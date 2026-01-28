# Fish Shell Configuration
# Ported from zshrc

# Disable greeting
set -g fish_greeting

# Starship prompt (two-line with git, cloud, tools)
starship init fish | source

# ============================================
# Environment Variables
# ============================================

# Paths
set -gx PATH $HOME/.cargo/bin $PATH
set -gx PATH $HOME/.local/bin $PATH
set -gx PATH $HOME/.local/share/pnpm $PATH
set -gx PATH $HOME/.bun/bin $PATH
set -gx PATH $HOME/go/bin $PATH
set -gx PATH $HOME/.local/go/bin $PATH
set -gx PATH $HOME/.npm-global/bin $PATH
set -gx PATH /usr/local/bin $PATH

# Go
set -gx GOPATH $HOME/go
set -gx GOROOT $HOME/.local/go

# Android
set -gx ANDROID_HOME $HOME/Android/Sdk
set -gx PATH $PATH $ANDROID_HOME/emulator
set -gx PATH $PATH $ANDROID_HOME/platform-tools
set -gx PATH $PATH $ANDROID_HOME/cmdline-tools/latest/bin

# Bun
set -gx BUN_INSTALL $HOME/.bun

# pnpm
set -gx PNPM_HOME $HOME/.local/share/pnpm

# NVM
set -gx NVM_DIR $HOME/.nvm

# ============================================
# Aliases
# ============================================

# Base
alias sudo 'sudo -E'
alias grep 'grep --color=auto --exclude-dir={.git}'
alias c 'clear'
alias tree 'tree -a -I .git'

# Editors
alias vim 'nvim'
alias vi 'nvim'
alias vimdiff 'nvim -d'

# Git
alias g 'git'
alias ga 'git add'
alias gaa 'git add --all'
alias gb 'git branch'
alias gc 'git commit -v'
alias gca 'git commit -v -a'
alias gco 'git checkout'
alias gd 'git diff'
alias gl 'git pull'
alias glg 'git log --stat'
alias glog 'git log --oneline --decorate --graph'
alias gm 'git merge'
alias gp 'git push'
alias gpf 'git push --force'
alias gst 'git status'
alias gs 'git stash'
alias gsp 'git stash pop'
alias gu 'gitui'

# Docker
alias docker-compose 'podman-compose'

# Kubernetes
alias k 'kubectl'

# Terraform
alias t 'terraform'

# Django
alias dmmm 'python -m manage makemigrations'
alias dmmg 'python -m manage migrate'

# Modern CLI tools
alias ls 'eza --group-directories-first'
alias ll 'ls -la'
alias l 'ls -1'
alias cat 'batcat'
alias ping 'prettyping --nolegend'
alias preview "fzf --preview 'batcat --color \"always\" {}'"

# Utils
if type -q tldr
    alias help 'tldr'
end

if type -q hub
    alias git 'hub'
end

# Clean node_modules
alias clean-node-modules "find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +"

# ============================================
# Tool Integrations
# ============================================

# Rust/Cargo
if test -f $HOME/.cargo/env.fish
    source $HOME/.cargo/env.fish
end

# Load conf.d files (for nvm, venv hooks, etc.)
# Fish automatically sources files in conf.d/
