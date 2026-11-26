#!/usr/bin/env python3
"""Rotate Claude and Codex accounts by reported usage and weekly reset time.

`--loop` runs the service, `--once` runs one pass, and `--dry-run` previews the changes.
Codex saved resets are user-authorized; exhausted usage is not usable until recovery is confirmed.
"""

import filecmp
import json
import math
import os
import sqlite3
import subprocess
import re
import sys
import time
from pathlib import Path

HOME = os.path.expanduser("~")
DB = f"{HOME}/.omp/agent/agent.db"
STATE = f"{HOME}/.omp/agent/rotate-accounts.state.json"
MODELS_DB = f"{HOME}/.omp/agent/models.db"
CODEX_STEER_MODELS = ("gpt-6.1-sol", "gpt-6-astra")
CODEX_CATALOG_MAX_AGE_S = 24 * 3600
CODEX_CATALOG_REFRESH_S = 6 * 3600
OMP_INSTALLS = Path(HOME) / ".local/share/mise/installs/github-can1357-oh-my-pi"
CAUSE = "manual: account rotation (model-routing skill)"
HARD_CAP = 0.90
EXPIRY_FOCUS_S = 24 * 3600
EXPIRY_COHORT_S = 3600
# This service is the only regular `omp usage` caller now (headroom.sh and the bar read SNAPSHOT), so it can refresh
# the snapshot every few minutes without tripping the per-IP 429 (user, 2026-10-22: usage display too slow).
MIN_INTERVAL_S = 3 * 60
BUDGET = f"{HOME}/.omp/agent/rotate-budget.json"
# Incident-ledger re-verification (skill://failure-ladder); headroom.sh prints its status file.
REVERIFY = f"{HOME}/.omp/agent/managed-skills/failure-ladder/reverify.py"
REVERIFY_S = 6 * 3600
WIDE_CAP = 10  # user, 2026-10-28: Claude family 4-10 per session
HELPER_TOTAL = 6
HELPER_MIN = 2
# Claude is UNLIMITED in every session now that the turing-worker pool is large (user, 2026-10-22: "워커 계정 많아서
# 모든 세션에 무한 모드"). Codex: zkwmak08 moved to Pro Max on 2026-10-23, so with <identity:YH_ID> both Codex accounts are
# Pro Max and normal sessions get openai-codex <= 12 (user, 2026-10-25: three Codex accounts, spawn many subagents).
NORMAL_CAPS = {"anthropic": 10, "openai-codex": "unlimited"}  # user, 2026-10-28: Claude 4, Codex unlimited (worker pool)
NORMAL_COMBINED_CAP = 0  # task.maxConcurrency 0 = uncapped; Claude stays at 4 via headroom
SHARED_CAP_FAMILIES = {"openai-codex", "anthropic"}
SAVE_CAP = None
FREE_SESSIONS = {"/feat-personal-agent": {"anthropic": 10, "openai-codex": "unlimited"}}
# Per-session routing added to that pane's steer messages (user, 2026-10-29: feat-personal-agent is too slow on sol alone).
SESSION_NOTES = {"/feat-personal-agent": (
    " This session (user, 2026-10-29): sol alone is too slow here — use \"opus\" (omit effort, ~85 tok/s vs "
    "sol ~15) for implementation slices on any layer plus scenario runs and verification, but never more than 6 opus "
    "at once (user, 2026-10-30); put further Claude-side slices on \"sonnet\". Claude-family cap is 10. Keep sol/terra for the slices that need GPT-side reasoning and astra "
    "as the per-slice reviewer (opus-authored slices still get an astra review).")}
SAVE_NOTE = (" Save mode (user): quota was overspent, so spend sparingly: spawn a subagent only when the work truly needs "
             "one, do small or sequential work inline, use one reviewer instead of a panel unless the slot is critical, no "
             "wide waves, astra/opus only for genuinely critical slots. The feat-personal-agent session is exempt; "
             "headroom.sh shows each session its own caps.")
# Codex limits reset 2026-10-15 (user: "burn it, but moderately"): Codex leaves save mode but keeps the shared
# HELPER_TOTAL cap (SHARED_CAP_FAMILIES), and the directive is codex-moderate; save mode then covers Claude only.
CODEX_MODERATE = True  # 2026-10-16: spend Codex actively on sol within the shared 12-cap, without over-burning on astra
CLAUDE_SAVE_NOTE = (" Save mode still applies to Claude (user): spawn Claude agents only for the seats named above, one "
                    "reviewer instead of a panel unless the slot is critical. The feat-personal-agent session is exempt; "
                    "headroom.sh shows each session its own caps.")
# Claude accounts added 2026-11-04 (user: "싹다 claude worker로 이송"); the rest followed 2026-11-13
# (user: "claude만 두지말고 대부분 claude-worker로 옮겨줘야해").
NEW_CLAUDE_WORKERS = {"<identity:ADMIN_AI_0002_EMAIL>", "<identity:AI_TEAMTURING_GMAIL_EMAIL>", "<identity:AI_TEAMTURING2_GMAIL_EMAIL>", "<identity:BELLA_TEAMTURING_COM_EMAIL>",
                      "<identity:ETHAN_TEAMTURING_COM_EMAIL>", "<identity:GABIN_TEAMTURING_COM_EMAIL>", "<identity:HUE_TEAMTURING_COM_EMAIL>", "<identity:JULIE_TEAMTURING_COM_EMAIL>",
                      "<identity:LEA_TEAMTURING_COM_EMAIL>", "<identity:MELISSA_TEAMTURING_COM_EMAIL>", "<identity:SENA_TEAMTURING_COM_EMAIL>",
                      "<identity:EVELYN_TEAMTURING_COM_EMAIL>", "<identity:MARY_TEAMTURING_COM_EMAIL>", "<identity:INA_TEAMTURING_COM_EMAIL>", "<identity:CHLOE_TEAMTURING_COM_EMAIL>",
                      "<identity:TOM_TEAMTURING_COM_EMAIL>", "<identity:WENDY_TEAMTURING_COM_EMAIL>", "<identity:JEANNE_TEAMTURING_COM_EMAIL>"}
# Exclude reserved credentials without overriding manual or OAuth disable reasons.
BANNED_HERE = {"openai-codex": {"<identity:TURING_WORKER_02_EMAIL>"}}
CODEX_UNENTITLED_PLANS = {"free"}

PROVIDER_WINDOWS = {
    "anthropic": {"Claude 5 Hour": "5h", "Claude 7 Day": "7d"},
    "openai-codex": {"7 days": "7d"},
}
CLAUDE_WORKERS = {"<identity:ADMIN_DEVELOPERS_TEAMTURING_EMAIL>", "<identity:TURING_EMAIL>", "<identity:GLOBAL_TEAMTURING_COM_EMAIL>", "<identity:YH_EMAIL>", "<identity:ADMIN_AI_TEAMTURING_EMAIL>", "<identity:CONTENTS_TURING_TEAMTURING_EMAIL>", "<identity:JUNE_TEAMTURING_COM_EMAIL>", "<identity:LEE_TEAMTURING_COM_EMAIL>", *NEW_CLAUDE_WORKERS}
DRY = "--dry-run" in sys.argv
LOOP = "--loop" in sys.argv and not DRY
now = time.time()


def log(msg):
    print(msg, flush=True)


def notify(msg):
    log(msg)
    if not DRY:
        subprocess.run(["notify-send", "-u", "critical", "omp account rotation", msg], capture_output=True, timeout=10)


