---
name: windows-build-vm
description: "Reproduce and operate the local Arch/Linux Windows 11 build VM: official evaluation media, TPM/Secure Boot, unattended setup, headless QMP controls, key-only PowerShell SSH, dedicated file exchange, MSVC/SDK/CMake builds."
---

# Windows build VM on Arch Linux

Read this skill when a task needs native Windows builds, the local Windows VM, background UI interaction, or reproducing this installation. Run real guest checks before claiming the VM or toolchain is usable. A QMP `running` response only describes the emulator, not guest readiness.

## Paths and safety

- Workspace: `/home/sharosoo/vms`; Quickemu checkout `quickemu/`, observed revision `82df57d`, Quickemu 4.9.9.
- Config: `/home/sharosoo/vms/windows-11.conf`; guest disk and helpers: `/home/sharosoo/vms/windows-11/`.
- Launch with `~/vms/windows-11/start.sh` so user-local TPM libraries are available; do not start the same writable disk twice.
- QMP: `windows-11/qmp.socket`; HMP: `windows-11/windows-11-monitor.socket`.
- Linux-local access files: `windows-11/access/password`, `id_ed25519`, `id_ed25519.pub`, and pinned `known_hosts`. Access directory 700; password/private key 600. Never print or embed passwords/private keys in chat, command strings, docs, or public artifacts.
- Guest account: `builder`, local administrator; remote SSH runs PowerShell.
- Dedicated exchange: `/home/sharosoo/windows-share`, mode 700, owned by the host user. Transfer over SSH/SFTP, not home-wide chmod or a native 9P mount. Windows has no macOS `mount_9p` command.
- **Never share or chmod the host home itself.** The prior macOS home-wide chmod777 broke host SSH StrictModes. `/home/sharosoo` must keep its existing restrictive permissions (755 observed); do not recursively change permissions anywhere.
- Windows SSH forward: `127.0.0.1:22221` → guest22. Config uses `network="none"` to suppress Quickemu's broad default forward, then supplies its own explicit user-mode NIC in `extra_args`. The launcher may print `Network: Disabled`; the extra NIC is the real network. Verify actual QEMU arguments and `ss -ltnp`, not the label.
- SPICE is loopback-only (observed5931); QMP is a Unix socket. Never change either to a public unauthenticated endpoint.
- Resources: 8 GiB RAM, 8 virtual CPUs (4 cores ×2 threads), sparse128 GiB disk. Preserve the independent macOS VM and other running work.

## Licensing and media

The installed media is **Windows11 Enterprise Evaluation24H2 x64**, not a permanent Windows Pro license. Evaluation is **90 days**; after expiration it is not a reliable build server and Windows can shut down hourly. Do not promise indefinite activation. Use licensed installation media for permanent use; the evaluation-to-full transition may require reinstalling. Never add activation servers, unauthorized keys, or licensing bypasses.

Before online evaluation activation, this image's desktop said `Windows License is expired`. Legitimate stock activation with `cscript //nologo C:\Windows\System32\slmgr.vbs /ato` succeeded; `SoftwareLicensingProduct` then reported `LicenseStatus=1` and approximately90 days remaining. The same licensed state persisted after reboot. Do not use clock changes, unauthorized KMS hosts or rearm workarounds; if normal activation fails, resolve the licensing prerequisite instead.

Quickget's consumer Windows11 request was rejected by Microsoft IP/bot protection (ProductID3813, SKU27160). Do not retry to confirm that observed failure. Use the official Enterprise evaluation CDN image or ask for legitimate user-provided media if that image is unavailable.

Observed working ISO:

```text
https://software-static.download.prss.microsoft.com/dbazure/888969d5-f34g-4e03-ac9d-1f9786c66749/26100.1742.240906-0331.ge_release_svc_refresh_CLIENTENTERPRISEEVAL_OEMRET_x64FRE_en-us.iso
size: 5387960320 bytes
SHA256: 755a90d43e826a74b9e1932a34788b898e028272439b777e5593dee8d53622ae
```

VirtIO media: Fedora's official `https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/stable-virtio/virtio-win.iso`. The observed release was0.1.302-1; use the resolved versioned **HTTPS** URL for reproducibility, not an insecure HTTP redirect:
`https://fedorapeople.org/groups/virt/virtio-win/direct-downloads/archive-virtio/virtio-win-0.1.302-1/virtio-win-0.1.302.iso`.

