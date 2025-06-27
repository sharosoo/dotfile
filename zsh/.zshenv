# Zsh Environment Configuration
# This file is always sourced, even for non-interactive shells
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Set ZDOTDIR for consistent zsh configuration
export ZDOTDIR="${HOME}/.config/zsh"

# For SSH sessions, ensure .zshrc is sourced if interactive
if [[ -n "$SSH_CONNECTION" ]] && [[ -o interactive ]] && [[ -f "$HOME/.zshrc" ]]; then
    source "$HOME/.zshrc"
fi