def reverify_ledger():
    # reverify.py runs each check twice (check and negative) with 30-60 s each; this bounds how long rotation waits on it.
    try:
        p = subprocess.run([sys.executable, REVERIFY], capture_output=True, text=True, timeout=400)
    except subprocess.TimeoutExpired:
        notify("incident ledger: re-verification took longer than 400 s")
        return
    if p.returncode:
        # stdout carries one readable line per problem; stderr may hold a stack trace and is only logged.
        if p.stderr.strip():
            log(p.stderr.strip()[-2000:])
        notify(f"incident ledger: {p.stdout.strip()[:400] or f'reverify.py exited {p.returncode}'}")


def omp(*args):
    return subprocess.run(["omp", *args], capture_output=True, text=True, timeout=90).stdout.strip()


def quota_pool(candidates, cache, *, provider="anthropic", caps=None):
    default_cap = 1.0 if provider == "openai-codex" else HARD_CAP
    open_accounts = set()
    soon = {}
    for email in candidates:
        cap = default_cap if caps is None else caps.get(email, 0.0)
        win = current(cache.get(email, {}))
        if cap <= 0 or any(w["used"] >= cap for w in win.values()):
            continue
        open_accounts.add(email)
        reset = win.get("7d", {}).get("resetsAt")
        if reset and reset > now and (provider == "openai-codex" or reset - now <= EXPIRY_FOCUS_S):
            soon[email] = reset
    if not soon:
        return open_accounts
    # Providers can report slightly different reset times for accounts in the same cohort.
    first = min(soon.values())
    return {email for email, reset in soon.items() if reset - first < EXPIRY_COHORT_S}


def auth_ready_quota_pool(candidates, cache, blocked, minimum=1, *, provider="anthropic", caps=None):
    ready = candidates - blocked
    active = quota_pool(ready, cache, provider=provider, caps=caps)
    if len(active) >= minimum:
        return active
    # A narrow expiry cohort should not leave Claude without an immediate backup.
    default_cap = 1.0 if provider == "openai-codex" else HARD_CAP
    backups = []
    for email in ready - active:
        cap = default_cap if caps is None else caps.get(email, 0.0)
        win = current(cache.get(email, {}))
        if cap > 0 and win and all(w["used"] < cap for w in win.values()):
            reset = win.get("7d", {}).get("resetsAt")
            backups.append((reset or float("inf"), email))
    return active | {email for _, email in sorted(backups)[:minimum - len(active)]}

def codex_policy_caps(db):
    identities = {
        rid: (kind, json.loads(identity))
        for rid, kind, identity in db.execute(
            "SELECT id, credential_type, json_object('email', json_extract(data, '$.email'), "
            "'accountId', json_extract(data, '$.accountId'), 'orgId', json_extract(data, '$.orgId'), "
            "'projectId', json_extract(data, '$.projectId')) FROM auth_credentials "
            "WHERE provider = 'openai-codex' AND (disabled_cause IS NULL OR disabled_cause = ?)", (CAUSE,)
        )
    }
    try:
        policies = json.loads(omp("config", "get", "auth.accountPolicies", "--json"))["value"]
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return None
    if not isinstance(policies, list):
        return None
    matches = {rid: [] for rid in identities}
    for policy in policies:
        if not isinstance(policy, dict) or policy.get("provider") != "openai-codex":
            continue
        account = policy.get("account")
        if (not isinstance(account, dict) or not any(key in account for key in ("email", "accountId", "projectId"))
                or not all(key in ("email", "accountId", "orgId", "projectId")
                           and isinstance(value, str) and value for key, value in account.items())):
            continue
        selected = [rid for rid, (kind, identity) in identities.items()
                    if kind == "oauth" and all(identity.get(key) == value for key, value in account.items())]
        reserve = policy.get("reservePct")
        cap = ((100 - reserve) / 100
               if type(reserve) in (int, float) and math.isfinite(reserve) and 0 <= reserve <= 100 else None)
        for rid in selected:
            matches[rid].append(cap if len(selected) == 1 else None)
    return {rid: caps[0] for rid, caps in matches.items() if len(caps) == 1 and caps[0] is not None}

