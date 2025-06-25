-- Warp Terminal Fix
-- This file is managed by dotfiles - https://github.com/sharosoo/dotfile

-- Fix for Warp terminal compatibility
if vim.env.TERM_PROGRAM == "WarpTerminal" then
  vim.opt.termguicolors = true
  
  -- Ensure proper color support
  vim.cmd([[
    if has('termguicolors')
      set termguicolors
    endif
  ]])
  
  -- Fix cursor shape
  vim.opt.guicursor = "n-v-c:block,i-ci-ve:ver25,r-cr:hor20,o:hor50"
end