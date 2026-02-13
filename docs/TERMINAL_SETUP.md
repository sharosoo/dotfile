# Terminal Setup Documentation

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Ghostty Terminal                         │
│                    ~/.config/ghostty/config                      │
│         (GitHub Dark theme, transparency, D2Coding)              │
├─────────────────────────────────────────────────────────────────┤
│                             tmux                                 │
│                         ~/.tmux.conf                             │
│              (Catppuccin Latte, TPM plugins)                     │
├─────────────────────────────────────────────────────────────────┤
│                          Fish Shell                              │
│                    ~/.config/fish/config.fish                    │
├──────────────┬──────────────┬──────────────┬────────────────────┤
│   Plugins    │   Functions  │   conf.d     │   Completions      │
│  (Fisher)    │              │  (auto-load) │                    │
├──────────────┼──────────────┼──────────────┼────────────────────┤
│ fish-ai      │ ghc.fish     │ nvm.fish     │ nvm.fish           │
│ nvm.fish     │ ghcd.fish    │ python_venv  │ fisher.fish        │
│ fisher       │ fisher.fish  │ fish_ai.fish │                    │
└──────────────┴──────────────┴──────────────┴────────────────────┘
          │                              │
          ▼                              ▼
┌─────────────────┐            ┌─────────────────┐
│    fish-ai      │            │    Starship     │
│ ~/.config/      │            │ ~/.config/      │
│ fish-ai.ini     │            │ starship.toml   │
│ (Azure GPT-5.2) │            │ (Two-line prompt│
└─────────────────┘            │  with git/cloud)│
                               └─────────────────┘
```

---

## File Locations

| Component | Path |
|-----------|------|
| Ghostty config | `~/.config/ghostty/config` |
| tmux config | `~/.tmux.conf` |
| tmux plugins | `~/.tmux/plugins/` |
| Fish config | `~/.config/fish/config.fish` |
| Fish functions | `~/.config/fish/functions/` |
| Fish auto-load | `~/.config/fish/conf.d/` |
| Fish plugins | `~/.config/fish/fish_plugins` |
| fish-ai config | `~/.config/fish-ai.ini` |
| Starship config | `~/.config/starship.toml` |

---

## Ghostty Terminal

**Config**: `~/.config/ghostty/config` (+ `~/.config/ghostty/config.macos` on macOS override)

```ini
background-opacity = 1.0
background = 0d1117
foreground = c9d1d9
cursor-color = 58a6ff
selection-background = 264f78
selection-foreground = ffffff
font-family = D2Coding Nerd Font
font-size = 12
window-padding-x = 8
window-padding-y = 8
window-decoration = server
gtk-titlebar = true
command = fish
keybind = ctrl+g=unbind
keybind = ctrl+y=unbind
```

### Keybind Passthrough

Ghostty intercepts certain key combinations by default. To allow fish-ai keybindings to work, we must explicitly unbind them:

```ini
keybind = ctrl+g=unbind   # Pass Ctrl+G to fish (fish-ai: comment↔command)
keybind = ctrl+y=unbind   # Pass Ctrl+Y to fish (fish-ai: autocomplete/fix)
```

**Validate config**: `ghostty +validate-config`

| Action | Behavior |
|--------|----------|
| `unbind` | Removes binding and **sends key to shell** |
| `ignore` | Key is completely ignored (black-holed) |

**Verify keybindings**: `ghostty +list-keybinds | grep ctrl`

### Window Actions

Ghostty 자체에는 "minimize" 액션이 없음. 창 최소화는 WM/DE 단축키 사용.

| Key | Action |
|-----|--------|
| `Ctrl+Shift+M` | Toggle maximize |
| `Ctrl+Shift+F` | Toggle fullscreen |
| `Ctrl+Alt+Arrow` | Resize split (10px) |

### Key Settings

| Setting | Value | Description |
|---------|-------|-------------|
| `background` | `#0d1117` | Dark background |
| `foreground` | `#c9d1d9` | Text color |
| `cursor-color` | `#58a6ff` | Blue cursor |
| `background-opacity` | 1.0 | 100% opacity (Linux/공통) <br>macOS는 `ghostty/config.macos`에서 0.7로 오버라이드 |
| `font-family` | D2Coding Nerd Font | Monospace font with Korean support + icons |
| `command` | `fish` | Launch fish shell by default |
| `window-decoration` | `server` | KDE title bar |
| `gtk-titlebar` | `true` | Enable GTK title bar |

### Title Bar Configuration

**Current configuration** (title bar enabled):
```ini
window-decoration = server
gtk-titlebar = true
```

---

## Fish Shell

### Installed Plugins (Fisher)

```
jorgebucaran/fisher     # Plugin manager
realiserad/fish-ai      # LLM-powered completions (Azure GPT-5.2)
jorgebucaran/nvm.fish   # Node version manager
```

### Environment Variables

