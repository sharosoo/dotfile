#!/usr/bin/env bash
# Hermes rewrites its configuration, so snapshots are copied rather than linked.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="${HERMES_HOME:-$HOME/.hermes}"
PYTHON="${HERMES_SYNC_PYTHON:-python3}"
FILES=(config.yaml SOUL.md cron/jobs.json)
UNIT=.config/systemd/user/hermes-gateway.service
DROPINS="$UNIT.d"
EXCLUDES=(
  --exclude='.git' --exclude='.hg' --exclude='.svn'
  --exclude='.env*' --exclude='auth*.json*' --exclude='auth/'
  --exclude='vault/' --exclude='secrets/' --exclude='credentials*'
  --exclude='*.token' --exclude='tokens.json' --exclude='*.pem' --exclude='*.key'
  --exclude='.netrc' --exclude='id_rsa*' --exclude='id_ed25519*'
  --exclude='__pycache__/' --exclude='*.py[cod]' --exclude='.venv/'
  --exclude='venv/' --exclude='node_modules/' --exclude='vendor/'
  --exclude='.cache/' --exclude='cache/' --exclude='caches/'
  --exclude='.pytest_cache/' --exclude='.mypy_cache/' --exclude='.ruff_cache/'
  --exclude='.tox/' --exclude='.nox/' --exclude='build/' --exclude='dist/'
  --exclude='memories/' --exclude='sessions/' --exclude='state-snapshots/' --exclude='logs/'
  --exclude='downloads/' --exclude='histories/' --exclude='history/'
  --exclude='*.log' --exclude='*.db*' --exclude='*.sqlite*'
  --exclude='*.bak' --exclude='*.backup'
  --exclude='.archive/' --exclude='.hub/' --exclude='.locks/'
  --exclude='.curator*' --exclude='.usage*' --exclude='.install-metadata*'
  --exclude='.hermes-catalog.json'
)

# Links are serialized separately; copying their targets could expose another app's secrets.
source_copy() {
  if [[ -L $1 ]]; then
    echo "refusing symlinked source directory: $1" >&2
    return 1
  fi
  mkdir -p "$2"
  rsync -a --no-links "${EXCLUDES[@]}" "$1/" "$2/"
}

