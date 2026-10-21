#!/usr/bin/env python3
"""Run a PowerShell command in the windows-11 build VM over SSH.

Reads the forwarded SSH port from windows-11.ports (Quickemu writes it at
launch), authenticates with the dedicated key in access/id_ed25519 and the
pinned host key in access/known_hosts — same trust model as the macOS
guest.sh helper. BatchMode makes any password prompt a failure rather than
a fallback.

The command is handed to the guest as
    powershell.exe -NoProfile -NonInteractive -EncodedCommand <b64>
with the script encoded UTF-16LE base64, so quoting survives both ssh's
remote-command stringification and PowerShell's command-line parsing.
The ssh exit status is this script's exit status.

Usage:
    guest.py 'Get-ChildItem C:\\BuildSetup'
    guest.py --file ./install-buildtools.ps1
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
from pathlib import Path
from typing import NoReturn

ROOT = Path(__file__).resolve().parent
PORTS_FILE = ROOT / "windows-11.ports"
IDENTITY = ROOT / "access" / "id_ed25519"
KNOWN_HOSTS = ROOT / "access" / "known_hosts"


def ssh_port() -> int:
    try:
        lines = PORTS_FILE.read_text(encoding="utf-8").splitlines()
    except OSError:
        sys.exit(
            f"{PORTS_FILE.name} not found; start the VM first "
            "(windows-11/start.sh)."
        )
    for line in lines:
        name, sep, value = line.partition(",")
        if sep and name.strip() == "ssh":
            try:
                return int(value.strip())
            except ValueError:
                break
    sys.exit(
        f"No guest SSH port recorded in {PORTS_FILE.name}; "
        "start the VM first."
    )


def read_script(path: str) -> str:
    raw = Path(path).read_bytes()
    # PowerShell 5.1 tools emit UTF-16 with a BOM by default; plain files are
    # read as UTF-8 (an optional UTF-8 BOM is stripped).
    if raw.startswith((b"\xff\xfe", b"\xfe\xff")):
        return raw.decode("utf-16")
    return raw.decode("utf-8-sig")


def encode(command: str) -> str:
    # PowerShell otherwise reports success after a failed native command or cmdlet.
    payload = (
        "$ErrorActionPreference = 'Stop'\n$global:LASTEXITCODE = 0\ntry {\n& {\n"
        + command
        + "\n} | Out-Default\nexit $global:LASTEXITCODE\n} catch {\n"
        "[Console]::Error.WriteLine($_.ToString())\nexit 1\n}"
    )
    return base64.b64encode(payload.encode("utf-16-le")).decode("ascii")


def main() -> NoReturn:
    parser = argparse.ArgumentParser(
        description="Run a PowerShell command in the windows-11 build VM.",
        epilog="Exactly one of a positional command or --file is required.",
    )
    parser.add_argument(
        "command",
        nargs="*",
        help="PowerShell command to run in the guest (joined with spaces)",
    )
    parser.add_argument(
        "--file",
        metavar="SCRIPT",
        help="read the PowerShell command from this file instead",
    )
    args = parser.parse_args()

    if args.file and args.command:
        parser.error("pass either a command or --file, not both")
    if args.file:
        command = read_script(args.file)
    elif args.command:
        command = " ".join(args.command)
    else:
        parser.error("a command or --file is required")

    if not IDENTITY.is_file():
        sys.exit(f"{IDENTITY} missing; generate the dedicated key first")

    port = ssh_port()
    ssh = [
        "ssh",
        "-i", str(IDENTITY),
        "-p", str(port),
        "-o", "IdentitiesOnly=yes",
        "-o", "BatchMode=yes",
        "-o", "StrictHostKeyChecking=yes",
        "-o", f"UserKnownHostsFile={KNOWN_HOSTS}",
        "builder@127.0.0.1",
        # The configured outer PowerShell shell otherwise collapses nonzero codes to 1.
        "powershell.exe -NoProfile -NonInteractive -EncodedCommand " + encode(command) + "; exit $LASTEXITCODE",
    ]
    try:
        # exec so the VM command's exit status becomes this process's status.
        os.execvp(ssh[0], ssh)
    except FileNotFoundError:
        sys.exit("ssh client not found on the host PATH")


if __name__ == "__main__":
    main()
