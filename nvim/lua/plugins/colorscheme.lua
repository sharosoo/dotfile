-- Colorscheme Plugin Configuration
-- This file is managed by dotfiles - https://github.com/sharosoo/dotfile

return {
  "folke/tokyonight.nvim",
  lazy = false,
  priority = 1000,
  config = function()
    require("tokyonight").setup({
      transparent = true,
      styles = {
        sidebars = "transparent",
        floats = "transparent",
        comments = { italic = true },
        keywords = { italic = true },
        functions = {},
        variables = {},
      },
      on_colors = function(colors)
        colors.comment = "#9ca0b0"
        colors.fg_gutter = "#737aa2"
        colors.bg_visual = "#364a82"
        colors.bg_search = "#3d59a1"
        colors.bg_highlight = "#292e42"
      end,
      on_highlights = function(highlights, colors)
        highlights.NormalFloat = { bg = colors.none, fg = colors.fg }
        highlights.FloatBorder = { bg = colors.none, fg = colors.blue }
        highlights.Pmenu = { bg = colors.bg_dark, fg = colors.fg }
        highlights.PmenuSel = { bg = colors.bg_highlight, fg = colors.fg }
        highlights.CursorLine = { bg = colors.bg_highlight }
        highlights.IndentBlanklineChar = { fg = colors.dark3 }
        highlights.VertSplit = { fg = colors.dark5 }
        highlights.WinSeparator = { fg = colors.dark5 }
      end,
    })
    vim.cmd.colorscheme("tokyonight-night")
  end,
}