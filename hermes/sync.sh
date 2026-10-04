#!/usr/bin/env bash
# Copy the hand-written Hermes Agent setup between this repo and ~/.hermes.
#
#   ./sync.sh capture   live -> repo (run before committing)
#   ./sync.sh restore   repo -> live (new machine, after installing Hermes)
#
# Copied, not symlinked: Hermes rewrites config.yaml, memories and cron/jobs.json itself.
# Secrets stay out: .env, auth.json and vault/ are never read; config.yaml references
# secrets as ${VAR} from .env.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LIVE="${HERMES_HOME:-$HOME/.hermes}"
FILES=(config.yaml SOUL.md memories/MEMORY.md memories/USER.md cron/jobs.json)
DIRS=(scripts plugins)
UNIT=.config/systemd/user/hermes-gateway.service

# Skills not shipped with Hermes (bundled ones are listed in skills/.bundled_manifest and
# come back with the install), relative to skills/.
own_skills() {
  local manifest="$LIVE/skills/.bundled_manifest"
  find "$LIVE/skills" -name SKILL.md -not -path '*/.archive/*' -printf '%h\n' |
    while read -r dir; do
      grep -q "^$(basename "$dir"):" "$manifest" || echo "${dir#"$LIVE/skills/"}"
    done | sort
}

capture() {
  local f d s
  for f in "${FILES[@]}"; do
    mkdir -p "$REPO/home/$(dirname "$f")"
    cp "$LIVE/$f" "$REPO/home/$f"
  done
  for d in "${DIRS[@]}"; do
    rsync -a --delete --exclude __pycache__ "$LIVE/$d/" "$REPO/home/$d/"
  done
  rm -rf "$REPO/home/skills"
  while read -r s; do
    mkdir -p "$REPO/home/skills/$s"
    rsync -a --exclude __pycache__ "$LIVE/skills/$s/" "$REPO/home/skills/$s/"
  done < <(own_skills)
  mkdir -p "$REPO/systemd"
  cp "$HOME/$UNIT" "$REPO/systemd/hermes-gateway.service"
  echo "captured into $REPO"
}

restore() {
  rsync -a "$REPO/home/" "$LIVE/"
  mkdir -p "$LIVE/skins" "$HOME/.config/systemd/user"
  # Follow the active Omarchy theme (each theme ships hermes.yaml).
  ln -sfn "$HOME/.local/state/omarchy/current/theme/hermes.yaml" "$LIVE/skins/omarchy.yaml"
  cp "$REPO/systemd/hermes-gateway.service" "$HOME/$UNIT"
  systemctl --user daemon-reload
  echo "restored into $LIVE; enable the gateway with: systemctl --user enable --now hermes-gateway"
}

case ${1:-} in
capture) capture ;;
restore) restore ;;
*) echo "usage: $0 capture|restore" >&2; exit 1 ;;
esac
