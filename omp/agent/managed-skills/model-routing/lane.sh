#!/usr/bin/env bash
# Usage: lane.sh <lane> <command...>
# Takes the test-lane lock, then waits inside the lock until load1 <= LANE_MAX_LOAD (default 64)
# before running the command at idle priority. The wait must sit inside the lock: on 2026-11-24
# two subagents checked load before flock and then ran tests at load1 100-131 on 32 threads.
set -euo pipefail
lane=${1:?lane name}; shift
[ $# -gt 0 ] || { echo "lane.sh: no command" >&2; exit 2; }
max=${LANE_MAX_LOAD:-64}
dir=${LANE_LOCK_DIR:-/tmp/test-lanes}
mkdir -p "$dir"
exec flock "$dir/lane-${lane}.lock" bash -c '
  max=$1 loadavg=$2; shift 2
  while :; do
    load=$(cut -d" " -f1 "$loadavg")
    awk -v l="$load" -v m="$max" "BEGIN{exit !(l<=m)}" && break
    echo "lane.sh: load1=$load > $max, waiting" >&2
    sleep "${LANE_POLL_S:-30}"
  done
  exec nice -n 19 ionice -c3 "$@"
' lane "$max" "${LANE_LOADAVG:-/proc/loadavg}" "$@"
