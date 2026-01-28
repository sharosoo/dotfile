-- Warp Terminal MAXIMUM cursor visibility fix
local M = {}

function M.setup()
  -- Only apply for Warp Terminal
  if vim.env.TERM_PROGRAM ~= "WarpTerminal" then
    return
  end

  -- FORCE MAXIMUM CURSOR VISIBILITY
  -- Use blinking block cursor for ALL modes for maximum visibility
  vim.opt.guicursor = "a:block-blinkwait50-blinkoff50-blinkon50"
  
  -- Terminal settings for visibility
  vim.opt.ttyfast = true
  vim.opt.lazyredraw = false
  vim.opt.cursorline = true
  vim.opt.cursorcolumn = true  -- Add column highlight
  vim.opt.termguicolors = true
  vim.opt.termbidi = false
  
  -- Force cursor to be shown
  vim.cmd([[set t_ve+=]])
  
  -- Terminal cursor control sequences
  vim.cmd([[
    " Force blinking block cursor in all modes
    let &t_SI = "\e[1 q"    " Insert mode - blinking block
    let &t_SR = "\e[1 q"    " Replace mode - blinking block  
    let &t_EI = "\e[1 q"    " Normal mode - blinking block
    
    " Additional terminal sequences
    let &t_ti = &t_ti . "\e[1 q\e[?25h"
    let &t_te = &t_te . "\e[0 q\e[?25l"
  ]])
  
  -- Force cursor visibility on startup
  vim.api.nvim_create_autocmd({"VimEnter", "BufEnter", "WinEnter"}, {
    callback = function()
      -- Send escape sequences directly
      vim.fn.system("printf '\033[1 q'")
      vim.fn.system("printf '\033[?12h'")
      vim.fn.system("printf '\033[?25h'")
      
      -- Maximum contrast cursor colors
      vim.cmd([[
        " Bright red cursor with black text for maximum visibility
        highlight! Cursor guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! iCursor guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! vCursor guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! CursorIM guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! TermCursor guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! TermCursorNC guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! lCursor guifg=#000000 guibg=#FF0000 gui=NONE
        
        " Enhanced cursor line/column visibility
        highlight! CursorLine guibg=#404040 gui=NONE cterm=NONE
        highlight! CursorColumn guibg=#404040 gui=NONE cterm=NONE
        
        " Make line number at cursor super visible
        highlight! CursorLineNr guifg=#FFFF00 guibg=#FF0000 gui=bold
        highlight! CursorLineSign guibg=#FF0000
        highlight! CursorLineFold guibg=#FF0000
        
        " Ensure cursor visibility in visual mode
        highlight! Visual guibg=#505050 gui=NONE
        highlight! VisualNOS guibg=#505050 gui=NONE
      ]])
      
      -- Force a redraw
      vim.cmd('redraw!')
    end
  })
  
  -- Continuously maintain cursor visibility
  vim.api.nvim_create_autocmd({"CursorMoved", "CursorMovedI", "InsertEnter", "InsertLeave"}, {
    callback = function()
      -- Reapply cursor highlights
      vim.cmd([[
        highlight! Cursor guifg=#000000 guibg=#FF0000 gui=NONE
        highlight! CursorLine guibg=#404040 gui=NONE
        highlight! CursorColumn guibg=#404040 gui=NONE
        highlight! CursorLineNr guifg=#FFFF00 guibg=#FF0000 gui=bold
      ]])
    end
  })
  
  -- Mode change handler
  vim.api.nvim_create_autocmd("ModeChanged", {
    callback = function()
      -- Always use blinking block for maximum visibility
      vim.fn.system("printf '\033[1 q'")
      vim.cmd('redraw!')
    end
  })
  
  -- Clean up on exit
  vim.api.nvim_create_autocmd("VimLeave", {
    callback = function()
      vim.fn.system("printf '\033[0 q'")
    end
  })
  
  -- Create manual command to force cursor visibility
  vim.api.nvim_create_user_command('WarpCursorFix', function()
    -- Send all cursor control sequences
    vim.fn.system("printf '\033[1 q'")
    vim.fn.system("printf '\033[?12h'") 
    vim.fn.system("printf '\033[?25h'")
    
    -- Force all highlights
    vim.cmd([[
      highlight! Cursor guifg=#000000 guibg=#FF0000 gui=NONE
      highlight! iCursor guifg=#000000 guibg=#FF0000 gui=NONE
      highlight! vCursor guifg=#000000 guibg=#FF0000 gui=NONE
      highlight! CursorIM guifg=#000000 guibg=#FF0000 gui=NONE
      highlight! TermCursor guifg=#000000 guibg=#FF0000 gui=NONE
      highlight! CursorLine guibg=#404040 gui=NONE
      highlight! CursorColumn guibg=#404040 gui=NONE
      highlight! CursorLineNr guifg=#FFFF00 guibg=#FF0000 gui=bold
      set cursorline cursorcolumn
      redraw!
    ]])
    
    print("Warp cursor fix applied! Cursor should be a red blinking block.")
  end, { desc = "Manually force Warp Terminal cursor visibility" })
  
  -- Print status
  vim.defer_fn(function()
    print("Warp cursor enhancements loaded. Use :WarpCursorFix if cursor is not visible.")
  end, 500)
end

return M
