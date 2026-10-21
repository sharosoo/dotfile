#!/usr/bin/env python3
"""Install verified Arch TPM/ISO tools under ~/vms/host-tools, without sudo."""
import os
from pathlib import Path
import subprocess
from urllib.parse import urlparse

workspace = Path(__file__).resolve().parent.parent
root = workspace / "host-tools"
packages = root / "packages"
packages.mkdir(parents=True, exist_ok=True)
keyring = Path("/etc/pacman.d/gnupg/pubring.gpg")
if not keyring.is_file():
    raise SystemExit("The host's initialized pacman public keyring is required")
urls = subprocess.check_output(["pacman", "-Sp", "swtpm", "libtpms", "cdrtools"], text=True).splitlines()
for url in urls:
    if urlparse(url).scheme != "https":
        raise SystemExit("Configure an HTTPS pacman mirror before downloading VM tools")
    target = packages / url.rsplit("/", 1)[1]
    for remote, local in ((url, target), (url + ".sig", Path(str(target) + ".sig"))):
        if not local.exists():
            partial = Path(str(local) + ".partial")
            subprocess.run(["curl", "-fLsS", "--proto", "=https", "--proto-redir", "=https", "--retry", "2", "-o", str(partial), remote], check=True)
            partial.replace(local)
    # Use pacman's initialized keyring; Arch's shipped key file is ASCII-armored.
    subprocess.run(["gpgv", "--keyring", str(keyring), str(target) + ".sig", str(target)], check=True)
    subprocess.run(["bsdtar", "-xf", str(target), "-C", str(root)], check=True)
env = dict(os.environ)
env["LD_LIBRARY_PATH"] = str(root / "usr/lib") + ":" + str(root / "usr/lib/swtpm")
for binary, flag in (("swtpm", "--version"), ("mkisofs", "-version")):
    subprocess.run([str(root / "usr/bin" / binary), flag], env=env, check=True)
print("User-local VM prerequisites ready; no system packages or home permissions changed")
