#!/usr/bin/env python3
"""Re-verify the active devices in the incident ledger (skill://failure-ladder).

A ledger row names its check by id; only scripts in REGISTRY ever run, so nothing written into the ledger is executed.
A device holds when its check exits 0 and the check's --negative control (the same assertion against a temporary
fixture without the device) exits non-zero; a negative control that passes means the check can no longer fail.

Writes ~/.omp/agent/incidents-status.json on every run (read by model-routing/headroom.sh) and exits 1 when a device
is broken or the ledger is invalid. Messages name line numbers, field names and registry names, never ledger text, so
nothing a session appended reaches headroom.sh or a notification. `--id <id>` runs one row whatever its status and
writes nothing. The rotation service (model-routing/rotate-accounts.py) runs this at start and every 6 hours.
"""

import json
import os
import re
import subprocess
import sys
import time

HOME = os.path.expanduser("~")
LEDGER = f"{HOME}/.omp/agent/incidents.jsonl"
STATUS = f"{HOME}/.omp/agent/incidents-status.json"
CHECKS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "checks")
REGISTRY = {name: f"{CHECKS}/{name}.sh" for name in (
    "pristine-providers", "profile-launch-prompt", "agents-cpu-cap", "agent-build-jobs", "host-load-gate",
    "benside-send-live-thread-check", "subagent-worktree-cwd", "patch-push-refuses-empty",
    "account-quota-cap", "expiry-auth-failover", "codex-catalog-refresh-verified", "test-lane-load-gate",
    "migrate-post-pending-scope-gate", "pgtyped-atomic-generate", "cutover-memory-floor", "pve-boot-health-gate",
    "codex-free-plan-excluded")}
# Checks that read PI_CONFIG_FILES; a shell started before the wall lacks it, which is not a broken device.
NEEDS_WALLS = {"pristine-providers"}
WALLS_ENV = f"{HOME}/.config/environment.d/omp-walls.conf"
TIMEOUT_S = 30
# pristine-providers starts omp four times; under build load that alone took 36 s.
TIMEOUTS = {"pristine-providers": 60}
KEBAB = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")
TEXT = ("incident", "ts", "symptom", "root_cause", "device", "falsified")
ENUMS = {"status": {"proposed", "active", "retired"}, "trigger": {"incident", "repeat", "correction"},
         "layer": {"harness", "loop", "graph"}}


def line_problem(row):
    """Shape of one line: field presence, types and enums. Lifecycle rules apply to current rows only."""
    if not isinstance(row, dict):
        return "not an object"
    for field in ("id", "verify"):
        if not isinstance(row.get(field), str) or len(row[field]) > 64 or not KEBAB.fullmatch(row[field]):
            return f"field {field} must be a kebab-case string"
    for field in TEXT:
        if not isinstance(row.get(field), str):
            return f"field {field} must be a string"
    for field, allowed in ENUMS.items():
        if not isinstance(row.get(field), str) or row[field] not in allowed:
            return f"field {field} must be one of {', '.join(sorted(allowed))}"
    if not isinstance(row.get("paths"), list) or not all(isinstance(p, str) for p in row["paths"]):
        return "field paths must be a list of strings"
    if row.get("approved_by", 0) not in ("user", None):
        return "field approved_by must be \"user\" or null"
    return None


def current_problem(row):
    if row["status"] in ("active", "retired") and row["approved_by"] != "user":
        return f"{row['status']} row needs approved_by \"user\""
    if row["status"] == "active":
        if row["verify"] not in REGISTRY:
            return "active row names an unregistered check in field verify"
        if not row["falsified"]:
            return "active row needs field falsified"
    return None


def load(invalid):
    """Current (last well-formed) row per id with its line number."""
    try:
        with open(LEDGER) as f:
            lines = f.read().splitlines()
    except FileNotFoundError:
        invalid.append("ledger file ~/.omp/agent/incidents.jsonl is missing")
        return {}
    rows = {}
    for n, line in enumerate(lines, 1):
        if not line.strip():
            continue
        try:
            row = json.loads(line)
        except ValueError:
            invalid.append(f"line {n}: not JSON")
            continue
        if why := line_problem(row):
            invalid.append(f"line {n}: {why}")
            continue
        rows[row["id"]] = (n, row)
    return rows


