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
Codex saved resets are redeemed by omp itself (codexResets.autoRedeem).
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
HELPER_MIN = 2
STEER_5H_USED = 0.75  # no burn rate yet: treat the 5-hour window as tight from here
STEER_MIN_LEFT_S = 45 * 60  # a 5-hour wall this close to its reset is not worth steering away from
STEER_MIN_GAP_S = 20 * 60  # minimum gap between non-urgent steering broadcasts

PROVIDERS = {
    "anthropic": {
        "primary": "yh04060@gmail.com",
        "helpers": ["admin-developers@teamturing.com", "global@teamturing.com"],
        "windows": {"Claude 5 Hour": "5h", "Claude 7 Day": "7d"},
    },
    "openai-codex": {
        "primary": "yh04060@gmail.com",
        "helpers": ["zkwmak08@gmail.com"],
        "windows": {"7 days": "7d"},
    },
}

DRY = "--dry-run" in sys.argv
LOOP = "--loop" in sys.argv and not DRY
now = time.time()


def log(msg):
    print(msg, flush=True)


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


def stale(win):
    """No usable data for a disabled helper: never seen, or old and not known to have reset."""
    if not win:
        return True
    return all(now - w.get("t", 0) > PROBE_MAX_AGE_S and not (w.get("resetsAt") and w["resetsAt"] < now) for w in win.values())


def burnable(win):
    w7 = win.get("7d")
    if not w7 or not w7.get("resetsAt"):
        return False
    soon = w7["resetsAt"] - now < BURN_HOURS * 3600
    return soon and 1 - w7["used"] >= BURN_MIN_LEFT and win.get("5h", {"used": 0})["used"] < HELPER_LIMIT


def healthy(win):
    return all(w["used"] < HELPER_LIMIT for w in win.values())


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


def omp_panes():
    """herdr panes running omp, as (pane_id, status)."""
    try:
        out = subprocess.run(["herdr", "agent", "list"], capture_output=True, text=True, timeout=10).stdout
        agents = json.loads(out)["result"]["agents"]
        return [(a["pane_id"], a.get("agent_status")) for a in agents if a.get("agent") == "omp"]
    except (OSError, ValueError, KeyError, subprocess.SubprocessError):
        return []


def claude_steer(p, rates, blocked):
    """Which family running Mains should lean on, from Claude yh pacing."""
    w5, w7 = p.get("5h"), p.get("7d")
    if blocked:
        return "claude-helpers", "Claude yh is spent; admin-developers/global carry Claude now (rotation handles it, Claude fast tier is off). Keep using opus normally."
    if w5 and w5.get("resetsAt"):
        left_s = w5["resetsAt"] - now
        r5 = rates.get("5h")
        on_pace_to_wall = (w5["used"] + r5 * left_s >= WALL) if r5 is not None else w5["used"] >= STEER_5H_USED
        if on_pace_to_wall and left_s > STEER_MIN_LEFT_S:
            # Share of the current Claude burn the window can sustain until its reset.
            share = (WALL - w5["used"]) / left_s / r5 if r5 else 0.5
            n = min(8, max(2, round(share * 10)))
            return f"mix-opus-{n}", (
                f"Claude yh 5-hour window is on pace to hit its limit before it resets ({w5['used']:.0%} used, resets in {left_s / 3600:.1f}h); "
                f"it can sustain about {share:.0%} of the current Claude burn. Mix, do not move everything to astra: until the reset keep about "
                f"{n} in 10 spawns that could run on opus (any slot kind, backend included) on opus and send the rest to astra "
                "(Codex yh has saved resets, spend it freely). Pure-backend sessions split backend slots the same way. Do not downgrade to cheap models.")
    if w7 and w7.get("resetsAt"):
        left_h = (w7["resetsAt"] - now) / 3600
        if 1 - w7["used"] >= BURN_MIN_LEFT + 0.05 and left_h < 30:
            return "burn-opus", (
                f"Claude yh 7-day window has {1 - w7['used']:.0%} left that expires in {left_h:.0f}h. Burn it: put opus on every slot it fits "
                "and run wide parallel waves; in backend-heavy sessions split backend slots about half opus, half astra.")
    return "normal", "Claude yh pacing is normal: follow model-routing §0 (astra and opus aggressively)."


def broadcast(state, steer, text):
    """Tell working omp sessions about a steering change (config edits do not reach live sessions)."""
    last = state.get("steer", {})
    if last.get("key") == steer:
        return
    urgent = "claude-helpers" in (steer, last.get("key"))
    if not urgent and now - last.get("at", 0) < STEER_MIN_GAP_S:
        return
    targets = [pid for pid, status in omp_panes() if status == "working"]
    msg = (f"[Routing directive from the account-rotation service ({steer}); live sessions do not reload config, so apply by hand. "
           f"Do not stop current work.] {text} Before each spawn wave run ~/.omp/agent/managed-skills/model-routing/headroom.sh "
           "and stay within its SUBAGENT BUDGET lines.")
    log(f"steer -> {steer}; directing {targets}")
    if DRY:
        return
    for pid in targets:
        subprocess.run(["herdr", "agent", "prompt", pid, msg], capture_output=True, timeout=10)
    state["steer"] = {"key": steer, "text": text, "at": now}


