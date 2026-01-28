-- Neovim Options Configuration
-- This file is managed by dotfiles - https://github.com/sharosoo/dotfile

local opt = vim.opt

-- Line Numbers
opt.number = true
opt.relativenumber = true

-- Tabs & Indentation
opt.tabstop = 2
opt.shiftwidth = 2
opt.expandtab = true
opt.smartindent = true

-- Line Wrapping
opt.wrap = false

-- Search Settings
opt.ignorecase = true
opt.smartcase = true
opt.hlsearch = false
opt.incsearch = true

-- Cursor Line
opt.cursorline = true

-- Appearance
opt.termguicolors = true
opt.signcolumn = "yes"
opt.scrolloff = 10
opt.sidescrolloff = 8

-- Backspace
opt.backspace = "indent,eol,start"

-- Clipboard
opt.clipboard:append("unnamedplus")

-- Split Windows
opt.splitright = true
opt.splitbelow = true

-- Word Characters
opt.iskeyword:append("-")

-- Files
opt.undofile = true
opt.swapfile = false
opt.backup = false
opt.writebackup = false

-- Update Time
opt.updatetime = 50
opt.timeoutlen = 300

-- Completion
opt.completeopt = "menuone,noselect"

-- Encoding
opt.encoding = "utf-8"
opt.fileencoding = "utf-8"

-- Font and Icons
opt.guifont = "D2CodingNerd:h14"
vim.g.have_nerd_font = true

-- List Characters
opt.list = true
opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }
opt.fillchars = { eob = " ", fold = " ", vert = "│", foldsep = " ", diff = "╱" }

-- Mouse
opt.mouse = "a"
opt.showmode = false

-- Incremental Commands
opt.inccommand = "split"

-- Break Indent
opt.breakindent = true

-- Folding (using treesitter)
opt.foldmethod = "expr"
opt.foldexpr = "nvim_treesitter#foldexpr()"
opt.foldenable = false

-- Session Options
opt.sessionoptions = "blank,buffers,curdir,folds,help,tabpages,winsize,winpos,terminal,localoptions"

-- Netrw Settings
vim.g.netrw_liststyle = 3
vim.g.netrw_banner = 0