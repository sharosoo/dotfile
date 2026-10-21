---
name: macos-build-vm
description: "Reproduce and operate the Arch/Linux Quickemu macOS Tahoe build VM: installation, OpenCore reboot selection, headless QMP screenshots/input, SSH access, host home sharing, and build-tool checks."
---

# macOS build VM on Arch Linux

Use this skill when a task needs macOS-only building, the local Tahoe VM, reproducing its installation, manipulating its UI in the background, or accessing the Linux host home from macOS. This is an Intel/x86_64 guest on an AMD Linux host, not an Apple Silicon VM.

## Local layout and guardrails

- Host workspace: `/home/sharosoo/vms`.
- Quickemu checkout: `/home/sharosoo/vms/quickemu`; observed checkout short SHA `82df57d`, Quickemu reports 4.9.9.
- Configuration: `/home/sharosoo/vms/macos-tahoe.conf`.
- VM files: `/home/sharosoo/vms/macos-tahoe/` (`disk.qcow2`, `OpenCore.qcow2`, EFI firmware, recovery image).
- QMP socket: `/home/sharosoo/vms/macos-tahoe/qmp.socket`.
- HMP socket: `/home/sharosoo/vms/macos-tahoe/macos-tahoe-monitor.socket`.
- Controller: `/home/sharosoo/vms/macos-tahoe/control.py`, standard-library Python only.
- SSH helper: `/home/sharosoo/vms/macos-tahoe/guest.sh`; reads the port from `.ports`, uses the dedicated Ed25519 key and pinned `access/known_hosts`, and fails instead of asking for a password.
- The skill bundles `control.py` and `guest.sh`; copy them beside the target VM's QMP socket and `.ports` file when reproducing elsewhere.
- Guest account: `builder`. Password is local-only in `macos-tahoe/access/password`; directory mode 700, file mode 600. Never include the password in chat, skill text, command logs, or a public artifact.
- The user explicitly authorized exposing the host home and changing `/home/sharosoo` to mode 777. This is not recursive and does not bypass permissions on children. Do not apply that permission policy to another machine without permission.
- Apple licensing restricts macOS virtualization to Apple hardware. This AMD-host arrangement does not satisfy that restriction; advise Apple hardware for compliant use.
- No GPU acceleration guarantee. Do not promise Metal support, nested virtualization, Apple Silicon-only app support, iMessage, signing identities, or notarization.
- Never run two QEMU processes against the same writable disk. Coordinate UI actions; QMP accepts one active client. Close the connection after each operation. A second client's greeting can time out while a persistent eval client owns the socket.

## Reproduce installation from scratch

Do not overwrite an existing VM; inspect configuration, process, disk, and screenshots first. For a fresh directory:

Paths below describe this workstation. On another machine replace `/home/sharosoo`, `sharosoo` and the mount tag with its actual home and username; use an absolute QMP socket path. Run commands whose paths are relative with the tool's `cwd` set to `~/vms`. The skill and bundled controller are self-contained; no earlier eval kernel or chat history is required.

```bash
mkdir -p ~/vms
# Run from ~/vms:
git clone https://github.com/quickemu-project/quickemu.git
# Prefer the observed revision for reproducing this session; master may change.
git -C quickemu checkout 82df57d
./quickemu/quickget --list-csv
./quickemu/quickget macos tahoe
# Install the bundled controller beside the new VM's socket:
cp ~/.omp/agent/managed-skills/macos-build-vm/control.py ./macos-tahoe/control.py
cp ~/.omp/agent/managed-skills/macos-build-vm/guest.sh ./macos-tahoe/guest.sh
chmod +x ./macos-tahoe/control.py
chmod +x ./macos-tahoe/guest.sh
```

Requirements verified on this host: AMD-V, usable `/dev/kvm`, QEMU x86_64, `qemu-img`, curl, jq, socat, 7zip, GTK/SDL QEMU display modules, and UEFI firmware. Host had Ryzen 9 9950X and approximately 60 GiB RAM. `qemu-base` was installed; `qemu-full`, libvirt and dmg2img were not required for the observed path. Missing `spicy` was bypassed with `viewer="none"`; SDL works. This avoids sudo/package installation, but installs executable scripts in the checkout, not system-wide pacman packages. Verify current dependency checks instead of assuming another host has all requirements.

