#!/usr/bin/env python3
"""Rotate Claude and Codex OAuth accounts by quota (model-routing skill §0).

Goal: spend the primary account (yh04060) to its wall first, then hand load to helpers
without a stall. Helpers stay disabled while the primary has quota, because omp routes
away from an account once its 5-hour window is >= 85% used whenever another account is
enabled; keeping helpers off is what lets yh burn to 100%. Instead, checks tighten as the
primary approaches its wall (projected from its measured burn rate) and helpers come on as
soon as it is reached. Helpers whose weekly quota would otherwise expire unused are burned
too. omp does not report usage for disabled accounts, so a helper with no recent data is
enabled for a few seconds to read its usage (probe).

`--loop` (systemd omp-account-rotate.service) runs forever and picks its own next check;
`--once` runs one pass; `--dry-run` runs one pass without changing anything.
Codex saved resets are redeemed by omp itself (codexResets.autoRedeem). Claude saved resets are spent by hand
(`omp usage reset anthropic/<credential id>`; autoRedeem is Codex-only) when the user asks.
"""

import json
import os
import sqlite3
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
DB = f"{HOME}/.omp/agent/agent.db"
STATE = f"{HOME}/.omp/agent/rotate-accounts.state.json"
CAUSE = "manual: account rotation (model-routing skill)"
# Rows disabled by omp itself (OAuth failures, user deletes) are never touched.
OWN_CAUSES = ("manual:", "temporarily disabled by user")

WALL = 0.99  # a primary window at or above this is spent
# omp redeems a Codex reset on the first blocked request; a wall that outlives this means
# the redeem did not happen and helpers take over.
REDEEM_GRACE_S = 2 * 60
HELPER_LIMIT = 0.95
BURN_HOURS = 24
BURN_MIN_LEFT = 0.10
MIN_INTERVAL_S = 5 * 60
MAX_INTERVAL_S = 10 * 60
NEAR_POLL_S = 60  # cadence once the primary is about to hit its wall
NEAR_MARGIN = 0.15  # within this of the wall: check at MIN_INTERVAL_S or tighter
UNKNOWN_RATE_POLL_S = 2 * 60  # no burn rate yet: resample soon to measure one
PROBE_MAX_AGE_S = 3 * 3600
BUDGET = f"{HOME}/.omp/agent/rotate-budget.json"
WIDE_CAP = 32  # primary has quota: run wide to spend it
HELPER_TOTAL = 12  # concurrent subagents across all working sessions while on helper accounts
HELPER_MIN = 4
# Families held to the shared HELPER_TOTAL (12) cap so task.maxConcurrency stays 12 unless in wide burn.
SHARED_CAP_FAMILIES = {"openai-codex", "anthropic"}
# Save mode (user, 2026-10-14 -> lifted 2026-10-20: "spend Claude actively too, especially in gpai-monorepo"):
# None turns save mode off so anthropic gets 6-12 concurrent subagents per session alongside gemini/swe/deepseek/minimax.
SAVE_CAP = None
FREE_SESSIONS = {"/feat-personal-agent": 6}
SAVE_NOTE = (" Save mode (user): quota was overspent, so spend sparingly: spawn a subagent only when the work truly needs "
             "one, do small or sequential work inline, use one reviewer instead of a panel unless the slot is critical, no "
             "wide waves, astra/opus only for genuinely critical slots. The feat-personal-agent session is exempt and keeps "
             "a normal pace; headroom.sh shows each session its own caps.")
# Codex limits reset 2026-10-15 (user: "burn it, but moderately"): Codex leaves save mode but keeps the shared
# HELPER_TOTAL cap (SHARED_CAP_FAMILIES), and the directive is codex-moderate; save mode then covers Claude only.
CODEX_MODERATE = True  # 2026-10-16: spend Codex actively on sol within the shared 12-cap, without over-burning on astra
# All accounts on (user, 2026-10-15: "yh is a sturdy buffer; I recommend keeping every account on"): every account
# stays enabled unless one of its windows is walled or it is at its shared cap, and omp balances among them. Sprint,
# weekly-burn and backup ordering are skipped; a walled primary is switched off while a helper carries the provider
# (omp does not fall over from a walled account on its own). False restores yh-first rotation.
ALL_ON = True
# Providers exempt from ALL_ON: only the primary runs and helpers come on solely as backup once it is walled (user,
# 2026-10-16: "Codex on yh04060 only for now; zkwmak08 is used too much" — zk had 69% of its week used vs yh 0%
# within a day of the reset, since omp kept picking zk's rows).
PRIMARY_ONLY = {"openai-codex"}
CLAUDE_SAVE_NOTE = (" Save mode still applies to Claude (user): spawn Claude agents only for the seats named above, one "
                    "reviewer instead of a panel unless the slot is critical. The feat-personal-agent session is exempt; "
                    "headroom.sh shows each session its own caps.")
# Claude primary burn (user, 2026-10-14: "burn Claude yh fast" with its weekly window resetting at 23:00 KST unused):
# while yh's 7-day window resets within CLAUDE_BURN_HOURS with at least BURN_MIN_LEFT left, the directive is
# claude-burn and the Anthropic family is exempt from save mode (WIDE_CAP). Codex stays in save mode.
CLAUDE_BURN_HOURS = 6
WEEK_S = 7 * 86400
MIN_AVG_ELAPSED_S = 2 * 3600  # a younger weekly window gives too noisy an average burn
SPRINT_START_S = 35 * 60  # a helper's 5-hour window this close to reset may take a sprint
SPRINT_END_S = 60  # hand back to the primary this long before the helper's reset
SPRINT_MAX_USED = 0.70  # sprint only on a helper with at least 30% of its 5-hour window unused
SPRINT_MIN_7D_LEFT = 0.03  # weekly room left below the account's cap (shared caps are enforced separately)
SPRINT_PRIMARY_5H = 0.75  # only worth it while the primary's own 5-hour window is tight
# A non-shared Claude helper whose weekly window resets within this many hours, before the primary's,
# with at least BURN_MIN_LEFT unused takes all Claude traffic (primary off) until a window of it walls
# (user, 2026-10-09: spend admin-developers' week before its reset).
BURN_EXCLUSIVE_HOURS = 48
BURN_WATCH = 0.80  # a burning helper window at or above this is polled every NEAR_POLL_S
# Claude plan (user, 2026-10-12): yh runs alone until its weekly window is CLAUDE_SOLO_UNTIL full (helpers only
# as backup or to spend weekly quota that would otherwise expire), then mixes as usual; at CLAUDE_PRIMARY_STOP
# it is parked and admin-developers carries Claude. Once every Claude account in use is past its SLOW_MARKS
# entry, Claude use slows down to the helper-phase subagent cap. This replaced "overrun alongside", which spent
# helpers while yh still had quota.
# 2026-10-13 (user: burn yh fully, its reset gets refilled): no parking, yh burns to its wall; the user is
# notified there to decide on spending a saved Claude reset. Set CLAUDE_PRIMARY_STOP below WALL to park again.
CLAUDE_SOLO_UNTIL = 0.40
CLAUDE_PRIMARY_STOP = 1.0
# The shared global only ever carries Claude in slow mode.
SLOW_MARKS = {"admin-developers@teamturing.com": 0.60, "global@teamturing.com": 0.0}

