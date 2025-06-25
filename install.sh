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

# Install Homebrew (macOS/Linux)
install_homebrew() {
    if ! command -v brew &> /dev/null; then
        log_info "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH
        if [[ "$OS" == "macos" ]]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        else
            echo 'eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/home/linuxbrew/.linuxbrew/bin/brew shellenv)"
        fi
        
        log_success "Homebrew installed"
    else
        log_info "Homebrew already installed"
    fi
}

# Install packages via Homebrew
install_packages() {
    log_info "Installing packages..."
    
    # Essential packages
    local packages=(
        "git"
        "neovim"
        "zsh"
        "starship"
        "fzf"
        "ripgrep"
        "fd"
        "eza"
        "bat"
        "prettyping"
        "tldr"
        "jq"
        "yq"
        "tmux"
        "antidote"
        "gh"
        "gitui"
        "lazygit"
        "python3"
        "node"
        "go"
        "rust"
        "jenv"
        "nvm"
        "pnpm"
    )
    
    for package in "${packages[@]}"; do
        if brew list "$package" &> /dev/null; then
            log_info "$package already installed"
        else
            log_info "Installing $package..."
            brew install "$package"
        fi
    done
    
    log_success "Packages installed"
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

# Install Neovim plugins
install_nvim_plugins() {
    log_info "Installing Neovim plugins..."
    nvim --headless "+Lazy! sync" +qa
    log_success "Neovim plugins installed"
}

# Set ZSH as default shell
set_default_shell() {
    local zsh_path
    
    # Try to find zsh
    if command -v brew &> /dev/null; then
        # Use Homebrew zsh if available
        if [[ "$OS" == "macos" ]]; then
            zsh_path="/opt/homebrew/bin/zsh"
        else
            zsh_path="/home/linuxbrew/.linuxbrew/bin/zsh"
        fi
        
        # Check if Homebrew zsh exists and add to /etc/shells if needed
        if [[ -f "$zsh_path" ]]; then
            if ! grep -q "$zsh_path" /etc/shells; then
                log_info "Adding Homebrew zsh to /etc/shells..."
                echo "$zsh_path" | sudo tee -a /etc/shells > /dev/null
            fi
        else
            # Fall back to system zsh
            zsh_path="$(which zsh)"
        fi
    else
        # Use system zsh
        zsh_path="$(which zsh)"
    fi
    
    if [[ "$SHELL" != "$zsh_path" ]]; then
        log_info "Setting ZSH as default shell..."
        chsh -s "$zsh_path"
        log_success "Default shell set to ZSH"
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
    
    # Create Warp configuration directory if it doesn't exist
    mkdir -p ~/.warp
    
    # Add Warp-specific configurations to .zshrc if needed
    if ! grep -q "WARP_TERMINAL_COMPAT" ~/.zshrc; then
        log_info "Warp terminal compatibility already configured"
    fi
    
    log_success "Warp terminal setup complete"
}

# Main installation
main() {
    echo "==================================="
    echo "  Dotfiles Installation Script"
    echo "==================================="
    echo
    
    # Detect OS
    detect_os
    
    # Ask for confirmation
    read -p "This will install dotfiles and may overwrite existing configurations. Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_info "Installation cancelled"
        exit 0
    fi
    
    # Create backup
    backup_config
    
    # Install Homebrew
    install_homebrew
    
    # Install packages
    install_packages
    
    # Create directories
    create_directories
    
    # Link configuration files
    link_configs
    
    # Install Neovim plugins
    install_nvim_plugins
    
    # Set default shell
    set_default_shell
    
    # Create environment template
    create_env_template
    
    # Setup Warp
    setup_warp
    
    echo
    log_success "Installation completed!"
    echo
    echo "Next steps:"
    echo "1. Restart your terminal or run: source ~/.zshrc"
    echo "2. Configure your API keys in ~/.env.local"
    echo "3. Run :checkhealth in Neovim to verify setup"
    echo
    echo "To rollback, restore from backup directory created at the beginning"
}

# Run main function
main "$@"