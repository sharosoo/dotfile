#!/usr/bin/env bash
# The cutover host preflight (proxmox/config/check_memory_bandwidth.py) must say NO-GO for a median copy rate
# under 5 GB/s and for any raised hwmon temperature alarm (2026-11-21: sister-host throughput ranged from
# ~60 MB/s to ~20 GB/s). Loads the script from git with stubbed samples and a fixture hwmon tree; no benchmark.
# The device is read from git: the feature branch while it exists, else origin/main.
# --negative runs the same assertions on the script from before the alarm gate and must fail.
set -euo pipefail
# Repo paths and refs live in device-repos.local.env, which is not published.
. "$(dirname "$0")/../device-repos.local.env"
repo=$INFRA_REPO ref=$INFRA_REF
git -C "$repo" rev-parse -q --verify "$ref^{commit}" >/dev/null || ref=$INFRA_FALLBACK
[[ ${1:-} == --negative ]] && ref=$INFRA_BASE
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
git -C "$repo" show "$ref:proxmox/config/check_memory_bandwidth.py" >"$t/preflight.py"
mkdir -p "$t/hwmon/hwmon0"
python3 - "$t" <<'PY'
import contextlib, io, runpy, sys
t = sys.argv[1]
g = runpy.run_path(f'{t}/preflight.py')
main = g['main']
def run(ns, alarm):
    with open(f'{t}/hwmon/hwmon0/temp1_crit_alarm', 'w') as f:
        f.write('1\n' if alarm else '0\n')
    main.__globals__['samples_ns'] = lambda: [ns] * 3
    main.__globals__['HWMON_ALARMS'] = f'{t}/hwmon/hwmon*/temp*_*alarm'
    with contextlib.redirect_stdout(io.StringIO()):
        return main()
def fail(reason):
    print(reason)
    sys.exit(1)
# 64 MiB in 1.1 s is ~0.06 GB/s; in 3.2 ms ~21 GB/s.
if run(1_100_000_000, False) != 1:
    fail('slow memory did not block the cutover preflight')
if run(3_200_000, False) != 0:
    fail('healthy memory throughput did not pass the cutover preflight')
if run(3_200_000, True) != 1:
    fail('a raised thermal alarm did not block the cutover preflight')
print('cutover preflight blocks slow memory and raised thermal alarms')
PY
