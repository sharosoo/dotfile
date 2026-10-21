#!/usr/bin/env python3
"""Build a protected Windows provisioning ISO from the pinned Quickget template."""
import argparse
import os
from pathlib import Path
import secrets
import subprocess
import xml.etree.ElementTree as ET

NS = "urn:schemas-microsoft-com:unattend"
WCM = "http://schemas.microsoft.com/WMIConfig/2002/State"
ET.register_namespace("", NS)
ET.register_namespace("wcm", WCM)

def answer_file(source, password):
    start = source.index('<?xml version="1.0" encoding="utf-8"?>', source.index("function unattended_windows"))
    end = source.index("</unattend>", start) + len("</unattend>")
    root = ET.fromstring(source[start:end])
    for settings in root:
        for component in list(settings):
            name = component.get("name", "")
            if name.startswith("Microsoft-Windows-Security-SPP"):
                settings.remove(component)
                continue
            for child in list(component):
                if child.tag in (f"{{{NS}}}RunSynchronous", f"{{{NS}}}ProductKey"):
                    component.remove(child)
            user_data = component.find(f"{{{NS}}}UserData")
            if user_data is not None:
                for child in list(user_data):
                    if child.tag == f"{{{NS}}}ProductKey":
                        user_data.remove(child)
            for element in component.iter():
                if element.text == "Quickemu":
                    element.text = "builder"
                elif element.text == "quickemu":
                    element.text = password
                if element.tag == f"{{{NS}}}EnableLUA":
                    element.text = "true"
                elif element.tag == f"{{{NS}}}ProtectYourPC":
                    element.text = "1"
            if settings.get("pass") == "oobeSystem" and name == "Microsoft-Windows-Shell-Setup":
                auto = component.find(f"{{{NS}}}AutoLogon")
                ET.SubElement(auto, f"{{{NS}}}LogonCount").text = "1"
                component.remove(component.find(f"{{{NS}}}FirstLogonCommands"))
                first = ET.SubElement(component, f"{{{NS}}}FirstLogonCommands")
                cmd = ET.SubElement(first, f"{{{NS}}}SynchronousCommand", {f"{{{WCM}}}action": "add"})
                ET.SubElement(cmd, f"{{{NS}}}Order").text = "1"
                ET.SubElement(cmd, f"{{{NS}}}Description").text = "Provision Windows build SSH access"
                ET.SubElement(cmd, f"{{{NS}}}CommandLine").text = (
                    'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "'
                    "$p=Get-PSDrive -PSProvider FileSystem | ForEach-Object { Join-Path $_.Root 'bootstrap.ps1' } "
                    "| Where-Object { Test-Path $_ } | Select-Object -First 1; "
                    "if (!$p) { throw 'Provisioning ISO missing' }; & $p\""
                )
        if settings.get("pass") == "windowsPE":
            setup = next(c for c in settings if c.get("name") == "Microsoft-Windows-Setup")
            for partition in setup.findall(f"{{{NS}}}DiskConfiguration/{{{NS}}}Disk/{{{NS}}}CreatePartitions/{{{NS}}}CreatePartition"):
                order = partition.find(f"{{{NS}}}Order").text
                size = partition.find(f"{{{NS}}}Size")
                if size is not None:
                    size.text = {"1": "1536", "2": "260", "3": "16"}[order]
            image = setup.find(f"{{{NS}}}ImageInstall/{{{NS}}}OSImage")
            install = ET.Element(f"{{{NS}}}InstallFrom")
            metadata = ET.SubElement(install, f"{{{NS}}}MetaData", {f"{{{WCM}}}action": "add"})
            ET.SubElement(metadata, f"{{{NS}}}Key").text = "/IMAGE/INDEX"
            ET.SubElement(metadata, f"{{{NS}}}Value").text = "1"
            image.insert(0, install)
            paths = next(c for c in settings if c.get("name") == "Microsoft-Windows-PnpCustomizationsWinPE").find(f"{{{NS}}}DriverPaths")
            for child in list(paths):
                paths.remove(child)
            for i, driver in enumerate(("viostor", "vioscsi", "NetKVM"), 1):
                entry = ET.SubElement(paths, f"{{{NS}}}PathAndCredentials", {f"{{{WCM}}}action": "add", f"{{{WCM}}}keyValue": str(i)})
                ET.SubElement(entry, f"{{{NS}}}Path").text = rf"E:\{driver}\w11\amd64"
    ET.indent(root)
    return ET.tostring(root, encoding="unicode", xml_declaration=True)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--vm-dir", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    vm = args.vm_dir.resolve()
    if (vm / "disk.qcow2").exists():
        parser.error("Refusing to prepare destructive installation media beside an existing VM disk")
    workspace = vm.parent
    provision = vm / "provision"
    if not (provision / "bootstrap.ps1").is_file():
        parser.error("Copy bootstrap.ps1 and install-buildtools.ps1 into provision/ first")
    access = vm / "access"
    access.mkdir(mode=0o700, parents=True, exist_ok=True)
    access.chmod(0o700)
    password_file = access / "password"
    if not password_file.exists():
        fd = os.open(password_file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as output:
            output.write(secrets.token_hex(12) + "\n")
    if not (access / "id_ed25519").exists():
        subprocess.run(["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", str(access / "id_ed25519"), "-C", "windows-build-vm"], check=True)
    (provision / "builder.pub").write_text((access / "id_ed25519.pub").read_text())
    source = (workspace / "quickemu" / "quickget").read_text()
    xml = answer_file(source, password_file.read_text().strip())
    fd = os.open(provision / "autounattend.xml", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as output:
        output.write(xml)
    os.chmod(provision / "autounattend.xml", 0o600)
    os.umask(0o077)
    subprocess.run([str(workspace / "host-tools/usr/bin/mkisofs"), "-quiet", "-J", "-r", "-V", "BUILDPROVISION", "-o", str(vm / "unattended.iso"), str(provision)], check=True)
    print("Prepared protected installation ISO; credentials were not printed.")

if __name__ == "__main__":
    main()
