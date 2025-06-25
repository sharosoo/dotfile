# Zsh Configuration
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# VS Code Shell Integration
[[ "$TERM_PROGRAM" == "vscode" ]] && . "$(code --locate-shell-integration-path zsh)"

# Warp Terminal Compatibility
# Some features might need to be disabled in Warp
export WARP_TERMINAL_COMPAT="${TERM_PROGRAM}"

# ZSH Configuration Directory
export ZDOTDIR="${HOME}/.config/zsh"

# Source configuration files
source $ZDOTDIR/aliases.zsh
source $ZDOTDIR/completions.zsh
source $ZDOTDIR/environment.zsh

# Source profile for machine-specific settings
[[ -f ~/.zprofile ]] && source ~/.zprofile

# Development Environment Setup
# ============================

# C/C++ Development
export DYLD_LIBRARY_PATH=/usr/local/Cellar/libomp/19.1.2/lib:$DYLD_LIBRARY_PATH
export CPPFLAGS="-I/opt/homebrew/include"
export LDFLAGS="-L/opt/homebrew/lib"
export PKG_CONFIG_PATH="/opt/homebrew/lib/pkgconfig"

# Java Environment Manager
export PATH="$HOME/.jenv/bin:$PATH"
command -v jenv >/dev/null 2>&1 && eval "$(jenv init -)"

# Go Version Manager
[[ -s "/Users/jh/.gvm/scripts/gvm" ]] && source "/Users/jh/.gvm/scripts/gvm"

# Rust
export PATH="$HOME/.cargo/bin:$PATH"

# Node.js Package Managers
export PATH="$HOME/.local/share/pnpm:$PATH"
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# Node Version Manager
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# Auto-switch Node versions based on .nvmrc
load-nvm-or-default() {
  if [ -f "$(nvm_find_nvmrc)" ]; then
    nvm use --silent
  else
    if [ "$(nvm current)" = "none" ]; then
      nvm use default --silent
    fi
  fi
}

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
add-zsh-hook chpwd load-nvm-or-default
add-zsh-hook chpwd load_venv

# Initialize on shell start
load-nvm-or-default
load_venv

# Path Additions
export PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"
export PATH="$HOME/go/bin:$PATH"
export PATH=$PATH:/Users/jh/workspaces/patrickchugh/terravision

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

# Starship Prompt
command -v starship >/dev/null 2>&1 && eval "$(starship init zsh)"

# Neovim aliases (ensure consistency)
alias vi="nvim"
alias vim="nvim"
alias vimdiff="nvim -d"