def save_state(state):
    with open(STATE + ".tmp", "w") as stream:
        json.dump(state, stream, indent=1)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(STATE + ".tmp", STATE)
    directory = os.open(os.path.dirname(STATE), os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def fresh_codex_report(account, email):
    started = time.time()
    subprocess.run(["omp", "usage", "invalidate", "--provider", "openai-codex"],
                   capture_output=True, timeout=90, check=True)
    reports = json.loads(omp("usage", "--provider", "openai-codex", "--json"))["reports"]
    matching = []
    for report in reports:
        meta = report.get("metadata") or {}
        if (report.get("provider") == "openai-codex" and not meta.get("stale")
                and (meta.get("accountId") == account if account else meta.get("email") == email)
                and isinstance(report.get("fetchedAt"), (int, float))
                and started * 1000 <= report["fetchedAt"] <= time.time() * 1000 + 1000):
            matching.append(report)
    return max(matching, key=lambda report: report["fetchedAt"], default=None)


def codex_reset_windows(report):
    at = time.time()
    exhausted = []
    seen = set()
    for limit in report.get("limits", []):
        fallback = {"openai-codex:primary": "5h", "openai-codex:secondary": "weekly"}.get(limit.get("id"))
        if fallback is None:
            continue
        window = limit.get("window") or {}
        duration = window.get("durationMs")
        kind = ("weekly" if isinstance(duration, (int, float)) and abs(duration - 7 * 86400000) <= 60000
                else "5h" if isinstance(duration, (int, float)) and abs(duration - 5 * 3600000) <= 60000
                else fallback)
        used = (limit.get("amount") or {}).get("usedFraction")
        if type(used) not in (int, float) or not math.isfinite(used) or used < 0:
            return None
        seen.add(fallback)
        reset = window.get("resetsAt")
        if isinstance(used, (int, float)) and used >= 1:
            if not isinstance(reset, (int, float)) or not at < reset / 1000 <= at + (8 * 86400 if kind == "weekly" else 6 * 3600):
                return None
            exhausted.append((kind, reset / 1000))
    return exhausted if seen else None


def recover_codex_account(db, state, candidates, cache, row_accounts, policy_caps, auth_blocked, catalog_holds,
                          quota_blocked=()):
    if DRY:
        return None
    try:
        settings = {
            key: json.loads(omp("config", "get", "codexResets." + key, "--json"))["value"]
            for key in ("autoRedeem5h", "autoRedeemWeekly", "keepCredits", "minBlockedMinutes")
        }
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
        return None
    if not any(settings[key] == "yes" for key in ("autoRedeem5h", "autoRedeemWeekly")):
        return None
    if any(type(settings[key]) not in (int, float) or not math.isfinite(settings[key]) or settings[key] < 0
           for key in ("keepCredits", "minBlockedMinutes")):
        return None
    if settings["keepCredits"] > 0:
        log("Codex reset bridge skipped: native CLI cannot atomically enforce a positive credit reserve.")
        return None
    eligible = [
        (email, rid) for email, ids in candidates.items() for rid in ids
        if policy_caps.get(rid, 0) > 0 and rid not in auth_blocked and rid not in catalog_holds
        and (rid in quota_blocked or any(window["used"] >= 1 for window in current(cache.get(email, {})).values()))
    ]
    eligible.sort(key=lambda item: (cache.get(item[0], {}).get("7d", {}).get("resetsAt") or float("inf"), item[1]))
    attempts = state.setdefault("codexResetAttempts", {}) if eligible else {}
    for email, rid in eligible:
        account = row_accounts[rid][0]
        key = account or email
        previous = attempts.get(key, {})
        if now - previous.get("lastProbeAt", 0) < 300:
            continue
        if now - previous.get("attemptedAt", 0) < 1800 and not previous.get("awaitingRecovery"):
            continue
        temporary = False
        attempted = False
        try:
            if db.execute(
                "SELECT 1 FROM auth_credential_blocks WHERE credential_id = ? AND block_scope = 'auth' "
                "AND blocked_until_ms > ? LIMIT 1", (rid, now * 1000),
            ).fetchone():
                continue
            cause = db.execute("SELECT disabled_cause FROM auth_credentials WHERE id = ?", (rid,)).fetchone()
            if cause is None or cause[0] not in (None, CAUSE):
                continue
            previous = attempts.setdefault(key, {})
            previous["lastProbeAt"] = now
            save_state(state)
            if cause[0] == CAUSE:
                temporary = bool(db.execute(
                    "UPDATE auth_credentials SET disabled_cause = NULL WHERE id = ? AND disabled_cause = ?", (rid, CAUSE)
                ).rowcount)
                db.commit()
                if not temporary:
                    continue
            report = fresh_codex_report(account, email)
            if report is None:
                continue
            exhausted = codex_reset_windows(report)
            if exhausted is None:
                continue
            if not exhausted:
                if previous.get("awaitingRecovery"):
                    previous["awaitingRecovery"] = False
                    save_state(state)
                    log(f"Codex reset recovery credential={rid} recovered=True")
                return email, rid, report
            # A timeout can follow a successful spend; never re-spend this episode on a stale full report.
            if (now - previous.get("attemptedAt", 0) < 1800
                    or (previous.get("awaitingRecovery") and now < previous.get("unblockAt", 0) + 300)):
                continue
            if any(settings["autoRedeem5h" if kind == "5h" else "autoRedeemWeekly"] != "yes"
                   for kind, _ in exhausted):
                continue
            if max(reset for _, reset in exhausted) - now < settings["minBlockedMinutes"] * 60:
                continue
            credits = (report.get("resetCredits") or {}).get("availableCount")
            if type(credits) not in (int, float) or not math.isfinite(credits) or credits < 1 or credits <= settings["keepCredits"]:
                continue
            listed_at = time.time() * 1000
            listing = json.loads(omp("usage", "reset", "--provider", "openai-codex", "--json"))
            if not isinstance(listing.get("generatedAt"), (int, float)) or listing["generatedAt"] < listed_at:
                continue
            balances = [item for item in listing.get("accounts", [])
                        if item.get("provider") == "openai-codex" and item.get("credentialId") == rid]
            if len(balances) != 1 or balances[0].get("error") or balances[0].get("unavailableReason"):
                continue
            available, redeemable = balances[0].get("availableCount"), balances[0].get("redeemableCount")
            if (type(available) not in (int, float) or not math.isfinite(available)
                    or available <= settings["keepCredits"]
                    or type(redeemable) not in (int, float) or not math.isfinite(redeemable) or redeemable < 1):
                continue
            if db.execute(
                "SELECT 1 FROM auth_credential_blocks WHERE credential_id = ? AND block_scope = 'auth' "
                "AND blocked_until_ms > ? LIMIT 1", (rid, time.time() * 1000),
            ).fetchone():
                continue
            if db.execute("SELECT disabled_cause FROM auth_credentials WHERE id = ?", (rid,)).fetchone() != (None,):
                continue
            attempts[key] = {"attemptedAt": now, "unblockAt": max(reset for _, reset in exhausted),
                             "awaitingRecovery": True, "lastProbeAt": now}
            save_state(state)
            attempted = True
            log(f"Codex reset attempt credential={rid}")
            exit_class = "unknown"
            # The supported command owns the cross-process fence and live credit recheck; its prose is not an API.
            try:
                result = subprocess.run(["omp", "usage", "reset", f"openai-codex/{rid}", "--json"],
                                        capture_output=True, timeout=90, check=False)
                exit_class = "success" if result.returncode == 0 else "unknown"
            except subprocess.TimeoutExpired:
                exit_class = "timeout"
            except (OSError, subprocess.SubprocessError):
                exit_class = "error"
            try:
                refreshed = fresh_codex_report(account, email)
            except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
                refreshed = None
            recovered = refreshed is not None and codex_reset_windows(refreshed) == []
            log(f"Codex reset outcome credential={rid} exit={exit_class} recovered={recovered}")
            if recovered:
                attempts[key]["awaitingRecovery"] = False
                save_state(state)
            return email, rid, refreshed or report
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError):
            if attempted:
                return None
        finally:
            if temporary or attempted:
                db.execute("UPDATE auth_credentials SET disabled_cause = ? WHERE id = ? AND disabled_cause IS NULL",
                           (CAUSE, rid))
                db.commit()
    return None



SNAPSHOT = f"{HOME}/.omp/agent/usage-snapshot.json"


def fetch_usage():
    """`omp usage --json`, also merged into SNAPSHOT so headroom.sh and the bar widget read a cache instead of
    hitting the 429-prone usage endpoint themselves (user, 2026-10-22). Accounts missing from this fetch (disabled,
    or throttled) keep their last report, flagged metadata.stale, so they do not vanish from the widget."""
    usage = json.loads(omp("usage", "--json"))
    try:
        with open(SNAPSHOT) as f:
            old = json.load(f).get("reports", [])
    except (OSError, ValueError):
        old = []
    key = lambda r: (r.get("provider"), (r.get("metadata") or {}).get("email") or (r.get("metadata") or {}).get("accountId"))
    fresh = {key(r) for r in usage.get("reports", []) if r.get("limits")}
    reports = [r for r in usage.get("reports", []) if r.get("limits") or key(r) not in {key(o) for o in old}]
    # Only accounts that still have a credential row carry over; a deleted account (turing-worker-01 Claude, put on
    # hold 2026-10-30) would otherwise stay on the dashboard forever.
    with sqlite3.connect(f"file:{HOME}/.omp/agent/agent.db?mode=ro", uri=True) as ro:
        known = {(p, k.split("|")[0].removeprefix("email:")) for p, k in
                 ro.execute("select provider, identity_key from auth_credentials where identity_key is not null")}
    for r in old:
        if key(r) not in fresh and r.get("limits") and key(r) in known:
            reports.append({**r, "metadata": {**(r.get("metadata") or {}), "stale": True}})
    if not DRY:
        try:
            with open(f"{HOME}/.omp/agent/config.yml") as f:
                codex_tier = config_codex_tier(f.read())
        except OSError:
            codex_tier = None
        # The bar widget and the dashboard group and badge accounts from these, so the policy lives in one place.
        claude_workers = {r["metadata"]["email"] for r in reports if r.get("provider") == "anthropic"
                          and str((r.get("metadata") or {}).get("email", "")).startswith("turing-worker-")}
        groups = {"anthropic": {e: "worker" for e in claude_workers | CLAUDE_WORKERS},
                  "openai-codex": {e: "worker" for e in CODEX_ALWAYS_ON}}
        tmp = SNAPSHOT + ".tmp"
        with open(tmp, "w") as f:
            json.dump({**usage, "reports": reports, "codexTier": codex_tier, "accountGroups": groups}, f)
        os.replace(tmp, SNAPSHOT)
    # Stale carry-overs keep the last known plan of disabled accounts visible to the Codex plan exclusion.
    return {**usage, "merged": reports}


