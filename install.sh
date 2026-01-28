#!/usr/bin/env bash
# Dotfiles Installation Script
# This file is managed by dotfiles - https://github.com/sharosoo/dotfile

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Global variables
OS=""
PACKAGE_MANAGER=""

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# OS Detection
detect_os() {
    case "$(uname -s)" in
        Darwin*)    OS="macos";;
        Linux*)     OS="linux";;
        *)          log_error "Unsupported OS"; exit 1;;
    esac
    log_info "Detected OS: $OS"
}

# Linux Package Manager Detection
detect_package_manager() {
    if [[ "$OS" == "linux" ]]; then
        if command -v apt-get &> /dev/null; then
            PACKAGE_MANAGER="apt"
        elif command -v yum &> /dev/null; then
            PACKAGE_MANAGER="yum"
        elif command -v dnf &> /dev/null; then
            PACKAGE_MANAGER="dnf"
        elif command -v pacman &> /dev/null; then
            PACKAGE_MANAGER="pacman"
        elif command -v zypper &> /dev/null; then
            PACKAGE_MANAGER="zypper"
        else
            log_warning "Could not detect a supported package manager (apt, yum, dnf, pacman, zypper)."
            PACKAGE_MANAGER="unknown"
        fi
        log_info "Detected Package Manager: $PACKAGE_MANAGER"
    fi
}

# Uninstall existing Linuxbrew if requested
prompt_and_uninstall_linuxbrew() {
    if [[ "$OS" == "linux" ]] && [[ -f "/home/linuxbrew/.linuxbrew/bin/brew" ]]; then
        log_warning "Existing Linuxbrew installation found."
        read -p "Do you want to uninstall it and use the system package manager ($PACKAGE_MANAGER)? (y/N) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            log_info "Uninstalling Linuxbrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/uninstall.sh)"
            
            # Clean up shell profile
            if [[ -f "$HOME/.zprofile" ]]; then
                sed -i.bak '/eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"'/d "$HOME/.zprofile"
            fi
            
            log_success "Linuxbrew uninstalled successfully."
        else
            log_info "Skipping Linuxbrew uninstallation. The script will proceed, but may have conflicts."
        fi
    fi
}

# Backup existing configuration
backup_config() {
    local timestamp=$(date +%Y%m%d_%H%M%S)
    local backup_dir="$HOME/.dotfiles_backup_$timestamp"
    
    log_info "Creating backup directory: $backup_dir"
    mkdir -p "$backup_dir"
    
    # Backup existing files
    for file in ~/.zshrc ~/.zprofile ~/.config/zsh ~/.config/nvim; do
        if [[ -e "$file" ]]; then
            log_info "Backing up $file"
            cp -r "$file" "$backup_dir/"
        fi
    done
    
    log_success "Backup completed at: $backup_dir"
}

# Install Homebrew (macOS only)
install_homebrew_macos() {
    if ! command -v brew &> /dev/null; then
        log_info "Installing Homebrew for macOS..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
        
        log_success "Homebrew installed"
    else
        log_info "Homebrew already installed"
    fi
}

# Install ZSH via system package manager if needed
install_zsh() {
    if command -v zsh &> /dev/null; then
        log_info "ZSH already available on system"
        return
    fi
    
    log_info "Installing ZSH via system package manager..."
    
    if [[ "$OS" == "linux" ]]; then
        if [[ "$PACKAGE_MANAGER" == "unknown" ]]; then
            log_error "Cannot install ZSH. Unknown package manager."
            exit 1
        fi
        log_info "Using '$PACKAGE_MANAGER' to install zsh."
        case "$PACKAGE_MANAGER" in
            "apt")    sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y zsh ;;
            "yum")    sudo yum install -y zsh ;;
            "dnf")    sudo dnf install -y zsh ;;
            "pacman") sudo pacman -S --noconfirm zsh ;;
            "zypper") sudo zypper install -y zsh ;;
        esac
    elif [[ "$OS" == "macos" ]]; then
         log_error "ZSH not found on macOS. Please install it via Homebrew or manually."
         exit 1
    fi
    
    log_success "ZSH installed via system package manager"
}

