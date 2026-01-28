-- Terminal cursor settings for better visibility
local M = {}

function M.setup()
  -- Terminal cursor shape escape sequences
  -- These work for most modern terminals including iTerm2, Terminal.app, Warp, etc.
  
  -- Block cursor in normal mode
  vim.cmd([[let &t_SI = "\e[6 q"]])  -- Insert mode: bar cursor
  vim.cmd([[let &t_SR = "\e[4 q"]])  -- Replace mode: underline cursor
  vim.cmd([[let &t_EI = "\e[2 q"]])  -- Normal mode: block cursor
  
  -- Warp Terminal specific settings
  if vim.env.TERM_PROGRAM == "WarpTerminal" then
    -- Enable cursor blinking
    vim.cmd([[
      augroup WarpCursor
        autocmd!
        " Make cursor more visible with brighter colors
        autocmd VimEnter * silent !printf '\e[?12h'
        autocmd VimLeave * silent !printf '\e[?12l'
      augroup END
    ]])
  end
  
  -- Additional cursor enhancements
  vim.api.nvim_create_autocmd({"VimEnter", "VimResume"}, {
    pattern = "*",
    callback = function()
      -- Force cursor shape reset
      vim.cmd([[silent! execute "!echo -ne '\e[2 q'"]])
    end
  })
  
  vim.api.nvim_create_autocmd({"VimLeave", "VimSuspend"}, {
    pattern = "*",
    callback = function()
      -- Reset cursor to default
      vim.cmd([[silent! execute "!echo -ne '\e[0 q'"]])
    end
  })
end

return M