Quickget downloaded an Apple recovery image, checked it and converted DMG to IMG, downloaded OpenCore/firmware, and generated `macos-tahoe.conf`. Keep download verification enabled. Before first boot use:

```bash
#!/home/sharosoo/vms/quickemu/quickemu --vm
guest_os="macos"
disk_img="macos-tahoe/disk.qcow2"
img="macos-tahoe/RecoveryImage.img"
disk_size="128G"
macos_release="tahoe"
display="sdl"
viewer="none"
extra_args="-qmp unix:/home/sharosoo/vms/macos-tahoe/qmp.socket,server=on,wait=off"
```

All relative disk paths depend on running from `/home/sharosoo/vms`:

```bash
./quickemu/quickemu --vm macos-tahoe.conf
```

Observed allocation: 16 GiB guest RAM, Haswell-v2 virtual CPU, 8 cores/16 threads, sparse 128 GiB disk. Verify actual allocation in launch output. Quickemu may allocate too much on another host; set resources deliberately there.

### Recovery and installation

1. OpenCore → `macOS Base System` for the initial recovery boot.
2. Disk Utility: select the **137.44 GB / 128 GiB uninitialized Apple Inc. VirtIO Block Media**. Do not erase recovery media or OpenCore's small disk. Erase as `Macintosh HD`, APFS, GUID partition map. Verify the size and empty state before erasing.
3. Quit Disk Utility (guest Command+Q = QMP `meta_l q`). Choose Reinstall macOS Tahoe, accept terms under the user's installation authorization, and select Macintosh HD.
4. Installer downloads the full OS; watch actual progress. At each restart inspect OpenCore rather than sleeping blindly for ten minutes.
5. **Critical pitfall:** OpenCore repeatedly defaulted to Base System/recovery. Select `macOS Installer` explicitly during installation, then `Macintosh HD` when that entry replaces Installer. Plain Enter worked. Ctrl+Enter alone did not reliably start the selected entry; verify the screenshot, then use plain Enter if still in the picker.
6. A sealed System volume in `diskutil apfs list` is evidence of the installed system, not proof of a working desktop or completed onboarding.
7. After installation, cleanly stop the VM and remove the `img=` recovery-image line from its configuration. Keep the image file for recovery. This removed Base System from the boot picker and made Macintosh HD the first entry. Do not detach it in the middle of installation.
8. Finish Setup Assistant: choose South Korea, ABC keyboard/English UI for deterministic input, skip data migration and Apple Account, create local `builder` administrator with a generated password stored only in the protected access directory. Disable optional analytics, Siri, Screen Time, and FileVault for unattended boot. FileVault disables unattended OS access after reboot. Defer automatic installation of OS updates; build VM upgrades need an explicit decision.


Generate the local account password before typing it into Setup Assistant, without printing it:

```bash
python3 -c 'import os,pathlib,secrets; p=pathlib.Path.home()/"vms/macos-tahoe/access"; p.mkdir(mode=0o700,exist_ok=True); p.chmod(0o700); fd=os.open(p/"password",os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600); os.write(fd,(secrets.token_hex(12)+"\n").encode()); os.close(fd)'
```

The exclusive create fails safely if a password already exists. Use `control.py text --file .../access/password` separately in both password fields; never regenerate it after account creation. Visually verify that the account name and full name were not truncated.

## Background UI manipulation (does not steal host focus)

```bash
~/vms/macos-tahoe/control.py status
~/vms/macos-tahoe/control.py shot /tmp/macos-screen.png
~/vms/macos-tahoe/control.py click 1276 802
~/vms/macos-tahoe/control.py scroll up --steps 10
~/vms/macos-tahoe/control.py key meta_l spc
~/vms/macos-tahoe/control.py text 'Terminal'
~/vms/macos-tahoe/control.py key ret
~/vms/macos-tahoe/control.py text --file ~/vms/macos-tahoe/access/password
```