def apply_budget(plan, steer_text):
    """Per-family subagent caps for Main (read via headroom.sh) plus the hard task.maxConcurrency."""
    working = max(1, sum(status == "working" for _, status in omp_panes()))
    helper_cap = max(HELPER_MIN, HELPER_TOTAL // working)
    caps = {p: (helper_cap if spent else WIDE_CAP) for p, spent in plan.items()}
    hard = max(caps.values(), default=WIDE_CAP)
    budget = {
        "updatedAt": int(now),
        "workingSessions": working,
        "perSession": {p: {"cap": c, "phase": "helpers" if plan[p] else "burn-yh"} for p, c in caps.items()},
        "maxConcurrency": hard,
        "steer": steer_text,
    }
    try:
        with open(BUDGET) as f:
            old = json.load(f)
    except (OSError, ValueError):
        old = {}
    if {k: v for k, v in old.items() if k not in ("updatedAt", "steer")} != {k: v for k, v in budget.items() if k not in ("updatedAt", "steer")}:
        log(f"budget: {working} working session(s), per-session caps {caps}, task.maxConcurrency {hard}")
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
    try:
        usage = fetch_usage()
    except (ValueError, subprocess.SubprocessError) as e:
        log(f"usage fetch failed, no changes: {e}")
        return MIN_INTERVAL_S
    state = load_state()
    keep = int(float(omp("config", "get", "codexResets.keepCredits") or 0))
    db = sqlite3.connect(DB, timeout=10)
    samples = state.setdefault("samples", {})
    interval = MAX_INTERVAL_S
    plan = {}
    steer = None

    for provider, cfg in PROVIDERS.items():
        reports = {r["metadata"].get("email"): r for r in usage["reports"] if r.get("provider") == provider and r.get("metadata")}
        cache = state.setdefault(provider, {})
        for email, r in reports.items():
            cache[email] = windows_of(r, cfg["windows"])
        primary = reports.get(cfg["primary"])
        if primary is None or not cache.get(cfg["primary"]):
            log(f"{provider}: no usage for primary, skipped")
            interval = min(interval, MIN_INTERVAL_S)
            continue
        p = cache[cfg["primary"]]
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
            at_wall |= primary["metadata"].get("limitReached") is True
            credits = (primary.get("resetCredits") or {}).get("availableCount", 0)
            if at_wall:
                state.setdefault("codexWallSince", now)
            else:
                state.pop("codexWallSince", None)
            # With spare resets, hold yh alone at its wall so omp redeems one.
            blocked = at_wall and (credits <= keep or now - state["codexWallSince"] > REDEEM_GRACE_S)
            if at_wall and not blocked:
                interval = min(interval, NEAR_POLL_S)
        else:
            blocked = at_wall

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
        need_probe = [(provider, e) for e in cfg["helpers"] if stale(cache.get(e, {})) and (near or not is_enabled(db, provider, e))]
        if need_probe:
            probe(db, need_probe, state)

        helpers = {}
        for email in cfg["helpers"]:
            win = current(cache.get(email, {}))
            helpers[email] = (blocked and healthy(win)) or burnable(win)
        if blocked and not any(helpers.values()):
            # Every helper looks spent; enable them anyway rather than stall on a dead primary.
            helpers = {e: True for e in helpers}
        plan[provider] = blocked
        if provider == "anthropic":
            steer = claude_steer(p, rates, blocked)

        changed = False
        if not DRY:
            changed = set_enabled(db, provider, cfg["primary"], True)
            for email, on in helpers.items():
                changed |= set_enabled(db, provider, email, on)
        if changed or DRY:
            log(f"{provider}: primary {'spent' if blocked else 'burning'} {json.dumps({k: v['used'] for k, v in p.items()})} "
                f"rates/10min {json.dumps({k: (round(v * 600, 3) if v is not None else None) for k, v in rates.items()})}; helpers {helpers}")

    if not DRY:
        db.commit()
    db.close()

    if "anthropic" in plan:
        want = "none" if plan["anthropic"] else "priority"
        if omp("config", "get", "tier.anthropic") != want:
            log(f"tier.anthropic -> {want}")
            if not DRY:
                omp("config", "set", "tier.anthropic", want)

    if plan:
        if steer:
            broadcast(state, *steer)
        apply_budget(plan, steer[1] if steer else None)

    if not DRY:
        with open(STATE, "w") as f:
            json.dump(state, f, indent=1)
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
