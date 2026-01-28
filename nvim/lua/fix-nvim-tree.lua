-- Fix for nvim-tree diagnostic sign errors
local M = {}

function M.setup()
  -- Ensure signs are defined before nvim-tree uses them
  local signs = {
    { name = "NvimTreeDiagnosticErrorIcon", text = "", texthl = "DiagnosticError" },
    { name = "NvimTreeDiagnosticWarnIcon", text = "", texthl = "DiagnosticWarn" },
    { name = "NvimTreeDiagnosticInfoIcon", text = "", texthl = "DiagnosticInfo" },
    { name = "NvimTreeDiagnosticHintIcon", text = "", texthl = "DiagnosticHint" },
  }
  
  for _, sign in ipairs(signs) do
    vim.fn.sign_define(sign.name, { text = sign.text, texthl = sign.texthl })
  end
end

return M