# Install Fish shell via system package manager if needed
install_fish() {
    if command -v fish &> /dev/null; then
        log_info "Fish shell already available on system"
        return
    fi
    
    log_info "Installing Fish shell via system package manager..."
    
    if [[ "$OS" == "linux" ]]; then
        if [[ "$PACKAGE_MANAGER" == "unknown" ]]; then
            log_error "Cannot install Fish. Unknown package manager."
            exit 1
        fi
        log_info "Using '$PACKAGE_MANAGER' to install fish."
        case "$PACKAGE_MANAGER" in
            "apt")    sudo apt-get update && sudo DEBIAN_FRONTEND=noninteractive apt-get install -y fish ;;
            "yum")    sudo yum install -y fish ;;
            "dnf")    sudo dnf install -y fish ;;
            "pacman") sudo pacman -S --noconfirm fish ;;
            "zypper") sudo zypper install -y fish ;;
        esac
    elif [[ "$OS" == "macos" ]]; then
         log_error "Fish not found on macOS. Please install it via Homebrew or manually."
         exit 1
    fi
    
    log_success "Fish shell installed via system package manager"
}

# Install packages based on OS
install_packages() {
    log_info "Installing packages for $OS..."

    if [[ "$OS" == "macos" ]]; then
        if ! command -v brew &> /dev/null; then
            log_error "Homebrew is not installed. Please run the installer again."
            exit 1
        fi
        log_info "Using Homebrew to install packages from Brewfile..."
        if [[ -f "Brewfile" ]]; then
            brew bundle
            log_success "Packages from Brewfile installed."
        else
            log_warning "Brewfile not found. Skipping package installation."
        fi

    elif [[ "$OS" == "linux" ]]; then
        if [[ "$PACKAGE_MANAGER" == "unknown" ]]; then
            log_warning "Skipping package installation due to unknown package manager."
            return
        fi

        local package_file="scripts/packages.$PACKAGE_MANAGER"
        if [[ ! -f "$package_file" ]]; then
            log_warning "Package file '$package_file' not found."
            log_info "Please create it and list the packages you want to install, one per line."
            log_info "An example file can be found at 'scripts/packages.apt.example'."
            return
        fi

        log_info "Installing packages from '$package_file' using '$PACKAGE_MANAGER'..."
        
        # Read packages, ignoring comments and empty lines
        local packages_to_install=$(grep -vE '^\s*#|^\s*$' "$package_file")

        if [[ -z "$packages_to_install" ]]; then
            log_info "No packages to install in '$package_file'."
            return
        fi

        case "$PACKAGE_MANAGER" in
            "apt")
                # Pre-configure iperf3 to not start as a daemon
                echo "iperf3 iperf3/start_daemon boolean false" | sudo debconf-set-selections
                
                sudo apt-get update
                # Use DEBIAN_FRONTEND=noninteractive to avoid interactive prompts
                echo "$packages_to_install" | xargs sudo DEBIAN_FRONTEND=noninteractive apt-get install -y
                ;;
            "yum")
                echo "$packages_to_install" | xargs sudo yum install -y
                ;;
            "dnf")
                echo "$packages_to_install" | xargs sudo dnf install -y
                ;;
            "pacman")
                local packages=$(echo "$packages_to_install")
                sudo pacman -S --noconfirm $packages
                ;;
            "zypper")
                echo "$packages_to_install" | xargs sudo zypper install -y
                ;;
        esac
        log_success "Packages from '$package_file' installed."
    fi
}

# --- Linux Specific Tool Installations ---

# Install eza (ls replacement)
install_eza() {
    if command -v eza &> /dev/null; then
        log_info "eza already installed."
        return
    fi
    log_info "Installing eza..."
    # Using official recommended installation for Debian/Ubuntu
    sudo mkdir -p /etc/apt/keyrings
    wget -qO- https://raw.githubusercontent.com/eza-community/eza/main/deb.asc | sudo gpg --dearmor -o /etc/apt/keyrings/gierens.gpg
    echo "deb [signed-by=/etc/apt/keyrings/gierens.gpg] http://deb.gierens.de stable main" | sudo tee /etc/apt/sources.list.d/gierens.list
    sudo chmod 644 /etc/apt/keyrings/gierens.gpg
    sudo apt-get update
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y eza
    log_success "eza installed."
}

