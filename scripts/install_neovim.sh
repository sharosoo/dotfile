#!/bin/bash
# Install latest Neovim on Linux

set -e

# Function to install Neovim from AppImage
install_neovim_appimage() {
    echo "Installing Neovim 0.10+ from AppImage..."
    
    # Create local bin directory if it doesn't exist
    mkdir -p ~/.local/bin
    
    # Download latest stable Neovim
    curl -LO https://github.com/neovim/neovim/releases/latest/download/nvim.appimage
    chmod u+x nvim.appimage
    
    # Try to extract AppImage (works on systems without FUSE)
    ./nvim.appimage --appimage-extract >/dev/null 2>&1
    
    if [ -d "squashfs-root" ]; then
        # Move extracted files to .local
        mv squashfs-root ~/.local/nvim-squashfs
        ln -sf ~/.local/nvim-squashfs/AppRun ~/.local/bin/nvim
        rm nvim.appimage
        echo "Neovim installed via extracted AppImage"
    else
        # Use AppImage directly
        mv nvim.appimage ~/.local/bin/nvim
        echo "Neovim installed as AppImage"
    fi
    
    # Add to PATH if not already there
    if ! echo "$PATH" | grep -q "$HOME/.local/bin"; then
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.bashrc
        echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc 2>/dev/null || true
    fi
}

# Function to install from unstable PPA (Ubuntu/Debian)
install_neovim_ppa() {
    echo "Installing Neovim 0.10+ from unstable PPA..."
    
    # Add the unstable PPA
    sudo add-apt-repository -y ppa:neovim-ppa/unstable
    sudo apt-get update
    sudo apt-get install -y neovim
}

# Check current Neovim version
if command -v nvim &> /dev/null; then
    CURRENT_VERSION=$(nvim --version | head -n1 | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' || echo "0.0.0")
    MAJOR=$(echo $CURRENT_VERSION | cut -d. -f2)
    
    if [ "$MAJOR" -ge 10 ]; then
        echo "Neovim $CURRENT_VERSION is already installed and meets requirements"
        exit 0
    else
        echo "Current Neovim version $CURRENT_VERSION is too old, upgrading..."
    fi
else
    echo "Neovim not found, installing..."
fi

# Detect distribution
if [ -f /etc/os-release ]; then
    . /etc/os-release
    
    case "$ID" in
        ubuntu|debian|pop|elementary|linuxmint)
            if command -v add-apt-repository &> /dev/null; then
                install_neovim_ppa
            else
                install_neovim_appimage
            fi
            ;;
        *)
            # For other distributions, use AppImage
            install_neovim_appimage
            ;;
    esac
else
    # Unknown distribution, use AppImage
    install_neovim_appimage
fi

# Verify installation
if command -v nvim &> /dev/null; then
    NEW_VERSION=$(nvim --version | head -n1)
    echo "Successfully installed: $NEW_VERSION"
else
    echo "Error: Neovim installation failed"
    exit 1
fi