The Windows ISO is UDF. The agent `read` archive reader exposed only README.TXT, not the UDF sources tree. `7z l` correctly identified `sources/boot.wim` and `sources/install.wim`; this is a documented specialised-reader limitation, not evidence of a corrupt ISO.

## Reproduce from scratch

On another host, replace absolute home/workspace paths and use usable KVM/modern x86_64 hardware. This procedure targets Arch with an initialized pacman keyring, QEMU, OVMF, curl, gpgv, bsdtar, Python3, OpenSSH client and 7zip already available.

1. Create a **fresh** `~/vms/windows-11/` and dedicated `~/windows-share/` mode700. Do not overwrite an existing VM disk. Reuse the Quickemu checkout only at the observed revision or inspect changes before upgrading it.
2. Copy the bundled `control.py`, `guest.py`, `start.sh`, `prepare-host-tools.py`, and `prepare-unattended.py` beside the VM disk; copy `bootstrap.ps1` and `install-buildtools.ps1` into its `provision/` directory. These files are independent of previous chat/eval state.
3. Run `python3 ~/vms/windows-11/prepare-host-tools.py`. This downloads swtpm/libtpms/cdrtools and resolved dependencies from the configured HTTPS Arch mirror, verifies detached package signatures with `/etc/pacman.d/gnupg/pubring.gpg`, and extracts into `~/vms/host-tools/`. It installs no system package and needs no sudo. `swtpm` needs both `usr/lib` and `usr/lib/swtpm` in LD_LIBRARY_PATH; `start.sh` sets them.
4. Download the Windows ISO above to `windows-11/windows.iso` and VirtIO ISO to `windows-11/virtio-win.iso`; enforce HTTPS and check the pinned Windows SHA256 before booting. This procedure installs image index1 (Enterprise Evaluation); another ISO may have different indices/editions.
5. Run `python3 ~/vms/windows-11/prepare-unattended.py` before creating the disk. It generates fresh protected local credentials once, SSH keys, a public-key file, and a mode600 provisioning ISO. It **refuses to run beside an existing disk** because its answer file wipes disk0. Never bypass that guard against a used VM.
6. Create `~/vms/windows-11.conf` using the installation configuration below; run `~/vms/windows-11/start.sh`.
7. QMP screenshots initially showed language and US keyboard screens. Keep English/US for deterministic input and click Next on each. Installation then used the answer file automatically, created UEFI partitions and injected signed Win11 VirtIO disk/network drivers. Watch actual progress and reboots; do not reboot because a percentage temporarily stays still.
8. FirstLogonCommands finds `bootstrap.ps1` on the provisioning ISO. It installs official OpenSSH.Server, provisions the administrator public-key file, narrows guest TCP22 firewall access to10.0.2.2, preserves UAC/Defender, and removes first-logon password state. Transcript: `C:\BuildSetup\bootstrap.log`. If it fails, inspect that transcript through the guest console; do not weaken authentication or turn off UAC to suppress an error.

Installation config:

```bash
#!/home/sharosoo/vms/quickemu/quickemu --vm
guest_os="windows"
disk_img="windows-11/disk.qcow2"
iso="windows-11/windows.iso"
fixed_iso="windows-11/virtio-win.iso"
disk_size="128G"
ram="8G"
cpu_cores="8"
tpm="on"
secureboot="on"
display="none"
viewer="none"
sound_card="none"
public_dir="/home/sharosoo/windows-share"
ssh_port="22221"
network="none"
extra_args="-netdev user,id=winbuild,hostfwd=tcp:127.0.0.1:22221-:22 -device virtio-net-pci,netdev=winbuild -qmp unix:/home/sharosoo/vms/windows-11/qmp.socket,server=on,wait=off"
```

Secure Boot-capable firmware selected `/usr/share/edk2/x64/OVMF_CODE.secboot.4m.fd`; TPM2 is provided by signed user-local swtpm0.10.1/libtpms0.10.2. Host `ignore_msrs` remained N; do not change host-wide KVM behavior without actual evidence of an MSR-related failure.

The generator sanitizes Quickget's original template: no LabConfig hardware-check bypasses, no KMS product keys, UAC true, ProtectYourPC1, one-time builder logon, Win11 viostor/vioscsi/NetKVM paths on E:, and UEFI recovery/EFI/MSR/Windows partitions. It uses the password only in the protected answer/ISO and local password file. After the OS and SSH work, remove installer `iso=`/`fixed_iso=` from config, safely detach media, and delete the secret-bearing autounattend.xml/unattended.iso; retain non-secret scripts and the local protected access directory.