metadata() {
  "$PYTHON" - "$@" <<'PY'
import json
import os
import re
import shlex
import sys
from pathlib import Path
from urllib.parse import urlsplit

mode, live_arg, snapshot_arg = sys.argv[1:4]
live, snapshot, home = Path(live_arg), Path(snapshot_arg), Path.home()
hidden = {"__pycache__", "node_modules", "venv", "vendor", "cache", "caches",
          "sessions", "state-snapshots", "logs", "downloads", "history", "histories"}
secret_key = re.compile(
    r"(?:^|[_-])(?:api[_-]?key|token|password|passwd|secret|authorization|cookie|credentials?)(?:$|[_-])",
    re.I,
)
placeholder = re.compile(r"(?:Bearer\s+)?\$\{[A-Za-z_][A-Za-z0-9_]*\}", re.I)


def fail(message):
    raise SystemExit(message)


def relative(value):
    path = Path(value)
    if not value or path == Path(".") or path.is_absolute() or ".." in path.parts or any(ord(c) < 32 for c in value):
        fail("Unsafe relative path in Hermes snapshot metadata")
    return path


def write_json(name, value):
    (snapshot / name).write_text(json.dumps(value, indent=2, sort_keys=True) + "\n")


def read_json(path):
    return json.loads(path.read_text()) if path.exists() else {}


def walk(root):
    for base, dirs, files in os.walk(root, followlinks=False):
        dirs[:] = sorted(d for d in dirs if not d.startswith(".") and d not in hidden)
        yield Path(base), dirs, sorted(files)


def check_value(key, value, path):
    if str(key).upper().endswith(("_ENV", "_FILE", "_PATH")):
        return
    if secret_key.search(str(key)) and isinstance(value, str) and value and not placeholder.fullmatch(value):
        fail(f"Refusing literal credential in {path}; use an environment placeholder (value not printed)")


def check_config(value, path):
    if isinstance(value, dict):
        for key, child in value.items():
            check_value(key, child, path)
            check_config(child, path)
    elif isinstance(value, list):
        for child in value:
            check_config(child, path)


if mode == "capture":
    plugins = live / "plugins"
    installed = read_json(plugins / ".install-metadata.json")
    lock = {}
    for name, record in installed.items():
        relative(name)
        if not (plugins / name).exists():
            continue
        source, revision = record.get("source", ""), record.get("revision", "")
        url = urlsplit(source)
        if (url.scheme != "https" or not url.hostname or url.username or url.password
                or url.query or (url.fragment and (".." in Path(url.fragment).parts or url.fragment.startswith("/")))):
            fail(f"Plugin {name} needs a credential-free HTTPS source URL in install metadata")
        if not re.fullmatch(r"[0-9a-fA-F]{40}", revision):
            fail(f"Plugin {name} needs an exact 40-character revision in install metadata")
        lock[name] = {"source": source, "revision": revision.lower()}
    write_json("plugins.lock.json", lock)

    custom = []
    for base, dirs, files in walk(plugins):
        rel = base.relative_to(plugins)
        if rel.as_posix() in lock:
            dirs[:] = []
            continue
        if ".git" in files or (base / ".git").is_dir():
            fail(f"Plugin checkout {rel} has no install metadata; record its source/revision before capture")
        if "plugin.yaml" in files and not (base / "plugin.yaml").is_symlink():
            relative(rel.as_posix())
            custom.append(rel.as_posix())
            dirs[:] = []
    (snapshot / "custom-plugins.list").write_bytes(b"".join(p.encode() + b"\0" for p in custom))

    skills = live / "skills"
    manifest = skills / ".bundled_manifest"
    bundled = {line.split(":", 1)[0].strip()
               for line in manifest.read_text(encoding="utf-8-sig").splitlines()
               if line.strip()} if manifest.exists() else set()
    try:
        import yaml
    except ImportError:
        fail("PyYAML is required; set HERMES_SYNC_PYTHON to a Python interpreter with PyYAML")

    def skill_name(path):
        frontmatter = re.match(r"^---\r?\n(.*?)\r?\n---(?:\r?\n|$)",
                               path.read_text(encoding="utf-8-sig"), re.S)
        metadata = yaml.safe_load(frontmatter.group(1)) if frontmatter else {}
        name = metadata.get("name") if isinstance(metadata, dict) else None
        return name.strip() if isinstance(name, str) else path.parent.name

    # The manifest tracks core skills only; official optional skills have separate provenance.
    installed_paths = set()
    for variable, directory in (("HERMES_BUNDLED_SKILLS", "skills"),
                                ("HERMES_OPTIONAL_SKILLS", "optional-skills")):
        root = Path(os.environ.get(variable) or live / "hermes-agent" / directory)
        for base, _, files in walk(root):
            if "SKILL.md" in files and not (base / "SKILL.md").is_symlink():
                installed_paths.add(base.relative_to(root).as_posix())
                bundled.update((base.name, skill_name(base / "SKILL.md")))
    hub = read_json(skills / ".hub/lock.json")
    for name, record in hub.get("installed", {}).items():
        if isinstance(record, dict) and record.get("install_path"):
            installed_paths.add(relative(record["install_path"]).as_posix())
            bundled.add(name)

    owned, links = [], {}
    for base, dirs, files in walk(skills):
        if "SKILL.md" in files and not (base / "SKILL.md").is_symlink() and base != skills:
            rel = base.relative_to(skills).as_posix()
            if rel in installed_paths or base.name in bundled or skill_name(base / "SKILL.md") in bundled:
                dirs[:] = []
                continue
        for name in list(dirs) + files:
            if name.startswith(".") or name in {"auth.json", "tokens.json"} or name.endswith((".token", ".key", ".pem")):
                continue
            path = base / name
            if not path.is_symlink():
                continue
            rel = path.relative_to(skills).as_posix()
            relative(rel)
            raw = os.readlink(path)
            target = Path(os.path.abspath(path.parent / raw))
            if any(p.startswith(".env") or p.endswith(".token") or p in {"auth.json", "vault", "secrets"}
                   for p in target.parts):
                fail(f"Skill link {rel} points at private data; refusing capture")
            try:
                links[rel] = {"kind": "home", "target": target.relative_to(home).as_posix()}
            except ValueError:
                links[rel] = {"kind": "absolute", "target": str(target)}
        if "SKILL.md" in files and not (base / "SKILL.md").is_symlink():
            rel = base.relative_to(skills).as_posix()
            relative(rel)
            if not any(Path(rel).is_relative_to(Path(parent)) for parent in owned):
                owned.append(rel)
    write_json("skill-links.json", links)
    (snapshot / "own-skills.list").write_bytes(b"".join(p.encode() + b"\0" for p in owned))

elif mode == "check":
    try:
        import yaml
    except ImportError:
        fail("PyYAML is required; set HERMES_SYNC_PYTHON to a Python interpreter with PyYAML")
    for path in (snapshot / "home").rglob("*"):
        if path.is_file() and path.suffix in {".yaml", ".yml", ".json"}:
            check_config(yaml.safe_load(path.read_text()), path.relative_to(snapshot))
    for unit in (snapshot / "systemd").rglob("*"):
        if not unit.is_file():
            continue
        for line in unit.read_text().splitlines():
            if line.startswith("Environment="):
                for assignment in shlex.split(line.removeprefix("Environment=")):
                    key, sep, value = assignment.partition("=")
                    if sep:
                        check_value(key, value, unit.relative_to(snapshot))
        unit.write_text(unit.read_text().replace(str(home), "${HOME}"))

elif mode == "unit":
    destination = Path(sys.argv[4])
    for source in (snapshot / "systemd").rglob("*"):
        if source.is_file():
            target = destination / source.relative_to(snapshot / "systemd")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(source.read_text().replace("${HOME}", str(home)))

elif mode == "links":
    backup = Path(sys.argv[4])
    skills = live / "skills"
    for name, record in read_json(snapshot / "skill-links.json").items():
        path = skills / relative(name)
        if record["kind"] == "home":
            target = home / relative(record["target"])
        elif record["kind"] == "absolute" and Path(record["target"]).is_absolute():
            target = Path(record["target"])
        else:
            fail(f"Invalid target for skill link {name}")
        # Never follow a pre-existing parent symlink while restoring a managed link.
        for parent in path.parents:
            if parent == live:
                break
            if parent.is_symlink():
                fail(f"Refusing skill link {name}: its parent is a symlink")
        if path.is_symlink() and os.readlink(path) == str(target):
            continue
        if path.exists() or path.is_symlink():
            saved = backup / "skills" / name
            saved.parent.mkdir(parents=True, exist_ok=True)
            path.rename(saved)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.symlink_to(target)
        if not target.exists():
            print(f"Missing shared skill target for {name}: {target}; restore/install that source separately")

elif mode == "plugins":
    for name, record in read_json(snapshot / "plugins.lock.json").items():
        relative(name)
        if not (live / "plugins" / name / "plugin.yaml").is_file():
            command = ["hermes", "plugins", "install", record["source"], "--ref", record["revision"], "--no-enable"]
            print(f"Missing third-party plugin {name}; reinstall explicitly:")
            print("  " + shlex.join(command))
else:
    fail(f"Unknown metadata operation: {mode}")
PY
}