Read screenshots with the agent image reader. Click coordinates are **full guest framebuffer pixels**, default 1920×1080; a half-size screenshot doubles coordinates. Pass `--width` and `--height` if actual resolution differs. Do not confuse the reader's displayed scaling with guest dimensions.

The controller uses `qmp_capabilities`, `query-status`, `screendump` (PNG), `input-send-event` absolute x/y axes normalized to 0…32767 and left-button down/up, and `send-key` qcodes. It paces keystrokes (100 ms hold + 200 ms delay): fast character injection dropped input during onboarding. Text must be ASCII with ABC/US input active; Command+Space opens Spotlight, Command+A selects text, Command+Q quits. Use SSH instead of UI typing once available. SPICE clipboard cannot be assumed on macOS.

macOS natural scrolling inverted the observed wheel direction: `scroll up` moved down through Sharing settings. Re-check the screenshot rather than assuming a direction. Spotlight's first launch was delayed; wait for Terminal before typing a shell command, or the command may land in the wrong surface.

**Release SDL input capture:** Ctrl+Alt+G on the host keyboard. USB tablet is already configured; no need to hotplug another mouse.

Never take a screenshot concurrently with reading it: first complete `shot`, then read the resulting PNG. Earlier parallel reads could see stale frames. A `running` QMP status only proves the emulator is running; it does not prove guest boot or installer progress.

### Minimal controller reproduction if the helper is unavailable

Standard-library Python can connect to the Unix socket, read its JSON greeting, send `{"execute":"qmp_capabilities"}`, and read until a response with `return` or `error` (skip asynchronous events). Then send:

```json
{"execute":"screendump","arguments":{"filename":"/tmp/mac.png","format":"png"}}
{"execute":"send-key","arguments":{"keys":[{"type":"qcode","data":"ret"}],"hold-time":100}}
{"execute":"input-send-event","arguments":{"events":[{"type":"abs","data":{"axis":"x","value":16384}},{"type":"abs","data":{"axis":"y","value":16384}}]}}
```

Send button down then up in separate commands to click, allow a small delay, close both stream and socket. Do not expose QMP or HMP on a public TCP endpoint.

## Launching without a local display

Use the same VM, not a new disk:

```bash
# From /home/sharosoo/vms, after the existing VM has shut down:
./quickemu/quickemu --vm macos-tahoe.conf --display none --viewer none
```

QMP screenshots/input still work with a guest display device and no local window. Do not restart simply to hide the window during a build. For an SDL window, launch in the desktop session environment; a Python eval subprocess in this session failed with `Could not initialize SDL(No available video device)`, whereas the bash tool's desktop environment worked. Headless mode avoids that requirement.

The installed configuration now defaults to `display="none"`, `viewer="none"`, explicitly sets `public_dir="/home/sharosoo/macos-share"`, and has no recovery `img=` line. To return to a local window after stopping this instance: `./quickemu/quickemu --vm macos-tahoe.conf --display sdl --viewer none`.

## Host home sharing and build access

Quickemu exposes `xdg-user-dir PUBLICSHARE` by default; on this machine that resolved to `/home/sharosoo`, tagged `Public-sharosoo`. Verify `-fsdev ... path=...` and `mount_tag` in the actual QEMU command/config. The config pins `public_dir="/home/sharosoo/macos-share"`. NEVER share or chmod the home directory itself: Quickemu's hint `chmod 777 ${PUBLIC}` applied to `/home/sharosoo` (done on 2026-10-12) makes sshd StrictModes reject key login for the host user ("bad ownership or modes for directory /home/sharosoo"). Only the dedicated share directory may be mode 777; `/home/sharosoo` must stay 755.

Quickemu's documented macOS mount command is:

```bash
sudo mount_9p Public-sharosoo
```

