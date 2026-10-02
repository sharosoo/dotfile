# Ported from the old global-turing (Ubuntu) fish config, adapted to Omarchy.
# Ubuntu-only pieces dropped: gvm/bass, nvm.fish (mise manages node here), GOROOT
# pinned to ~/.local/go, linuxbrew, podman-compose, Tabby/terax prompt hooks.

set -g fish_greeting

# Omarchy exports OMARCHY_PATH and puts mise shims + ~/.local/bin on PATH for the
# uwsm session; mirror it so fish started outside that session behaves the same.
set -q OMARCHY_PATH; or set -gx OMARCHY_PATH /usr/share/omarchy
fish_add_path -g -a $HOME/.local/share/mise/shims $HOME/.local/bin

# ============================================
# Environment
# ============================================

if test -f ~/.env.local
    source ~/.env.local
end

set -gx EDITOR nvim
set -gx VISUAL nvim
set -gx SUDO_EDITOR nvim
set -gx BROWSER omarchy-launch-browser
set -gx BAT_THEME ansi
set -gx MANROFFOPT -c
set -gx MANPAGER "sh -c 'col -bx | bat -l man -p'"

set -gx FZF_DEFAULT_COMMAND 'fd --type f --hidden --follow --exclude .git'
set -gx FZF_DEFAULT_OPTS '--height 40% --layout=reverse --border'
set -gx FZF_CTRL_T_COMMAND $FZF_DEFAULT_COMMAND

set -gx LESS -R
set -gx LESSHISTFILE /dev/null
set -gx LESS_TERMCAP_mb (printf '\e[1;32m')
set -gx LESS_TERMCAP_md (printf '\e[1;32m')
set -gx LESS_TERMCAP_me (printf '\e[0m')
set -gx LESS_TERMCAP_se (printf '\e[0m')
set -gx LESS_TERMCAP_so (printf '\e[01;33m')
set -gx LESS_TERMCAP_ue (printf '\e[0m')
set -gx LESS_TERMCAP_us (printf '\e[1;4;31m')

set -gx GPG_TTY (tty)

set -gx GOPATH $HOME/go
set -gx CARGO_HOME $HOME/.cargo
set -gx RUSTUP_HOME $HOME/.rustup
set -gx BUN_INSTALL $HOME/.bun
set -gx PNPM_HOME $HOME/.local/share/pnpm
set -gx ANDROID_HOME $HOME/Android/Sdk

fish_add_path -g $HOME/.cargo/bin $PNPM_HOME $BUN_INSTALL/bin $GOPATH/bin $HOME/.npm-global/bin $HOME/.grok/bin $HOME/.kimi-code/bin
fish_add_path -g -a $ANDROID_HOME/emulator $ANDROID_HOME/platform-tools $ANDROID_HOME/cmdline-tools/latest/bin

# ============================================
# Tool integrations (same set Omarchy's bash init loads)
# ============================================

if type -q mise
    mise activate fish | source
end

if status is-interactive
    if type -q starship
        # Old global-turing prompt from the dotfile repo; bash keeps Omarchy's ~/.config/starship.toml.
        set -l old_prompt $HOME/workspaces/sharosoo/dotfile/starship/starship.toml
        test -f $old_prompt; and set -gx STARSHIP_CONFIG $old_prompt
        starship init fish | source
    end
    if type -q zoxide
        zoxide init fish | source
    end
    if type -q fzf
        fzf --fish | source
    end
    if type -q kubectl
        kubectl completion fish | source
    end
    if type -q gh
        gh completion -s fish | source
    end
end

# ============================================
# Aliases: old personal set, plus Omarchy's where they don't clash
# ============================================

alias sudo 'sudo -E'
alias grep 'grep --color=auto --exclude-dir=.git'
alias c clear
alias tree 'tree -a -I .git'

alias vim nvim
alias vi nvim
alias vimdiff 'nvim -d'

# Omarchy-style listing
alias ls 'eza -lh --group-directories-first --icons=auto'
alias lsa 'ls -a'
alias lt 'eza --tree --level=2 --long --icons --git'
alias lta 'lt -a'
alias ll 'ls -a'
alias l 'eza -1 --group-directories-first'

alias cat bat
alias preview "fzf --preview 'bat --color always {}'"
alias ff "fzf --preview 'bat --style=numbers --color=always {}'"

alias g git
alias ga 'git add'
alias gaa 'git add --all'
alias gb 'git branch'
alias gc 'git commit -v'
alias gca 'git commit -v -a'
alias gcm 'git commit -m'
alias gcam 'git commit -a -m'
alias gcad 'git commit -a --amend'
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
alias gu gitui

alias d docker
alias k kubectl
alias t terraform
alias h herdr
alias a 'omarchy-agent --inline'
alias cx 'printf "\033[2J\033[3J\033[H" && claude --permission-mode auto'
alias cy 'codex --approve-for-me'
alias mup 'MISE_MINIMUM_RELEASE_AGE=0 mise up'

alias dmmm 'python -m manage makemigrations'
alias dmmg 'python -m manage migrate'
alias clean-node-modules "find . -name 'node_modules' -type d -prune -exec rm -rf '{}' +"

alias .. 'cd ..'
alias ... 'cd ../..'
alias .... 'cd ../../..'
alias ..... 'cd ../../../..'

alias rm 'rm -i'
alias cp 'cp -i'
alias mv 'mv -i'
alias mkdir 'mkdir -pv'

if type -q tldr
    alias help tldr
end

function n --description 'Open nvim (current dir when no args)'
    if test (count $argv) -eq 0
        command nvim .
    else
        command nvim $argv
    end
end

function open --description 'xdg-open detached'
    xdg-open $argv >/dev/null 2>&1 &
    disown
end
