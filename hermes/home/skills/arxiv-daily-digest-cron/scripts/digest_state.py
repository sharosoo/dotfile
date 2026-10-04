#!/usr/bin/env python3
"""Atomic state-file update helper for the arxiv-daily-digest-cron.

Usage:
    python3 digest_state.py --state ~/.hermes/cron/arxiv/state.json \
        --add 2607.21535,2607.19456,2607.19223,2607.19957 \
        --note "4 LLM-serving system-relevant papers on 2026-07-25."

Behavior:
- Reads the state file (creates if missing with empty seen_ids)
- Appends new ids to seen_ids, deduped
- Updates last_run to now (UTC, ISO 8601 with +00:00 offset)
- Updates last_yield to the count of *new* ids added (not the total seen)
- Updates last_run_note
- Writes atomically (write to .tmp, rename)

The script is intentionally simple — the cron should not depend on any
non-stdlib Python module. It is safe to call from `terminal` in a heredoc
or as a subprocess.
"""

import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


VERSION_STRIP_RE = re.compile(r"v\d+$")


def strip_version(arxiv_id: str) -> str:
    """Strip the version suffix from an arxiv id.

    '2607.21535v1' -> '2607.21535'
    '2607.21535'   -> '2607.21535'
    """
    return VERSION_STRIP_RE.sub("", arxiv_id)


def load_state(path: Path) -> dict:
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        return {
            "seen_ids": [],
            "last_run": None,
            "last_yield": 0,
            "last_run_note": None,
        }
    with path.open() as f:
        return json.load(f)


def atomic_write(path: Path, data: dict) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--state", required=True, help="Path to state.json")
    parser.add_argument(
        "--add",
        default="",
        help="Comma-separated list of arxiv base ids to add (version suffix auto-stripped)",
    )
    parser.add_argument(
        "--note",
        default="",
        help="One-line note for last_run_note (describe what was sent in this run)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print what would change, but do not write",
    )
    args = parser.parse_args()

    state_path = Path(args.state).expanduser()
    state = load_state(state_path)

    seen = set(state.get("seen_ids", []))
    new_ids_raw = [s.strip() for s in args.add.split(",") if s.strip()]
    new_ids = [strip_version(i) for i in new_ids_raw]
    deduped = []
    for nid in new_ids:
        if nid and nid not in seen and nid not in deduped:
            deduped.append(nid)

    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    if args.dry_run:
        print(f"state: {state_path}")
        print(f"existing seen_ids: {len(seen)}")
        print(f"input ids (raw): {new_ids_raw}")
        print(f"input ids (base): {new_ids}")
        print(f"would add (deduped, not-already-seen): {deduped}")
        print(f"would set last_run: {now}")
        print(f"would set last_yield: {len(deduped)}")
        print(f"would set last_run_note: {args.note or '(unchanged)'}")
        return 0

    state["seen_ids"] = list(seen) + deduped
    state["last_run"] = now
    state["last_yield"] = len(deduped)
    if args.note:
        state["last_run_note"] = args.note

    atomic_write(state_path, state)
    print(f"OK: added {len(deduped)} new ids, total tracked = {len(state['seen_ids'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