def load_state():
    try:
        with open(STATE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def windows_of(report, labels):
    out = {}
    for lim in report.get("limits", []):
        label = lim.get("label")
        if not label:
            continue
        amount = lim.get("amount") or {}
        used = amount.get("usedFraction")
        if used is None and (remaining := amount.get("remainingFraction")) is not None:
            used = 1 - remaining
        if not isinstance(used, (int, float)) or not 0 <= used <= 1:
            continue
        resets = (lim.get("window") or {}).get("resetsAt")
        out[labels.get(label, label)] = {"used": used, "resetsAt": resets / 1000 if resets else None}
    return out


def current(win):
    """Cached windows: a passed reset means the window is empty again."""
    return {
        wid: ({**w, "used": 0.0, "resetsAt": None} if w.get("resetsAt") and w["resetsAt"] < now else w)
        for wid, w in win.items()
    }

# Per-agent concurrency per session (user, 2026-11-10: Fable 5.2 plans and reviews; 2026-11-11: opus implements).
AGENT_CAPS = {"fable": {"cap": 10, "note": "plans, design advice, cross-verification of opus/astra slices, whole-change reviews; never writing"},
              "opus": {"cap": 10, "note": "frontend owner; shares non-frontend implementation with Sol and agy Orchestrator; actively use available Codex for implementation and reviews"}}
CODEX_ALWAYS_ON = {"<identity:ZKWMAK08_GMAIL_COM_EMAIL>", "<identity:TURING_EMAIL>", "<identity:YH04060_NAVER_COM_EMAIL>", "<identity:YH_EMAIL>", *[f"turing-worker-0{i}@gpai.app" for i in range(1, 7)]}

def rows(db, provider, email):
    key = f"email:{email}"
    return db.execute(
        "select id, disabled_cause from auth_credentials where provider=? "
        "and (identity_key=? or substr(identity_key, 1, ?)=?)",
        (provider, key, len(key) + 1, key + "|"),
    ).fetchall()


def set_enabled(db, provider, email, enable, blocked_ids):
    changed = False
    for rid, cause in rows(db, provider, email):
        if cause not in (None, CAUSE):
            continue
        allowed = enable and rid not in blocked_ids
        if allowed and cause is not None:
            db.execute("update auth_credentials set disabled_cause=NULL, updated_at=strftime('%s','now') where id=?", (rid,))
            changed = True
        elif not allowed and cause is None:
            db.execute("update auth_credentials set disabled_cause=?, updated_at=strftime('%s','now') where id=?", (CAUSE, rid))
            changed = True
    if changed:
        log(f"{provider} {email}: {'enable' if enable else 'disable'}")
    return changed


def _pane_has_spinner(pid):
    """True when an omp pane's status bar shows an active Braille spinner (e.g. background subagents running)."""
    try:
        lines = subprocess.run(["hc", "read", pid], capture_output=True, text=True, timeout=5).stdout.splitlines()
        for l in reversed(lines):
            if l.startswith("\ue0b6"):
                return any(c in l[:12] for c in "⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏")
    except (OSError, subprocess.SubprocessError):
        pass
    return False


def omp_panes():
    """herdr-core terminals running omp, as (terminal address, status, cwd)."""
    try:
        out = subprocess.run(["hc", "ls", "--json"], capture_output=True, text=True, timeout=10).stdout
        res = []
        for t in json.loads(out)["terminals"]:
            if t.get("agent") != "omp" or t.get("state") != "live":
                continue
            pid = t["address"]
            st = t.get("status")
            if st != "working" and _pane_has_spinner(pid):
                st = "working"
            res.append((pid, st, t.get("cwd", "")))
        return res
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return []


IMPLEMENTATION_STEER = (
    "Codex capacity priority (user, 2026-11-24): use the available ChatGPT subscription quota fully on useful "
    "implementation and reviews, with no Codex reserve. The rotation service selects accounts with the nearest "
    "weekly reset first, even when it is more than 24 hours away; no account-name preference. Backend "
    "implementation always runs as a pair (user, 2026-11-24): GPT-6 Astra plus Opus on the same slice, never Astra "
    "alone; fall back to GPT-6.1 Sol for the Astra seat only when Astra is unavailable, blocked or out of quota. "
    "Astra also takes deep backend logic, authz, concurrency, planning, reviews and bug hunts. Keep agy "
    "Orchestrator in real independent implementation slices; "
    "frontend, UI and product copy stay on Opus. Use Astra and Sol on distinct review questions when useful, but "
    "never count two OpenAI reviewers as cross-family independence. Reviews and bug hunts use the highest "
    "supported effort (task effort hi, capped at xhigh); ordinary implementation omits effort. Keep one owner "
    "per path, obey live budgets, stop at provider exhaustion, and never create filler work or repeat completed "
    "reviews solely to spend quota. Native automatic Codex saved resets are authorized through the last credit. "
    "Do not redeem other providers' resets, buy credits, or enable automatic top-ups. "
    "Main runs `agy-agent coder` in a Herdr pane for implementation, `agy-agent gemini` (Hydrogen) for "
    "research, vision and summaries, and `agy-agent reviewer` (Neon) for independent reviews. "
    "Fable and Astra are the core planning/review pair; skip the author's family for independent review. "
    "Fable never implements. Devin is SWE-only; outside gpai-monorepo deepseek/minimax/swe are extra review seats only."
)
SOL_FIRST = ("sol-first", IMPLEMENTATION_STEER)
CODEX_BLOCKED = (
    "codex-blocked",
    "Codex has no usable account: do not spawn astra, sol or luna. Split ordinary implementation between Opus "
    "and `agy-agent coder` (Orchestrator); frontend, UI and copy stay on Opus. Use Fable for plans and independent "
    "reviews of Google work, and `agy-agent reviewer` (Neon) for independent reviews of Claude work.")
CODEX_MODE = (
    "codex-mode",
    "Claude has no usable account: do not spawn opus, sonnet, fable or haiku. Continue non-frontend implementation "
    "with Sol and `agy-agent coder` (Orchestrator), and Astra for deep work. Use `agy-agent reviewer` (Neon) for "
    "independent reviews of Codex work. Hold frontend, UI and copy for Opus or ask the user before reassigning.")
CODEX_MODERATE_STEER = ("codex-moderate", IMPLEMENTATION_STEER)
CODEX_AG_OPUS_STEER = (
    "codex-ag-opus",
    "Codex + Antigravity Opus burn (user, 2026-10-16): \"opus\" and \"sonnet\" currently spend google-antigravity's "
    "separate Claude 5h/7d bucket (<identity:YH_ID> AI Ultra) before touching direct Anthropic quota, and Codex is open on "
    "<identity:YH_ID> — use both families actively in parallel waves up to their SUBAGENT BUDGETs! Put normal backend/logic/"
    "test/contract/migration slots on \"sol\" (omit effort); put frontend/UI/copy work, planning drafts, architecture/"
    "design, verification of GPT-authored work, and review panels on \"opus\" (omit effort) and \"sonnet\". To avoid "
    "over-burning Codex, reserve \"astra\" (omit effort) strictly for top-intelligence backend/logic/security/"
    "concurrency slots and critical reviews. Keep \"luna\" and `agy-agent gemini` for search/scans. Outside gpai-monorepo "
    "\"swe\" (effort \"hi\", \"med\" for fill-in) takes fill-in and fixed-contract slots and what exceeds the budgets; "
    "in gpai-monorepo swe is overflow only.")
# Codex tier is chosen by the user (user, 2026-10-30: "fast ultrafast standard 모두 선택할수있게"): the dashboard and
# the bar widget write CODEX_TIER_FILE through `rotate-accounts.py --set-tier <tier>`; every pass applies it.
CODEX_TIER_FILE = f"{os.path.expanduser('~')}/.omp/agent/codex-tier"
CODEX_TIERS = ("standard", "fast", "ultrafast")
CODEX_TIER_DEFAULT = "standard"
CODEX_TIER_NOTES = {
    "standard": (" Codex agents (\"sol\", \"astra\", \"terra\", \"luna\") run at the standard tier (set by the user): "
                 "never use /fast or a priority override; if your session is on fast, run /fast to turn it off."),
    "fast": (" Codex agents (\"sol\", \"astra\", \"terra\", \"luna\") run at the priority (fast) tier, subagents and Codex "
             "Mains alike (set by the user). If your session is not on fast, run /fast."),
    "ultrafast": (" Codex agents run at the fastest tier the model offers (set by the user): \"sol\" and \"astra\" at "
                  "ultrafast, \"terra\" and \"luna\" at priority (fast; they have no ultrafast). Ultrafast spends Codex "
                  "quota several times faster than fast, so keep waves purposeful."),
}
CODEX_STANDARD_TIER = (" If your own model is gemini-4-argon, NEVER spawn "
                       "\"naturalizer\" — write Korean/non-English text directly. Wrap-up work goes to the wrap-up roles "
                       "(user, 2026-10-25: enforce them; 2026-10-29: never opus/sol for these), which Main runs itself from bash as "
                       "`agy-agent <role> < packet-file` via ACP (never as task subagents): CI preflight and CI "
                       "watching through \"ci\"; Gemini 4 Hydrogen drafts the commit plan through \"committer\" and "
                       "the PR draft through \"pr\". Main applies them; agy does not commit or publish. All agent-to-agent "
                       "packets, messages, plans, reviews and handoffs are in English, including across OpenAI, Anthropic "
                       "and Gemini. Naturalize only at the human boundary: Main sends English intent with target_language: "
                       "ko to `agy-agent naturalizer` (Gemini Hydrogen) for session replies, Slack, GitHub and other "
                       "human-facing text, then verifies and delivers the Korean result. No non-Gemini prose fallback. "
                       "In a new Herdr coder pane, inspect setup before counting it as dispatched. If only the color "
                       "scheme picker is shown with terminal selected, confirm it once with `hc keys <terminal> enter` "
                       "and re-read. Stop on sign-in, Terms of Service, or data consent; never accept them on the user's behalf.")


def claude_burn_steer(until, why):
    """Directive while Claude quota should be spent fast until `until`."""
    at = time.strftime("%H:%M", time.localtime(until))
    return (
        "claude-burn",
        f"Claude priority until {at} local time: {why}. Favor Opus for suitable implementation while the window "
        "lasts, without dropping Sol or `agy-agent coder` from independent non-frontend slices when available. "
        "Frontend, UI and copy stay on Opus. Astra still handles deep backend work and plans/reviews with Fable; "
        "use `agy-agent gemini` for research and `agy-agent reviewer` as an independent Google review seat.")


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


def omp_pane_builds(addresses, proc=Path("/proc")):
    candidates = {os.fsencode(address): set() for address in addresses}
    if not candidates:
        return {}
    prefix = b"HC_TERMINAL_ID="
    for entry in proc.iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            if entry.stat().st_uid != os.getuid() or (entry / "comm").read_text().strip() != "omp":
                continue
            # Child workers can inherit the pane address without owning the interactive PTY.
            if not str((entry / "fd" / "0").readlink()).startswith("/dev/pts/"):
                continue
            address = next((v[len(prefix):] for v in (entry / "environ").read_bytes().split(b"\0")
                            if v.startswith(prefix)), None)
            if address not in candidates:
                continue
            exe = (entry / "exe").readlink()
        except OSError:
            continue
        build = exe.parent.name
        if (exe.name == "omp" and exe.parent.parent.name == "github-can1357-oh-my-pi"
                and re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][\w.]+)?", build)):
            candidates[address].add(build)
        else:
            candidates[address].add(installed_build_of(exe) or "unknown")
    return {os.fsdecode(address): builds for address, builds in candidates.items()}


