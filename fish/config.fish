# Fish Shell Configuration
# Ported from zshrc

# Disable greeting
set -g fish_greeting

# Starship prompt (two-line with git, cloud, tools)
starship init fish | source

# ============================================
# Environment Variables
# ============================================

# Load local env if present
if test -f ~/.env.local
    source ~/.env.local
end

# Editor
set -gx EDITOR nvim
set -gx VISUAL nvim

# Locale
set -gx LANG en_US.UTF-8
set -gx LC_ALL en_US.UTF-8

# FZF
set -gx FZF_DEFAULT_COMMAND 'fd --type f --hidden --follow --exclude .git'
set -gx FZF_DEFAULT_OPTS '--height 40% --layout=reverse --border'
set -gx FZF_CTRL_T_COMMAND $FZF_DEFAULT_COMMAND

# Less
set -gx LESS '-R'
set -gx LESSHISTFILE '/dev/null'
set -gx LESS_TERMCAP_mb (printf '\e[1;32m')
set -gx LESS_TERMCAP_md (printf '\e[1;32m')
set -gx LESS_TERMCAP_me (printf '\e[0m')
set -gx LESS_TERMCAP_se (printf '\e[0m')
set -gx LESS_TERMCAP_so (printf '\e[01;33m')
set -gx LESS_TERMCAP_ue (printf '\e[0m')
set -gx LESS_TERMCAP_us (printf '\e[1;4;31m')

# GPG
set -gx GPG_TTY (tty)

# XDG
set -gx XDG_CONFIG_HOME $HOME/.config
set -gx XDG_CACHE_HOME $HOME/.cache
set -gx XDG_DATA_HOME $HOME/.local/share
set -gx XDG_STATE_HOME $HOME/.local/state

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

# Rust
set -gx CARGO_HOME $HOME/.cargo
set -gx RUSTUP_HOME $HOME/.rustup

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

# Volta
set -gx VOLTA_HOME $HOME/.volta
set -gx PATH $PATH $VOLTA_HOME/bin

# Homebrew
switch (uname -s)
    case Darwin
        if test -f /opt/homebrew/bin/brew
            eval (/opt/homebrew/bin/brew shellenv)
        else if test -f /usr/local/bin/brew
            eval (/usr/local/bin/brew shellenv)
        end
    case Linux
        if test -d /home/linuxbrew/.linuxbrew
            eval (/home/linuxbrew/.linuxbrew/bin/brew shellenv)
        end
end

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
alias lt 'ls --tree'
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

# Navigation
alias .. 'cd ..'
alias ... 'cd ../..'
alias .... 'cd ../../..'
alias ..... 'cd ../../../..'

# Safety
alias rm 'rm -i'
alias cp 'cp -i'
alias mv 'mv -i'

# Mkdir
alias mkdir 'mkdir -pv'

# Linux open
if test (uname -s) = Linux
    alias open 'xdg-open'
end

# ============================================
# Tool Integrations
# ============================================

# Rust/Cargo
if test -f $HOME/.cargo/env.fish
    source $HOME/.cargo/env.fish
end

# Completions
if type -q kubectl
    kubectl completion fish | source
end
if type -q helm
    helm completion fish | source
end
if type -q gh
    gh completion -s fish | source
end

# Load conf.d files (for nvm, venv hooks, etc.)
# Fish automatically sources files in conf.d/
