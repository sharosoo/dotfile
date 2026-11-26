#!/usr/bin/env bash
# VM provisioning and migration must refuse unless every host involved (target, and source for a move) has
# fresh evidence of a live boot controller and a writable root; cluster quorum is not evidence
# (2026-11-20: a boot controller died and root went read-only while quorum held). Runs the repo's
# vms/platform/boot_health_gate.py from git on fixture plans and evidence; no SSH, no PVE.
# The device is read from git: the feature branch while it exists, else origin/main.
# --negative runs the same assertions on the tree from before the gate and must fail.
set -euo pipefail
# Repo paths and refs live in device-repos.local.env, which is not published.
. "$(dirname "$0")/../device-repos.local.env"
repo=$INFRA_REPO ref=$INFRA_REF
git -C "$repo" rev-parse -q --verify "$ref^{commit}" >/dev/null || ref=$INFRA_FALLBACK
[[ ${1:-} == --negative ]] && ref=$INFRA_BASE
t=$(mktemp -d); trap 'rm -rf "$t"' EXIT
gate=$t/gate.py
if ! git -C "$repo" show "$ref:vms/platform/boot_health_gate.py" >"$gate" 2>/dev/null; then
  echo "no boot health gate at $ref"; exit 1
fi
git -C "$repo" show "$ref:vms/platform/tofu.sh" | grep -q 'boot_health_gate.py" hosts' \
  || { echo "tofu.sh apply does not run the boot health gate"; exit 1; }
cat >"$t/plan.json" <<'EOF'
{"resource_changes": [
  {"change": {"actions": ["update"], "before": {"node_name": "src"}, "after": {"node_name": "dst"}}},
  {"change": {"actions": ["create"], "before": null, "after": {"node_name": "new"}}},
  {"change": {"actions": ["no-op"], "before": {"node_name": "idle"}, "after": {"node_name": "idle"}}}]}
EOF
[[ $(python3 "$gate" hosts <"$t/plan.json" | paste -sd, -) == dst,new,src ]] \
  || { echo "gate did not name the source, target and new host of a plan"; exit 1; }
mkdir "$t/ev"
now=$(date +%s)
write() { printf '{"host":"%s","checked_at":%s,"boot_controller_live":%s,"root_writable":%s,"cluster_quorate":true}\n' "$1" "$2" "$3" "$4" >"$t/ev/$1.json"; }
write src "$now" true true; write dst "$now" true true; write new "$now" true true
python3 "$gate" check "$t/ev" src dst new >/dev/null 2>&1 || { echo "gate refused healthy fresh evidence"; exit 1; }
write src "$now" false false
if python3 "$gate" check "$t/ev" src dst new >/dev/null 2>&1; then echo "gate accepted a dead boot controller on a quorate source"; exit 1; fi
write src "$((now - 3600))" true true
if python3 "$gate" check "$t/ev" src dst new >/dev/null 2>&1; then echo "gate accepted hour-old evidence"; exit 1; fi
rm "$t/ev/src.json"
if python3 "$gate" check "$t/ev" src dst new >/dev/null 2>&1; then echo "gate accepted a host with no evidence"; exit 1; fi
echo "provisioning and migration need fresh boot-controller and writable-root evidence from every host"
