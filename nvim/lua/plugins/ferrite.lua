-- ferrite.nvim — open the current file (md/json/yaml/toml/…) in the Ferrite GUI.
-- Local plugin: ~/workspaces/sharosoo/ferrite.nvim
-- Replaces the old obsidian.nvim setup (archived in docs/archive/obsidian.lua.removed).
local dir = vim.fn.expand("~/workspaces/sharosoo/ferrite.nvim")

return {
  dir = dir,
  name = "ferrite.nvim",
  -- Skip on machines without the local checkout (e.g. macOS).
  cond = vim.fn.isdirectory(dir) == 1,
  lazy = false,
  keys = {
    { "<leader>mp", mode = { "n", "x" }, desc = "Ferrite: open current file" },
    { "<leader>mP", mode = { "n", "x" }, desc = "Ferrite: open cwd as workspace" },
  },
  opts = {
    -- bin = "ferrite",  -- install via ferrite.nvim/scripts/install-ferrite.sh
  },
}
