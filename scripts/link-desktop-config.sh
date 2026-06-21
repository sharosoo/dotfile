#!/usr/bin/env bash
# Symlink dotfile desktop configs into ~/.config (and optional home doc).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

link() {
  local src="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if [[ -e "$dest" && ! -L "$dest" ]]; then
    echo "skip (not symlink): $dest"
    return 0
  fi
  ln -sfn "$src" "$dest"
  echo "link $dest -> $src"
}

mkdir -p "$HOME/.config/niri" "$HOME/.config/noctalia" "$HOME/.config/fcitx5/conf" "$HOME/.config/systemd/user" "$HOME/.config/opencode"

for f in config.kdl session.kdl noctalia.kdl logout-to-sddm.sh; do
  [[ -f "$ROOT/niri/$f" ]] && link "$ROOT/niri/$f" "$HOME/.config/niri/$f"
done

[[ -f "$ROOT/noctalia/settings.json" ]] && link "$ROOT/noctalia/settings.json" "$HOME/.config/noctalia/settings.json"

[[ -f "$ROOT/fcitx5/config" ]] && link "$ROOT/fcitx5/config" "$HOME/.config/fcitx5/config"
[[ -f "$ROOT/fcitx5/conf/hangul.conf" ]] && link "$ROOT/fcitx5/conf/hangul.conf" "$HOME/.config/fcitx5/conf/hangul.conf"

for u in niri.service noctalia-qs.service kwalletd6.service xdg-desktop-portal-gtk.service niri-shutdown.target; do
  [[ -f "$ROOT/systemd/user/$u" ]] && link "$ROOT/systemd/user/$u" "$HOME/.config/systemd/user/$u"
done
if [[ -d "$ROOT/systemd/user/niri.service.wants" ]]; then
  mkdir -p "$HOME/.config/systemd/user/niri.service.wants"
  for w in "$ROOT/systemd/user/niri.service.wants/"*; do
    [[ -f "$w" ]] && link "$w" "$HOME/.config/systemd/user/niri.service.wants/$(basename "$w")"
  done
fi

for f in opencode.json oh-my-openagent.jsonc .gitignore; do
  [[ -f "$ROOT/opencode/$f" ]] && link "$ROOT/opencode/$f" "$HOME/.config/opencode/$f"
done

[[ -f "$ROOT/docs/niri-noctalia-단축키.md" ]] && link "$ROOT/docs/niri-noctalia-단축키.md" "$HOME/niri-noctalia-단축키.md"

echo "Done. Run: systemctl --user daemon-reload"