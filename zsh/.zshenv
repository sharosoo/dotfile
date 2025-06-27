# Zsh Environment Configuration
# This file is always sourced, even for non-interactive shells
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Debug logging for .zshenv
echo "[DEBUG] Loading ~/.zshenv at $(date)" >> /tmp/zshrc_debug.log

# Set ZDOTDIR for consistent zsh configuration
export ZDOTDIR="${HOME}/.config/zsh"

# For Warp SSH sessions, ensure .zshrc is sourced
if [[ -n "$WARP_IS_SUBSHELL" ]] && [[ -f "$HOME/.zshrc" ]]; then
    echo "[DEBUG] Warp SSH detected in .zshenv, will source .zshrc" >> /tmp/zshrc_debug.log
    # Set a flag to source .zshrc later
    export WARP_NEEDS_ZSHRC=1
fi