_COPY_BUILDS = {}


def installed_build_of(exe):
    """Build whose install is byte-identical to ``exe``. Herdr resumes panes with ``~/.local/bin`` first on
    PATH, so they run ``~/.local/bin/omp`` (a copy of an install); 2026-11-25 eight such panes read as
    'unknown' and withheld Sol/Astra from every session. A copy that matches no install stays unknown."""
    try:
        st = exe.stat()
    except OSError:
        return None
    key = (str(exe), st.st_size, st.st_mtime_ns, st.st_ino)
    if key not in _COPY_BUILDS:
        _COPY_BUILDS[key] = None
        for install in sorted(OMP_INSTALLS.glob("*/omp")):
            build = install.parent.name
            if install.is_symlink() or not re.fullmatch(r"\d+\.\d+\.\d+(?:[-+][\w.]+)?", build):
                continue
            try:
                if install.stat().st_size == st.st_size and filecmp.cmp(install, exe, shallow=False):
                    _COPY_BUILDS[key] = build
                    break
            except OSError:
                continue
    return _COPY_BUILDS[key]


# OMP 19.x leaves model_cache.updated_at alone when a refresh returns an unchanged catalog and records
# the successful fetch in model_cache_freshness.updated_at instead (2026-11-25: 19.1.1 refreshed fine,
# the payload stayed at 17:20, and the stale check fired). Freshness is the later of the two.
CODEX_CATALOG_FRESH_SQL = (
    "SELECT c.materialization_policy, c.authoritative, c.models, "
    "MAX(c.updated_at, COALESCE(f.updated_at, 0)) AS fresh FROM model_cache c "
    "LEFT JOIN model_cache_freshness f ON f.provider_id = c.provider_id "
    "AND f.materialization_policy = c.materialization_policy AND f.authoritative = c.authoritative "
    "WHERE c.provider_id LIKE 'openai-codex:%' AND c.materialization_policy LIKE ? AND fresh >= ? "
    "ORDER BY fresh DESC, c.updated_at DESC"
)


def codex_catalogs(db_path, at):
    catalogs = {}
    uri = Path(db_path).as_uri() + "?mode=ro"
    try:
        with sqlite3.connect(uri, uri=True, timeout=1) as db:
            for policy, authoritative, raw, _ in db.execute(
                CODEX_CATALOG_FRESH_SQL, ("app-%", int((at - CODEX_CATALOG_MAX_AGE_S) * 1000)),
            ):
                match = re.match(r"app-([^:]+):", policy or "")
                if not match or match[1] in catalogs:
                    continue
                # The newest materialization for a build wins; a bundled fallback is not entitlement evidence.
                catalogs[match[1]] = {}
                if not authoritative:
                    continue
                for model in json.loads(raw):
                    mid, access = model.get("id"), model.get("accountAccess")
                    if mid in CODEX_STEER_MODELS and isinstance(access, dict):
                        catalogs[match[1]][mid] = set(access)
    except (OSError, sqlite3.Error, TypeError, ValueError, AttributeError):
        return {}
    return catalogs


def codex_catalog_updated_at(build):
    try:
        with sqlite3.connect(Path(MODELS_DB).as_uri() + "?mode=ro", uri=True, timeout=1) as db:
            row = db.execute(CODEX_CATALOG_FRESH_SQL, (f"app-{build}:%", 0)).fetchone()
    except sqlite3.Error:
        return 0
    return (row and row[3]) or 0


