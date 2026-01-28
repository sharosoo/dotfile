# ZProfile Configuration
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile


# Amazon Q Integration (if installed)
[[ -f "${HOME}/Library/Application Support/amazon-q/shell/zprofile.pre.zsh" ]] && builtin source "${HOME}/Library/Application Support/amazon-q/shell/zprofile.pre.zsh"

# Git Workspace Management Functions
ghc() {
    local url=$1
    local repo=""
    local org=""
    if [[ "$url" == https://github.com/* ]]; then
        repo=${url##*/}
        repo=${repo%.git}
        echo "Cloning $repo..."
        org=${url%/*}
        org=${org##*/}
    elif [[ "$url" == git@github.com:* ]]; then
        orgrepo=${url#*:}
        org=${orgrepo%%/*}
        repo=${orgrepo##*/}
        repo=${repo%.git}
    else
        echo "Invalid git URL. Please provide a GitHub URL."
        return 1
    fi
    local dir=~/workspaces/$org/$repo
    mkdir -p $(dirname $dir)
    git clone $url $dir
    echo "Repository cloned to: $dir"
}

ghcd() {
    local repo=$1
    local dir
    IFS=$'\n' dir=($(find ~/workspaces -mindepth 2 -maxdepth 2 -type d -iname "*$repo*" -print | fzf -1 -0 --header "Select a repository:"))
    if [[ -n $dir ]]; then
        cd "$dir"
        echo "Changed to: $dir"
    else
        echo "No matching repository found."
    fi
}

# Path Configuration
export PATH="$PATH:/usr/local/bin"
export GOPATH="$HOME/go"
export PATH="$GOPATH/bin:$PATH"

# Node Version Manager
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"

# Platform-specific paths
case "$(uname -s)" in
  Darwin)
    # macOS specific paths
    export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:$PATH"
    ;;
  Linux)
    # Linux specific paths
    export PATH="/usr/local/sbin:$PATH"
    ;;
esac

# User-specific paths
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/.rd/bin:$PATH"

# Development tools paths
export PATH="$HOME/.cargo/bin:$PATH"
export PATH="$HOME/.nix-profile/bin:$PATH"
export PATH="/nix/var/nix/profiles/default/bin:$PATH"

# Google Cloud SDK
export PATH="$HOME/google-cloud-sdk/bin:$PATH"

# Amazon Q Integration (if installed) - Post block
[[ -f "${HOME}/Library/Application Support/amazon-q/shell/zprofile.post.zsh" ]] && builtin source "${HOME}/Library/Application Support/amazon-q/shell/zprofile.post.zsh"