Verify the command exists and observe the mounted path, then prove reading/writing a uniquely named harmless file in the share. Do not claim sharing works just because Quickemu prints its mount command. Never chmod the home directory, recursively or not. Do not run builds in the 9P share blindly: build systems can depend on symlinks, file locking, xattrs and permissions. Prefer copying sources into the guest's local APFS workspace and copying artifacts back. For very large trees use rsync over SSH, if installed at both ends.

Verified mount path: `/Volumes/Public-sharosoo` maps to Linux `public_dir`. With the earlier home-wide share, guest UID 501 could not write into host-owned 755 directories; the dedicated exchange directory `/home/sharosoo/macos-share` (mode 777) allowed the guest to write `guest=builder share=read-write`. With `public_dir` now pointing there, `/Volumes/Public-sharosoo` itself is the writable exchange. Host SSH can copy sources into guest-owned APFS paths without changing project permissions.

The forwarded guest SSH port is recorded in `macos-tahoe/macos-tahoe.ports` (initially 22220), but forwarding alone does not enable SSH inside macOS. Enable guest Remote Login, provision a dedicated host public key in `/Users/builder/.ssh/authorized_keys`, then verify `ssh ... 'sw_vers; uname -m; id'`. Never invent guest IPs or assume the printed `ssh user@localhost` works. Quickemu's default `hostfwd=tcp::PORT-:22` binds all host interfaces; restrict or firewall access before relying on a local-only security claim.

Concrete SSH provisioning after opening Terminal inside the installed guest:

1. Host: `ssh-keygen -t ed25519 -N '' -f ~/vms/macos-tahoe/access/id_ed25519` (only if the key does not already exist).
2. Guest: create `~/.ssh` mode 700, insert that host-generated **public** key into `~/.ssh/authorized_keys`, and set it to mode 600. Keep the private key on Linux.
3. Guest: `sudo systemsetup -setremotelogin on`. If macOS denies this because Terminal lacks Full Disk Access, use System Settings → General → Sharing → Remote Login and enable access only for `builder`.
4. Host: `ssh -i ~/vms/macos-tahoe/access/id_ed25519 -p 22220 -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=~/vms/macos-tahoe/access/known_hosts builder@127.0.0.1 'sw_vers; uname -m; id'`. Inspect the actual `.ports` file for a changed port. This initializes the helper's pinned host-key file on first connection; never automatically accept a changed existing key or disable host-key checking globally.
5. Sources: first run `~/vms/macos-tahoe/guest.sh 'mkdir -p /Users/builder/builds'`, then `scp -i ~/vms/macos-tahoe/access/id_ed25519 -o UserKnownHostsFile=~/vms/macos-tahoe/access/known_hosts -o StrictHostKeyChecking=yes -P 22220 -r /home/sharosoo/PATH_TO_PROJECT builder@127.0.0.1:/Users/builder/builds/`. Replace the source with the actual requested tree; do not copy the whole home or secrets.
6. Artifacts: use the reverse `scp` direction into a requested host output directory.

Remote Login was enabled using the Sharing UI: Terminal's `sudo systemsetup -setremotelogin on` actually failed with a Full Disk Access requirement. Open the pane with `open 'x-apple.systempreferences:com.apple.Sharing-Settings.extension'`, scroll to Remote Login, toggle it, and authenticate using the protected account password. Host-key trust was initialized once using `StrictHostKeyChecking=accept-new` and `UserKnownHostsFile=access/known_hosts`; subsequent helper calls enforce strict pinned checking.

Verified current access:

```bash
~/vms/macos-tahoe/guest.sh 'sw_vers; uname -m; id'
~/vms/macos-tahoe/guest.sh 'ls /Volumes/Public-sharosoo'
```

The 9P mount is not persistent across reboots. If absent, remount with guest sudo; SSH already starts before GUI login. For agent sudo commands, read the protected local password file and pass its bytes as stdin to `guest.sh "sudo -S -p '' COMMAND"` through a subprocess; do not interpolate the password into shell strings or print it.

## Build verification

