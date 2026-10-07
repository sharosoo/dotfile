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
WEEK_S = 7 * 86400
MIN_AVG_ELAPSED_S = 2 * 3600  # a younger weekly window gives too noisy an average burn
SPRINT_START_S = 35 * 60  # a helper's 5-hour window this close to reset may take a sprint
SPRINT_END_S = 60  # hand back to the primary this long before the helper's reset
SPRINT_MAX_USED = 0.70  # sprint only on a helper with at least 30% of its 5-hour window unused
SPRINT_MIN_7D_LEFT = 0.03  # weekly room left below the account's cap (shared caps are enforced separately)
SPRINT_PRIMARY_5H = 0.75  # only worth it while the primary's own 5-hour window is tight

PROVIDERS = {
    "anthropic": {
        "primary": "yh04060@gmail.com",
        # Preference order when the primary is spent: global first (up to its shared cap), then admin-developers.
        "helpers": ["global@teamturing.com", "admin-developers@teamturing.com"],
        "windows": {"Claude 5 Hour": "5h", "Claude 7 Day": "7d"},
    },
    "openai-codex": {
        "primary": "yh04060@gmail.com",
        "helpers": ["zkwmak08@gmail.com"],
        # zk has its own saved resets (user, 2026-10-07): run it alongside yh all the time; omp ranks
        # and redeems per account.
        "alongside": True,
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


def stale(win, email):
    """No usable data for a disabled helper: never seen, or old and not known to have reset."""
    if not win:
        return True
    max_age = SHARED_MAX_AGE_S if email in SHARED_CAPS else PROBE_MAX_AGE_S
    return all(now - w.get("t", 0) > max_age and not (w.get("resetsAt") and w["resetsAt"] < now) for w in win.values())


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


# Standing routing policy (user, 2026-10-07 evening): Claude yh and opus quota are spent for this
# cycle, so GPT-6.1 Sol carries the load and opus/astra are reserved for work that needs them.
SOL_FIRST = (
    "sol-first",
    "Sol-first routing: put every normal slot (implementation, tests, contracts, migrations, verification, second opinions, "
    "planning drafts) on agent \"sol\" with effort \"hi\" (= xhigh), and run waves wide on it. Use astra or opus only when a slot "
    "truly needs top intelligence: astra for the hardest logic, security/authz/concurrency/crash-consistency and critical "
    "reviews; opus for critical frontend/UI/copy judgement or a mandatory Anthropic review seat. Aim for at most about 1 in 10 "
    "spawns on astra or opus combined. Keep cheap models (gemini, luna) for search/scans only.")


def claude_steer(blocked, helpers_on):
    """Routing directive for running Mains; Claude availability only matters when it is gone entirely."""
    if blocked and not helpers_on:
        return "codex-mode", (
            "Claude has no usable account right now: do not spawn opus at all, use astra for the rare top-intelligence slot. "
            + SOL_FIRST[1])
    return SOL_FIRST


def pane_busy_input(pid):
    """Why typing into the pane now would go astray, or None when its editor is empty.

    `herdr agent prompt` types into the editor and presses Enter: a half-typed user draft gets the directive
    appended (2026-10-07 it became part of a `/btw` side question the main loop never saw), and an open side
    panel takes the keys as its own shortcuts. Those passes defer; the next one retries.
    """
    try:
        lines = subprocess.run(["herdr", "agent", "read", pid], capture_output=True, text=True, timeout=10).stdout.splitlines()
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
    so every working pane whose last received key differs from the current one is caught up.
    """
    last = state.get("steer", {})
    sent = state.setdefault("steerSent", {})
    changed = last.get("key") != steer
    panes = omp_panes()
    live = {pid for pid, _ in panes}
    for pid in list(sent):
        if pid not in live:
            del sent[pid]
    targets = [pid for pid, status in panes if status == "working" and sent.get(pid) != steer]
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
        sent[pid] = steer
    if changed:
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
    steer = None

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
        # Shared accounts are probed only when they may be needed: a probe briefly exposes them to our traffic.
        need_probe = [(provider, e) for e in cfg["helpers"]
                      if stale(cache.get(e, {}), e) and (near or (e not in SHARED_CAPS and not is_enabled(db, provider, e)))]
        if need_probe:
            probe(db, need_probe, state)

        # Hours until the primary's weekly window walls at its average burn since the window opened.
        wall_eta_h = None
        w7 = p.get("7d")
        if provider == "openai-codex" and w7 and w7.get("resetsAt"):
            elapsed = WEEK_S - (w7["resetsAt"] - now)
            if elapsed >= MIN_AVG_ELAPSED_S and w7["used"] > 0:
                wall_eta_h = (WALL - w7["used"]) / (w7["used"] / elapsed) / 3600

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
            # A spent primary gets the first healthy helper in preference order.
            backup = blocked and not backup_taken and healthy(win, email)
            backup_taken |= backup
            helpers[email] = backup or burnable(win, email) or bool(expires_unused) or bool(cfg.get("alongside"))
        if provider == "openai-codex" and blocked and not any(helpers.values()):
            # zk looks spent; enable it anyway rather than stall Codex on a dead primary.
            helpers = {e: True for e in helpers}
        sprint = None
        if provider == "anthropic":
            sprint, sprint_wake = pick_sprint(cache, cfg, p)
            interval = min(interval, sprint_wake)
            if sprint:
                helpers = {e: e == sprint for e in helpers}
        for email, on in helpers.items():
            if on and email in SHARED_CAPS and left7(current(cache.get(email, {})), email) < 0.08:
                interval = min(interval, NEAR_POLL_S)  # close to the shared cap: watch it closely
        plan[provider] = blocked
        if provider == "anthropic":
            steer = claude_steer(blocked, any(helpers.values()))

        changed = False
        if not DRY:
            changed = set_enabled(db, provider, cfg["primary"], not sprint)
            for email, on in helpers.items():
                changed |= set_enabled(db, provider, email, on)
        if changed or DRY:
            log(f"{provider}: primary {'sprint-rest' if sprint else 'spent' if blocked else 'burning'} {json.dumps({k: v['used'] for k, v in p.items()})} "
                f"rates/10min {json.dumps({k: (round(v * 600, 3) if v is not None else None) for k, v in rates.items()})}; helpers {helpers}")

    if not DRY:
        db.commit()
    db.close()

    if plan:
        steer = steer or SOL_FIRST  # the anthropic pass is skipped while the user holds yh off
        broadcast(state, *steer)
        apply_budget(plan, steer[1])

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
