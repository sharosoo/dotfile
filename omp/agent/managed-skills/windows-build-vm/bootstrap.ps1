<#
.SYNOPSIS
    One-time elevated provisioning for the Windows 11 build VM.

.DESCRIPTION
    Invoked from the provisioning ISO via unattend FirstLogonCommands, which
    already runs elevated. Installs the OpenSSH.Server optional capability,
    pins key-only SSH for the local administrator "builder" via
    C:\ProgramData\ssh\administrators_authorized_keys, makes powershell.exe
    the SSH default shell, narrows the inbound TCP/22 firewall allowance to
    the QEMU user-mode NAT host (10.0.2.2), disables sleep/hibernation, and
    clears the autologon credential state used to reach this script.

    Expects builder.pub (the host's dedicated SSH public key) next to this
    script on the provisioning ISO. Transcript goes to
    C:\BuildSetup\bootstrap.log; no credential value is ever written to it.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SetupDir = 'C:\BuildSetup'
$LogPath = Join-Path $SetupDir 'bootstrap.log'
$RebootFlag = Join-Path $SetupDir 'REBOOT-REQUIRED'
$needsReboot = $false
$failed = $false

New-Item -ItemType Directory -Path $SetupDir -Force | Out-Null
Start-Transcript -Path $LogPath -Force | Out-Null

function Assert-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($id)
    $admin = [Security.Principal.WindowsBuiltInRole]::Administrator
    if (-not ($principal.IsInRole($admin) -or $id.User.Value -eq 'S-1-5-18')) {
        throw 'bootstrap.ps1 must run elevated (FirstLogonCommands/Administrators/SYSTEM).'
    }
}

# Throw on a non-zero native exit so provisioning failures stay visible.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$ArgumentList = @()
    )
    & $FilePath @ArgumentList
    if ($LASTEXITCODE -ne 0) {
        throw "$FilePath $($ArgumentList -join ' ') exited $LASTEXITCODE"
    }
}