def refresh_codex_catalogs(builds, state):
    refreshed = state.setdefault("codexCatalogRefreshedAt", {})
    # A refresh can exit 0 without writing a catalog (2026-11-23: 19.1.0 stayed stale and every
    # session lost Sol/Astra for a day). Builds whose refresh did not advance the catalog are kept
    # here; the codex-catalog-refresh-verified check reports them through the ledger.
    stale = state.setdefault("codexCatalogStale", {})
    for build in sorted(builds - {"unknown"}):
        if now - refreshed.get(build, 0) < CODEX_CATALOG_REFRESH_S:
            continue
        binary = OMP_INSTALLS / build / "omp"
        if not binary.is_file():
            continue
        refreshed[build] = now
        before = codex_catalog_updated_at(build)
        try:
            result = subprocess.run(
                [str(binary), "models", "refresh", "openai-codex", "--no-extensions"],
                stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=30,
            )
            if result.returncode:
                log(f"Codex catalog refresh for OMP {build} exited {result.returncode}")
        except (OSError, subprocess.SubprocessError) as e:
            log(f"Codex catalog refresh for OMP {build}: {type(e).__name__}")
        if codex_catalog_updated_at(build) > before:
            stale.pop(build, None)
        else:
            stale[build] = now
            log(f"Codex catalog refresh for OMP {build} did not update the catalog")


def codex_catalog_holds(accounts, metered, catalogs, observed):
    verified = set()
    for access in catalogs.values():
        verified.update(set.intersection(*(access.get(model, set()) for model in CODEX_STEER_MODELS)))
    if not verified.intersection(accounts.values()):
        return set()
    # A credential absent from both discovery and live usage must not veto verified siblings.
    return {rid for rid, account in accounts.items()
            if rid in observed and rid not in metered and account not in verified}


AG_CLAUDE_ENABLED = False  # 2026-10-18: user switched off Antigravity Claude routing (keep Antigravity for Gemini only)
AG_CLAUDE_EMAIL = "<identity:YH_EMAIL>"
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


# config.yml text per tier: per-agent overrides for subagents, `tier.openai` for Codex Mains. terra and luna have no
# ultrafast (Codex /models, 2026-10-30), so they stay on priority there instead of silently dropping to standard.
CODEX_TIER_CONFIG = {
    "standard": ("  agentServiceTierOverrides: {}\n", "tier:\n  openai: none"),
    "fast": ("  agentServiceTierOverrides:\n    sol: priority\n    astra: priority\n    terra: priority\n    luna: priority\n",
             "tier:\n  openai: priority"),
    "ultrafast": ("  agentServiceTierOverrides:\n    sol: ultrafast\n    astra: ultrafast\n    terra: priority\n    luna: priority\n",
                  "tier:\n  openai: ultrafast"),
}


def read_codex_tier():
    try:
        with open(CODEX_TIER_FILE) as f:
            tier = f.read().strip()
    except OSError:
        return CODEX_TIER_DEFAULT
    return tier if tier in CODEX_TIERS else CODEX_TIER_DEFAULT


_TIER_BLOCK_RE = re.compile(r"^  agentServiceTierOverrides:(?: \{\}\n|\n(?:    [\w-]+: [\w-]+\n)+)", re.M)
_TIER_MAIN_RE = re.compile(r"^tier:\n  openai: [\w-]+", re.M)


def _tier_overrides(block):
    return dict(re.findall(r"^    ([\w-]+): ([\w-]+)$", block, re.M))


def config_codex_tier(text):
    """The tier config.yml currently carries, or None when it matches none of CODEX_TIER_CONFIG.

    Compares parsed agent->tier pairs, not raw text: hand edits reorder the override lines."""
    block, main = _TIER_BLOCK_RE.search(text), _TIER_MAIN_RE.search(text)
    if not block or not main:
        return None
    have = (_tier_overrides(block.group()), main.group())
    return next((t for t, (b, m) in CODEX_TIER_CONFIG.items() if (_tier_overrides(b), m) == have), None)


def set_codex_tier(tier):
    """Rewrite config.yml's subagent overrides and Codex Main tier to `tier`."""
    cfg_path = f"{HOME}/.omp/agent/config.yml"
    try:
        with open(cfg_path) as f:
            text = f.read()
        if config_codex_tier(text) is None:
            log("codex tier update skipped: config.yml tier lines not recognised")
            return
        if config_codex_tier(text) == tier:
            return
        new = _TIER_BLOCK_RE.sub(lambda _: CODEX_TIER_CONFIG[tier][0], text, count=1)
        new = _TIER_MAIN_RE.sub(lambda _: CODEX_TIER_CONFIG[tier][1], new, count=1)
        with open(cfg_path, "w") as f:
            f.write(new)
        log(f"codex tier -> {tier}")
    except OSError as e:
        log(f"codex tier update failed: {e}")


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
# <identity:YH_ID> also serves Flash so the Argon -> 3.8 Flash fallback stays on Antigravity while zk/sh are spent (2026-10-25).
AG_FLASH_ACCOUNTS = {"<identity:ZKWMAK08_GMAIL_COM_EMAIL>": {}, "<identity:SHAROSOO14_GMAIL_COM_EMAIL>": {}, "<identity:YH_EMAIL>": {}}
# Antigravity Gemini spent everywhere (2026-10-23): config.yml falls back from google-antigravity Gemini to the same
# models on CommandCode, which gpai-monorepo forbids, so live sessions are told how to route meanwhile.
AG_GEMINI_SPENT_AT = 0.98
AG_SPENT_NOTE = (" Antigravity Gemini is spent on every account: `agy-agent gemini`/`reviewer` exit 3, so skip those "
                 "seats and use \"haiku\"/\"luna\" for scans and \"opus\"/\"fable\"/\"sol\" for the rest until "
                 "Antigravity resets.")


# deepseek/minimax ride CommandCode and swe rides Devin; when a provider's every current window is spent, live
# sessions are told to skip those agents instead of failing on them (2026-10-25).
SPENT_AGENT_NOTES = {
    "commandcode": " CommandCode quota is spent: do not spawn \"deepseek\", \"minimax\", or \"muse\" until it resets.",
    "devin": " Devin quota is spent: do not spawn \"swe\" until it resets.",
}


def provider_spent(usage, provider):
    """True when every reported account has a current window at or above the cap."""
    reps = [r for r in usage.get("reports", []) if r.get("provider") == provider]
    return bool(reps) and all(any((l.get("amount") or {}).get("usedFraction") is not None
                                  and l["amount"]["usedFraction"] >= HARD_CAP
                                  and ((l.get("window") or {}).get("resetsAt") or 0) / 1000 > now
                                  for l in r.get("limits", [])) for r in reps)


def antigravity_gemini_spent(usage):
    """True when every google-antigravity account has a current Gemini window at or above AG_GEMINI_SPENT_AT."""
    seen = False
    for r in usage.get("reports", []):
        if r.get("provider") != "google-antigravity":
            continue
        seen = True
        gem = [l for l in r.get("limits", []) if l.get("label") == "Gemini" and (l.get("amount") or {}).get("usedFraction") is not None
               and ((l.get("window") or {}).get("resetsAt") or 0) / 1000 > now]
        if not any(l["amount"]["usedFraction"] >= AG_GEMINI_SPENT_AT for l in gem):
            return False
    return seen