# Install bat (cat replacement)
install_bat() {
    if command -v bat &> /dev/null; then
        log_info "bat already installed."
        return
    fi
    log_info "Installing bat..."
    # Using official recommended installation for Debian/Ubuntu
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y bat
    # Create symlink for 'batcat' to 'bat' if needed
    if ! command -v bat &> /dev/null && command -v batcat &> /dev/null; then
        log_info "Creating symlink for batcat to bat."
        mkdir -p ~/.local/bin
        ln -s "$(which batcat)" ~/.local/bin/bat
    fi
    log_success "bat installed."
}

# Install zoxide (cd replacement)
install_zoxide() {
    if command -v zoxide &> /dev/null; then
        log_info "zoxide already installed."
        return
    fi
    log_info "Installing zoxide..."
    curl -sSfL https://raw.githubusercontent.com/ajeetdsouza/zoxide/main/install.sh | bash
    log_success "zoxide installed."
}

# Install lazygit
install_lazygit() {
    if command -v lazygit &> /dev/null; then
        log_info "lazygit already installed."
        return
    fi
    log_info "Installing lazygit..."
    
    # Get the latest version with better error handling
    LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | jq -r '.tag_name' | sed 's/^v//')
    
    if [[ -z "$LAZYGIT_VERSION" || "$LAZYGIT_VERSION" == "null" ]]; then
        log_error "Failed to get lazygit version from GitHub API"
        return 1
    fi
    
    log_info "Downloading lazygit version ${LAZYGIT_VERSION}..."
    
    if ! curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/download/v${LAZYGIT_VERSION}/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"; then
        log_error "Failed to download lazygit"
        return 1
    fi
    
    if ! sudo tar xf lazygit.tar.gz -C /usr/local/bin lazygit; then
        log_error "Failed to extract lazygit"
        rm -f lazygit.tar.gz
        return 1
    fi
    
    rm -f lazygit.tar.gz
    log_success "lazygit installed."
}

# Install Rustup (Rust toolchain installer)
install_rustup() {
    if command -v rustup &> /dev/null; then
        log_info "Rustup already installed."
        return
    fi
    log_info "Installing Rustup..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    # Source cargo env for current session
    source "$HOME/.cargo/env"
    log_success "Rustup installed."
}

# Install Volta (JavaScript Tool Manager)
install_volta() {
    if command -v volta &> /dev/null; then
        log_info "Volta already installed."
        return
    fi
    
    log_info "Installing Volta..."
    
    # Download and install Volta
    curl https://get.volta.sh | bash -s -- --skip-setup
    
    # Add Volta to PATH for current session
    export VOLTA_HOME="$HOME/.volta"
    export PATH="$VOLTA_HOME/bin:$PATH"
    
    # Install Node.js LTS by default
    if command -v volta &> /dev/null; then
        log_info "Installing Node.js LTS via Volta..."
        volta install node@lts
        log_success "Volta and Node.js LTS installed."
    else
        log_error "Failed to install Volta."
        return 1
    fi
}

# Install Docker
install_docker() {
    if command -v docker &> /dev/null; then
        log_info "Docker already installed."
        return
    fi
    log_info "Installing Docker..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    rm get-docker.sh
    sudo usermod -aG docker "$USER"
    log_success "Docker installed. Please log out and log back in for user group changes to take effect."
}

# Install Kubectl
install_kubectl() {
    if command -v kubectl &> /dev/null; then
        log_info "kubectl already installed."
        return
    fi
    log_info "Installing kubectl..."
    curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
    sudo install -o root -g root -m 0755 kubectl /usr/local/bin/kubectl
    rm kubectl
    log_success "kubectl installed."
}

# Install Helm
install_helm() {
    if command -v helm &> /dev/null; then
        log_info "Helm already installed."
        return
    fi
    log_info "Installing Helm..."
    curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash
    log_success "Helm installed."
}