try {
    Assert-Elevated

    $pubPath = Join-Path $PSScriptRoot 'builder.pub'
    if (-not (Test-Path $pubPath)) {
        throw "builder.pub not found next to bootstrap.ps1 ($pubPath). Rebuild the provisioning ISO."
    }
    $keyLines = Get-Content -Path $pubPath |
        ForEach-Object { $_.Trim() } |
        Where-Object { $_ -match '^(ssh-|ecdsa-|sk-)' }
    if (-not $keyLines) {
        throw 'builder.pub contains no usable public key lines.'
    }

    $capName = 'OpenSSH.Server~~~~0.0.1.0'
    $cap = Get-WindowsCapability -Online -Name $capName
    if ($cap.State -ne 'Installed') {
        $result = Add-WindowsCapability -Online -Name $capName
        if ($result.RestartNeeded) { $needsReboot = $true }
    }
    $cap = Get-WindowsCapability -Online -Name $capName
    if ($cap.State -ne 'Installed') {
        throw 'OpenSSH.Server capability is not installed after Add-WindowsCapability.'
    }

    # powershell.exe as the default shell for SSH sessions (HKLM:\SOFTWARE\OpenSSH);
    # create the key first — it is only guaranteed to exist after sshd has run.
    New-Item -Path 'HKLM:\SOFTWARE\OpenSSH' -Force | Out-Null
    New-ItemProperty -Path 'HKLM:\SOFTWARE\OpenSSH' -Name 'DefaultShell' `
        -Value "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe" `
        -PropertyType String -Force | Out-Null

    Set-Service -Name sshd -StartupType Automatic

    # The capability install creates a broad inbound rule; narrow it before
    # sshd ever runs. Slirp user-mode NAT presents forwarded connections
    # from 10.0.2.2, so nothing else needs to reach this port.
    $qemuHost = '10.0.2.2'
    # The capability's default Private-only rule does not match this VM's Public NAT profile.
    if (Get-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -ErrorAction SilentlyContinue) {
        Set-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -RemoteAddress $qemuHost -Enabled True -Profile Any
    } else {
        New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' `
            -Enabled True -Direction Inbound -Protocol TCP -Action Allow `
            -LocalPort 22 -RemoteAddress $qemuHost -Profile Any | Out-Null
    }
    # Narrow any other broad inbound allow rule that explicitly opens TCP/22,
    # so a duplicate rule cannot re-expose sshd to the whole network.
    $broad = Get-NetFirewallRule -Direction Inbound -Enabled True -Action Allow -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -ne 'OpenSSH-Server-In-TCP' } |
        Where-Object {
            $f = $_ | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
            $f -and $f.Protocol -eq 'TCP' -and ($f.LocalPort -contains '22')
        }
    foreach ($r in $broad) {
        Set-NetFirewallRule -Name $r.Name -RemoteAddress $qemuHost
        Write-Warning "Restricted additional inbound TCP/22 rule '$($r.DisplayName)' to $qemuHost."
    }

    # Both are needed before the config can be validated; the firewall is
    # already narrowed, so a brief default-config run is contained.
    $sshConfig = 'C:\ProgramData\ssh\sshd_config'
    $hasHostKey = [bool](Get-ChildItem 'C:\ProgramData\ssh\ssh_host_*' -File -ErrorAction SilentlyContinue |
        Where-Object Name -NotLike '*.pub')
    if (-not (Test-Path $sshConfig) -or -not $hasHostKey) {
        Start-Service sshd
        $deadline = (Get-Date).AddSeconds(30)
        while (-not (Test-Path $sshConfig) -and (Get-Date) -lt $deadline) {
            Start-Sleep -Milliseconds 500
        }
        if (-not (Test-Path $sshConfig)) {
            throw 'sshd_config was not generated after starting sshd.'
        }
    }

    $authKeys = 'C:\ProgramData\ssh\administrators_authorized_keys'
    Set-Content -Path $authKeys -Value ($keyLines -join "`n") -Encoding ascii

    # sshd refuses the file unless only SYSTEM and Administrators hold access;
    # grant by SID so the ACL is locale-independent.
    $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
    $admins = [Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
    $acl = [System.Security.AccessControl.FileSecurity]::new()
    $acl.SetOwner($system)
    $acl.SetAccessRuleProtection($true, $false)   # disable inheritance, drop inherited ACEs
    $full = [System.Security.AccessControl.FileSystemRights]::FullControl
    $allow = [System.Security.AccessControl.AccessControlType]::Allow
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($system, $full, $allow))
    $acl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($admins, $full, $allow))
    Set-Acl -Path $authKeys -AclObject $acl

    # First obtained value wins in sshd_config, and a later "Match" block would
    # scope any directive appended after it. Strip every existing occurrence of
    # the auth directives (commented or not) and insert pinned values before
    # the first Match block.
    $pinned = @(
        'PubkeyAuthentication yes',
        'PasswordAuthentication no',
        'KbdInteractiveAuthentication no'
    )
    $directive = '^(?:#\s*)?(?:PubkeyAuthentication|PasswordAuthentication|KbdInteractiveAuthentication)\b'
    $lines = [System.Collections.Generic.List[string]]::new()
    $lines.AddRange([string[]](Get-Content -Path $sshConfig))
    $kept = [System.Collections.Generic.List[string]]::new()
    $firstMatch = -1
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -match $directive) { continue }
        if ($firstMatch -lt 0 -and $lines[$i] -match '^\s*Match\s') { $firstMatch = $kept.Count }
        $kept.Add($lines[$i])
    }
    $out = [System.Collections.Generic.List[string]]::new()
    $insertAt = if ($firstMatch -ge 0) { $firstMatch } else { $kept.Count }
    for ($i = 0; $i -lt $kept.Count; $i++) {
        if ($i -eq $insertAt) { foreach ($p in $pinned) { $out.Add($p) } }
        $out.Add($kept[$i])
    }
    if ($insertAt -eq $kept.Count) { foreach ($p in $pinned) { $out.Add($p) } }
    # Older images may lack the admin Match block; without it administrator
    # logins would read ~/.ssh/authorized_keys instead of the ACL-locked file.
    if (-not (($out -join "`n") -match 'administrators_authorized_keys')) {
        $out.Add('Match Group administrators')
        $out.Add('    AuthorizedKeysFile __PROGRAMDATA__/ssh/administrators_authorized_keys')
        $out.Add('Match all')
    }
    Set-Content -Path $sshConfig -Value $out -Encoding ascii

    Invoke-Native -FilePath "$env:WINDIR\System32\OpenSSH\sshd.exe" -ArgumentList @('-t')
    Restart-Service sshd -Force

    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'standby-timeout-ac', '0')
    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'standby-timeout-dc', '0')
    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'monitor-timeout-ac', '0')
    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'monitor-timeout-dc', '0')
    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'disk-timeout-ac', '0')
    Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'disk-timeout-dc', '0')
    # Hibernate timeouts and the hibernate flag can fail on virtual hardware
    # without hibernation support; standby is the real sleep path, so warn only.
    try {
        Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'hibernate-timeout-ac', '0')
        Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/change', 'hibernate-timeout-dc', '0')
        Invoke-Native -FilePath 'powercfg.exe' -ArgumentList @('/hibernate', 'off')
    } catch {
        Write-Warning "hibernate settings failed: $($_.Exception.Message)"
    }

    # The unattended first logon stores the account password in plaintext
    # under Winlogon; clearing it is why no password may appear in this log.
    $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    Set-ItemProperty -Path $winlogon -Name 'AutoAdminLogon' -Value '0'
    foreach ($v in 'DefaultPassword', 'AutoLogonCount') {
        if (Get-ItemProperty -Path $winlogon -Name $v -ErrorAction SilentlyContinue) {
            Remove-ItemProperty -Path $winlogon -Name $v -Force
        }
    }
    # Setup leaves a copy of the answer file (which embeds the same secret)
    # under Panther; remove those copies rather than scrub a needed log.
    foreach ($leftover in @(
            "$env:WINDIR\Panther\unattend.xml",
            "$env:WINDIR\Panther\UnattendGC\unattend.xml")) {
        if (Test-Path $leftover) {
            Remove-Item -Path $leftover -Force
            Write-Output "Removed unattend copy: $leftover"
        }
    }

    if ($needsReboot) {
        # Report, never reboot mid-provisioning; Main decides when to restart.
        Set-Content -Path $RebootFlag -Value 'OpenSSH.Server capability requested a restart.'
        Write-Warning "A reboot is required (see $RebootFlag)."
    }
    Write-Output 'bootstrap.ps1 completed.'
} catch {
    Write-Error $_
    $failed = $true
} finally {
    Stop-Transcript | Out-Null
}
if ($failed) { exit 1 }
exit 0
