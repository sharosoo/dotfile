# Windows restore of the OMP setup (repo -> %USERPROFILE%\.omp), for broker-mode clients.
#
#   powershell -ExecutionPolicy Bypass -File omp\sync-windows.ps1 [-BrokerUrl http://100.65.137.27:8765]
#
# Windows PowerShell 5.1 only: no bash, jq, yq or rsync. Differences from sync.sh restore:
# - config.yml: auth.accountPolicies is dropped (turing's omp-account-rotate owns account policy) and
#   auth.broker.url is set, so omp never falls back to a local vault.
# - No systemd units, omp-walls environment, context7-rotate or cap-context.py: those run on turing only.
# - mcp.json is merged like sync.sh: live servers stay and a live header value beats a repo ${..._TOKEN} placeholder.
# The broker token is never in the repo: copy it out of band to %USERPROFILE%\.omp\auth-broker.token.
param([string]$BrokerUrl = 'http://100.65.137.27:8765')
$ErrorActionPreference = 'Stop'

$Repo = $PSScriptRoot
$Live = Join-Path $env:USERPROFILE '.omp'
$Agent = Join-Path $Live 'agent'
$AgentDirs = 'agents', 'managed-skills', 'rules', 'skills', 'extensions'
New-Item -ItemType Directory -Force $Agent | Out-Null

$utf8 = New-Object System.Text.UTF8Encoding $false

# config.yml: replace the top-level auth: block with the broker URL.
$out = New-Object System.Collections.Generic.List[string]
$inAuth = $false
foreach ($line in [IO.File]::ReadAllLines((Join-Path $Repo 'agent\config.yml'))) {
  if ($line -match '^auth:\s*$') { $inAuth = $true; continue }
  if ($inAuth -and $line -match '^\S') { $inAuth = $false }
  if (-not $inAuth) { $out.Add($line) }
}
$out.Add('auth:'); $out.Add('  broker:'); $out.Add("    url: $BrokerUrl")
$cfg = Join-Path $Agent 'config.yml'
if (Test-Path $cfg) { Copy-Item $cfg "$cfg.bak" -Force }
[IO.File]::WriteAllText($cfg, ($out -join "`n") + "`n", $utf8)

# mcp.json merge.
$repoMcp = Get-Content -Raw (Join-Path $Repo 'agent\mcp.json') | ConvertFrom-Json
$liveMcpPath = Join-Path $Agent 'mcp.json'
if (Test-Path $liveMcpPath) {
  $liveMcp = Get-Content -Raw $liveMcpPath | ConvertFrom-Json
  if (-not $liveMcp.mcpServers) { $liveMcp | Add-Member -Force mcpServers ([pscustomobject]@{}) }
  foreach ($s in $repoMcp.mcpServers.PSObject.Properties) {
    $old = $liveMcp.mcpServers.PSObject.Properties[$s.Name]
    if ($s.Value.headers -and $old -and $old.Value.headers) {
      foreach ($h in @($s.Value.headers.PSObject.Properties)) {
        $oldH = $old.Value.headers.PSObject.Properties[$h.Name]
        if ($h.Value -match '\$\{' -and $oldH) { $s.Value.headers.($h.Name) = $oldH.Value }
      }
    }
    $liveMcp.mcpServers | Add-Member -Force $s.Name $s.Value
  }
  $disabled = @($liveMcp.disabledServers) + @($repoMcp.disabledServers) | Where-Object { $_ } | Sort-Object -Unique
  $liveMcp | Add-Member -Force disabledServers @($disabled)
  [IO.File]::WriteAllText($liveMcpPath, ($liveMcp | ConvertTo-Json -Depth 20), $utf8)
  "merged repo mcp.json into $liveMcpPath (existing header secrets kept)"
} else {
  Copy-Item (Join-Path $Repo 'agent\mcp.json') $liveMcpPath
  "mcp.json restored with `${..._TOKEN} placeholders; set them or edit the file"
}

foreach ($d in $AgentDirs) {
  $src = Join-Path $Repo "agent\$d"
  if (Test-Path $src) {
    robocopy $src (Join-Path $Agent $d) /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy $d failed ($LASTEXITCODE)" }
  }
}
$global:LASTEXITCODE = 0

# <identity:KEY> placeholders back to real values from the machine-local map (see ../scripts/identities.sh).
$map = Join-Path $env:USERPROFILE '.config\dotfile\identities.local'
if (Test-Path $map) {
  $vals = @{}
  Get-Content $map | Where-Object { $_ -match '^([A-Z0-9_]+)=(.+)$' } | ForEach-Object { $vals[$Matches[1]] = $Matches[2] }
  Get-ChildItem -Recurse -File $Agent -Include *.md, *.yml, *.yaml, *.json, *.sh, *.ps1, *.py |
    Where-Object { $_.FullName -notmatch '\\(cache|sessions)\\' } | ForEach-Object {
      $text = [IO.File]::ReadAllText($_.FullName)
      if ($text -notmatch '<identity:') { return }
      $new = [regex]::Replace($text, '<identity:([A-Z0-9_]+)>', { param($m) if ($vals.ContainsKey($m.Groups[1].Value)) { $vals[$m.Groups[1].Value] } else { $m.Value } })
      if ($new -ne $text) { [IO.File]::WriteAllText($_.FullName, $new, $utf8) }
    }
}

if (-not (Test-Path (Join-Path $Live 'auth-broker.token'))) {
  "copy the broker token from turing to $Live\auth-broker.token; omp fails closed until it exists"
}
"restored into $Live (broker $BrokerUrl)"
