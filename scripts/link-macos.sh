#!/usr/bin/env bash
# Symlink dotfile configs on macOS (fish, ghostty, starship, nvim, tmux, mise).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FORCE="${1:-}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS only. On Linux use scripts/link-desktop-config.sh or omarchy/sync.sh." >&2
  exit 1
fi

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

link "$ROOT/fish/config.fish" "$HOME/.config/fish/config.fish"
link "$ROOT/ghostty/config" "$HOME/.config/ghostty/config"
link "$ROOT/ghostty/config.macos" "$HOME/Library/Application Support/com.mitchellh.ghostty/config"
link "$ROOT/starship/starship.toml" "$HOME/.config/starship.toml"
link "$ROOT/nvim" "$HOME/.config/nvim"
link "$ROOT/tmux/.tmux.conf" "$HOME/.tmux.conf"
link "$ROOT/mise/config.toml" "$HOME/.config/mise/config.toml"

# herdr rewrites its config, so it is copied (like omarchy/sync.sh) from the Omarchy
# source with the Linux-only bits swapped: fish path, and the `omarchy launch` binding.
herdr_src="$ROOT/omarchy/home/.config/herdr/config.toml"
herdr_dest="$HOME/.config/herdr/config.toml"
mkdir -p "$(dirname "$herdr_dest")" "$HOME/.local/bin"
sed -e 's#^default_shell = "/usr/bin/fish"#default_shell = "/opt/homebrew/bin/fish"#' \
    -e '/^\[\[keys.command\]\]$/{N;/prefix+alt+c/{N;N;d;};}' \
    "$herdr_src" >"$herdr_dest"
echo "copy $herdr_dest <- $herdr_src (macOS)"
cp "$ROOT/omarchy/home/.local/bin/herdr-agent-picker" "$HOME/.local/bin/herdr-agent-picker"
echo "copy $HOME/.local/bin/herdr-agent-picker"

echo "Done. Packages: brew bundle --file=$ROOT/Brewfile"
