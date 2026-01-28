-- Neovim Autocommands Configuration
-- This file is managed by dotfiles - https://github.com/sharosoo/dotfile

local augroup = vim.api.nvim_create_augroup
local autocmd = vim.api.nvim_create_autocmd

-- Highlight on yank
augroup("YankHighlight", { clear = true })
autocmd("TextYankPost", {
  group = "YankHighlight",
  callback = function()
    vim.highlight.on_yank()
  end,
})

-- Remove whitespace on save
augroup("TrimWhitespace", { clear = true })
autocmd("BufWritePre", {
  group = "TrimWhitespace",
  pattern = "*",
  command = [[%s/\s\+$//e]],
})

-- Auto resize splits when window resized
augroup("ResizeSplits", { clear = true })
autocmd("VimResized", {
  group = "ResizeSplits",
  callback = function()
    vim.cmd("tabdo wincmd =")
  end,
})

-- Go to last location when opening a buffer
augroup("LastLocation", { clear = true })
autocmd("BufReadPost", {
  group = "LastLocation",
  callback = function()
    local mark = vim.api.nvim_buf_get_mark(0, '"')
    local lcount = vim.api.nvim_buf_line_count(0)
    if mark[1] > 0 and mark[1] <= lcount then
      pcall(vim.api.nvim_win_set_cursor, 0, mark)
    end
  end,
})

-- Close some filetypes with <q>
augroup("CloseWithQ", { clear = true })
autocmd("FileType", {
  group = "CloseWithQ",
  pattern = {
    "help",
    "lspinfo",
    "man",
    "notify",
    "qf",
    "spectre_panel",
    "startuptime",
    "tsplayground",
    "checkhealth",
  },
  callback = function(event)
    vim.bo[event.buf].buflisted = false
    vim.keymap.set("n", "q", "<cmd>close<cr>", { buffer = event.buf, silent = true })
  end,
})

-- Wrap and check for spell in text filetypes
augroup("WrapSpell", { clear = true })
autocmd("FileType", {
  group = "WrapSpell",
  pattern = { "gitcommit", "markdown" },
  callback = function()
    vim.opt_local.wrap = true
    vim.opt_local.spell = true
  end,
})

-- Auto create dir when saving a file
augroup("AutoCreateDir", { clear = true })
autocmd("BufWritePre", {
  group = "AutoCreateDir",
  callback = function(event)
    if event.match:match("^%w%w+://") then
      return
    end
    local file = vim.loop.fs_realpath(event.match) or event.match
    vim.fn.mkdir(vim.fn.fnamemodify(file, ":p:h"), "p")
  end,
})

-- Fix conceallevel for json files
augroup("JsonConceal", { clear = true })
autocmd("FileType", {
  group = "JsonConceal",
  pattern = { "json", "jsonc" },
  callback = function()
    vim.wo.conceallevel = 0
  end,
})

-- Terraform file settings
augroup("TerraformSettings", { clear = true })
autocmd({"BufRead", "BufNewFile"}, {
  group = "TerraformSettings",
  pattern = { "*.tf", "*.tfvars", "*.hcl" },
  callback = function()
    vim.bo.filetype = "terraform"
    vim.bo.commentstring = "# %s"
    vim.bo.tabstop = 2
    vim.bo.shiftwidth = 2
    vim.bo.expandtab = true
  end,
})

-- Transparent background adjustments
augroup("TransparentBackground", { clear = true })
autocmd("ColorScheme", {
  group = "TransparentBackground",
  callback = function()
    vim.cmd([[
      highlight CursorLineNr guifg=#ff9e64 gui=bold
      highlight LineNr guifg=#737aa2
      highlight MatchParen guibg=#364a82 guifg=#c0caf5 gui=bold
      highlight Visual guibg=#364a82
      highlight VisualNOS guibg=#364a82
      highlight Search guibg=#3d59a1 guifg=#c0caf5
      highlight IncSearch guibg=#ff9e64 guifg=#1f2335
      highlight DiagnosticError guifg=#f7768e
      highlight DiagnosticWarn guifg=#e0af68
      highlight DiagnosticInfo guifg=#0db9d7
      highlight DiagnosticHint guifg=#10b981
      highlight DiffAdd guibg=#20303b guifg=#9ece6a
      highlight DiffChange guibg=#1f2d3d guifg=#7aa2f7
      highlight DiffDelete guibg=#37222c guifg=#f7768e
      highlight DiffText guibg=#394b70 guifg=#c0caf5
    ]])
  end,
})

-- Warp Terminal Fix
if vim.env.TERM_PROGRAM == "WarpTerminal" then
  autocmd({ "BufEnter", "BufWinEnter" }, {
    callback = function()
      require("config.warp-fix")
    end,
  })
end