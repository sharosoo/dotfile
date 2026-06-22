#!/usr/bin/env bash
# Copy dotfile niri/*.kdl into ~/.config/niri when those files are not symlinks.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${HOME}/.config/niri"
mkdir -p "$DEST"
for f in config.kdl session.kdl noctalia.kdl logout-to-sddm.sh; do
  [[ -f "$ROOT/niri/$f" ]] || continue
  if [[ -L "$DEST/$f" ]]; then
    echo "skip (symlink): $DEST/$f"
    continue
  fi
  cp -a "$ROOT/niri/$f" "$DEST/$f"
  echo "copied $DEST/$f <- dotfile"
done
echo "Run: niri msg action load-config-file"