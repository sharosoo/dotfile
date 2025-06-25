# Completions Configuration
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

# Enable completion system
autoload -Uz compinit && compinit

# Google Cloud SDK
if [ -f "$HOME/google-cloud-sdk/path.zsh.inc" ]; then 
  source "$HOME/google-cloud-sdk/path.zsh.inc"
fi

if [ -f "$HOME/google-cloud-sdk/completion.zsh.inc" ]; then 
  source "$HOME/google-cloud-sdk/completion.zsh.inc"
fi

# Makefile Completions
_makefile_targets() {
  if [[ -f Makefile ]]; then
    reply=($(awk -F: '/^[a-zA-Z0-9][^$#\/\t=]*:/ {print $1}' Makefile | sort -u))
  fi
}
compctl -K _makefile_targets make

# Kubernetes completions
command -v kubectl >/dev/null 2>&1 && source <(kubectl completion zsh)

# Terraform completions
command -v terraform >/dev/null 2>&1 && complete -o nospace -C terraform terraform

# Docker completions
if command -v docker >/dev/null 2>&1; then
  # Docker command completions
  zstyle ':completion:*:*:docker:*' option-stacking yes
  zstyle ':completion:*:*:docker-*:*' option-stacking yes
fi

# Completion styling
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu select

# FZF completions
if [ -f ~/.fzf.zsh ]; then
  source ~/.fzf.zsh
elif [ -f /opt/homebrew/opt/fzf/shell/completion.zsh ]; then
  source /opt/homebrew/opt/fzf/shell/completion.zsh
fi

# AWS CLI completions
if command -v aws_completer >/dev/null 2>&1; then
  complete -C aws_completer aws
fi

# Helm completions
command -v helm >/dev/null 2>&1 && source <(helm completion zsh)

# GitHub CLI completions
command -v gh >/dev/null 2>&1 && eval "$(gh completion -s zsh)"

# Enable caching for faster completions
zstyle ':completion:*' use-cache on
zstyle ':completion:*' cache-path ~/.zsh/cache