<#
.SYNOPSIS
    Installs the native build toolchain for the Windows 11 build VM.

.DESCRIPTION
    Runs elevated in the guest (via guest.py over SSH, or from an elevated
    console) after bootstrap.ps1 has completed.

    1. Downloads the official VS 2022 Build Tools bootstrapper from
       https://aka.ms/vs/17/release/vs_buildtools.exe, verifies its
       Authenticode signature chains to Microsoft, and installs the
       "Desktop development with C++" (VCTools) workload with recommended
       components: MSVC v143 x64/x86 tools, Windows 11 SDK 10.0.26100 and
       CMake. Exit code 0 and 3010 both count as success; 3010 drops a
       C:\BuildSetup\REBOOT-REQUIRED flag instead of rebooting itself.
    2. Installs Git for Windows from the official git-for-windows/git
       GitHub release when a signed 64-bit installer can be resolved;
       if not, it warns and continues because MSVC/SDK/CMake are the
       contractual minimum.

    Transcript: C:\BuildSetup\install-buildtools.log.
    Visual Studio installer logs are preserved under C:\BuildSetup\logs.
#>

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$SetupDir = 'C:\BuildSetup'
$LogDir = Join-Path $SetupDir 'logs'
$DlDir = Join-Path $SetupDir 'downloads'
$LogPath = Join-Path $SetupDir 'install-buildtools.log'
$RebootFlag = Join-Path $SetupDir 'REBOOT-REQUIRED'
$InstallPath = 'C:\BuildTools'
$failed = $false
$needsReboot = $false

New-Item -ItemType Directory -Path $SetupDir -Force | Out-Null
New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
New-Item -ItemType Directory -Path $DlDir -Force | Out-Null
Start-Transcript -Path $LogPath -Force | Out-Null

function Assert-Elevated {
    $id = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($id)
    $admin = [Security.Principal.WindowsBuiltInRole]::Administrator
    if (-not ($principal.IsInRole($admin) -or $id.User.Value -eq 'S-1-5-18')) {
        throw 'install-buildtools.ps1 must run elevated.'
    }
}

# Run an installer, tolerating only the documented "success, reboot needed"
# code; everything else non-zero fails the provisioning run visibly.
function Invoke-Installer {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [Parameter(Mandatory)][string[]]$ArgumentList,
        [int[]]$RebootCodes = @(3010),
        [Parameter(Mandatory)][string]$Name
    )
    $p = Start-Process -FilePath $FilePath -ArgumentList $ArgumentList -Wait -PassThru
    $code = $p.ExitCode
    if ($code -eq 0) {
        Write-Host "$Name completed (exit 0)."
        return $false
    }
    if ($RebootCodes -contains $code) {
        Write-Warning "$Name completed with exit $code (reboot required)."
        return $true
    }
    throw "$Name failed with exit code $code."
}

function Assert-MicrosoftSignature {
    param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][string]$What)
    $sig = Get-AuthenticodeSignature -FilePath $Path
    if ($sig.Status -ne 'Valid' -or
        $sig.SignerCertificate.Subject -notmatch '^CN=Microsoft Corporation,') {
        throw "$What is not signed by Microsoft (status: $($sig.Status), subject: $($sig.SignerCertificate.Subject)). Refusing to run it."
    }
    Write-Output "$What signature OK: $($sig.SignerCertificate.Subject)"
}

