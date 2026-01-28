-- Icon debugging helper
local M = {}

function M.check_icons()
  local devicons_ok, devicons = pcall(require, "nvim-web-devicons")
  if not devicons_ok then
    print("nvim-web-devicons not loaded!")
    return
  end
  
  print("=== Icon Check ===")
  print("Nerd Font enabled: " .. tostring(vim.g.have_nerd_font))
  print("Termguicolors: " .. tostring(vim.opt.termguicolors:get()))
  print("Font: " .. vim.opt.guifont:get())
  
  -- Test some icons
  local test_icons = {
    folder_closed = "",
    folder_open = "",
    file = "",
    git = "",
    python = "",
    javascript = "",
  }
  
  print("\n=== Test Icons ===")
  for name, icon in pairs(test_icons) do
    print(name .. ": " .. icon)
  end
  
  -- Check if icons are properly loaded
  local all_icons = devicons.get_icons()
  local count = 0
  for _ in pairs(all_icons) do
    count = count + 1
  end
  print("\nTotal icons loaded: " .. count)
end

return M