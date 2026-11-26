#!/usr/bin/env bash
# Device: model-routing/lane.sh waits for load1 <= LANE_MAX_LOAD inside the lane lock before
# running the command. Fixture: a fake loadavg above the limit; the command must not run.
set -u
lane=~/.omp/agent/managed-skills/model-routing/lane.sh
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if [ "${1:-}" = --negative ]; then
  # The pre-device pattern: flock and run, no load wait inside the lock.
  printf '#!/usr/bin/env bash\nlane=$1; shift; exec flock "$LANE_LOCK_DIR/lane-$lane.lock" "$@"\n' >"$tmp/lane.sh"
  chmod +x "$tmp/lane.sh"; lane=$tmp/lane.sh
fi
[ -x "$lane" ] || { echo "FAIL: lane.sh missing"; exit 1; }
export LANE_LOCK_DIR=$tmp/locks LANE_POLL_S=1 LANE_MAX_LOAD=64
mkdir -p "$LANE_LOCK_DIR"
echo "200.00 1 1 1/1 1" >"$tmp/high"; echo "1.00 1 1 1/1 1" >"$tmp/low"
LANE_LOADAVG=$tmp/high timeout 3 "$lane" t touch "$tmp/ran-high" 2>/dev/null
[ ! -e "$tmp/ran-high" ] || { echo "FAIL: lane.sh ran a command while load1 was above LANE_MAX_LOAD"; exit 1; }
LANE_LOADAVG=$tmp/low timeout 5 "$lane" t touch "$tmp/ran-low" 2>/dev/null
[ -e "$tmp/ran-low" ] || { echo "FAIL: lane.sh did not run the command at low load"; exit 1; }
echo "ok"