try {
    Assert-Elevated
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    $vsUrl = 'https://aka.ms/vs/17/release/vs_buildtools.exe'
    $vsExe = Join-Path $DlDir 'vs_buildtools.exe'
    Write-Output "Downloading $vsUrl"
    Invoke-WebRequest -Uri $vsUrl -OutFile $vsExe -UseBasicParsing
    Assert-MicrosoftSignature -Path $vsExe -What 'vs_buildtools.exe'

    # --wait makes the bootstrapper wait for the installer child process and
    # return its exit code; without it the launch returns before setup ends.
    $vsArgs = @(
        '--quiet', '--wait', '--norestart',
        '--installPath', $InstallPath,
        '--add', 'Microsoft.VisualStudio.Workload.VCTools',
        '--includeRecommended',
        # Pinned for clarity; both are already VCTools-recommended components.
        '--add', 'Microsoft.VisualStudio.Component.VC.CMake.Project',
        '--add', 'Microsoft.VisualStudio.Component.Windows11SDK.26100',
        '--addProductLang', 'en-US'
    )
    $needsReboot = Invoke-Installer -FilePath $vsExe -ArgumentList $vsArgs -Name 'VS Build Tools'

    # Preserve the installer's own logs next to the transcript.
    Get-ChildItem -Path $env:TEMP -Filter 'dd_*.log' -ErrorAction SilentlyContinue |
        Copy-Item -Destination $LogDir -Force
    Get-ChildItem -Path "$env:ProgramData\Microsoft\VisualStudio\Packages\_Instances" `
        -Filter '*.log' -Recurse -ErrorAction SilentlyContinue |
        Copy-Item -Destination $LogDir -Force

    $msbuild = Join-Path $InstallPath 'MSBuild\Current\Bin\MSBuild.exe'
    $cmake = Join-Path $InstallPath 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    foreach ($probe in @($msbuild, $cmake)) {
        if (-not (Test-Path $probe)) {
            throw "Expected tool missing after install: $probe"
        }
    }

    $gitInstalled = $false
    try {
        $release = Invoke-RestMethod -Uri 'https://api.github.com/repos/git-for-windows/git/releases/latest' `
            -Headers @{ 'User-Agent' = 'windows-11-build-vm' }
        $asset = $release.assets | Where-Object { $_.name -match '^Git-[\d.]+-64-bit\.exe$' } | Select-Object -First 1
        if (-not $asset) {
            Write-Warning 'Could not find a Git-*-64-bit.exe asset in the latest git-for-windows release; skipping Git.'
        } else {
            $gitExe = Join-Path $DlDir $asset.name
            Write-Output "Downloading $($asset.browser_download_url)"
            Invoke-WebRequest -Uri $asset.browser_download_url -OutFile $gitExe -UseBasicParsing
            $sig = Get-AuthenticodeSignature -FilePath $gitExe
            if ($sig.Status -ne 'Valid') {
                Write-Warning "Git installer signature is $($sig.Status) (subject: $($sig.SignerCertificate.Subject)); refusing to run it. Install Git manually."
            } else {
                $gitLog = Join-Path $LogDir 'git-install.log'
                # /VERYSILENT /NORESTART per the Inno Setup CLI Git for Windows uses.
                $gitNeedsReboot = Invoke-Installer -FilePath $gitExe `
                    -ArgumentList @('/VERYSILENT', '/NORESTART', "/LOG=`"$gitLog`"") `
                    -RebootCodes @() -Name 'Git for Windows'
                $needsReboot = $needsReboot -or $gitNeedsReboot
                # PATH updates are not visible to this session; verify via the
                # default install location instead.
                $gitBin = "$env:ProgramFiles\Git\bin\git.exe"
                if (Test-Path $gitBin) {
                    $gitInstalled = $true
                    Write-Output "git --version: $(& $gitBin --version)"
                } else {
                    Write-Warning 'git.exe not found under Program Files after install; check git-install.log.'
                }
            }
        }
    } catch {
        Write-Warning "Git for Windows install failed: $($_.Exception.Message). MSVC/SDK/CMake are unaffected."
    }

    if ($needsReboot) {
        Set-Content -Path $RebootFlag -Value 'An installer requested a restart; reboot before relying on the toolchain.'
        Write-Warning "Reboot required (see $RebootFlag)."
    }
    Write-Output "install-buildtools.ps1 completed. Git installed: $gitInstalled"
} catch {
    Write-Error $_
    $failed = $true
} finally {
    Stop-Transcript | Out-Null
}
if ($failed) { exit 1 }
exit 0