capture() (
  local f d s stage backup
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  mkdir -p "$stage/home/plugins" "$stage/home/skills" "$stage/home/scripts" "$stage/systemd"
  metadata capture "$LIVE" "$stage"
  for f in "${FILES[@]}"; do
    if [[ -L $LIVE/$f ]]; then
      echo "refusing symlinked managed file: $f" >&2
      exit 1
    fi
    mkdir -p "$stage/home/$(dirname "$f")"
    cp "$LIVE/$f" "$stage/home/$f"
  done
  [[ ! -d $LIVE/scripts ]] || source_copy "$LIVE/scripts" "$stage/home/scripts"
  while IFS= read -r -d '' d; do
    source_copy "$LIVE/plugins/$d" "$stage/home/plugins/$d"
  done < "$stage/custom-plugins.list"
  while IFS= read -r -d '' s; do
    source_copy "$LIVE/skills/$s" "$stage/home/skills/$s"
  done < "$stage/own-skills.list"
  cp "$HOME/$UNIT" "$stage/systemd/hermes-gateway.service"
  [[ ! -d $HOME/$DROPINS ]] || source_copy "$HOME/$DROPINS" "$stage/systemd/hermes-gateway.service.d"
  metadata check "$LIVE" "$stage"

  # Validate outside the public checkout, then keep overwritten snapshots recoverable.
  backup="$LIVE/state-snapshots/dotfile/capture-$(date -u +%Y%m%dT%H%M%S)-$$"
  for f in "${FILES[@]}"; do
    mkdir -p "$REPO/home/$(dirname "$f")" "$backup/home/$(dirname "$f")"
    rsync -a --checksum --backup --backup-dir="$backup/home/$(dirname "$f")" "$stage/home/$f" "$REPO/home/$f"
  done
  for d in scripts plugins; do
    mkdir -p "$REPO/home/$d" "$backup/home/$d"
    rsync -a --checksum --delete --backup --backup-dir="$backup/home/$d" "$stage/home/$d/" "$REPO/home/$d/"
  done
  # Excluding a distributed skill from capture must not purge an already tracked snapshot.
  mkdir -p "$REPO/home/skills" "$backup/home/skills"
  rsync -a --checksum --backup --backup-dir="$backup/home/skills" "$stage/home/skills/" "$REPO/home/skills/"
  mkdir -p "$REPO/systemd" "$backup/systemd"
  rsync -a --checksum --backup --backup-dir="$backup" "$stage/plugins.lock.json" "$stage/skill-links.json" "$REPO/"
  rsync -a --checksum --delete --backup --backup-dir="$backup/systemd" "$stage/systemd/" "$REPO/systemd/"
  echo "captured source/configuration into $REPO; previous snapshots, if changed: $backup"
)

