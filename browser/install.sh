#!/usr/bin/env bash
# Symlink the browser-agent setup from this repo into $HOME. Idempotent.
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG="${XDG_CONFIG_HOME:-$HOME/.config}/sharosoo-browser"
DATA="${XDG_DATA_HOME:-$HOME/.local/share}/sharosoo-browser"

link() {
  local src="$1" dst="$2"
  mkdir -p "$(dirname "$dst")"
  if [[ -e "$dst" && ! -L "$dst" ]]; then
    echo "refusing to replace non-symlink $dst" >&2
    exit 1
  fi
  ln -sfn "$src" "$dst"
  echo "$dst -> $src"
}

link "$REPO/relay-extension" "$CONFIG/relay-extension"
link "$REPO/policy.toml" "$CONFIG/policy.toml"
# Written by `browser-vault add`; must exist so the link points at a real file.
[[ -e "$REPO/sites.toml" ]] || : >"$REPO/sites.toml"
link "$REPO/sites.toml" "$CONFIG/sites.toml"
link "$REPO/bin/browser-vault" "$HOME/.local/bin/browser-vault"

# Session files hold live cookies: private, never in the repo.
mkdir -p "$DATA/sessions"
chmod 700 "$DATA" "$DATA/sessions"

cat <<EOF

Chromium (one-time): chrome://extensions -> Developer mode -> Load unpacked ->
  $CONFIG/relay-extension
Then remove "OMP Browser Relay" so only one extension talks to the relay.
EOF
