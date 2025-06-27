# Zsh Environment Configuration
# This file is always sourced, even for non-interactive shells
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Set ZDOTDIR for consistent zsh configuration
export ZDOTDIR="${HOME}/.config/zsh"

# For SSH sessions, ensure .zshrc is sourced if not already done
# Use a guard variable to prevent recursion
if [[ -n "$SSH_CONNECTION" ]] && [[ -z "$DOTFILES_ZSHRC_LOADED" ]] && [[ -f "$HOME/.zshrc" ]]; then
    export DOTFILES_ZSHRC_LOADED=1
    source "$HOME/.zshrc"
fi