## Background UI without capturing host focus

```bash
~/vms/windows-11/control.py status
~/vms/windows-11/control.py shot /tmp/windows-screen.png
~/vms/windows-11/control.py click 902 635
~/vms/windows-11/control.py key meta_l r
~/vms/windows-11/control.py text powershell
~/vms/windows-11/control.py key ret
```

Use screenshot → read → action → screenshot sequentially. Default click dimensions are1280×800, as observed during installation; use `--width`/`--height` for a changed guest resolution. Coordinates refer to the full PNG, not the reader's scaled preview. `meta_l` is the Windows key; `ctrl shift ret` on a selected program requests elevation, which may present UAC consent. `text --file access/password` types the protected password locally without putting it in the command line. ABC/US layout only; Unicode commands should go over encoded PowerShell SSH, not simulated keystrokes.

The controller opens and closes QMP per operation. Do not keep a persistent connection while another agent uses it: QMP is single-client here and the second greeting can time out. Coordinate GUI sequences between agents.

`key` sends explicit QMP key-down events followed by reversed key-up events. The earlier deferred `send-key` timer path intermittently left typed commands waiting for Enter in this guest; paired events executed the queued command and subsequent command/shortcut operations reliably. Wait for a visible ready console before typing: Edge's first-run UI can take focus during initial logon. For debugging before SSH, elevated `cmd` launched through Windows+R → `ctrl shift ret` → UAC consent was reliable.

## SSH and file exchange

On the first successful SSH connection, verify/pin the VM's host key into the helper's own file:

```bash
ssh -i ~/vms/windows-11/access/id_ed25519 -p 22221 \
  -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new \
  -o UserKnownHostsFile=~/vms/windows-11/access/known_hosts \
  builder@127.0.0.1 hostname
```

Never accept a changed key automatically. For subsequent commands:

```bash
~/vms/windows-11/guest.py '$env:COMPUTERNAME; whoami; Get-Service sshd'
~/vms/windows-11/guest.py --file ~/vms/windows-11/provision/install-buildtools.ps1
```

`guest.py` reads the actual SSH port from `windows-11.ports`, enforces key-only BatchMode and pinned StrictHostKeyChecking, encodes scripts as UTF16LE PowerShell `-EncodedCommand`, and propagates native exit codes and terminating PowerShell errors. Test nonzero status with a harmless `exit 7` scenario before relying on it in build automation.

Two PowerShell boundaries matter: the inner script must finish `Out-Default` before exiting or formatted objects can disappear; the outer PowerShell default SSH shell needs `; exit $LASTEXITCODE` after the nested encoded invocation, otherwise it collapses native exit7 to1. Actual smoke checks observed `exit 7` →7, `cmd.exe /c exit 9` →9, and missing-item/Write-Error →1.

For uploads/downloads use the standard host scp client with the same key, port and pinned host file. Modern scp uses SFTP; Windows paths use forms such as `builder@127.0.0.1:C:/Builds/`. First create `C:\Builds` through PowerShell. Copy only requested projects; stage returned artifacts under `~/windows-share`. No mounted home directory, no Samba guest share, and no recursive permission changes are needed. SPICE's printed WebDAV URL does not prove sharing is active; it needs a viewer/agent, so the observed headless workflow uses SSH/SFTP instead.

## Native build tools and proof

`install-buildtools.ps1` uses the official Microsoft VS2022 bootstrapper at `https://aka.ms/vs/17/release/vs_buildtools.exe`, requires a valid Microsoft Authenticode signature, installs at `C:\BuildTools`, and requests:

- `Microsoft.VisualStudio.Workload.VCTools` with recommended components
- `Microsoft.VisualStudio.Component.VC.CMake.Project`
- `Microsoft.VisualStudio.Component.Windows11SDK.26100`

It preserves setup logs in `C:\BuildSetup`, treats0 as success and3010 as **success with a required reboot**, and does not reboot itself. A later Git-for-Windows install is separate; absence is reported rather than pretending the compiler needs it. Initialization for MSVC: `C:\BuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64`.

After installation, compile a throwaway C/C++ program with cl, link it using the Windows SDK and execute the produced EXE; observe its exact output and binary architecture. Check bundled CMake and Ninja as needed. An installed MSBuild path alone is not proof of a functioning C++ toolchain. Remove temporary smoke sources/artifacts after proof. Do not claim a user's project builds, signing works, or unrelated .NET/Node/Rust dependencies exist without exercising that project.

