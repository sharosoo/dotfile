-- Warp Terminal fix for icons
local M = {}

function M.setup()
  -- Warp Terminal specific settings
  if vim.env.TERM_PROGRAM == "WarpTerminal" then
    -- Use simpler icons that work better in Warp
    vim.g.nvim_tree_use_simple_icons = true
    
    -- Alternative folder icons for Warp
    local simple_icons = {
      folder = {
        arrow_closed = "▸",
        arrow_open = "▾",
        default = "[D]",
        open = "[O]",
        empty = "[E]",
        empty_open = "[E]",
        symlink = "[L]",
        symlink_open = "[L]",
      },
      git = {
        unstaged = "M",
        staged = "A",
        unmerged = "U",
        renamed = "R",
        untracked = "?",
        deleted = "D",
        ignored = "I",
      },
    }
    
    -- You can switch to these if the current ones don't work
    -- Just uncomment the lines below
    -- require("nvim-tree").setup({
    --   renderer = {
    --     icons = {
    --       glyphs = simple_icons
    --     }
    --   }
    -- })
  end
end

return M