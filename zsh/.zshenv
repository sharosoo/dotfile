# Zsh Environment Configuration
# This file is always sourced, even for non-interactive shells
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Set ZDOTDIR for consistent zsh configuration
export ZDOTDIR="${HOME}/.config/zsh"

# For SSH sessions, ensure .zshrc is sourced
# Special handling for Warp's tmux sessions
if [[ -n "$SSH_CONNECTION" ]] && [[ -f "$HOME/.zshrc" ]]; then
    # Check if we're in a Warp tmux session (after warpification)
    if [[ -n "$TMUX" ]] && [[ "$TMUX" == *"warp"* ]]; then
        # Always source for Warp tmux sessions
        source "$HOME/.zshrc"
    elif [[ -z "$DOTFILES_ZSHRC_LOADED" ]]; then
        # For initial SSH connection, use guard variable
        export DOTFILES_ZSHRC_LOADED=1
        source "$HOME/.zshrc"
    fi
fi