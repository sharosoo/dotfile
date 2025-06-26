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
            "apt")    sudo apt-get update && sudo apt-get install -y zsh ;;
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
                sudo apt-get update
                echo "$packages_to_install" | xargs sudo apt-get install -y
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
    sudo apt-get install -y eza
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
    sudo apt-get install -y bat
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
    LAZYGIT_VERSION=$(curl -s "https://api.github.com/repos/jesseduffield/lazygit/releases/latest" | grep -Po '"tag_name": "v\\K[^"]*')
    curl -Lo lazygit.tar.gz "https://github.com/jesseduffield/lazygit/releases/latest/download/lazygit_${LAZYGIT_VERSION}_Linux_x86_64.tar.gz"
    sudo tar xf lazygit.tar.gz -C /usr/local/bin lazygit
    rm lazygit.tar.gz
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

# Install NVM (Node Version Manager)
install_nvm() {
    if [[ -d "$HOME/.nvm" ]]; then
        log_info "NVM already installed."
        return
    fi
    log_info "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    # Source NVM for current session
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
    log_success "NVM installed."
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
    # Using official installation script for Debian/Ubuntu
    curl -sL "https://packages.gitlab.com/install/repositories/gitlab/glab/script.deb.sh" | sudo bash
    sudo apt-get install -y glab
    log_success "glab installed."
}

# Install yq (YAML processor)
install_yq() {
    if command -v yq &> /dev/null; then
        log_info "yq already installed."
        return
    fi
    log_info "Installing yq..."
    YQ_VERSION=$(curl -s https://api.github.com/repos/mikefarah/yq/releases/latest | grep -Po '"tag_name": "v\\K[^"]*')
    wget "https://github.com/mikefarah/yq/releases/latest/download/yq_linux_amd64" -O ~/.local/bin/yq
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
    if ! command -v pip3 &> /dev/null; then
        log_warning "pip3 not found. Cannot install prettyping. Please install python3-pip first."
        return
    fi
    pip3 install prettyping
    log_success "prettyping installed."
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

# Install pnpm
install_pnpm() {
    if command -v pnpm &> /dev/null; then
        log_info "pnpm already installed."
        return
    fi
    log_info "Installing pnpm..."
    if ! command -v npm &> /dev/null; then
        log_warning "npm not found. Cannot install pnpm. Please install Node.js via NVM first."
        return
    fi
    npm install -g pnpm
    log_success "pnpm installed."
}

# Function to call all Linux-specific tool installations
install_linux_specific_tools() {
    if [[ "$OS" == "linux" ]]; then
        log_info "Starting Linux-specific tool installations..."
        install_eza
        install_bat
        install_zoxide
        install_lazygit
        install_rustup
        install_nvm
        install_docker
        install_kubectl
        install_helm
        install_glab
        install_yq
        install_prettyping
        install_antidote
        install_pnpm
        log_success "Finished Linux-specific tool installations."
    fi
}

# Create necessary directories
create_directories() {
    log_info "Creating directories..."
    
    mkdir -p ~/.config/zsh
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
    ln -sf "$dotfiles_dir/zsh/.zshrc" ~/.zshrc
    ln -sf "$dotfiles_dir/zsh/.zprofile" ~/.zprofile
    ln -sf "$dotfiles_dir/zsh/aliases.zsh" ~/.config/zsh/aliases.zsh
    ln -sf "$dotfiles_dir/zsh/completions.zsh" ~/.config/zsh/completions.zsh
    ln -sf "$dotfiles_dir/zsh/environment.zsh" ~/.config/zsh/environment.zsh
    
    # Neovim configuration
    ln -sf "$dotfiles_dir/nvim/init.lua" ~/.config/nvim/init.lua
    ln -sf "$dotfiles_dir/nvim/lua" ~/.config/nvim/
    
    log_success "Configuration files linked"
}

# Remove Amazon Q related content from .zshrc
remove_amazon_q_from_zshrc() {
    if [[ -f "$HOME/.zshrc" ]]; then
        log_info "Removing Amazon Q related content from ~/.zshrc..."
        # Remove lines containing 'Amazon Q' or 'aws-shell-prompt'
        sed -i.bak '/Amazon Q/d' "$HOME/.zshrc"
        sed -i.bak '/aws-shell-prompt/d' "$HOME/.zshrc"
        log_success "Amazon Q related content removed from ~/.zshrc."
    else
        log_warning "~/.zshrc not found. Skipping Amazon Q content removal."
    fi
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
    echo "2. For Linux, ensure your package list at 'scripts/packages.<distro>' is up-to-date."
    echo "3. Configure your API keys in ~/.env.local"
    echo "4. Run :checkhealth in Neovim to verify setup"
    echo "5. If Docker was installed, log out and log back in for user group changes to take effect."
    echo
}

# Run main function
main "$@"