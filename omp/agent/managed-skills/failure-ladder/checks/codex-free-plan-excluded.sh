#!/usr/bin/env bash
# Device: a free-plan Codex account (no Sol/Astra) never counts as Codex headroom in headroom.sh, and
# rotate-accounts.py bans it from rotation. Fixture: a usage snapshot with one free account at 100% and
# one depleted paid account; headroom must not read GREEN.
set -u
home=$HOME
rotate=$home/.omp/agent/managed-skills/model-routing/rotate-accounts.py
headroom=$home/.omp/agent/managed-skills/model-routing/headroom.sh
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
if [ "${1:-}" = --negative ]; then
  # Pre-device headroom: every report counts toward the provider state.
  sed -e 's/select(.unusable | not) | //g' -e 's/unusable: (.provider == "openai-codex" and .metadata.planType == "free")/unusable: false/' \
    "$headroom" >"$tmp/headroom.sh"
  headroom=$tmp/headroom.sh
fi
grep -q 'CODEX_UNENTITLED_PLANS = {"free"}' "$rotate" ||
  { echo "FAIL: rotate-accounts.py does not ban free-plan Codex accounts"; exit 1; }
mkdir -p "$tmp/h/.omp/agent"
future=$(( ($(date +%s) + 86400) * 1000 ))
jq -n --argjson f "$future" '{reports: [
  {provider: "openai-codex", metadata: {email: "free@x", accountId: "a", planType: "free"},
   limits: [{label: "30 days", amount: {usedFraction: 0}, window: {resetsAt: $f}}]},
  {provider: "openai-codex", metadata: {email: "paid@x", accountId: "b", planType: "promax"},
   limits: [{label: "7 days", amount: {usedFraction: 1}, window: {resetsAt: $f}}]}]}' \
  >"$tmp/h/.omp/agent/usage-snapshot.json"
line=$(HOME=$tmp/h HEADROOM_LOADAVG=/proc/loadavg bash "$headroom" 2>/dev/null | grep -m1 'openai-codex')
case $line in
  GREEN*) echo "FAIL: headroom reads Codex GREEN from a free-plan account without Sol/Astra"; exit 1 ;;
  "") echo "FAIL: headroom printed no openai-codex line"; exit 1 ;;
esac
echo ok