restore() (
  local backup stage
  backup="$LIVE/state-snapshots/dotfile/restore-$(date -u +%Y%m%dT%H%M%S)-$$"
  stage="$(mktemp -d)"
  trap 'rm -rf "$stage"' EXIT
  mkdir -p "$LIVE" "$HOME/.config/systemd/user" "$backup/home" "$backup/systemd"
  # No --delete: unrelated live plugins, bundled skills and credentials must survive.
  rsync -a --checksum --no-links "${EXCLUDES[@]}" --backup --backup-dir="$backup/home" "$REPO/home/" "$LIVE/"
  metadata links "$LIVE" "$REPO" "$backup/home"
  metadata unit "$LIVE" "$REPO" "$stage/systemd"
  rsync -a --checksum --backup --backup-dir="$backup/systemd" "$stage/systemd/" "$HOME/.config/systemd/user/"
  mkdir -p "$LIVE/skins"
  if [[ -e $LIVE/skins/omarchy.yaml || -L $LIVE/skins/omarchy.yaml ]]; then
    mkdir -p "$backup/home/skins"
    mv "$LIVE/skins/omarchy.yaml" "$backup/home/skins/omarchy.yaml"
  fi
  ln -s "$HOME/.local/state/omarchy/current/theme/hermes.yaml" "$LIVE/skins/omarchy.yaml"
  systemctl --user daemon-reload
  echo "restored managed local files into $LIVE; previous files, if changed: $backup"
  metadata plugins "$LIVE" "$REPO"
  echo "review missing plugins/skill targets above before enabling: systemctl --user enable --now hermes-gateway"
)

case ${1:-} in
capture) capture ;;
restore) restore ;;
*) echo "usage: $0 capture|restore" >&2; exit 1 ;;
esac