| Variable | Value |
|----------|-------|
| `GOPATH` | `$HOME/go` |
| `GOROOT` | `$HOME/.local/go` |
| `ANDROID_HOME` | `$HOME/Android/Sdk` |
| `BUN_INSTALL` | `$HOME/.bun` |
| `PNPM_HOME` | `$HOME/.local/share/pnpm` |
| `NVM_DIR` | `$HOME/.nvm` |

### PATH Additions

```fish
$HOME/.cargo/bin
$HOME/.local/bin
$HOME/.local/share/pnpm
$HOME/.bun/bin
$HOME/go/bin
$HOME/.local/go/bin
$HOME/.npm-global/bin
/usr/local/bin
$ANDROID_HOME/emulator
$ANDROID_HOME/platform-tools
$ANDROID_HOME/cmdline-tools/latest/bin
```

---

## Starship Prompt

**Config**: `~/.config/starship.toml`
**Base**: Jetpack preset (customized)

### Prompt Layout (Two-Line)

```
⌂/workspaces/project/src △⎪●◦◃◈⎥ node ◫ 22.21.0 py ⌉⌊ 3.13.7
◎ 
```

- **Line 1**: Directory, git status, languages/tools
- **Line 2**: Prompt input (`◎` success, `○` error)

### Directory Settings

```toml
[directory]
truncation_length = 255      # No truncation (full path)
home_symbol = "⌂"            # Home directory symbol
```

### Prompt Symbols

| Symbol | Meaning |
|--------|---------|
| `◎` | Success prompt |
| `○` | Error prompt |
| `△` | Git branch |
| `▴` | Commits ahead |
| `▿` | Commits behind |
| `●◦` | Modified files |
| `▪` | Staged files |
| `◌◦` | Untracked files |
| `◃◈` | Stashed changes |
| `⌉⌊` | Python version |
| `◫` | Node.js version |
| `⊃` | Rust version |
| `∩` | Go version |
| `◧` | Docker context |
| `⎈` | Kubernetes context |

### Enabled Modules

- Directory (full path)
- Git (branch, status, metrics)
- Node.js, Python, Rust, Go, Java, Kotlin
- Docker, Kubernetes, Terraform
- Command duration

### Disabled Modules

- AWS, GCloud, Azure (cloud providers)
- Battery, Time

### Customization

```fish
vim ~/.config/starship.toml
```

**Docs**: https://starship.rs/config/

---

## tmux

**Config**: `~/.tmux.conf`

### Installation

```bash
# Install TPM (Tmux Plugin Manager)
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm

# Link config
ln -sf ~/dotfiles/tmux/.tmux.conf ~/.tmux.conf

# Start tmux and install plugins
tmux
# Press: prefix + I (capital i)
```

### Key Bindings

Default prefix: `Ctrl+b`

#### Pane Management

| Key | Action |
|-----|--------|
| `prefix + \|` | Split vertically |
| `prefix + -` | Split horizontally |
| `prefix + h/j/k/l` | Navigate panes (vim-style) |
| `prefix + H/J/K/L` | Resize panes |
| `prefix + x` | Kill pane |
| `prefix + S` | Synchronize panes toggle |
| `Alt + Arrow` | Navigate panes (no prefix) |

#### Window Management

| Key | Action |
|-----|--------|
| `prefix + c` | New window |
| `prefix + X` | Kill window |
| `Shift + Left/Right` | Switch windows (no prefix) |
| `Alt + 1-9` | Go to window N (no prefix) |

#### Session Management

| Key | Action |
|-----|--------|
| `prefix + s` | Choose session |
| `prefix + N` | New session |
| `prefix + R` | Rename session |
| `prefix + d` | Detach |

#### Copy Mode (vi-style)

| Key | Action |
|-----|--------|
| `prefix + [` | Enter copy mode |
| `v` | Start selection |
| `y` | Copy to clipboard |
| `prefix + ]` | Paste |

### Plugins (TPM)

| Plugin | Description |
|--------|-------------|
| tmux-sensible | Sensible defaults |
| tmux-resurrect | Save/restore sessions |
| tmux-continuum | Auto-save every 15 min |
| tmux-yank | System clipboard integration |

### Plugin Commands

| Key | Action |
|-----|--------|
| `prefix + I` | Install plugins |
| `prefix + U` | Update plugins |
| `prefix + Ctrl+s` | Save session (resurrect) |
| `prefix + Ctrl+r` | Restore session (resurrect) |

### Theme

Catppuccin Latte:
- Status bar: bottom, light background
- Active window: blue highlight
- Pane borders: surface0/blue

### Session Workflow

```bash
# Create named session
tmux new -s dev

# Attach to session
tmux attach -t dev

# List sessions
tmux ls

# Kill session
tmux kill-session -t dev
```

---

## Aliases

### Editors
| Alias | Command |
|-------|---------|
| `vim` | `nvim` |
| `vi` | `nvim` |
| `vimdiff` | `nvim -d` |