After remote access works, inspect `xcode-select -p`, `clang --version`, `xcrun --find clang`, and `xcodebuild -version` as appropriate. A working desktop is not a build environment. Install Command Line Tools if absent; full Xcode is separate and may require Apple Account/download authorization. Compile and execute a throwaway native program and observe its output before claiming native builds work. This Intel guest produces x86_64 binaries natively; arm64 cross-compilation, universal binaries, simulator availability, code signing and notarization must each be verified for the actual project. No actual user project was specified here.

Verified installed OS: macOS **26.7.1**, build **25G241**, architecture **x86_64**. Installed **Command Line Tools for Xcode 26.6-26.6** via Software Update; the selected SDK reports **26.5** (package version and SDK version differ).

Reproduce CLT installation in the guest, selecting an exact available label rather than inventing one:

```bash
touch /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
softwareupdate --list
sudo softwareupdate --install 'Command Line Tools for Xcode 26.6-26.6'
rm -f /tmp/.com.apple.dt.CommandLineTools.installondemand.in-progress
```

The marker exposed CLT packages that did not appear in the initial listing. The observed installation exited 0. Native compile/run smoke (in the guest, delete its own temporary directory afterward):

```bash
set -eu
xcode-select -p
xcrun --find clang
xcrun --show-sdk-version
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
printf '#include <stdio.h>\nint main(void) { puts("macOS native build OK"); return 0; }\n' > "$d/smoke.c"
clang -Wall -Werror "$d/smoke.c" -o "$d/smoke"
"$d/smoke"
file "$d/smoke"
```

Observed output: `macOS native build OK`, `Mach-O 64-bit executable x86_64`; exit 0. Full Xcode and a specific project's dependencies/signing were not installed or tested.

## Troubleshooting and recorded mistakes

- Back at Recovery: inspect picker and disk roles; it may be wrong boot selection rather than a failed installer. Detach recovery image only after installation.
- Black screen: send a harmless modifier/mouse movement, screenshot again, and inspect guest state. In this session a black frame progressed to Setup Assistant's white screen/beachball and then country selection. This does not prove every black screen is sleep.
- Setup Assistant stalled at the final `Update Mac Automatically` step after `Only Download Automatically`. ACPI powerdown and guest Command-Q did not finish it. A QMP reset recovered to the normal login screen; the stored password authenticated and Finder appeared. This reset was only done during initial setup with no user documents or builds open. Never use that recovery action blindly during a real build.
- A later `sudo shutdown -h now` SSH call timed out; the guest subsequently reported a fresh uptime and login screen, so do not infer a powered-off emulator from the requested shutdown. Check actual QMP state. In this idle session, guest-side `sync` through SSH followed by QMP `quit` stopped the emulator before launching headless; that is not a general replacement for graceful shutdown.
- Repeated launchd `Failed to bootstrap ... Operation already in progress`: not enough to diagnose kernel panic; capture boot history and current UI before acting.
- AMD MSR warning: `/sys/module/kvm/parameters/ignore_msrs` was `N`; Recovery and Setup Assistant still booted. Do not call it the cause without evidence. If an actual MSR-related failure warrants it, `echo 1 | sudo tee /sys/module/kvm/parameters/ignore_msrs` is a host-wide temporary change requiring sudo, with reversion `echo 0 | sudo tee ...`. Never pretend sudo succeeded; this session had no passwordless sudo.
- PipeWire `no target node available` logs appeared while UI booted; do not silently suppress unrelated errors or assert audio works.
- QMP client timeout: release a persistent prior client; QMP is single-client here.
- Long sleeps conceal reboot selection errors. Sample and inspect screens near restart; do not interpret elapsed time as progress.
- Do not export guest credentials, host private SSH keys, or the entire home to a public endpoint.

## Sources

- Quickemu macOS installation: https://github.com/quickemu-project/quickemu/wiki/03-Create-macOS-virtual-machines
- Advanced configuration, headless and sharing: https://github.com/quickemu-project/quickemu/wiki/05-Advanced-quickemu-configuration
- Local `quickemu` source (network hostfwd, public_dir, display, extra_args), actual tool outputs and screenshots from this session are primary evidence for local deviations.
