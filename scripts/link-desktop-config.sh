#!/usr/bin/env bash
# Symlink dotfile desktop configs into ~/.config.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE="${1:-}"


link() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    if [[ "$FORCE" == "--adopt" ]]; then
      mv "$dest" "${dest}.bak.$(date +%Y%m%d%H%M%S)"
      echo "backup $dest -> ${dest}.bak.*"
    else
      echo "skip (not symlink): $dest  (use: $0 --adopt to backup+link)"
      return 0
    fi
  fi
  ln -sfn "$src" "$dest"
  echo "link $dest -> $src"
}

mkdir -p "$HOME/.config/fcitx5/conf" "$HOME/.config/systemd/user"

[[ -f "$ROOT/fcitx5/config" ]] && link "$ROOT/fcitx5/config" "$HOME/.config/fcitx5/config"
[[ -f "$ROOT/fcitx5/conf/hangul.conf" ]] && link "$ROOT/fcitx5/conf/hangul.conf" "$HOME/.config/fcitx5/conf/hangul.conf"

for u in kwalletd6.service xdg-desktop-portal-gtk.service; do
  [[ -f "$ROOT/systemd/user/$u" ]] && link "$ROOT/systemd/user/$u" "$HOME/.config/systemd/user/$u"
done

echo "Done. Run: systemctl --user daemon-reload"