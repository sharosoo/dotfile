# Zsh Configuration
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Debug: Log when .zshrc is being loaded
echo "[DEBUG] Loading ~/.zshrc at $(date)" >> /tmp/zshrc_debug.log
echo "[DEBUG] WARP_IS_SUBSHELL=$WARP_IS_SUBSHELL" >> /tmp/zshrc_debug.log
echo "[DEBUG] TERM_PROGRAM=$TERM_PROGRAM" >> /tmp/zshrc_debug.log
echo "[DEBUG] SSH_CONNECTION=$SSH_CONNECTION" >> /tmp/zshrc_debug.log

# Auto-Warpify - Must be at the top to ensure it runs even if sourcing fails
# This hook allows Warp terminal to detect shell initialization
# Works for both local and SSH sessions
[[ "$-" == *i* ]] && printf '\eP$f{"hook": "SourcedRcFileForWarp", "value": { "shell": "zsh", "uname": "'$(uname)'" }}\x9c'

# For Warp SSH sessions, ensure we continue processing
# Warp may set WARP_IS_SUBSHELL which can affect sourcing
if [[ -n "$WARP_IS_SUBSHELL" ]]; then
    echo "[DEBUG] Detected WARP_IS_SUBSHELL, continuing with sourcing" >> /tmp/zshrc_debug.log
    # Unset ZLE to prevent conflicts with Warp's handling
    unsetopt ZLE 2>/dev/null || true
fi

# Force interactive mode for Warp SSH if needed
if [[ -n "$SSH_CONNECTION" ]] && [[ -n "$WARP_IS_SUBSHELL" ]]; then
    echo "[DEBUG] Forcing interactive mode for Warp SSH" >> /tmp/zshrc_debug.log
    set -o interactive
fi

# VS Code Shell Integration
[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"

# Warp Terminal Compatibility
# Some features might need to be disabled in Warp
export WARP_TERMINAL_COMPAT="${TERM_PROGRAM}"

# ZSH Configuration Directory
export ZDOTDIR="${HOME}/.config/zsh"

# Source configuration files from the correct location
# These files are symlinked by install.sh to the actual dotfiles
[[ -f $ZDOTDIR/aliases.zsh ]] && source $ZDOTDIR/aliases.zsh
[[ -f $ZDOTDIR/completions.zsh ]] && source $ZDOTDIR/completions.zsh
[[ -f $ZDOTDIR/environment.zsh ]] && source $ZDOTDIR/environment.zsh

# Source profile for machine-specific settings
[[ -f ~/.zprofile ]] && source ~/.zprofile

# Development Environment Setup
# ============================

# C/C++ Development
export DYLD_LIBRARY_PATH=/usr/local/Cellar/libomp/19.1.2/lib:$DYLD_LIBRARY_PATH
export CPPFLAGS="-I/opt/homebrew/include"
export LDFLAGS="-L/opt/homebrew/lib"
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig"

# Go Version Manager
# Prevent recursion by checking if GVM functions are already loaded
if ! command -v gvm >/dev/null 2>&1 && [[ -s "$HOME/.gvm/scripts/gvm" ]]; then
  source "$HOME/.gvm/scripts/gvm"
fi

# Rust
export PATH="$HOME/.cargo/bin:$PATH"

# Node.js Package Managers
export PATH="$HOME/.local/share/pnpm:$PATH"

# Volta - JavaScript Tool Manager
export VOLTA_HOME="$HOME/.volta"
export PATH="$VOLTA_HOME/bin:$PATH"

# Python Virtual Environment Auto-activation
load_venv() {
  if [[ -f .venv/bin/activate ]]; then
    if [[ -z "$VIRTUAL_ENV" || "$VIRTUAL_ENV" != "$PWD/.venv" ]]; then
      source .venv/bin/activate
    fi
  else
    if [[ -n "$VIRTUAL_ENV" ]]; then
      deactivate 2>/dev/null || true
    fi
  fi
}

# Hook Functions
autoload -U add-zsh-hook
add-zsh-hook chpwd load_venv

# Initialize on shell start
load_venv

# Path Additions
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"
export PATH=$PATH:$HOME/workspaces/patrickchugh/terravision

# Plugin Management
# =================
if [[ -f /opt/homebrew/opt/antidote/share/antidote/antidote.zsh ]]; then
  source /opt/homebrew/opt/antidote/share/antidote/antidote.zsh
  # Load plugins
  antidote bundle <<EOF
    zsh-users/zsh-autosuggestions
    zsh-users/zsh-syntax-highlighting
    ohmyzsh/ohmyzsh path:plugins/git
EOF
fi

# Neovim aliases (ensure consistency)
alias vi="nvim"
alias vim="nvim"
alias vimdiff="nvim -d"

# Debug: Log completion of .zshrc
echo "[DEBUG] Completed loading ~/.zshrc" >> /tmp/zshrc_debug.log
echo "[DEBUG] PATH=$PATH" >> /tmp/zshrc_debug.log
echo "[DEBUG] Aliases loaded: $(alias | wc -l) aliases" >> /tmp/zshrc_debug.log