def pin_antigravity_account_access():
    """Strip non-Gemini models (Claude/GPT) from google-antigravity in models.db, and pin Argon-><identity:YH_ID>, Flash->zk/sh."""
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
                log("pinned google-antigravity models.db (stripped Claude/GPT; <identity:YH_ID>: Argon; zk/sh/yh: 3.8 Flash)")
        mdb.close()
    except Exception as e:
        log(f"pin_antigravity_account_access failed: {e}")



def pane_busy_input(pid):
    """Why typing into the pane now would go astray, or None when its editor is empty.

    Typing into the terminal presses Enter after the text: a half-typed user draft gets the directive
    appended (2026-10-07 it became part of a `/btw` side question the main loop never saw), and an open side
    panel takes the keys as its own shortcuts. Those passes defer; the next one retries.
    """
    try:
        lines = subprocess.run(["hc", "read", pid], capture_output=True, text=True, timeout=10).stdout.splitlines()
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


def broadcast(state, default, panes):
    """Tell working omp sessions about a steering change (config edits do not reach live sessions).

    Panes that were idle when a directive went out still act on the older one once they resume,
    so every working pane whose last received directive text differs from the current one is caught up.
    """
    steer, text = default
    last = state.get("steer", {})
    sent = state.setdefault("steerSent", {})
    changed = last.get("key") != steer or last.get("text") != text
    live = {pid for pid, _, _ in panes}
    for pid in list(sent):
        if pid not in live:
            del sent[pid]
    targets = [pid for pid, status, _ in panes if status == "working" and sent.get(pid) != text]
    if not targets and not changed:
        return
    log(f"steer -> {steer}; directing {targets}")
    if DRY:
        return
    for pid in targets:
        busy = pane_busy_input(pid)
        if busy:
            log(f"steer {pid}: deferred ({busy})")
            continue
        msg = (f"[Routing directive from the account-rotation service ({steer}); it replaces every earlier routing directive. "
               f"Do not stop current work.] {text} Before each spawn wave run "
               "~/.omp/agent/managed-skills/model-routing/headroom.sh and stay within its SUBAGENT BUDGET lines.")
        sent_msg = subprocess.run(["hc", "send", "--if", "working", pid, msg], capture_output=True, timeout=30)
        if sent_msg.returncode == 0:
            sent[pid] = text
    if changed:
        state["steer"] = {"key": steer, "text": text, "at": now}