PROVIDERS = {
    "anthropic": {
        "primary": "yh04060@gmail.com",
        # Preference order when the primary is spent or parked: admin-developers first, then the shared global.
        "helpers": ["admin-developers@teamturing.com", "global@teamturing.com"],
        "windows": {"Claude 5 Hour": "5h", "Claude 7 Day": "7d"},
    },
    "openai-codex": {
        "primary": "yh04060@gmail.com",
        "helpers": ["zkwmak08@gmail.com"],
        # yh first (user, 2026-10-13): zk only as backup once yh is walled with no reset left to redeem
        # (codexResets.keepCredits 0). Before that zk ran alongside yh all the time (2026-10-07).
        "windows": {"7 days": "7d"},
    },
}
# Accounts shared with other people: never push past these fractions, and refresh their usage
# often because others spend them while they are disabled here.
SHARED_CAPS = {"global@teamturing.com": {"7d": 0.90}}
SHARED_MAX_AGE_S = 15 * 60

DRY = "--dry-run" in sys.argv
LOOP = "--loop" in sys.argv and not DRY
now = time.time()


def log(msg):
    print(msg, flush=True)


def notify(msg):
    log(msg)
    if not DRY:
        subprocess.run(["notify-send", "-u", "critical", "omp account rotation", msg], capture_output=True, timeout=10)


def omp(*args):
    return subprocess.run(["omp", *args], capture_output=True, text=True, timeout=90).stdout.strip()


def fetch_usage():
    return json.loads(omp("usage", "--json"))


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def windows_of(report, labels):
    out = {}
    for lim in report.get("limits", []):
        wid = labels.get(lim.get("label"))
        if wid:
            resets = (lim.get("window") or {}).get("resetsAt")
            out[wid] = {"used": lim["amount"]["usedFraction"], "resetsAt": resets / 1000 if resets else None, "t": now}
    return out


def current(win):
    """Cached windows: a passed reset means the window is empty again."""
    return {
        wid: ({**w, "used": 0.0, "resetsAt": None} if w.get("resetsAt") and w["resetsAt"] < now else w)
        for wid, w in win.items()
    }


def cap(email, wid):
    return SHARED_CAPS.get(email, {}).get(wid, 1.0)


def stale(win, email, near=False):
    """No usable data for a disabled helper: never seen, or old and not known to have reset.

    Every helper is re-read after PROBE_MAX_AGE_S so mixing it in can be judged (user, 2026-10-12: check
    admin-developers and global now and then); a shared one is re-read after SHARED_MAX_AGE_S once it may be
    needed, because others spend it meanwhile.
    """
    if not win:
        return True
    max_age = SHARED_MAX_AGE_S if near and email in SHARED_CAPS else PROBE_MAX_AGE_S
    return all(now - w.get("t", 0) > max_age and not (w.get("resetsAt") and w["resetsAt"] < now) for w in win.values())


def five_hour_shot(state, provider, email, win):
    """Helper asked to run alongside until its current 5-hour window resets.

    One-off requests live in the state file as burn5h[provider][email] = reset epoch (user, 2026-10-12: burn
    admin-developers' current 5-hour window); passed entries are dropped.
    """
    shots = state.get("burn5h", {}).get(provider, {})
    until = shots.get(email)
    if until is None:
        return False
    if now >= until:
        del shots[email]
        log(f"{provider} {email}: 5-hour burn over")
        return False
    return healthy(win, email)


def left7(win, email):
    w7 = win.get("7d")
    return cap(email, "7d") - w7["used"] if w7 else 0.0


def burnable(win, email):
    w7 = win.get("7d")
    if not w7 or not w7.get("resetsAt"):
        return False
    soon = w7["resetsAt"] - now < BURN_HOURS * 3600
    return soon and left7(win, email) >= BURN_MIN_LEFT and healthy(win, email)


def healthy(win, email):
    return all(w["used"] < min(HELPER_LIMIT, cap(email, wid)) for wid, w in win.items())


def account_open(win, email):
    """No window walled and below the account's shared cap (unknown windows count as usable)."""
    return all(w["used"] < min(WALL, cap(email, wid)) for wid, w in win.items())


def rows(db, provider, email):
    return db.execute(
        "select id, disabled_cause from auth_credentials where provider=? and identity_key like ?",
        (provider, f"email:{email}%"),
    ).fetchall()


def set_enabled(db, provider, email, enable, quiet=False):
    changed = False
    for rid, cause in rows(db, provider, email):
        if cause is not None and not cause.startswith(OWN_CAUSES):
            continue
        if enable and cause is not None:
            db.execute("update auth_credentials set disabled_cause=NULL, updated_at=strftime('%s','now') where id=?", (rid,))
            changed = True
        elif not enable and cause is None:
            db.execute("update auth_credentials set disabled_cause=?, updated_at=strftime('%s','now') where id=?", (CAUSE, rid))
            changed = True
    if changed and not quiet:
        log(f"{provider} {email}: {'enable' if enable else 'disable'}")
    return changed


def is_enabled(db, provider, email):
    return any(cause is None for _, cause in rows(db, provider, email))


def probe(db, targets, state):
    """Enable disabled helpers for one usage fetch to learn their windows, then restore."""
    flipped = [(p, e) for p, e in targets if not is_enabled(db, p, e)]
    if DRY:
        log(f"would probe {targets}")
        return
    for p, e in flipped:
        set_enabled(db, p, e, True, quiet=True)
    db.commit()
    try:
        usage = fetch_usage()
    finally:
        for p, e in flipped:
            set_enabled(db, p, e, False, quiet=True)
        db.commit()
    for p, e in targets:
        for r in usage["reports"]:
            if r.get("provider") == p and (r.get("metadata") or {}).get("email") == e:
                state.setdefault(p, {})[e] = windows_of(r, PROVIDERS[p]["windows"])
                log(f"probed {p} {e}: {json.dumps({k: v['used'] for k, v in state[p][e].items()})}")
                break


