# Windows counterpart of headroom.sh for broker-mode clients (Windows PowerShell 5.1, no jq/bash needed).
# Windows clients have no usage-snapshot.json, rotate-budget.json or incidents-status.json: those are written by
# omp-account-rotate on turing. Usage therefore comes live from `omp usage --json -r` through the auth broker, and
# SUBAGENT BUDGET / ROUTING STEER / LEDGER are read from turing over hc when it is reachable.
$ErrorActionPreference = 'Stop'

function State($rem) {
  if ($null -eq $rem) { 'UNMETERED' } elseif ($rem -ge 40) { 'GREEN' } elseif ($rem -ge 5) { 'LOW' } else { 'EXHAUSTED' }
}
function Hours($ms) {
  if (-not $ms) { return '-' }
  $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  '{0}h' -f [math]::Floor(($ms - $now) / 3600000)
}

$usage = (& omp usage --json -r 2>$null | Out-String) | ConvertFrom-Json
$rows = foreach ($r in $usage.reports) {
  $wins = @(foreach ($l in @($r.limits)) {
    if ($null -eq $l) { continue }
    $rf = $l.amount.remainingFraction
    if ($null -eq $rf -and $null -ne $l.amount.usedFraction) { $rf = 1 - $l.amount.usedFraction }
    if ($null -eq $rf) { continue }
    [pscustomobject]@{ label = $l.label; rem = [math]::Floor($rf * 100); reset = $l.window.resetsAt }
  })
  $account = if ($r.metadata.accountId) { $r.metadata.accountId } elseif ($r.metadata.email) { $r.metadata.email } else { '?' }
  [pscustomobject]@{
    provider = $r.provider
    key      = "$($r.provider)|$account"
    email    = if ($r.metadata.email) { $r.metadata.email } else { '?' }
    windows  = $wins
    worst    = ($wins | Sort-Object rem | Select-Object -First 1)
  }
}
# One login stored twice is still one quota.
$rows = $rows | Sort-Object key -Unique
$groups = $rows | Group-Object provider | ForEach-Object {
  $best = ($_.Group | Where-Object { $_.worst } | ForEach-Object { $_.worst.rem } | Measure-Object -Maximum).Maximum
  [pscustomobject]@{ provider = $_.Name; best = $best; items = $_.Group }
} | Sort-Object { if ($null -eq $_.best) { -1 } else { $_.best } } -Descending

foreach ($g in $groups) {
  $bestText = if ($null -eq $g.best) { '-' } else { $g.best }
  '{0,-10} {1,-30} {2,3} account(s)  best {3}%' -f (State $g.best), $g.provider, @($g.items).Count, $bestText
  foreach ($i in $g.items) {
    $w = $i.worst
    $remText = if ($w) { "$($w.rem)%" } else { '-%' }
    $label = if ($w) { $w.label } else { 'no % reported' }
    $resetText = if ($w) { Hours $w.reset } else { '-' }
    $all = ($i.windows | ForEach-Object { "$($_.label)=$($_.rem)%" } | Sort-Object -Unique) -join ', '
    '    {0,-34} {1,5} {2,-22} reset {3,-6} [{4}]' -f $i.email, $remText, $label, $resetText, $all
  }
}
''
'LOW primaries are still used; EXHAUSTED (<5%) -> next candidate. Outside gpai-monorepo, swe (devin) and deepseek (commandcode) are active workers alongside sol.'

$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$threads = [Environment]::ProcessorCount
$gate = if ($cpu -ge 95) { 'RED' } elseif ($cpu -ge 75) { 'YELLOW' } else { 'GREEN' }
"HOST LOAD $gate (cpu $cpu% on $threads threads) - RED: start no build/test wave, wait and re-run; YELLOW: one build/test job at a time."

# Budget and ledger live on turing; hc reaches it when this machine is registered there.
''
$remote = $null
if (Get-Command hc -ErrorAction SilentlyContinue) {
  try { $remote = & hc exec --on turing 'bash -lc ~/.omp/agent/managed-skills/model-routing/headroom.sh' 2>$null } catch { }
}
if ($remote) {
  $remote | Select-String -Pattern '^(SUBAGENT BUDGET|  |ROUTING STEER|LEDGER)' | Where-Object { $_.Line -notmatch '^\s{2,}\S+@' } | ForEach-Object { $_.Line }
} else {
  'SUBAGENT BUDGET unavailable on Windows (rotate-budget.json lives on turing): keep to 4 concurrent Claude subagents, Codex unlimited.'
}
