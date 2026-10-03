#!/usr/bin/env bash
# Quota headroom per account and per provider from `omp usage --json` (identifiers redacted).
# Accounts are deduplicated by provider+accountId (one login stored twice is still one quota).
# Provider state = best account's state, because omp's usage-aware fallback rotates accounts.
set -euo pipefail
omp usage --json -r 2>/dev/null | jq -r '
  def state: if . == null then "UNMETERED" elif . >= 40 then "GREEN" elif . >= 5 then "LOW" else "EXHAUSTED" end;
  def hours: if . then ((. / 1000 - now) / 3600 | floor | tostring) + "h" else "-" end;
  [ .reports[]
    | { provider,
        account: (.metadata.accountId // .metadata.email // "?"),
        email: (.metadata.email // "?"),
        windows: [ .limits[]? | select(.amount.remainingFraction != null)
                   | {label, rem: (.amount.remainingFraction * 100 | floor), reset: .window.resetsAt} ] } ]
  | unique_by([.provider, .account])
  | map(. + { worst: (.windows | min_by(.rem) // null) })
  | group_by(.provider)
  | sort_by(-(map(.worst.rem // -1) | max))
  | .[]
  | (map(.worst.rem // null) | max) as $best
  | "\($best | state)\t\(.[0].provider)\t\(length) account(s)\tbest \($best // "-")%",
    ( .[] | "\t  \(.email)\t\(.worst.rem // "-")% \(.worst.label // "no % reported")\treset \(.worst.reset | hours)\t[\(.windows | map("\(.label)=\(.rem)%") | unique | join(", "))]" )
' | column -t -s $'\t'
echo
echo "LOW primaries are still used; EXHAUSTED (<5%) → next primary, overflow (devin/commandcode) only when all primaries are exhausted."
echo "UNMETERED = no percentage (commandcode credits): a 429 closes that account until its reset header."