def apply_budget(plan, steer_text, panes, unsaved=(), wide=(), spurt=()):
    """Per-family subagent caps for Main (read via headroom.sh) plus the hard task.maxConcurrency.

    Families in `unsaved` skip save mode; families in `wide` also skip SHARED_CAP_FAMILIES (e.g. claude-burn).
    """
    working = max(1, sum(status == "working" for _, status, _ in panes))
    caps = {p: (WIDE_CAP if p in wide else NORMAL_CAPS.get(p, HELPER_MIN)
                if p in SHARED_CAP_FAMILIES or (spent and p not in unsaved) else WIDE_CAP)
            for p, spent in plan.items()}
    phases = {p: "burn-yh" if p in wide else "helpers" if plan[p] else "session-cap" if p in SHARED_CAP_FAMILIES
              else "burn-yh" for p in plan}
    caps.update({p: "unlimited" for p in spurt if p in caps})
    phases.update({p: "last-spurt" for p in spurt if p in phases})
    pane_caps = {}
    if SAVE_CAP is not None:
        saved = [p for p in plan if p not in unsaved]
        caps.update({p: min(caps[p], SAVE_CAP) for p in saved})
        phases.update({p: "save" for p in saved})
    for pid, _, cwd in panes:
        free = next((c for suffix, c in FREE_SESSIONS.items() if cwd.endswith(suffix)), None)
        if free is not None:
            pane_caps[pid] = {
                p: {"cap": free.get(p, caps[p]) if isinstance(free, dict) else free, "phase": "feat-personal-agent"}
                for p in plan
            }
    hard = NORMAL_COMBINED_CAP  # user, 2026-10-28: Codex uncapped, so no global cap
    budget = {
        "updatedAt": int(now),
        "workingSessions": working,
        "combinedCap": NORMAL_COMBINED_CAP,
        "perSession": {p: {"cap": c, "phase": phases[p]} for p, c in caps.items()},
        "agentCaps": AGENT_CAPS,
        "panes": pane_caps,
        "freeSessions": {k: {p: {"cap": v[p], "phase": "feat-personal-agent"} for p in v}
                         for k, v in FREE_SESSIONS.items() if isinstance(v, dict)},
        "freeSuffixes": list(FREE_SESSIONS.keys()),
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


def run_once():
    """One rotation pass; returns seconds until the next check."""
    global now
    now = time.time()
    db = sqlite3.connect(DB, timeout=10)
    codex_caps = codex_policy_caps(db)
    if codex_caps is None:
        log("Codex policy unavailable; rotation skipped without changing account state.")
        db.close()
        return MIN_INTERVAL_S
    try:
        usage = fetch_usage()
    except (ValueError, subprocess.SubprocessError) as e:
        db.close()
        log(f"usage fetch failed, no changes: {e}")
        return MIN_INTERVAL_S
    state = load_state()
    interval = MIN_INTERVAL_S
    plan = {}
    active_pools = {}
    db_emails = {}
    cred_map = state.setdefault("credentialIds", {})
    for cid, provider, identity in db.execute(
        "SELECT id, provider, identity_key FROM auth_credentials WHERE identity_key LIKE 'email:%'"
    ):
        email = identity.split("|", 1)[0][6:]
        cred_map[str(cid)] = {"provider": provider, "email": email}
        db_emails.setdefault(provider, set()).add(email)
    block_rows = db.execute(
        "SELECT b.credential_id, b.block_scope, MAX(b.blocked_until_ms) FROM auth_credential_blocks b "
        "JOIN auth_credentials c ON c.id = b.credential_id "
        "WHERE b.blocked_until_ms > ? AND (b.block_scope = 'auth' OR "
        "(c.provider = 'openai-codex' AND b.block_scope IN ('chat', 'shared'))) "
        "GROUP BY b.credential_id, b.block_scope", (now * 1000,)
    ).fetchall()
    auth_blocks = {}
    for rid, _, until in block_rows:
        auth_blocks[rid] = max(auth_blocks.get(rid, 0), until)
    auth_only = {rid for rid, scope, _ in block_rows if scope == "auth"}
    panes = omp_panes()
    builds = set().union(*omp_pane_builds(pid for pid, _, _ in panes).values())
    if not DRY and builds:
        refresh_codex_catalogs(builds, state)
    catalogs = {b: c for b, c in codex_catalogs(MODELS_DB, time.time()).items() if b in builds}
    codex_rows = {rid: (account, cause) for rid, account, cause in db.execute(
        "SELECT id, json_extract(data, '$.accountId'), disabled_cause FROM auth_credentials "
        "WHERE provider = 'openai-codex' AND (disabled_cause IS NULL OR disabled_cause = ?)", (CAUSE,)
    )}
    held_ids = set(auth_blocks) | (codex_rows.keys() - codex_caps.keys())

    for provider, labels in PROVIDER_WINDOWS.items():
        fresh = {}
        for report in usage["reports"]:
            meta = report.get("metadata") or {}
            email = meta.get("email")
            if report.get("provider") == provider and email in db_emails.get(provider, ()) and not meta.get("stale"):
                windows = fresh.setdefault(email, {})
                for wid, window in windows_of(report, labels).items():
                    if wid not in windows or window["used"] > windows[wid]["used"]:
                        windows[wid] = window
        cache = state.setdefault(provider, {})
        for email, windows in fresh.items():
            # Missing windows are not evidence that a previously capped bucket recovered.
            cache.setdefault(email, {}).update(windows)
        present = db_emails.get(provider, set())
        banned = BANNED_HERE.get(provider, set())
        if provider == "openai-codex":
            # A free ChatGPT plan has no Sol/Astra (model_not_found) yet reports an unused 30-day window, so
            # headroom showed Codex GREEN while every spawn failed (2026-11-26). The last reported plan sticks,
            # since disabled accounts only report stale data.
            plans = state.setdefault("codexPlans", {})
            for report in usage.get("merged", usage["reports"]):
                meta = report.get("metadata") or {}
                if report.get("provider") == provider and meta.get("email") and meta.get("planType"):
                    plans[meta["email"]] = meta["planType"]
            banned = banned | {email for email, kind in plans.items() if kind in CODEX_UNENTITLED_PLANS}
        candidates = {}
        for email in present - banned:
            owned = [rid for rid, cause in rows(db, provider, email) if cause in (None, CAUSE)]
            if owned:
                candidates[email] = owned
        caps = None
        if provider == "openai-codex":
            ready = {rid: codex_rows[rid][0] for ids in candidates.values() for rid in ids
                     if rid in codex_rows and rid not in held_ids}
            metered = {rid for email, ids in candidates.items() if fresh.get(email) for rid in ids}
            prior_catalog_holds = set(state.get("codexCatalogHeld", ()))
            observed = set(prior_catalog_holds)
            observed.update(rid for rid in ready if codex_rows[rid][1] is None)
            catalog_holds = codex_catalog_holds(ready, metered, catalogs, observed)
            held_ids.update(catalog_holds)
            state["codexCatalogHeld"] = sorted(catalog_holds)
            recovered = recover_codex_account(db, state, candidates, cache, codex_rows, codex_caps,
                                              auth_only, catalog_holds | prior_catalog_holds,
                                              set(auth_blocks) - auth_only)
            if recovered is not None:
                email, rid, report = recovered
                cache.setdefault(email, {}).update(windows_of(report, labels))
                still_blocked = db.execute(
                    "SELECT 1 FROM auth_credential_blocks WHERE credential_id = ? "
                    "AND block_scope IN ('auth', 'chat', 'shared') AND blocked_until_ms > ? LIMIT 1",
                    (rid, now * 1000),
                ).fetchone()
                if still_blocked is None:
                    held_ids.discard(rid)
                    auth_blocks.pop(rid, None)
            caps = {
                email: max((codex_caps[rid] for rid in ids if rid not in held_ids), default=0.0)
                for email, ids in candidates.items()
            }
        blocked = {email for email, ids in candidates.items() if all(rid in held_ids for rid in ids)}
        active = auth_ready_quota_pool(candidates.keys(), cache, blocked,
                                       minimum=3 if provider == "anthropic" else 1, provider=provider, caps=caps)
        if provider == "openai-codex" and any(
            window["used"] >= .95 for email in active for window in current(cache.get(email, {})).values()
        ):
            interval = min(interval, 60)
        for ids in candidates.values():
            for rid in ids:
                if rid in auth_blocks:
                    interval = min(interval, max(30, int(auth_blocks[rid] / 1000 - now) + 1))
        active_pools[provider] = sorted(active)
        for email in candidates.keys() | (present & banned):
            if DRY:
                log(f"would {'enable' if email in active else 'disable'} {provider} {email}")
            else:
                set_enabled(db, provider, email, email in active, held_ids)
        plan[provider] = not active
        for email in candidates:
            for w in current(cache.get(email, {})).values():
                if (reset := w.get("resetsAt")):
                    interval = min(interval, max(1, int(reset - now) + 1))
    state["quotaActive"] = active_pools
    if not DRY:
        db.commit()
    claude_gone = plan["anthropic"]
    claude_burn_until = None
    claude_burn_why = ""
    ag_claude_open = False
    db.close()
    set_claude_agent_models(False)
    pin_antigravity_account_access()

    if plan:
        codex_moderate = CODEX_MODERATE and not plan.get("openai-codex", False)
        base = pick_steer(claude_gone, plan.get("openai-codex", False), claude_burn_until, claude_burn_why,
                          codex_moderate, ag_claude_open)
        claude_unsaved = bool(claude_burn_until or ag_claude_open)
        save = ("" if SAVE_CAP is None or claude_unsaved
                else CLAUDE_SAVE_NOTE if codex_moderate else SAVE_NOTE)
        ag_spent = antigravity_gemini_spent(usage)
        spent = [pv for pv in SPENT_AGENT_NOTES if provider_spent(usage, pv)]
        tier = read_codex_tier()
        if not DRY:
            set_codex_tier(tier)
        key, rendered = base
        suffixes = (["ag-spent"] if ag_spent else []) + [f"{pv}-spent" for pv in spent]
        rendered += CODEX_TIER_NOTES[tier] + save
        if tier != "fast":
            suffixes.append(f"codex-{tier}")
        rendered += CODEX_STANDARD_TIER
        if ag_spent:
            rendered += AG_SPENT_NOTE
        rendered += "".join(SPENT_AGENT_NOTES[pv] for pv in spent)
        broadcast(state, ("+".join([key, *suffixes]), rendered), panes)
        apply_budget(plan, rendered, panes,
                     (("anthropic",) if claude_unsaved else ()) + (("openai-codex",) if codex_moderate else ()),
                     wide=("anthropic",) if claude_burn_until else ())

    if not DRY:
        save_state(state)
    return int(interval)


def main():
    if not LOOP:
        log(f"next check in {run_once()} s")
        return
    last_reverify = 0.0
    while True:
        try:
            interval = run_once()
        except Exception as e:  # keep the daemon alive; a bad pass retries soon
            log(f"pass failed: {e!r}")
            interval = MIN_INTERVAL_S
        # Outside run_once(): a failed usage fetch returns early or raises there, and device checks must not depend
        # on the usage endpoint.
        if time.time() - last_reverify >= REVERIFY_S:
            last_reverify = time.time()
            try:
                reverify_ledger()
            except Exception as e:
                log(f"ledger re-verification failed: {e!r}")
        time.sleep(interval)


if "--set-tier" in sys.argv:
    # Called by the dashboard and the bar widget: record the choice and apply it now, without waiting for a pass.
    tier = sys.argv[sys.argv.index("--set-tier") + 1] if sys.argv.index("--set-tier") + 1 < len(sys.argv) else ""
    if tier not in CODEX_TIERS:
        sys.exit(f"--set-tier takes one of {', '.join(CODEX_TIERS)}")
    with open(CODEX_TIER_FILE, "w") as f:
        f.write(tier + "\n")
    set_codex_tier(tier)
    try:
        with open(SNAPSHOT) as f:
            snap = json.load(f)
        snap["codexTier"] = tier
        with open(SNAPSHOT + ".tmp", "w") as f:
            json.dump(snap, f)
        os.replace(SNAPSHOT + ".tmp", SNAPSHOT)
    except (OSError, ValueError):
        pass
    print(tier)
elif "--snapshot" in sys.argv:
    # Live refresh for the bar widget when the user asks (panel open / r / middle-click): one `omp usage` call merged
    # into SNAPSHOT and printed; no rotation side effects.
    fetch_usage()
    with open(SNAPSHOT) as f:
        sys.stdout.write(f.read())
elif __name__ == "__main__":
    main()
