# Aliases Configuration
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Base System
alias sudo='sudo -E'  # Use current user configs
alias grep='grep  --color=auto --exclude-dir={.git}'
alias c='clear'
alias tree='tree -a -I .git'

# Editor
alias vim='nvim'
alias vi='nvim'
alias vimdiff='nvim -d'

# Git Aliases
alias g='git'
alias ga='git add'
alias gaa='git add --all'
alias gb='git branch'
alias gc='git commit -v'
alias gc!='git commit -v --amend'
alias gca='git commit -v -a'
alias gca!='git commit -v -a --amend'
alias gco='git checkout'
alias gd='git diff'
alias gl='git pull'
alias glg='git log --stat'
alias glog='git log --oneline --decorate --graph'
alias gm='git merge'
alias gp='git push'
alias gpf='git push --force'
alias gst='git status'
alias gs='git stash'
alias gsp='git stash pop'
alias gu='gitui'

# Docker/Podman
alias docker-compose='podman-compose'

# Kubernetes
alias k="kubectl"

# Terraform
alias t="terraform"

# Django
alias dmmm="python -m manage makemigrations"
alias dmmg="python -m manage migrate"

# Modern CLI Tools
# ================

# Better ls with eza
if command -v eza >/dev/null 2>&1; then
  alias ls='eza --group-directories-first'
  alias ll='ls -la'
  alias l='ls -1'
  alias lt='ls --tree'
else
  alias ll='ls -la'
  alias l='ls -1'
fi

# Better cat with bat
command -v bat >/dev/null 2>&1 && alias cat='bat'

# Better ping
command -v prettyping >/dev/null 2>&1 && alias ping='prettyping --nolegend'

# FZF preview
alias preview="fzf --preview 'bat --color \"always\" {}'"

# tldr as help
command -v tldr >/dev/null 2>&1 && alias help='tldr'

# GitHub CLI integration
# command -v gh >/dev/null 2>&1 && alias git='gh'

# Utility Functions
# =================

# Delete all node_modules folders recursively
alias clean-node-modules="find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +"

# Quick directory navigation
alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'
alias .....='cd ../../../..'

# Safety nets
alias rm='rm -i'
alias cp='cp -i'
alias mv='mv -i'

# Create parent directories on demand
alias mkdir='mkdir -pv'

# Platform specific aliases
case "$(uname -s)" in
  Darwin)
    # macOS specific
    alias brewup='brew update && brew upgrade && brew cleanup'
    alias flushdns='sudo dscacheutil -flushcache'
    ;;
  Linux)
    # Linux specific
    alias open='xdg-open'
    ;;
esac

# Git Hub Clone - Clone GitHub repos to organized workspace
ghc() {
  local url=$1
  local repo=""
  local org=""
  
  if [[ "$url" == https://github.com/* ]]; then
    repo=${url##*/}
    repo=${repo%.git}
    echo $repo
    org=${url%/*}
    org=${org##*/}
  elif [[ "$url" == git@github.com:* ]]; then
    orgrepo=${url#*:}
    org=${orgrepo%%/*}
    repo=${orgrepo##*/}
    repo=${repo%.git}
  else
    echo "Invalid git URL."
    return 1
  fi
  
  local dir=~/workspaces/$org/$repo
  mkdir -p $dir
  git clone $url $dir
}

# Git Hub Change Directory - Navigate to GitHub repos in workspace
ghcd() {
  local repo=$1
  local dir
  IFS=$'\n' dir=($(find ~/workspaces -mindepth 2 -maxdepth 2 -type d -iname "*$repo*" -print | fzf -1 -0 --header "Select a repository:"))
  if [[ -n $dir ]]; then
    cd "$dir"
  else
    echo "No matching repository found."
  fi
}