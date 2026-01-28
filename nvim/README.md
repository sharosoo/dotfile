# Native Neovim Configuration

A LunarVim-inspired Neovim configuration optimized for Python, TypeScript, Go, and Rust development.

## Features

- **Plugin Manager**: lazy.nvim for fast startup
- **Colorscheme**: TokyoNight with transparent background
- **File Explorer**: nvim-tree with icons
- **Fuzzy Finding**: Telescope with fzf integration
- **LSP Support**: Full language server support for Python, TypeScript, Go, and Rust
- **Autocompletion**: nvim-cmp with LuaSnip
- **Formatting**: conform.nvim with uvx ruff for Python
- **Testing**: neotest integration for all languages
- **Git Integration**: gitsigns for git status in buffer
- **Terminal**: toggleterm for integrated terminal

## Language Support

### Python
- **LSP**: pyright and ruff (native server)
- **Formatting**: uvx ruff (primary), black + isort (fallback)
- **Testing**: pytest via neotest-python

### TypeScript/JavaScript
- **LSP**: ts_ls (typescript-language-server)
- **Formatting**: prettier/prettierd
- **Testing**: Built-in Jest support

### Go
- **LSP**: gopls
- **Formatting**: gofumpt + goimports
- **Testing**: neotest-go

### Rust
- **LSP**: rust-analyzer with clippy
- **Formatting**: rustfmt
- **Testing**: neotest-rust

## Key Bindings

### General
- `<Space>` - Leader key
- `<C-s>` - Save file
- `<leader>q` - Quit
- `<leader>e` - Toggle file explorer

### Telescope
- `<leader>ff` - Find files
- `<leader>fg` - Live grep
- `<leader>fb` - Find buffers
- `<leader>fh` - Help tags

### LSP
- `gd` - Goto definition
- `gr` - Goto references
- `gI` - Goto implementation
- `<leader>D` - Type definition
- `<leader>rn` - Rename
- `<leader>ca` - Code actions
- `K` - Hover documentation

### Testing
- `<leader>tt` - Run nearest test
- `<leader>tf` - Run file tests
- `<leader>ts` - Toggle test summary

### Terminal
- `<C-\>` - Toggle terminal
- `<Esc>` - Exit terminal mode (in terminal)

## Installation

1. The configuration is installed at `~/.config/nvim-native/`
2. Shell aliases are set up to use this configuration:
   - `vi` → `NVIM_APPNAME=nvim-native nvim`
   - `vim` → `NVIM_APPNAME=nvim-native nvim`
   - `vimdiff` → `NVIM_APPNAME=nvim-native nvim -d`

3. On first launch, lazy.nvim will automatically install all plugins
4. Mason will install language servers and tools automatically

## Requirements

- Neovim >= 0.9.0
- Git
- Node.js (for TypeScript support)
- Python 3.8+ with uvx installed
- Go (for Go support)
- Rust toolchain (for Rust support)
- A Nerd Font (D2Coding Nerd Font is configured)

## Font Configuration

The configuration uses D2Coding Nerd Font. Make sure it's installed and set in your terminal:
- GUI: Already configured in init.lua
- Terminal: Set D2CodingNerd as your terminal font

## Transparent Background

The configuration includes transparent background support. Ensure your terminal supports transparency for the best experience.