def check_env():
    """Environment for checks; PI_CONFIG_FILES comes from omp-walls.conf when the caller's shell predates it."""
    env = dict(os.environ)
    if not env.get("PI_CONFIG_FILES"):
        try:
            with open(WALLS_ENV) as f:
                for line in f:
                    key, sep, value = line.strip().partition("=")
                    if sep and key == "PI_CONFIG_FILES":
                        env["PI_CONFIG_FILES"] = os.path.expandvars(value)
        except OSError:
            pass
    return env


def run(argv, env, limit):
    try:
        p = subprocess.run(argv, cwd=HOME, env=env, stdin=subprocess.DEVNULL, capture_output=True, text=True,
                           timeout=limit)
    except subprocess.TimeoutExpired:
        return 124, f"timed out after {limit} s"
    # Checks print their reason on stdout; stderr holds tool noise such as stack traces, which never surfaces.
    out = [line for line in p.stdout.splitlines() if line.strip()]
    return p.returncode, (out[-1] if out else "no reason printed")[:300]


def check(name, env):
    """None when the device holds, else the reason."""
    limit = TIMEOUTS.get(name, TIMEOUT_S)
    code, out = run([REGISTRY[name]], env, limit)
    if code:
        return f"exit {code}: {out}"
    code, out = run([REGISTRY[name], "--negative"], env, limit)
    if not code:
        return f"negative control passed, so the check cannot fail: {out}"
    return None


def verify_all(status):
    rows = load(status["invalid"])
    env = check_env()
    covered = set()
    for rid, (n, row) in sorted(rows.items()):
        if why := current_problem(row):
            status["invalid"].append(f"line {n}: {why}")
            continue
        if row["status"] == "proposed":
            status["proposed"].append(rid)
        elif row["status"] == "active":
            covered.add(row["verify"])
            if row["verify"] in NEEDS_WALLS and not env.get("PI_CONFIG_FILES"):
                status["invalid"].append(f"line {n}: environment has no PI_CONFIG_FILES and {WALLS_ENV} is missing")
            elif why := check(row["verify"], env):
                status["broken"].append({"id": rid, "output": why})
            else:
                status["ok"].append(rid)
    for name in sorted(REGISTRY.keys() - covered):
        status["invalid"].append(f"registered check {name} has no active row")


def main():
    if "--id" in sys.argv:
        i = sys.argv.index("--id") + 1
        rows = load([])
        n, row = rows.get(sys.argv[i], (0, None)) if i < len(sys.argv) else (0, None)
        if not row:
            sys.exit("no well-formed ledger row with that id")
        env = check_env()
        why = current_problem(row) or (None if row["status"] == "active" else f"current row is {row['status']}")
        if why:
            sys.exit(f"line {n}: {why}; check not run")
        if row["verify"] in NEEDS_WALLS and not env.get("PI_CONFIG_FILES"):
            sys.exit(f"line {n}: environment has no PI_CONFIG_FILES and {WALLS_ENV} is missing; check not run")
        why = check(row["verify"], env)
        print(f"line {n}: {why or 'holds'}")
        sys.exit(1 if why else 0)

    try:
        with open(STATUS) as f:
            since = {b["id"]: b["since"] for b in json.load(f).get("broken", [])}
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        since = {}
    now = int(time.time())
    status = {"checkedAt": now, "ok": [], "broken": [], "proposed": [], "invalid": []}
    try:
        verify_all(status)
    except Exception as e:  # the status file must still say something went wrong
        status["invalid"].append(f"reverify.py failed: {type(e).__name__}")
    for b in status["broken"]:
        b["since"] = since.get(b["id"], now)
    with open(STATUS + ".tmp", "w") as f:
        json.dump(status, f, indent=1)
    os.replace(STATUS + ".tmp", STATUS)
    for b in status["broken"]:
        print(f"{b['id']} broken: {b['output']}")
    for line in status["invalid"]:
        print(f"invalid ledger: {line}")
    sys.exit(1 if status["broken"] or status["invalid"] else 0)


main()
