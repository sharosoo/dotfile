-- Diagnostic script for folder icons
local M = {}

function M.diagnose()
  print("=== Icon Diagnostics ===")
  print("")
  
  -- Check terminal capabilities
  print("Terminal Information:")
  print("  TERM: " .. (vim.env.TERM or "not set"))
  print("  Termguicolors: " .. tostring(vim.opt.termguicolors:get()))
  print("  Encoding: " .. vim.opt.encoding:get())
  print("  File encoding: " .. vim.opt.fileencoding:get())
  print("")
  
  -- Check font settings
  print("Font Settings:")
  print("  GUI font: " .. vim.opt.guifont:get())
  print("  Nerd font enabled: " .. tostring(vim.g.have_nerd_font))
  print("")
  
  -- Check nvim-web-devicons
  local devicons_ok, devicons = pcall(require, "nvim-web-devicons")
  if devicons_ok then
    print("nvim-web-devicons: loaded successfully")
    local setup_opts = devicons.get_icons()
    local count = 0
    for _ in pairs(setup_opts) do
      count = count + 1
    end
    print("  Total icons loaded: " .. count)
  else
    print("nvim-web-devicons: FAILED to load!")
  end
  print("")
  
  -- Check nvim-tree
  local nvim_tree_ok, _ = pcall(require, "nvim-tree")
  if nvim_tree_ok then
    print("nvim-tree: loaded successfully")
    
    -- Get nvim-tree config
    local config_ok, config = pcall(require, "nvim-tree.config")
    if config_ok then
      local opts = config.get_config()
      print("  Folder icons enabled: " .. tostring(opts.renderer.icons.show.folder))
      print("  Folder arrows enabled: " .. tostring(opts.renderer.icons.show.folder_arrow))
      print("")
      print("  Configured folder icons:")
      local folder_glyphs = opts.renderer.icons.glyphs.folder
      for key, value in pairs(folder_glyphs) do
        print("    " .. key .. ": '" .. value .. "' (Unicode: U+" .. string.format("%04X", value:byte(1, -1)) .. ")")
      end
    end
  else
    print("nvim-tree: FAILED to load!")
  end
  print("")
  
  -- Test rendering of specific icons
  print("Icon Rendering Test:")
  local test_icons = {
    ["Folder closed"] = "",
    ["Folder open"] = "",
    ["Arrow closed"] = "",
    ["Arrow open"] = "",
    ["File"] = "",
    ["Git"] = "",
  }
  
  for name, icon in pairs(test_icons) do
    print("  " .. name .. ": '" .. icon .. "'")
  end
  print("")
  
  -- Check if running in a proper terminal
  print("Terminal Capabilities:")
  if vim.fn.has("gui_running") == 1 then
    print("  Running in GUI mode")
  else
    print("  Running in terminal mode")
  end
  
  -- Check Unicode support
  print("")
  print("Unicode Support Test:")
  print("  Box drawing: ┌─┬─┐ │ ├─┼─┤ └─┴─┘")
  print("  Arrows: ← ↑ → ↓ ↔ ↕")
  print("  Blocks: ▀ ▄ █ ▌ ▐ ░ ▒ ▓")
  
  print("")
  print("=== End Diagnostics ===")
end

function M.check_font()
  print("\n=== Font Recommendations ===")
  print("For proper icon display, ensure you're using a Nerd Font.")
  print("Popular options:")
  print("  - JetBrainsMono Nerd Font")
  print("  - FiraCode Nerd Font")
  print("  - Hack Nerd Font")
  print("  - D2Coding Nerd Font")
  print("")
  print("Download from: https://www.nerdfonts.com/")
  print("")
  print("After installing, configure your terminal to use the Nerd Font.")
end

return M