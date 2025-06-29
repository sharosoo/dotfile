#!/bin/bash

echo "=== Neovim Mason Debug Script ==="
echo

echo "1. Neovim version:"
nvim --version | head -n 1

echo
echo "2. Checking nvim config directory:"
ls -la ~/.config/nvim/

echo
echo "3. Checking mason-lspconfig line 106 in lsp.lua:"
sed -n '100,110p' ~/.config/nvim/lua/plugins/lsp.lua

echo
echo "4. Checking if mason directories exist:"
ls -la ~/.local/share/nvim/site/pack/*/start/mason* 2>/dev/null || echo "Mason plugins not found in standard location"

echo
echo "5. Cleaning neovim plugins and cache:"
echo "Run these commands manually if needed:"
echo "rm -rf ~/.local/share/nvim"
echo "rm -rf ~/.local/state/nvim" 
echo "rm -rf ~/.cache/nvim"

echo
echo "6. Testing minimal config:"
cat > /tmp/minimal_lsp.lua << 'EOF'
-- Minimal test config for mason
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  {
    "williamboman/mason.nvim",
    config = function()
      require("mason").setup()
    end
  },
  {
    "williamboman/mason-lspconfig.nvim",
    dependencies = { "williamboman/mason.nvim" },
    config = function()
      require("mason-lspconfig").setup({
        automatic_installation = false,  -- Disable automatic installation for testing
      })
    end
  },
})
EOF

echo
echo "To test minimal config, run:"
echo "nvim -u /tmp/minimal_lsp.lua"