def rate(prev, win):
    """Usage fraction per second since the previous sample of the same window, or None."""
    if not prev or prev.get("resetsAt") != win["resetsAt"] or win["used"] < prev["used"]:
        return None
    dt = now - prev["t"]
    return (win["used"] - prev["used"]) / dt if dt > 30 else None


def _pane_has_spinner(pid):
    """True when an omp pane's status bar shows an active Braille spinner (e.g. background subagents running)."""
    try:
        lines = subprocess.run(["herdr", "agent", "read", pid], capture_output=True, text=True, timeout=5).stdout.splitlines()
        for l in reversed(lines):
            if l.startswith("\ue0b6"):
                return any(c in l[:12] for c in "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
    except (OSError, subprocess.SubprocessError):
        pass
    return False


def omp_panes():
    """herdr panes running omp, as (pane_id, status, cwd)."""
    try:
        out = subprocess.run(["herdr", "agent", "list"], capture_output=True, text=True, timeout=10).stdout
        agents = json.loads(out)["result"]["agents"]
        res = []
        for a in agents:
            if a.get("agent") != "omp":
                continue
            pid = a["pane_id"]
            st = a.get("agent_status")
            if st != "working" and _pane_has_spinner(pid):
                st = "working"
            res.append((pid, st, a.get("cwd", "")))
        return res
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return []


# Standing directives (user, 2026-10-14; replaces the quota-projection race between astra-first and claude-first):
# normal slots on sol and swe; astra and opus only for top-intelligence slots, opus only for frontend/UI/copy.
# swe takes regular slots outside gpai-monorepo; there it stays overflow (user rule, 2026-10-12).
SOL_SWE_NORMAL = (
    "spend Claude (\"opus\", \"sonnet\", \"fable\", \"haiku\") and \"gemini\" (Gemini 4 Argon, index 53, DeepSWE 77.9%) "
    "actively in parallel waves alongside \"sol\" (omit effort)! Claude save mode is OFF (anthropic budget is open for "
    "parallel opus + sonnet waves — do NOT hold off on opus while sonnet is running). Especially in gpai-monorepo (where "
    "deepseek/minimax are forbidden, swe is overflow only, and Codex is LOW while Claude has 3 open accounts with yh04060 "
    "resetting in ~36h): use \"opus\" (omit effort), \"sonnet\", \"fable\", and \"gemini\" (Argon) heavily across BOTH "
    "backend/python-worker and frontend/web for implementation, audits, tests, migrations, planning, reviews, and "
    "verification, alongside \"sol\"/\"astra\". Outside gpai-monorepo, run \"opus\" (omit effort), \"sonnet\", \"gemini\" "
    "(Argon), \"sol\" (omit effort), \"deepseek\" (DeepSeek V4.1-Flash-1017 on CommandCode; omit effort for normal, \"lo\" "
    "for fill-in/scans, strict Target paths), \"minimax\" (MiniMax M3.1-Flash on CommandCode, index 42, DeepSWE 73.7%, "
    "strict Target paths), and \"swe\" (effort \"hi\", \"med\" for fill-in) in parallel. A verifier comes from a family "
    "other than the author's.")
TOP_SLOTS = (
    " Top-intelligence slots (hardest logic, architecture, audits, security/authz/concurrency/crash-consistency, critical "
    "reviews): use \"opus\" (omit effort), \"astra\" (omit effort), and \"fable\" (omit effort).")
SOL_FIRST = (
    "sol-first",
    "Claude + Argon + Sol + DeepSeek/MiniMax/SWE routing: " + SOL_SWE_NORMAL + TOP_SLOTS)
CODEX_BLOCKED = (
    "codex-blocked",
    "Codex has no usable account right now: do not spawn astra, sol or luna. Put implementation, planning, and review "
    "waves on \"opus\" (omit effort), \"sonnet\", \"fable\", and \"gemini\" (Gemini 4 Argon), and outside gpai-monorepo "
    "also on \"deepseek\" (omit effort for normal, \"lo\" for fill-in), \"minimax\", and \"swe\" (effort \"hi\", \"med\" "
    "for fill-in). In gpai-monorepo use \"opus\", \"sonnet\", \"fable\", \"haiku\", and \"gemini\" (Argon) generously.")
CODEX_MODE = (
    "codex-mode",
    "Claude has no usable account right now: do not spawn opus, sonnet, fable or haiku at all. "
    + SOL_SWE_NORMAL + " Top-intelligence slots, frontend included, go to \"astra\" (omit effort) or \"sol\" (omit effort).")
CODEX_MODERATE_STEER = (
    "codex-moderate",
    "Claude + Argon + Sol active routing (user, 2026-10-20): Claude save mode is OFF — anthropic concurrency is wide open "
    "(up to 12 concurrent Claude subagents per session), so spawn \"opus\" (omit effort), \"sonnet\", \"fable\", and "
    "\"haiku\" in parallel without waiting for one Claude agent to finish before spawning another! Especially in "
    "gpai-monorepo (where deepseek/minimax are NEVER used, swe is overflow only, and Codex is LOW at 28% while Claude has "
    "3 healthy accounts with yh04060 resetting in ~36h): use \"opus\" (omit effort), \"sonnet\", \"fable\" (advisor/"
    "architecture/second-plan), and \"gemini\" (Gemini 4 Argon, AA index 53, DeepSWE 77.9%) heavily across BOTH backend/"
    "python-worker and frontend/web for implementation, audits, tests, migrations, planning, reviews, and verification, "
    "alongside \"sol\" (omit effort) and \"astra\" (omit effort). Outside gpai-monorepo, actively run \"opus\" (omit "
    "effort) and \"sonnet\" in parallel alongside \"gemini\" (Argon), \"sol\" (omit effort), \"deepseek\" (DeepSeek "
    "V4.1-Flash-1017 on CommandCode), \"minimax\" (MiniMax M3.1-Flash on CommandCode), and \"swe\" (effort \"hi\", "
    "\"med\" for fill-in).")
CODEX_AG_OPUS_STEER = (
    "codex-ag-opus",
    "Codex + Antigravity Opus burn (user, 2026-10-16): \"opus\" and \"sonnet\" currently spend google-antigravity's "
    "separate Claude 5h/7d bucket (yh04060 AI Ultra) before touching direct Anthropic quota, and Codex is open on "
    "yh04060 — use both families actively in parallel waves up to their SUBAGENT BUDGETs! Put normal backend/logic/"
    "test/contract/migration slots on \"sol\" (omit effort); put frontend/UI/copy work, planning drafts, architecture/"
    "design, verification of GPT-authored work, and review panels on \"opus\" (omit effort) and \"sonnet\". To avoid "
    "over-burning Codex, reserve \"astra\" (omit effort) strictly for top-intelligence backend/logic/security/"
    "concurrency slots and critical reviews. Keep \"luna\" and \"gemini\" for search/scans. Outside gpai-monorepo "
    "\"swe\" (effort \"hi\", \"med\" for fill-in) takes fill-in and fixed-contract slots and what exceeds the budgets; "
    "in gpai-monorepo swe is overflow only.")
# Codex priority ("fast") tier ended 2026-10-14 (user); task.agentServiceTierOverrides is back to {}. The note
# tells live sessions, which may still run with the old override or use /fast.
CODEX_STANDARD_TIER = (" Codex runs at the standard tier again: do not use the fast/priority tier for \"astra\" or \"sol\" "
                       "(no /fast, no per-agent tier override). If your own model is gemini-4-argon, NEVER spawn "
                       "\"naturalizer\" — write Korean/non-English text directly.")


def claude_burn_steer(until, why):
    """Directive while Claude quota should be spent fast until `until`."""
    at = time.strftime("%H:%M", time.localtime(until))
    return (
        "claude-burn",
        f"Claude burn (user) until {at} local time: {why}, so spend Claude now. Use subagents generously: put every "
        "normal slot (implementation, tests, contracts, migrations, reviews, verification, planning drafts, second "
        "opinions, frontend) on \"sonnet\" and run waves wide on it; top-intelligence slots of any kind go to \"opus\" "
        "(omit effort); \"fable\" takes advisor and second-plan seats; \"haiku\" joins gemini for search and scans. Verify "
        "Claude-authored work with \"gemini\", or \"astra\" for critical slots. Codex stays in save mode: sol/astra/luna "
        f"only where no Claude agent fits; swe only as overflow. The sol/swe directive returns after {at} or when the "
        "Claude account hits a wall.")


def pick_steer(claude_gone, codex_blocked, claude_burn_until=None, claude_burn_why="", codex_moderate=False,
               ag_claude_open=False):
    """Directive for running Mains from Claude/Codex/Antigravity-Claude availability."""
    if claude_gone and not ag_claude_open:
        return CODEX_MODE
    if claude_burn_until:
        return claude_burn_steer(claude_burn_until, claude_burn_why)
    if codex_blocked:
        return CODEX_BLOCKED
    if codex_moderate and ag_claude_open:
        return CODEX_AG_OPUS_STEER
    if codex_moderate:
        return CODEX_MODERATE_STEER
    return SOL_FIRST


AG_CLAUDE_ENABLED = False  # 2026-10-18: user switched off Antigravity Claude routing (keep Antigravity for Gemini only)
AG_CLAUDE_EMAIL = "yh04060@gmail.com"
AG_CLAUDE_AGENTS = {
    f"{HOME}/.omp/agent/agents/opus.md": (
        "google-antigravity/claude-opus-5-5, anthropic/claude-opus-5-5",
        "anthropic/claude-opus-5-5",
    ),
    f"{HOME}/.omp/agent/agents/sonnet.md": (
        "google-antigravity/claude-sonnet-5-5, anthropic/claude-sonnet-5-5",
        "anthropic/claude-sonnet-5-5",
    ),
}


def antigravity_claude_status(db, usage):
    """Check yh04060's google-antigravity 3p Claude (5h + weekly) windows and live block table: (is_open, wake_s, used_map)."""
    if not AG_CLAUDE_ENABLED:
        return False, MAX_INTERVAL_S, {}
    blk_row = db.execute(
        "SELECT b.blocked_until_ms FROM auth_credential_blocks b JOIN auth_credentials c ON c.id = b.credential_id "
        "WHERE c.provider = 'google-antigravity' AND c.identity_key LIKE ? AND b.block_scope LIKE '%anthropic%' AND b.blocked_until_ms > ?",
        (f"%{AG_CLAUDE_EMAIL}%", now * 1000.0),
    ).fetchone()
    blk_until = (blk_row[0] / 1000.0) if blk_row else 0.0
    for r in usage.get("reports", []):
        if r.get("provider") != "google-antigravity" or (r.get("metadata") or {}).get("email") != AG_CLAUDE_EMAIL:
            continue
        win = {}
        for lim in r.get("limits", []):
            lid = lim.get("id") or ""
            if ":anthropic:" in lid and (lid.endswith(":3p-5h") or lid.endswith(":3p-weekly")):
                key = "5h" if lid.endswith(":3p-5h") else "7d"
                win[key] = {
                    "used": float((lim.get("amount") or {}).get("usedFraction", 0.0) or 0.0),
                    "resetsAt": ((lim.get("window") or {}).get("resetsAt") or 0) / 1000.0,
                }
        if blk_until > now:
            win.setdefault("5h", {"used": 1.0, "resetsAt": blk_until})
            win["5h"]["used"] = max(win["5h"]["used"], 1.0)
            win["5h"]["resetsAt"] = max(win["5h"]["resetsAt"], blk_until)
        if not win:
            return False, MAX_INTERVAL_S, {}
        walled = [w for w in win.values() if w["used"] >= WALL]
        wake = MAX_INTERVAL_S
        if walled:
            for w in walled:
                if w["resetsAt"] > now:
                    wake = min(wake, max(NEAR_POLL_S, w["resetsAt"] - now + 5))
            return False, wake, {k: round(v["used"], 3) for k, v in win.items()}
        if any(w["used"] >= BURN_WATCH for w in win.values()):
            wake = min(wake, NEAR_POLL_S)
        return True, wake, {k: round(v["used"], 3) for k, v in win.items()}
    if blk_until > now:
        return False, min(MAX_INTERVAL_S, max(NEAR_POLL_S, blk_until - now + 5)), {"5h": 1.0}
    return False, MAX_INTERVAL_S, {}


def set_claude_agent_models(ag_first):
    """Put google-antigravity first in opus.md/sonnet.md and config.yml default while its 3p bucket has room, else anthropic first."""
    for path, (ag_line, anth_line) in AG_CLAUDE_AGENTS.items():
        target = f"model: {ag_line if ag_first else anth_line}"
        try:
            with open(path) as f:
                lines = f.read().splitlines()
            idx = next((i for i, ln in enumerate(lines) if ln.startswith("model:")), None)
            if idx is None or lines[idx] == target:
                continue
            if not DRY:
                lines[idx] = target
                tmp = f"{path}.tmp"
                with open(tmp, "w") as f:
                    f.write("\n".join(lines) + "\n")
                os.replace(tmp, path)
            log(f"agent {os.path.basename(path)}: {target}")
        except OSError as e:
            log(f"agent {os.path.basename(path)} update failed: {e}")
    cfg_path = f"{HOME}/.omp/agent/config.yml"
    want_def = "  default: google-antigravity/claude-opus-5-5:low" if ag_first else "  default: anthropic/claude-opus-5-5:low"
    try:
        with open(cfg_path) as f:
            lines = f.read().splitlines()
        idx = next((i for i, ln in enumerate(lines) if ln.startswith("  default: ") and "claude-opus-5-5" in ln), None)
        if idx is not None and lines[idx] != want_def:
            if not DRY:
                lines[idx] = want_def
                tmp = f"{cfg_path}.tmp"
                with open(tmp, "w") as f:
                    f.write("\n".join(lines) + "\n")
                os.replace(tmp, cfg_path)
            log(f"config.yml: {want_def.strip()}")
    except OSError as e:
        log(f"config.yml default update failed: {e}")


AG_YH_ONLY_MODELS = {"gemini-4-argon"}
AG_FLASH_ACCOUNTS = {"zkwmak08@gmail.com": {}, "sharosoo14@gmail.com": {}}


def pin_antigravity_account_access():
    """Strip non-Gemini models (Claude/GPT) from google-antigravity in models.db, and pin Argon->yh04060, Flash->zk/sh."""
    mdb_path = f"{HOME}/.omp/agent/models.db"
    if not os.path.exists(mdb_path):
        return
    try:
        mdb = sqlite3.connect(mdb_path, timeout=5)
        for pid, raw in mdb.execute(
            "SELECT provider_id, models FROM model_cache WHERE provider_id LIKE 'google-antigravity%'"
        ).fetchall():
            models = json.loads(raw)
            kept = [m for m in models if (m.get("id") or "").startswith("gemini-")]
            dirty = len(kept) != len(models)
            for m in kept:
                mid = m.get("id")
                if mid in AG_YH_ONLY_MODELS:
                    want = {AG_CLAUDE_EMAIL: {}}
                elif m.get("accountAccess") is not None:
                    want = AG_FLASH_ACCOUNTS
                else:
                    continue
                if m.get("accountAccess") != want:
                    m["accountAccess"] = want
                    dirty = True
            if dirty and not DRY:
                mdb.execute("UPDATE model_cache SET models = ? WHERE provider_id = ?", (json.dumps(kept), pid))
                mdb.commit()
                log("pinned google-antigravity models.db (stripped Claude/GPT; yh04060: Argon; zk/sh: 3.8 Flash)")
        mdb.close()
    except Exception as e:
        log(f"pin_antigravity_account_access failed: {e}")


def user_hold(db, provider, cfg, cache):
    """The user switched the primary off by hand: their helpers carry the provider.

    Accounts stay as the user set them, except shared caps: a shared helper at its cap is switched off,
    and one this script switched off comes back once it is below the cap again. Returns (usable, near):
    whether an enabled helper still has weekly quota, and whether a shared one is close to its cap.
    """
    usable = near = False
    for email in cfg["helpers"]:
        win = current(cache.get(email, {}))
        w7 = win.get("7d")
        if email in SHARED_CAPS and w7:
            over = left7(win, email) <= 0
            if over and is_enabled(db, provider, email):
                set_enabled(db, provider, email, False)
            elif not over and not is_enabled(db, provider, email) and owned_off(db, provider, email):
                set_enabled(db, provider, email, True)
            near |= is_enabled(db, provider, email) and left7(win, email) < 0.08
        if is_enabled(db, provider, email) and w7 and w7["used"] < min(WALL, cap(email, "7d")):
            usable = True
    return usable, near



def pane_busy_input(pid):
    """Why typing into the pane now would go astray, or None when its editor is empty.

    `herdr agent prompt` types into the editor and presses Enter: a half-typed user draft gets the directive
    appended (2026-10-07 it became part of a `/btw` side question the main loop never saw), and an open side
    panel takes the keys as its own shortcuts. Those passes defer; the next one retries.
    """
    try:
        lines = subprocess.run(["herdr", "agent", "read", pid], capture_output=True, text=True, timeout=10).stdout.splitlines()
        while lines and not lines[-1].strip():
            lines.pop()
    except (OSError, subprocess.SubprocessError):
        return "unreadable"
    tail = lines[-60:]
    bottom = max((i for i, l in enumerate(tail) if l.startswith("╰─")), default=None)
    status = max((i for i, l in enumerate(tail[:bottom]) if l.startswith("\ue0b6")), default=None) if bottom else None
    if bottom is None or status is None:
        return "editor not found"
    # The side panel's key hints sit just above the status line; transcript text further up may quote them.
    if any("to follow up" in l for l in tail[max(0, status - 6):status]):
        return "side panel open"
    # A one-line draft renders on the `╰─` row itself; longer drafts add rows above it. The bottom row also
    # carries right-aligned hints such as "← to see 4 running agents".
    draft = [l.strip(" │") for l in tail[status + 1:bottom]] + [tail[bottom][2:].split("  ")[0].strip()]
    if any(draft):
        return "user draft in editor"
    return None


def broadcast(state, steer, text):
    """Tell working omp sessions about a steering change (config edits do not reach live sessions).

    Panes that were idle when a directive went out still act on the older one once they resume,
    so every working pane whose last received directive text differs from the current one is caught up.
    """
    last = state.get("steer", {})
    sent = state.setdefault("steerSent", {})
    changed = last.get("key") != steer or last.get("text") != text
    panes = omp_panes()
    live = {pid for pid, _, _ in panes}
    for pid in list(sent):
        if pid not in live:
            del sent[pid]
    targets = [pid for pid, status, _ in panes if status == "working" and sent.get(pid) != text]
    if not targets and not changed:
        return
    msg = (f"[Routing directive from the account-rotation service ({steer}); it replaces every earlier routing directive. "
           f"Do not stop current work.] {text} Before each spawn wave run ~/.omp/agent/managed-skills/model-routing/headroom.sh "
           "and stay within its SUBAGENT BUDGET lines.")
    log(f"steer -> {steer}; directing {targets}")
    if DRY:
        return
    for pid in targets:
        busy = pane_busy_input(pid)
        if busy:
            log(f"steer {pid}: deferred ({busy})")
            continue
        subprocess.run(["herdr", "agent", "prompt", pid, msg], capture_output=True, timeout=10)
        sent[pid] = text
    if changed:
        state["steer"] = {"key": steer, "text": text, "at": now}


def apply_budget(plan, steer_text, unsaved=(), wide=()):
    """Per-family subagent caps for Main (read via headroom.sh) plus the hard task.maxConcurrency.

    Families in `unsaved` skip save mode; families in `wide` also skip SHARED_CAP_FAMILIES (e.g. claude-burn).
    """
    panes = omp_panes()
    working = max(1, sum(status == "working" for _, status, _ in panes))
    helper_cap = max(HELPER_MIN, HELPER_TOTAL // working)
    caps = {p: (WIDE_CAP if p in wide else max(6 if p == "anthropic" else HELPER_MIN, helper_cap)
                if p in SHARED_CAP_FAMILIES or (spent and p not in unsaved) else WIDE_CAP)
            for p, spent in plan.items()}
    phases = {p: "burn-yh" if p in wide else "helpers" if plan[p] else "capped" if p in SHARED_CAP_FAMILIES
              else "burn-yh" for p in plan}
    pane_caps = {}
    if SAVE_CAP is not None:
        saved = [p for p in plan if p not in unsaved]
        caps.update({p: min(caps[p], SAVE_CAP) for p in saved})
        phases.update({p: "save" for p in saved})
        for pid, _, cwd in panes:
            free = next((c for suffix, c in FREE_SESSIONS.items() if cwd.endswith(suffix)), None)
            if free is not None:
                pane_caps[pid] = {p: ({"cap": max(free, caps[p]), "phase": phases[p]} if p in unsaved
                                      else {"cap": free, "phase": "save-exempt"}) for p in plan}
    # Never below HELPER_TOTAL: the hard cap also binds swe/gemini/haiku, which have no family cap here.
    hard = max(max(caps.values(), default=WIDE_CAP), HELPER_TOTAL)
    budget = {
        "updatedAt": int(now),
        "workingSessions": working,
        "perSession": {p: {"cap": c, "phase": phases[p]} for p, c in caps.items()},
        "panes": pane_caps,
        "maxConcurrency": hard,
        "steer": steer_text,
    }
    try:
        with open(BUDGET) as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    if {k: v for k, v in old.items() if k not in ("updatedAt", "steer")} != {k: v for k, v in budget.items() if k not in ("updatedAt", "steer")}:
        log(f"budget: {working} working session(s), per-session caps {caps}, exempt panes {list(pane_caps)}, "
            f"task.maxConcurrency {hard}")
    if DRY:
        return
    with open(BUDGET, "w") as f:
        json.dump(budget, f, indent=1)
    if omp("config", "get", "task.maxConcurrency") != str(hard):
        omp("config", "set", "task.maxConcurrency", str(hard))


def owned_off(db, provider, email):
    rs = rows(db, provider, email)
    return bool(rs) and all(cause == CAUSE for _, cause in rs)


def pick_sprint(cache, cfg, p):
    """Helper whose 5-hour window resets soon with much unused, while the primary's 5-hour is tight.

    Its expiring 5-hour capacity takes all Claude traffic (primary off) until just before its reset,
    which saves the primary's scarce 5-hour quota. Returns (helper or None, seconds until the next
    sprint decision point).
    """
    wake = MAX_INTERVAL_S
    best = None
    tight = p.get("5h", {"used": 0})["used"] >= SPRINT_PRIMARY_5H
    for email in cfg["helpers"]:
        win = current(cache.get(email, {}))
        w5, w7 = win.get("5h"), win.get("7d")
        if not w5 or not w5.get("resetsAt") or not w7:
            continue
        left = w5["resetsAt"] - now
        if left > SPRINT_START_S:
            wake = min(wake, left - SPRINT_START_S + 5)
        elif left > SPRINT_END_S:
            wake = min(wake, left - SPRINT_END_S + 5)
            ok = tight and w5["used"] <= SPRINT_MAX_USED and left7(win, email) >= SPRINT_MIN_7D_LEFT and healthy(win, email)
            if ok and (best is None or w5["used"] < best[1]):
                best = (email, w5["used"])
    return (best[0] if best else None), max(30, wake)


def pick_burn(cache, cfg, p):
    """Helper whose weekly window would expire unused: it takes all traffic until a window of it walls.

    Shared accounts never qualify. The weekly window burns to WALL (the point is to leave nothing unused);
    the 5-hour window stops at HELPER_LIMIT so the primary takes over before requests fail, and the helper is
    picked again once that window resets (cached windows past their reset count as empty). Returns (helper or
    None, seconds until the next check this needs).
    """
    wake = MAX_INTERVAL_S
    best = None
    primary_reset = (p.get("7d") or {}).get("resetsAt")
    for email in cfg["helpers"]:
        if email in SHARED_CAPS:
            continue
        win = current(cache.get(email, {}))
        w7 = win.get("7d")
        if not w7 or not w7.get("resetsAt"):
            continue
        left_s = w7["resetsAt"] - now
        if left_s >= BURN_EXCLUSIVE_HOURS * 3600 or (primary_reset and w7["resetsAt"] >= primary_reset):
            continue
        limits = {wid: (WALL if wid == "7d" else HELPER_LIMIT) for wid in win}
        walled = [w for wid, w in win.items() if w["used"] >= limits[wid]]
        if walled:
            for w in walled:  # come back when the wall resets
                if w.get("resetsAt"):
                    wake = min(wake, w["resetsAt"] - now + 5)
            continue
        if best is None or left_s < best[1]:
            best = (email, left_s)
    if best:
        hot = any(w["used"] >= BURN_WATCH for w in current(cache.get(best[0], {})).values())
        wake = min(wake, NEAR_POLL_S if hot else MIN_INTERVAL_S)
    return (best[0] if best else None), max(30, wake)


def run_once():
    """One rotation pass; returns seconds until the next check."""
    global now
    now = time.time()
    try:
        usage = fetch_usage()
    except (ValueError, subprocess.SubprocessError) as e:
        log(f"usage fetch failed, no changes: {e}")
        return MIN_INTERVAL_S
    state = load_state()
    keep = int(float(omp("config", "get", "codexResets.keepCredits") or 0))
    auto_redeem = omp("config", "get", "codexResets.autoRedeem") == "yes"
    db = sqlite3.connect(DB, timeout=10)
    samples = state.setdefault("samples", {})
    interval = MAX_INTERVAL_S
    plan = {}
    claude_gone = False
    claude_burn_until = None
    claude_burn_why = "Claude yh04060's weekly window resets then with most of it unused"

    for provider, cfg in PROVIDERS.items():
        reports = {r["metadata"].get("email"): r for r in usage["reports"] if r.get("provider") == provider and r.get("metadata")}
        cache = state.setdefault(provider, {})
        for email, r in reports.items():
            cache[email] = windows_of(r, cfg["windows"])
        primary = reports.get(cfg["primary"])
        # A primary the script itself switched off (sprint) is tracked from cache; one the user
        # switched off pauses the provider.
        if primary is None and owned_off(db, provider, cfg["primary"]):
            primary = {}
        if primary is None and rows(db, provider, cfg["primary"]) and not is_enabled(db, provider, cfg["primary"]):
            usable, near = user_hold(db, provider, cfg, cache)
            # Claude on helpers gets the helper-phase subagent cap; for Codex the flag also means "blocked" to the steer.
            plan[provider] = provider == "anthropic" or not usable
            if provider == "anthropic":
                claude_gone = not usable
            interval = min(interval, NEAR_POLL_S if near else MIN_INTERVAL_S)
            continue
        if primary is None or not cache.get(cfg["primary"]):
            log(f"{provider}: no usage for primary, skipped")
            interval = min(interval, MIN_INTERVAL_S)
            continue
        p = current(cache[cfg["primary"]])
        prev = samples.get(provider, {})
        rates = {wid: rate(prev.get(wid), w) for wid, w in p.items()}
        # Keep the older sample until 30 s have passed so short polls still yield a rate.
        samples[provider] = {
            wid: (prev[wid] if wid in prev and rates[wid] is None and prev[wid].get("resetsAt") == w["resetsAt"]
                  and now - prev[wid]["t"] <= 30 else w)
            for wid, w in p.items()
        }

        at_wall = any(w["used"] >= WALL for w in p.values())
        if provider == "openai-codex":
            at_wall |= (primary.get("metadata") or {}).get("limitReached") is True
            credits = (primary.get("resetCredits") or {}).get("availableCount", 0)
            if at_wall:
                state.setdefault("codexWallSince", now)
            else:
                state.pop("codexWallSince", None)
            # With a redeemable reset, hold yh alone at its wall so omp redeems one.
            redeemable = auto_redeem and credits > keep
            blocked = at_wall and (not redeemable or now - state["codexWallSince"] > REDEEM_GRACE_S)
            if at_wall and not blocked:
                interval = min(interval, NEAR_POLL_S)
        else:
            blocked = at_wall
        # Claude primary at CLAUDE_PRIMARY_STOP: parked while a helper can carry Claude.
        parked = provider == "anthropic" and not at_wall and (p.get("7d") or {}).get("used", 0) >= CLAUDE_PRIMARY_STOP

        # Next check: right before the earliest projected wall, never later than needed.
        for wid, w in p.items():
            if w["used"] >= WALL:
                interval = min(interval, MIN_INTERVAL_S)  # watch for the reset/recovery
                continue
            r = rates[wid]
            if r is None:
                if w["used"] >= WALL - NEAR_MARGIN:
                    interval = min(interval, NEAR_POLL_S)
                elif not prev.get(wid):
                    interval = min(interval, UNKNOWN_RATE_POLL_S)
                continue
            if r > 0:
                eta = (WALL - w["used"]) / r
                interval = min(interval, max(NEAR_POLL_S, eta * 0.8))
            if w["used"] >= WALL - NEAR_MARGIN:
                interval = min(interval, MIN_INTERVAL_S)

        # Helpers needed now or soon must have known windows; probe stale ones.
        near = blocked or any(w["used"] >= WALL - NEAR_MARGIN for w in p.values())
        need_probe = [(provider, e) for e in cfg["helpers"]
                      if not is_enabled(db, provider, e) and stale(cache.get(e, {}), e, near)]
        if need_probe:
            probe(db, need_probe, state)

        # Hours until the primary's weekly window walls at its average burn since the window opened.
        wall_eta_h = None
        w7 = p.get("7d")
        if provider == "openai-codex" and w7 and w7.get("resetsAt"):
            elapsed = WEEK_S - (w7["resetsAt"] - now)
            if elapsed >= MIN_AVG_ELAPSED_S and w7["used"] > 0:
                wall_eta_h = (WALL - w7["used"]) / (w7["used"] / elapsed) / 3600

        solo = provider == "anthropic" and (w7 or {}).get("used", 1.0) < CLAUDE_SOLO_UNTIL
        if provider == "anthropic":
            # autoRedeem covers Codex only: a saved Claude reset is spent by hand, so tell the user once per wall.
            if at_wall and not state.get("claudeWallNotified"):
                notify(f"Claude {cfg['primary']} hit its wall {json.dumps({k: v['used'] for k, v in p.items()})}: "
                       "spend a saved reset with `omp usage reset anthropic/<id>` (helpers cover until then).")
                state["claudeWallNotified"] = True
            elif not at_wall:
                state.pop("claudeWallNotified", None)
        helpers = {}
        backup_taken = False
        for email in cfg["helpers"]:
            win = current(cache.get(email, {}))
            # A helper that resets before the primary walls would never be reached: burn it alongside.
            hw7 = win.get("7d")
            expires_unused = (
                wall_eta_h is not None and hw7 and hw7.get("resetsAt") and left7(win, email) >= BURN_MIN_LEFT
                and (hw7["resetsAt"] - now) / 3600 < wall_eta_h and healthy(win, email)
            )
            # A spent or parked primary gets the first healthy helper in preference order.
            backup = (blocked or parked) and not backup_taken and healthy(win, email)
            backup_taken |= backup
            helpers[email] = (backup or burnable(win, email) or bool(expires_unused)
                              or five_hour_shot(state, provider, email, win))
        if provider == "openai-codex" and blocked and not any(helpers.values()):
            # zk looks spent; enable it anyway rather than stall Codex on a dead primary.
            helpers = {e: True for e in helpers}
        sprint = None
        burn = None
        if provider == "anthropic" and not ALL_ON:
            burn, burn_wake = pick_burn(cache, cfg, p)
            interval = min(interval, burn_wake)
            if burn:
                helpers = {e: e == burn for e in helpers}
            elif not solo and not parked:
                sprint, sprint_wake = pick_sprint(cache, cfg, p)
                interval = min(interval, sprint_wake)
                if sprint:
                    helpers = {e: e == sprint for e in helpers}
        if ALL_ON and provider in PRIMARY_ONLY:
            helpers = {e: blocked and account_open(current(cache.get(e, {})), e) for e in helpers}
        elif ALL_ON:
            helpers = {e: account_open(current(cache.get(e, {})), e) for e in helpers}
        for email, on in helpers.items():
            if on and email in SHARED_CAPS and left7(current(cache.get(email, {})), email) < 0.08:
                interval = min(interval, NEAR_POLL_S)  # close to the shared cap: watch it closely
        slow = False
        if provider == "anthropic":
            # Slow down once every helper carrying a spent/parked yh is past its mark (none left counts too).
            slow = (blocked or parked) and all(
                current(cache.get(e, {})).get("7d", {}).get("used", 1.0) >= SLOW_MARKS.get(e, cap(e, "7d"))
                for e, on in helpers.items() if on)
            parked &= any(helpers.values())  # no helper left: yh's reserve is the last resort
        # Codex counts as blocked (codex-blocked steer, helper-phase cap) only when no healthy helper carries it.
        plan[provider] = slow if provider == "anthropic" else blocked and not any(
            on and healthy(current(cache.get(e, {})), e) for e, on in helpers.items())
        if provider == "anthropic":
            claude_gone = blocked and not any(helpers.values())
            w7 = p.get("7d") or {}
            if (not (blocked or parked or sprint or burn) and w7.get("resetsAt")
                    and 0 < w7["resetsAt"] - now <= CLAUDE_BURN_HOURS * 3600 and 1 - w7["used"] >= BURN_MIN_LEFT):
                claude_burn_until = w7["resetsAt"]
                interval = min(interval, max(NEAR_POLL_S, int(w7["resetsAt"] - now) + 30))

        changed = False
        # A walled primary left enabled still gets picked and fails (Codex usage_limit_reached, 2026-10-14): omp does
        # not fall over on its own. Switch it off while a helper carries the provider; it is then tracked from cache
        # and comes back when its cached window resets. Credits refilled meanwhile are not seen until then.
        codex_off = (provider == "openai-codex" or ALL_ON) and blocked and any(helpers.values())
        if not DRY:
            changed = set_enabled(db, provider, cfg["primary"], not (sprint or burn or parked or codex_off))
            for email, on in helpers.items():
                changed |= set_enabled(db, provider, email, on)
        if changed or DRY:
            log(f"{provider}: primary {'burn-rest (' + burn + ')' if burn else 'sprint-rest' if sprint else 'spent' if blocked else 'parked' if parked else 'expiry-burn' if claude_burn_until and provider == 'anthropic' else 'burning'}{' slow' if slow else ''} {json.dumps({k: v['used'] for k, v in p.items()})} "
                f"rates/10min {json.dumps({k: (round(v * 600, 3) if v is not None else None) for k, v in rates.items()})}; helpers {helpers}")

    # Persist (id -> provider, email) so per-account usage reports survive credential row deletion/re-login.
    cred_map = state.setdefault("credentialIds", {})
    for cid, prov, ikey in db.execute(
        "SELECT id, provider, identity_key FROM auth_credentials WHERE identity_key LIKE '%email:%'"
    ).fetchall():
        for part in (ikey or "").split("|"):
            if part.startswith("email:"):
                cred_map[str(cid)] = {"provider": prov, "email": part[6:]}
                break
    # One-off timed Claude burn (user, 2026-10-15: "burn global for 56 minutes, many subagents"): state
    # claudeBurn = {"until": epoch, "why": text}; it outranks the expiry burn and ends by itself.
    manual = state.get("claudeBurn") or {}
    if manual.get("until", 0) > now and not claude_gone:
        claude_burn_until, claude_burn_why = manual["until"], manual.get("why", "the user asked for it")
        interval = min(interval, max(NEAR_POLL_S, int(manual["until"] - now) + 5))
    elif manual:
        state.pop("claudeBurn", None)
        log("manual Claude burn over")
    ag_claude_open, ag_wake, ag_win = antigravity_claude_status(db, usage)
    if not DRY:
        db.commit()
    db.close()
    interval = min(interval, ag_wake)
    set_claude_agent_models(ag_claude_open and not claude_burn_until)
    pin_antigravity_account_access()
    if DRY or state.get("agClaudeOpen") != ag_claude_open:
        log(f"google-antigravity claude (yh04060): {'open' if ag_claude_open else 'walled'} {json.dumps(ag_win)}")
    state["agClaudeOpen"] = ag_claude_open

    if plan:
        codex_moderate = CODEX_MODERATE and not plan.get("openai-codex", False)
        steer = pick_steer(claude_gone, plan.get("openai-codex", False), claude_burn_until, claude_burn_why,
                           codex_moderate, ag_claude_open)
        claude_unsaved = bool(claude_burn_until or ag_claude_open)
        save = ("" if SAVE_CAP is None or claude_unsaved
                else CLAUDE_SAVE_NOTE if codex_moderate else SAVE_NOTE)
        steer = (steer[0], steer[1] + CODEX_STANDARD_TIER + save)
        if state.get("steer", {}).get("key") != steer[0]:
            log(f"steer pick {steer[0]}")
        broadcast(state, *steer)
        apply_budget(plan, steer[1],
                     (("anthropic",) if claude_unsaved else ()) + (("openai-codex",) if codex_moderate else ()),
                     wide=("anthropic",) if claude_burn_until else ())

    if not DRY:
        with open(STATE, "w") as f:
            json.dump(state, f, indent=1)
        try:
            subprocess.run(
                [sys.executable, os.path.join(os.path.dirname(__file__), "yh-usage.py"), "--quiet"],
                timeout=45,
                check=False,
            )
        except Exception as e:
            log(f"yh-usage refresh failed: {e}")
    return int(interval)


def main():
    if not LOOP:
        log(f"next check in {run_once()} s")
        return
    while True:
        try:
            interval = run_once()
        except Exception as e:  # keep the daemon alive; a bad pass retries soon
            log(f"pass failed: {e!r}")
            interval = NEAR_POLL_S
        time.sleep(interval)


main()
