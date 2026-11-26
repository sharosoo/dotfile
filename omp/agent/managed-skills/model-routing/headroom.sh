#!/usr/bin/env bash
# Quota headroom per account and per provider from the rotate-accounts usage snapshot (a cache of `omp usage --json`;
# the Claude usage endpoint 429s per source IP, so this never calls it). Falls back to a live call only if the
# snapshot is missing.
# Accounts are deduplicated by provider+accountId (one login stored twice is still one quota).
# Provider state = best account's state, because omp's usage-aware fallback rotates accounts.
set -euo pipefail
S=~/.omp/agent/usage-snapshot.json
if [[ -s $S ]]; then
  echo "usage snapshot: $(( ($(date +%s) - $(stat -c %Y "$S")) / 60 )) min old (stale = last known value)" >&2
  cat "$S"
else
  omp usage --json -r 2>/dev/null
fi | jq -r '
  def state($provider): if . == null then "UNMETERED" elif . >= 40 then "GREEN" elif ($provider == "openai-codex" and . > 0) or . >= 5 then "LOW" else "EXHAUSTED" end;
  def hours: if . then ((. / 1000 - now) / 3600 | floor | tostring) + "h" else "-" end;
  [ .reports[]
    | { provider,
        account: (.metadata.accountId // .metadata.email // "?"),
        email: (.metadata.email // "?"),
        windows: [ .limits[]?
                   | (.amount.remainingFraction // (if .amount.usedFraction != null then 1 - .amount.usedFraction else null end)) as $rf
                   | select($rf != null)
                   | {label, rem: ($rf * 100), reset: .window.resetsAt} ] } ]
  | unique_by([.provider, .account])
  | map(. + { worst: (.windows | min_by(.rem) // null) })
  | group_by(.provider)
  | sort_by(-(map(.worst.rem // -1) | max))
  | .[]
  | .[0].provider as $provider
  | (map(.worst.rem // null) | max) as $best
  | "\($best | state($provider))\t\(.[0].provider)\t\(length) account(s)\tbest \(if $best == null then "-" else $best | floor end)%",
    ( .[] | "\t  \(.email)\t\(if .worst.rem == null then "-" else .worst.rem | floor end)% \(.worst.label // "no % reported")\treset \(.worst.reset | hours)\t[\(.windows | map("\(.label)=\(.rem | floor)%") | unique | join(", "))]" )
' | column -t -s $'\t'
echo
echo "Codex: use all available subscription quota; nearest weekly reset first, including beyond 24h. LOW is usable until the provider limit. Automatic saved resets are authorized through the last credit. Assign useful Sol/Astra implementation and review work; no filler. Other providers keep their reserve policies."
# Live host pressure, read here so it is never stale (2026-11-11: three sessions' builds drove load to 196 on 32
# threads, io PSI 82%). The HEADROOM_* paths exist for failure-ladder/checks/host-load-gate.sh's fixtures.
read -r load1 _ <"${HEADROOM_LOADAVG:-/proc/loadavg}"
io60=$(sed -n 's/^some .*avg60=\([0-9.]*\).*/\1/p' "${HEADROOM_IO_PSI:-/proc/pressure/io}")
threads=$(nproc --all) # plain nproc shrinks to this session's own CPU quota; load is host-wide
gate=$(awk -v l="$load1" -v io="$io60" -v n="$threads" \
  'BEGIN { print (io >= 50 || l >= 4 * n) ? "RED" : (io >= 25 || l >= 2 * n) ? "YELLOW" : "GREEN" }')
echo "HOST LOAD $gate (load1 $load1 on $threads threads, io some avg60 $io60%) — RED: start no build/test wave, wait and re-run; YELLOW: one build/test job at a time."
B=~/.omp/agent/rotate-budget.json
if [[ -f $B ]]; then
  echo
  jq -r --arg pane "${HC_TERMINAL_ID:-}" --arg pwd "$PWD" '
    ((.freeSuffixes // []) | map(select(. as $s | $pwd | endswith($s))) | first // null) as $matchSuffix |
    (if .panes[$pane] then .panes[$pane]
     elif ($matchSuffix and .freeSessions[$matchSuffix]) then .freeSessions[$matchSuffix]
     else .perSession end) as $caps |
    ((.panes[$pane] != null) or ($matchSuffix != null)) as $isFree |
    (if $isFree then ", feat-personal-agent: Claude 4-10 + Codex unlimited"
     else ", every session: Claude 4-10 + Codex unlimited" end) as $note |
    "SUBAGENT BUDGET (rotate-accounts, \((now - .updatedAt) / 60 | floor) min old, \(.workingSessions) working omp session(s)\($note)) — obey per spawn wave:",
    ($caps | to_entries[] | "  \(.key): max \(.value.cap) concurrent subagents on this family (\(.value.phase))"),
    ((.agentCaps // {}) | to_entries[] | "  agent \(.key): max \(.value.cap) concurrent in this session (\(.value.note))"),
    "  hard cap task.maxConcurrency = \(.maxConcurrency)",
    (.steer | if . then "ROUTING STEER: \(.)" else empty end)' "$B"
fi
L=~/.omp/agent/incidents-status.json
if [[ -s $L ]]; then
  jq -r '
    (.broken[] | "LEDGER BROKEN: \(.id) — \(.output); internal only: report via tell_chongmu (kind report), never in user replies or Discord"),
    (if (.proposed | length) > 0 then "LEDGER: \(.proposed | length) proposed device(s) await approval (internal only; never in user replies or Discord): \(.proposed | join(", "))" else empty end),
    (if (.invalid | length) > 0 then "LEDGER INVALID: \(.invalid | join("; ")); internal only: report via tell_chongmu (kind report), never in user replies or Discord" else empty end),
    (if now - .checkedAt > 7 * 3600 then "LEDGER STALE: last re-verification \((now - .checkedAt) / 3600 | floor) h ago; is omp-account-rotate running?" else empty end)' "$L" 2>/dev/null ||
    echo "LEDGER STALE: $L is unreadable; is omp-account-rotate running?"
else
  echo "LEDGER STALE: no re-verification has run ($L is missing or empty); is omp-account-rotate running?"
fi
