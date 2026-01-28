-- Go Language Server Setup
-- This file handles Go LSP setup when Go is available

local M = {}

-- Check if Go is installed and setup gopls
function M.setup()
  if vim.fn.executable("go") == 0 then
    vim.notify("Go is not installed. Skipping gopls setup.", vim.log.levels.WARN)
    return false
  end

  -- Check if gopls is installed
  if vim.fn.executable("gopls") == 0 then
    vim.notify("gopls is not installed. Install with: go install golang.org/x/tools/gopls@latest", vim.log.levels.WARN)
    return false
  end

  local lspconfig = require("lspconfig")
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

  lspconfig.gopls.setup({
    capabilities = capabilities,
    settings = {
      gopls = {
        analyses = {
          unusedparams = true,
        },
        staticcheck = true,
        gofumpt = true,
      },
    },
  })

  vim.notify("Go LSP (gopls) configured successfully", vim.log.levels.INFO)
  return true
end

-- Install Go tools if Go is available
function M.install_tools()
  if vim.fn.executable("go") == 0 then
    return false
  end

  local tools = {
    "golang.org/x/tools/gopls@latest",
    "github.com/go-delve/delve/cmd/dlv@latest",
    "mvdan.cc/gofumpt@latest",
    "golang.org/x/tools/cmd/goimports@latest",
  }

  vim.notify("Installing Go tools...", vim.log.levels.INFO)
  
  for _, tool in ipairs(tools) do
    vim.fn.system({"go", "install", tool})
  end
  
  vim.notify("Go tools installation completed", vim.log.levels.INFO)
  return true
end

return M