### Verified local state and native builds

- Windows11 Enterprise Evaluation24H2, build26100.1742; licensed evaluation status1.
- VS2022 Build Tools17.14.41, MSVC tools14.44.35207 (compiler19.44.35229.0).
- Selected Windows SDK10.0.26100.0; CMake3.31.6-msvc6; Ninja1.12.1; Git2.56.0.windows.2.
- VS bootstrapper Authenticode statusValid, signerMicrosoft Corporation; installer exited0 and no reboot-required flag was present.
- Direct `cl /W4 /WX` compilation, linking and EXE execution printed `Windows native build OK`; parsed PE machine was0x8664 (x64).
- After a media-free restart, a separate CMake `-G Ninja` configure/build/EXE execution printed `Windows CMake build OK`; exit0.
- SSH/SFTP uploaded a unique file from `~/windows-share` into `C:\Builds`, modified it in the guest and downloaded it back. Both temporary transfer files were removed.
- Windows Defender antivirus and real-time protection both reportedTrue. Host home stayed755; exchange/access directories700 and password600.
- Installer/provisioning CD media were ejected, `iso=`/`fixed_iso=` removed from live config, and secret-bearing XML/ISO deleted. SSH and compiler tools remained usable after restart **without GUI login**; no auto-logon password state remains.

Reproduce the native compiler smoke inside an initialized developer shell:

```cmd
call C:\BuildTools\Common7\Tools\VsDevCmd.bat -arch=x64 -host_arch=x64
cl /nologo /W4 /WX C:\Builds\smoke.c /Fe:C:\Builds\smoke.exe
C:\Builds\smoke.exe
```

For CMake, initialize the same shell, then configure using `-G Ninja` with the bundled Ninja binary supplied as `CMAKE_MAKE_PROGRAM`, build and run the EXE. Use a uniquely named scratch project containing a real stdio C program and delete that project's own files after observing output. No real user project or code-signing workflow was tested.

## Troubleshooting

- Consumer media acquisition blocked: use official evaluation or authorized user media, not anti-bot/activation workarounds.
- ISO reader shows only README: inspect UDF with7zip; the Windows media was SHA256-checked.
- No disk in Setup: verify VirtIO CD attachment, E:\viostor\w11\amd64 and injected driver. Do not wipe a different disk.
- SSH admin key rejected: administrator accounts use `C:\ProgramData\ssh\administrators_authorized_keys`, not just builder's home .ssh; only SYSTEM/Administrators may hold file access.
- SSH timeout with a running listener: the capability's built-in rule was **Private-only**, while the NAT network wasPublic. Temporary firewall logging showed drops from10.0.2.2 to10.0.2.15:22. Fix the same rule to `-Profile Any` while retaining `-RemoteAddress 10.0.2.2`; do not disable the firewall or broaden sources. The bootstrap script now includes this fix, and temporary diagnostic logging was restored to disabled.
- The OS-supplied OpenSSH server currently triggers the Linux client's non-PQ key-exchange warning. The forwarded endpoint is loopback-only; no server upgrade or warning suppression was performed.
- Missing swtpm library: include `host-tools/usr/lib/swtpm` as well as usr/lib; a bare copied executable is insufficient.
- Unattended credentials are transient sensitive media. Do not bundle actual password, private keys, answer files or secret-bearing ISO into the skill.
- Default Quickget template disables UAC and adds TPM/RAM/CPU bypasses; do not boot it unmodified.
- Avoid forced reset during installation or builds. Prefer guest `Stop-Computer`/`Restart-Computer` with appropriate authorization and inspect actual emulator state after shutdown.

## Primary references

- Windows Enterprise evaluation/licensing: https://www.microsoft.com/en-us/evalcenter/evaluate-windows-11-enterprise
- Quickemu Windows: https://github.com/quickemu-project/quickemu/wiki/04-Create-Windows-virtual-machines
- Microsoft unattend reference: https://learn.microsoft.com/en-us/windows-hardware/customize/desktop/unattend/
- Windows OpenSSH: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_install_firstuse
- Windows SSH key management: https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement
- VS command line installation: https://learn.microsoft.com/en-us/visualstudio/install/use-command-line-parameters-to-install-visual-studio
- VS Build Tools components: https://learn.microsoft.com/en-us/visualstudio/install/workload-component-id-vs-build-tools
