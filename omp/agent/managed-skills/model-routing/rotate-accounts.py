#!/usr/bin/env python3
"""Rotate Claude and Codex OAuth accounts by quota (model-routing skill §0).

`--loop` (systemd omp-account-rotate.service) runs forever and picks its own next check,
5–10 minutes apart; `--once` runs one pass; `--dry-run` runs one pass without changing
anything. The primary account (yh04060) always stays enabled. Helper accounts are enabled
while the primary is at its limit, or projected to reach it before the next check, and to
burn quota that an imminent weekly reset would otherwise waste. Codex saved resets are
redeemed by omp itself (codexResets.autoRedeem), so the primary is held alone at its wall
until omp redeems.
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

PRIMARY_5H_LIMIT = 0.95
PRIMARY_7D_LIMIT = 0.90
CODEX_WALL = 0.995
# omp redeems a Codex reset on the first blocked request. Shorter than MIN_INTERVAL_S, so a
# wall seen on two consecutive checks means the redeem did not happen and helpers take over.
REDEEM_GRACE_S = 4 * 60
HELPER_LIMIT = 0.95
BURN_HOURS = 24
BURN_MIN_LEFT = 0.10
MIN_INTERVAL_S = 5 * 60
MAX_INTERVAL_S = 10 * 60
# A primary within this distance of a limit, or burning at least HOT_RATE of a window per
# MAX_INTERVAL_S, is checked at MIN_INTERVAL_S.
HOT_MARGIN = 0.15
HOT_RATE = 0.05

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
    return subprocess.run(["omp", *args], capture_output=True, text=True, timeout=60).stdout.strip()


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
            out[wid] = {"used": lim["amount"]["usedFraction"], "resetsAt": resets / 1000 if resets else None}
    return out


def current(win):
    """Cached windows for an account omp no longer reports (disabled): a passed reset means empty."""
    return {
        wid: ({"used": 0.0, "resetsAt": None} if w["resetsAt"] and w["resetsAt"] < now else w)
        for wid, w in win.items()
    }


def burnable(win):
    w7 = win.get("7d")
    if not w7 or not w7["resetsAt"]:
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


def set_enabled(db, provider, email, enable):
    changed = False
    for rid, cause in rows(db, provider, email):
        if cause is not None and not cause.startswith(OWN_CAUSES):
            continue
        if enable and cause is not None:
            if not DRY:
                db.execute("update auth_credentials set disabled_cause=NULL, updated_at=strftime('%s','now') where id=?", (rid,))
            changed = True
        elif not enable and cause is None:
            if not DRY:
                db.execute("update auth_credentials set disabled_cause=?, updated_at=strftime('%s','now') where id=?", (CAUSE, rid))
            changed = True
    if changed:
        log(f"{provider} {email}: {'enable' if enable else 'disable'}")
    return changed


def rate(prev, win):
    """Usage fraction per second since the previous sample of the same window, else 0."""
    if not prev or prev.get("resetsAt") != win["resetsAt"] or win["used"] < prev["used"]:
        return 0.0
    dt = now - prev["t"]
    return (win["used"] - prev["used"]) / dt if dt > 0 else 0.0


def run_once():
    """One rotation pass; returns seconds until the next check."""
    global now
    now = time.time()
    try:
        usage = json.loads(omp("usage", "--json"))
    except (ValueError, subprocess.SubprocessError) as e:
        log(f"usage fetch failed, no changes: {e}")
        return MIN_INTERVAL_S
    state = load_state()
    keep = int(float(omp("config", "get", "codexResets.keepCredits") or 0))
    db = sqlite3.connect(DB, timeout=10)
    plan = {}
    hot = False
    samples = state.setdefault("samples", {})

    for provider, cfg in PROVIDERS.items():
        reports = {r["metadata"].get("email"): r for r in usage["reports"] if r.get("provider") == provider and r.get("metadata")}
        cache = state.setdefault(provider, {})
        for email, r in reports.items():
            cache[email] = windows_of(r, cfg["windows"])
        primary = reports.get(cfg["primary"])
        if primary is None or not cache.get(cfg["primary"]):
            log(f"{provider}: no usage for primary, skipped")
            continue
        p = cache[cfg["primary"]]
        prev = samples.get(provider, {})
        rates = {wid: rate(prev.get(wid), w) for wid, w in p.items()}
        samples[provider] = {wid: {**w, "t": now} for wid, w in p.items()}
        # Usage expected by the check after next, so helpers are on before the wall.
        proj = {wid: w["used"] + rates[wid] * (MAX_INTERVAL_S + 60) for wid, w in p.items()}
        limits = {"5h": PRIMARY_5H_LIMIT, "7d": PRIMARY_7D_LIMIT}

        if provider == "openai-codex":
            credits = (primary.get("resetCredits") or {}).get("availableCount", 0)
            at_wall = p["7d"]["used"] >= CODEX_WALL or primary["metadata"].get("limitReached") is True
            if at_wall:
                state.setdefault("codexWallSince", now)
            else:
                state.pop("codexWallSince", None)
            if credits > keep:
                # Let yh hit its wall so omp redeems a saved reset; no early helpers.
                blocked = at_wall and now - state["codexWallSince"] > REDEEM_GRACE_S
                hot |= p["7d"]["used"] + rates["7d"] * MAX_INTERVAL_S >= CODEX_WALL - HOT_MARGIN or at_wall
            else:
                blocked = proj["7d"] >= PRIMARY_7D_LIMIT
        else:
            blocked = any(proj[wid] >= limits[wid] for wid in proj)

        for wid, w in p.items():
            if w["used"] >= limits[wid] - HOT_MARGIN or rates[wid] * MAX_INTERVAL_S >= HOT_RATE:
                hot = True
        hot |= blocked

        helpers = {}
        for email in cfg["helpers"]:
            win = current(cache.get(email, {}))
            helpers[email] = (blocked and healthy(win)) or burnable(win)
        plan[provider] = (blocked, helpers)

        changed = set_enabled(db, provider, cfg["primary"], True)
        for email, on in helpers.items():
            changed |= set_enabled(db, provider, email, on)
        if changed or DRY:
            log(f"{provider}: primary {'blocked' if blocked else 'ok'} {json.dumps(p)} projected {json.dumps(proj)}; helpers {helpers}")

    if not DRY:
        db.commit()
    db.close()

    if "anthropic" in plan:
        blocked, _ = plan["anthropic"]
        want = "none" if blocked else "priority"
        if omp("config", "get", "tier.anthropic") != want:
            log(f"tier.anthropic -> {want}")
            if not DRY:
                omp("config", "set", "tier.anthropic", want)

    if not DRY:
        with open(STATE, "w") as f:
            json.dump(state, f, indent=1)
    return MIN_INTERVAL_S if hot else MAX_INTERVAL_S


def main():
    if not LOOP:
        log(f"next check in {run_once() // 60} min")
        return
    while True:
        try:
            interval = run_once()
        except Exception as e:  # keep the daemon alive; a bad pass retries soon
            log(f"pass failed: {e!r}")
            interval = MIN_INTERVAL_S
        time.sleep(interval)


main()