### Git
| Alias | Command |
|-------|---------|
| `g` | `git` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gb` | `git branch` |
| `gc` | `git commit -v` |
| `gca` | `git commit -v -a` |
| `gco` | `git checkout` |
| `gd` | `git diff` |
| `gl` | `git pull` |
| `glg` | `git log --stat` |
| `glog` | `git log --oneline --decorate --graph` |
| `gm` | `git merge` |
| `gp` | `git push` |
| `gpf` | `git push --force` |
| `gst` | `git status` |
| `gs` | `git stash` |
| `gsp` | `git stash pop` |
| `gu` | `gitui` |

### Modern CLI Replacements
| Alias | Command | Replaces |
|-------|---------|----------|
| `ls` | `eza --group-directories-first` | `ls` |
| `ll` | `ls -la` | `ls -la` |
| `l` | `ls -1` | `ls -1` |
| `cat` | `batcat` | `cat` |
| `ping` | `prettyping --nolegend` | `ping` |
| `preview` | `fzf --preview 'batcat --color "always" {}'` | - |
| `help` | `tldr` | `man` |

### DevOps
| Alias | Command |
|-------|---------|
| `docker-compose` | `podman-compose` |
| `k` | `kubectl` |
| `t` | `terraform` |

### Django
| Alias | Command |
|-------|---------|
| `dmmm` | `python -m manage makemigrations` |
| `dmmg` | `python -m manage migrate` |

### Utilities
| Alias | Command |
|-------|---------|
| `c` | `clear` |
| `sudo` | `sudo -E` (preserve env) |
| `tree` | `tree -a -I .git` |
| `clean-node-modules` | Recursively delete all `node_modules` |

---

## Custom Functions

### `ghc` - Clone GitHub Repos

Clones repositories to an organized workspace structure.

```fish
ghc https://github.com/org/repo
# Clones to ~/workspaces/org/repo
```

**Supports**:
- HTTPS URLs: `https://github.com/org/repo.git`
- SSH URLs: `git@github.com:org/repo.git`

### `ghcd` - Navigate to Workspace Repos

Fuzzy-find and navigate to cloned repositories.

```fish
ghcd react
# Opens fzf to select matching repo, then cd into it
```

---

## Auto-Activation Features

### Python Virtual Environment

**File**: `~/.config/fish/conf.d/python_venv.fish`

Automatically activates `.venv` when entering a directory with a virtual environment, and deactivates when leaving.

```fish
cd my-python-project/    # Auto-activates .venv if present
cd ..                    # Auto-deactivates
```

### Node Version Manager (nvm.fish)

**Plugin**: `jorgebucaran/nvm.fish`

Manages Node.js versions. Usage:

```fish
nvm install 20       # Install Node 20
nvm use 20           # Switch to Node 20
nvm list             # List installed versions
```

---

## LLM-Powered Completions (fish-ai)

**Config**: `~/.config/fish-ai.ini`

```ini
[fish-ai]
configuration = azure
keymap_1 = ctrl-g
keymap_2 = ctrl-y

# Note: Ghostty must unbind these keys (see ghostty config)
language = Korean

[azure]
provider = azure
server = https://mathkingllmbatch2.openai.azure.com
model = gpt-5.2
api_key = <redacted>
```

### Keybindings

| Key | Action |
|-----|--------|
| **Ctrl+G** | Transform comment to command / Explain command |
| **Ctrl+Y** | AI autocomplete / Fix failed command |

### Usage Examples

**Comment to Command**:
```fish
# find all files larger than 100MB
# Press Ctrl+G → converts to:
find . -type f -size +100M
```

**Explain Command** (Korean):
```fish
kubectl get pods -A -o wide
# Press Ctrl+G → outputs explanation in Korean:
# 모든 네임스페이스(-A)에서 파드 목록을 가져오고, 추가 정보(-o wide)를 표시합니다
```

**AI Autocomplete**:
```fish
docker run -it
# Press Ctrl+Y for completion suggestions
```

**Fix Failed Command**:
```fish
gti status    # Typo
# Press Ctrl+Y to fix → git status
```

---

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────────┐
│                    KEYBINDINGS                               │
├─────────────────────────────────────────────────────────────┤
│  Ctrl+G     │  AI: Comment→Command / Explain                │
│  Ctrl+Y     │  AI: Autocomplete / Fix                       │
│  Ctrl+R     │  History search (fzf)                         │
│  Ctrl+L     │  Clear screen                                 │
├─────────────────────────────────────────────────────────────┤
│                    QUICK COMMANDS                            │
├─────────────────────────────────────────────────────────────┤
│  ghc <url>  │  Clone repo to ~/workspaces/org/repo          │
│  ghcd <q>   │  Fuzzy-find and cd to workspace repo          │
│  gst        │  git status                                   │
│  glog       │  git log (pretty graph)                       │
│  ll         │  eza -la (better ls)                          │
│  cat        │  batcat (syntax highlighting)                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Maintenance

### Update Fish Plugins
```fish
fisher update
```

### Reinstall fish-ai
```fish
fisher remove realiserad/fish-ai
fisher install realiserad/fish-ai
```

### Check Installed Plugins
```fish
fisher list
```

---

- `~/.zprofile` - Custom functions (ghc, ghcd)