# Install Glab (GitLab CLI)
install_glab() {
    if command -v glab &> /dev/null; then
        log_info "glab already installed."
        return
    fi
    log_info "Installing glab..."
    
    # For apt-based systems, try to install from universe repository first
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y glab 2>/dev/null; then
            log_success "glab installed via apt."
            return
        fi
    fi
    
    # Fallback: Download binary directly
    log_info "Installing glab via direct download..."
    GLAB_VERSION=$(curl -s https://api.github.com/repos/gitlab-org/cli/releases/latest | jq -r '.tag_name' | sed 's/^v//')
    
    if [[ -z "$GLAB_VERSION" || "$GLAB_VERSION" == "null" ]]; then
        log_error "Failed to get glab version from GitHub API"
        return 1
    fi
    
    if curl -Lo /tmp/glab.tar.gz "https://gitlab.com/gitlab-org/cli/-/releases/v${GLAB_VERSION}/downloads/glab_${GLAB_VERSION}_Linux_x86_64.tar.gz" && \
       sudo tar -C /usr/local/bin -xzf /tmp/glab.tar.gz bin/glab && \
       sudo chmod +x /usr/local/bin/glab; then
        rm -f /tmp/glab.tar.gz
        log_success "glab installed."
    else
        log_error "Failed to install glab."
        return 1
    fi
}

# Install yq (YAML processor)
install_yq() {
    if command -v yq &> /dev/null; then
        log_info "yq already installed."
        return
    fi
    log_info "Installing yq..."
    
    # Ensure ~/.local/bin exists
    mkdir -p ~/.local/bin
    
    # Get the latest version with better error handling
    YQ_VERSION=$(curl -s https://api.github.com/repos/mikefarah/yq/releases/latest | jq -r '.tag_name' | sed 's/^v//')
    
    if [[ -z "$YQ_VERSION" || "$YQ_VERSION" == "null" ]]; then
        log_error "Failed to get yq version from GitHub API"
        return 1
    fi
    
    log_info "Downloading yq version ${YQ_VERSION}..."
    
    if ! wget "https://github.com/mikefarah/yq/releases/download/v${YQ_VERSION}/yq_linux_amd64" -O ~/.local/bin/yq; then
        log_error "Failed to download yq"
        return 1
    fi
    
    chmod +x ~/.local/bin/yq
    log_success "yq installed."
}

# Install prettyping
install_prettyping() {
    if command -v prettyping &> /dev/null; then
        log_info "prettyping already installed."
        return
    fi
    log_info "Installing prettyping..."
    
    # Method 1: Try to install from system package manager
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        if sudo DEBIAN_FRONTEND=noninteractive apt-get install -y prettyping 2>/dev/null; then
            log_success "prettyping installed via apt."
            return
        fi
    fi
    
    # Method 2: Download directly to ~/.local/bin
    log_info "Installing prettyping manually..."
    mkdir -p ~/.local/bin
    
    if curl -o ~/.local/bin/prettyping https://raw.githubusercontent.com/denilsonsa/prettyping/master/prettyping && \
       chmod +x ~/.local/bin/prettyping; then
        log_success "prettyping installed."
    else
        log_error "Failed to install prettyping."
        return 1
    fi
}

# Install Antidote (ZSH plugin manager)
install_antidote() {
    if [[ -d "$HOME/.antidote" ]]; then
        log_info "Antidote already installed."
        return
    fi
    log_info "Installing Antidote..."
    git clone --depth=1 https://github.com/mattmc3/antidote.git "$HOME/.antidote"
    log_success "Antidote installed."
}

# Install Starship (cross-shell prompt)
install_starship() {
    if command -v starship &> /dev/null; then
        log_info "Starship already installed."
        return
    fi
    log_info "Installing Starship..."
    curl -sS https://starship.rs/install.sh | sh -s -- -y
    log_success "Starship installed."
}

# Install Fisher (Fish plugin manager)
install_fisher() {
    if ! command -v fish &> /dev/null; then
        log_warning "Fish shell not installed. Skipping Fisher installation."
        return
    fi
    
    if [[ -d "$HOME/.local/share/fish/vendor_conf.d/fisher.fish" ]] || command -v fisher &> /dev/null; then
        log_info "Fisher already installed."
        return
    fi
    
    log_info "Installing Fisher..."
    curl -sL https://git.io/fisher | source && fisher install jorgebucaran/fisher
    log_success "Fisher installed."
}

# Install TPM (Tmux Plugin Manager)
install_tpm() {
    if [[ -d "$HOME/.tmux/plugins/tpm" ]]; then
        log_info "TPM already installed."
        return
    fi
    
    log_info "Installing TPM (Tmux Plugin Manager)..."
    git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
    log_success "TPM installed. Run 'prefix + I' in tmux to install plugins."
}

# Install GitHub CLI
install_gh() {
    if command -v gh &> /dev/null; then
        log_info "GitHub CLI already installed."
        return
    fi
    log_info "Installing GitHub CLI..."
    
    if [[ "$PACKAGE_MANAGER" == "apt" ]]; then
        # Add GitHub CLI repo and install
        curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo gpg --dearmor -o /usr/share/keyrings/githubcli-archive-keyring.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null
        sudo apt-get update
        sudo DEBIAN_FRONTEND=noninteractive apt-get install -y gh
    else
        # Fallback to downloading binary
        GH_VERSION=$(curl -s https://api.github.com/repos/cli/cli/releases/latest | jq -r '.tag_name' | sed 's/^v//')
        
        if [[ -z "$GH_VERSION" || "$GH_VERSION" == "null" ]]; then
            log_error "Failed to get GitHub CLI version"
            return 1
        fi
        
        curl -Lo gh.tar.gz "https://github.com/cli/cli/releases/download/v${GH_VERSION}/gh_${GH_VERSION}_linux_amd64.tar.gz"
        tar xf gh.tar.gz
        sudo mv gh_${GH_VERSION}_linux_amd64/bin/gh /usr/local/bin/
        rm -rf gh.tar.gz gh_${GH_VERSION}_linux_amd64
    fi
    
    log_success "GitHub CLI installed."
}

# Install pnpm
install_pnpm() {
    if command -v pnpm &> /dev/null; then
        log_info "pnpm already installed."
        return
    fi
    log_info "Installing pnpm..."
    
    # Check if npm is available
    if ! command -v npm &> /dev/null; then
        # Try to load Volta first
        if [[ -d "$HOME/.volta" ]]; then
            export VOLTA_HOME="$HOME/.volta"
            export PATH="$VOLTA_HOME/bin:$PATH"
        fi
        
        # Check again
        if ! command -v npm &> /dev/null; then
            log_warning "npm not found. Cannot install pnpm. Please install Node.js via Volta first."
            return 1
        fi
    fi
    
    # Try to install pnpm using npm
    if ! npm install -g pnpm 2>/dev/null; then
        log_warning "Failed to install pnpm globally. Trying alternative method..."
        
        # Alternative: Install using standalone script
        curl -fsSL https://get.pnpm.io/install.sh | sh -
        
        # Add pnpm to PATH for current session
        export PNPM_HOME="$HOME/.local/share/pnpm"
        export PATH="$PNPM_HOME:$PATH"
    fi
    
    if command -v pnpm &> /dev/null; then
        log_success "pnpm installed."
    else
        log_error "Failed to install pnpm."
        return 1
    fi
}

install_opencode() {
    if command -v opencode &> /dev/null; then
        log_info "OpenCode already installed."
        return
    fi
    log_info "Installing OpenCode..."
    curl -fsSL https://opencode.ai/install | bash
    log_success "OpenCode installed."
}

install_oh_my_opencode() {
    if ! command -v opencode &> /dev/null; then
        log_warning "OpenCode not installed. Skipping Oh-My-OpenCode."
        return
    fi
    
    if ! command -v bun &> /dev/null && ! command -v npx &> /dev/null; then
        log_warning "bun or npx required for Oh-My-OpenCode."
        return
    fi
    
    log_info "Installing Oh-My-OpenCode..."
    log_info "GitHub: https://github.com/code-yeongyu/oh-my-opencode"
    
    if command -v bun &> /dev/null; then
        bunx oh-my-opencode install --no-tui --claude=no --gemini=no --copilot=no || true
    else
        npx oh-my-opencode install --no-tui --claude=no --gemini=no --copilot=no || true
    fi
    
    log_success "Oh-My-OpenCode installed. Run 'opencode auth login' to authenticate."
}

# Install Neovim 0.10+
install_neovim() {
    if command -v nvim &> /dev/null; then
        local current_version=$(nvim --version | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "0.0.0")
        local major_version=$(echo $current_version | cut -d. -f2)
        
        if [ "$major_version" -ge 10 ]; then
            log_info "Neovim $current_version already installed and meets requirements."
            return
        else
            log_info "Neovim $current_version is too old, upgrading..."
        fi
    fi
    
    log_info "Installing Neovim 0.10+..."
    
    # Run the neovim installation script
    local dotfiles_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    if [[ -f "$dotfiles_dir/scripts/install_neovim.sh" ]]; then
        bash "$dotfiles_dir/scripts/install_neovim.sh"
    else
        log_error "Neovim installation script not found."
        return 1
    fi
}

# Function to call all Linux-specific tool installations
install_linux_specific_tools() {
    if [[ "$OS" == "linux" ]]; then
        log_info "Starting Linux-specific tool installations..."
        
        # Array to track failed installations
        local failed_tools=()
        
        # Install each tool and track failures
        install_neovim || failed_tools+=("neovim")
        install_eza || failed_tools+=("eza")
        install_bat || failed_tools+=("bat")
        install_zoxide || failed_tools+=("zoxide")
        install_lazygit || failed_tools+=("lazygit")
        install_rustup || failed_tools+=("rustup")
        install_volta || failed_tools+=("volta")
        install_docker || failed_tools+=("docker")
        install_kubectl || failed_tools+=("kubectl")
        install_helm || failed_tools+=("helm")
        install_glab || failed_tools+=("glab")
        install_yq || failed_tools+=("yq")
        install_prettyping || failed_tools+=("prettyping")
        install_antidote || failed_tools+=("antidote")
        install_fish || failed_tools+=("fish")
        install_starship || failed_tools+=("starship")
        install_fisher || failed_tools+=("fisher")
        install_tpm || failed_tools+=("tpm")
        install_gh || failed_tools+=("gh")
        install_pnpm || failed_tools+=("pnpm")
        install_opencode || failed_tools+=("opencode")
        install_oh_my_opencode || failed_tools+=("oh-my-opencode")
        
        # Report results
        if [[ ${#failed_tools[@]} -eq 0 ]]; then
            log_success "All Linux-specific tools installed successfully."
        else
            log_warning "Some tools failed to install: ${failed_tools[*]}"
            log_info "You can try installing them manually later."
        fi
        
        log_success "Finished Linux-specific tool installations."
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating directories..."
    
    mkdir -p ~/.config/zsh
    mkdir -p ~/.config/fish
    mkdir -p ~/.config/ghostty
    mkdir -p ~/.config/opencode
    mkdir -p ~/.config/nvim
    mkdir -p ~/.local/bin
    mkdir -p ~/.cache
    mkdir -p ~/workspaces
    
    log_success "Directories created"
}

# Link configuration files
link_configs() {
    local dotfiles_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    
    log_info "Linking configuration files from $dotfiles_dir..."
    
    # ZSH configurations
    # Remove existing .zshrc if it's not a symlink or points to wrong location
    if [[ -e ~/.zshrc ]] && [[ ! -L ~/.zshrc || "$(readlink ~/.zshrc)" != "$dotfiles_dir/zsh/.zshrc" ]]; then
        log_warning "Existing ~/.zshrc found (not a proper symlink). Backing up..."
        mv ~/.zshrc ~/.zshrc.bak
    fi
    ln -sf "$dotfiles_dir/zsh/.zshrc" ~/.zshrc
    
    # Same for .zprofile
    if [[ -e ~/.zprofile ]] && [[ ! -L ~/.zprofile || "$(readlink ~/.zprofile)" != "$dotfiles_dir/zsh/.zprofile" ]]; then
        log_warning "Existing ~/.zprofile found (not a proper symlink). Backing up..."
        mv ~/.zprofile ~/.zprofile.bak
    fi
    ln -sf "$dotfiles_dir/zsh/.zprofile" ~/.zprofile
    
    # Same for .zshenv (important for Warp SSH compatibility)
    if [[ -e ~/.zshenv ]] && [[ ! -L ~/.zshenv || "$(readlink ~/.zshenv)" != "$dotfiles_dir/zsh/.zshenv" ]]; then
        log_warning "Existing ~/.zshenv found (not a proper symlink). Backing up..."
        mv ~/.zshenv ~/.zshenv.bak
    fi
    ln -sf "$dotfiles_dir/zsh/.zshenv" ~/.zshenv
    
    ln -sf "$dotfiles_dir/zsh/aliases.zsh" ~/.config/zsh/aliases.zsh
    ln -sf "$dotfiles_dir/zsh/completions.zsh" ~/.config/zsh/completions.zsh
    ln -sf "$dotfiles_dir/zsh/environment.zsh" ~/.config/zsh/environment.zsh
    
    # Fish shell configurations
    if [[ -d "$dotfiles_dir/fish" ]]; then
        ln -sf "$dotfiles_dir/fish/config.fish" ~/.config/fish/config.fish
        mkdir -p ~/.config/fish/functions
        mkdir -p ~/.config/fish/conf.d
        if [[ -f "$dotfiles_dir/fish/functions/ghc.fish" ]]; then
            ln -sf "$dotfiles_dir/fish/functions/ghc.fish" ~/.config/fish/functions/ghc.fish
        fi
        if [[ -f "$dotfiles_dir/fish/functions/ghcd.fish" ]]; then
            ln -sf "$dotfiles_dir/fish/functions/ghcd.fish" ~/.config/fish/functions/ghcd.fish
        fi
        if [[ -f "$dotfiles_dir/fish/conf.d/python_venv.fish" ]]; then
            ln -sf "$dotfiles_dir/fish/conf.d/python_venv.fish" ~/.config/fish/conf.d/python_venv.fish
        fi
    fi
    
    # Ghostty configuration
    if [[ -f "$dotfiles_dir/ghostty/config" ]]; then
        ln -sf "$dotfiles_dir/ghostty/config" ~/.config/ghostty/config
    fi
    
    # Starship configuration
    if [[ -f "$dotfiles_dir/starship/starship.toml" ]]; then
        ln -sf "$dotfiles_dir/starship/starship.toml" ~/.config/starship.toml
    fi
    
    # OpenCode configuration
    if [[ -d "$dotfiles_dir/opencode" ]]; then
        if [[ -f "$dotfiles_dir/opencode/opencode.json" ]]; then
            ln -sf "$dotfiles_dir/opencode/opencode.json" ~/.config/opencode/opencode.json
        fi
        if [[ -f "$dotfiles_dir/opencode/oh-my-opencode.json" ]]; then
            ln -sf "$dotfiles_dir/opencode/oh-my-opencode.json" ~/.config/opencode/oh-my-opencode.json
        fi
    fi
    
    # Neovim configuration
    # Remove existing nvim config directory if it's not empty
    if [[ -d ~/.config/nvim ]] && [[ ! -L ~/.config/nvim ]]; then
        log_warning "Existing ~/.config/nvim directory found. Backing up..."
        mv ~/.config/nvim ~/.config/nvim.bak.$(date +%Y%m%d_%H%M%S)
    fi
    
    # Create fresh nvim config directory
    rm -rf ~/.config/nvim
    mkdir -p ~/.config/nvim
    
    # Copy nvim configuration files (not symlink to avoid issues)
    cp -r "$dotfiles_dir/nvim/"* ~/.config/nvim/
    
    # Tmux configuration
    if [[ -f "$dotfiles_dir/tmux/.tmux.conf" ]]; then
        ln -sf "$dotfiles_dir/tmux/.tmux.conf" ~/.tmux.conf
        if command -v tmux &>/dev/null && pgrep -x "tmux" > /dev/null; then
            tmux source-file ~/.tmux.conf 2>/dev/null || true
        fi
    fi
    
    log_success "Configuration files linked"
}

# Remove Amazon Q related content from .zshrc
# NOTE: This function is deprecated as .zshrc is now managed by dotfiles
remove_amazon_q_from_zshrc() {
    log_info "Skipping Amazon Q removal - .zshrc is managed by dotfiles"
}

# Install Neovim plugins
install_nvim_plugins() {
    log_info "Installing Neovim plugins... (Requires nvim to be in PATH)"
    if command -v nvim &> /dev/null; then
        nvim --headless "+Lazy! sync" +qa
        log_success "Neovim plugins installed"
    else
        log_warning "Neovim not found in PATH. Skipping Neovim plugin installation. Please ensure Neovim is installed and in your PATH."
    fi
}

# Set ZSH as default shell
set_default_shell() {
    local zsh_path=$(which zsh)

    if [[ -z "$zsh_path" ]]; then
        log_error "zsh not found in PATH. Cannot set as default shell."
        return 1
    fi
    
    log_info "Found zsh at: $zsh_path"

    # Add zsh to /etc/shells if not already present
    if ! grep -q "^$zsh_path$" /etc/shells 2>/dev/null; then
        log_info "Adding $zsh_path to /etc/shells..."
        echo "$zsh_path" | sudo tee -a /etc/shells > /dev/null
    fi
    
    # Change default shell if not already set
    if [[ "$SHELL" != "$zsh_path" ]]; then
        log_info "Setting ZSH as default shell..."
        chsh -s "$zsh_path"
        log_success "Default shell set to ZSH: $zsh_path"
    else
        log_info "ZSH is already the default shell"
    fi
}

# Create .env.local template
create_env_template() {
    if [[ ! -f ~/.env.local ]]; then
        log_info "Creating .env.local template..."
        cat > ~/.env.local << 'EOF'
# Local Environment Variables
# This file should NOT be committed to version control
# Add your API keys and secrets here

# Example:
# export OPENAI_API_KEY="your-key-here"
# export AWS_ACCESS_KEY_ID="your-key-here"
# export AWS_SECRET_ACCESS_KEY="your-key-here"
EOF
        chmod 600 ~/.env.local
        log_success ".env.local template created"
    else
        log_info ".env.local already exists"
    fi
}

# Warp terminal setup
setup_warp() {
    log_info "Setting up Warp terminal compatibility..."
    mkdir -p ~/.warp
    log_success "Warp terminal setup complete"
}

# Main installation
main() {
    echo "===================================="
    echo "   Dotfiles Installation Script   "
    echo "===================================="
    echo
    
    detect_os
    detect_package_manager
    
    # Prompt to uninstall Linuxbrew if it exists
    prompt_and_uninstall_linuxbrew

    read -p "This will install dotfiles and may overwrite existing configurations. Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    backup_config
    
    if [[ "$OS" == "macos" ]]; then
        install_homebrew_macos
    fi
    
    install_zsh
    install_packages
    
    # Install Linux-specific tools if on Linux
    install_linux_specific_tools
    
    create_directories
    link_configs
    remove_amazon_q_from_zshrc # Call the new function here
    install_nvim_plugins
    set_default_shell
    create_env_template
    setup_warp
    
    echo
    log_success "Installation completed!"
    echo
    echo "Next steps:"
    echo "1. Restart your terminal or run: source ~/.zshrc"
    echo "2. To use Fish shell, run: chsh -s $(which fish)"
    echo "3. For Linux, ensure your package list at 'scripts/packages.<distro>' is up-to-date."
    echo "4. Configure your API keys in ~/.env.local"
    echo "5. Run :checkhealth in Neovim to verify setup"
    echo "6. If Docker was installed, log out and log back in for user group changes to take effect."
    echo
}

# Run main function
main "$@"