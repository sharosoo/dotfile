
-- ========================================================================
-- Neovim Configuration (LunarVim-inspired)
-- ========================================================================

-- Bootstrap lazy.nvim plugin manager
local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"
if not vim.loop.fs_stat(lazypath) then
  vim.fn.system({
    "git",
    "clone",
    "--filter=blob:none",
    "https://github.com/folke/lazy.nvim.git",
    "--branch=stable",
    lazypath,
  })
end
vim.opt.rtp:prepend(lazypath)

-- Leader key setup (must be before lazy setup)
vim.g.mapleader = " "
vim.g.maplocalleader = " "


-- Basic settings
vim.opt.number = true
vim.opt.relativenumber = true
vim.opt.mouse = "a"
vim.opt.showmode = false
vim.opt.breakindent = true
vim.opt.undofile = true
vim.opt.ignorecase = true
vim.opt.smartcase = true
vim.opt.signcolumn = "yes"
vim.opt.updatetime = 250
vim.opt.timeoutlen = 300
vim.opt.splitright = true
vim.opt.splitbelow = true
vim.opt.list = true
vim.opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }
vim.opt.inccommand = "split"
vim.opt.cursorline = true
vim.opt.scrolloff = 10

-- Cursor settings for better visibility
vim.opt.guicursor = "n-v-c:block,i-ci-ve:ver25,r-cr:hor20,o:hor50,a:blinkwait700-blinkoff400-blinkon250,sm:block-blinkwait175-blinkoff150-blinkon175"

-- Terminal compatibility settings
vim.opt.ttyfast = true  -- Faster redrawing
vim.opt.lazyredraw = false  -- Don't redraw while executing macros

-- Better cursor visibility in terminal
if vim.env.TERM_PROGRAM == "WarpTerminal" then
  -- Warp Terminal specific settings
  vim.opt.guicursor = "n-v-c-sm:block-blinkwait700-blinkoff400-blinkon250,i-ci-ve:ver25-blinkwait700-blinkoff400-blinkon250,r-cr-o:hor20-blinkwait700-blinkoff400-blinkon250"
  -- Force cursor to be visible
  vim.opt.cursorline = true
  vim.opt.cursorcolumn = false
  -- Terminal cursor control
  vim.cmd([[set t_ve+=]])
end

-- Tab and indent settings
vim.opt.tabstop = 2
vim.opt.shiftwidth = 2
vim.opt.expandtab = true
vim.opt.smartindent = true

-- Font and encoding
vim.opt.encoding = "utf-8"
vim.opt.termguicolors = true
vim.opt.fileencoding = "utf-8"
vim.opt.guifont = "D2CodingNerd:h14"

-- Additional settings for better icon display
vim.g.have_nerd_font = true
vim.env.NVIM_TUI_ENABLE_TRUE_COLOR = 1

-- Ensure proper rendering of Unicode characters
vim.opt.list = true
vim.opt.listchars = { tab = "» ", trail = "·", nbsp = "␣" }
vim.opt.fillchars = { eob = " ", fold = " ", vert = "│", foldsep = " ", diff = "╱" }

-- Terminal colors for better rendering

-- These will be loaded after plugins are initialized

-- Define diagnostic signs early for nvim-tree and re-define on FileType
vim.fn.sign_define("NvimTreeDiagnosticErrorIcon", { text = "", texthl = "DiagnosticError" })
vim.fn.sign_define("NvimTreeDiagnosticWarnIcon", { text = "", texthl = "DiagnosticWarn" })
vim.fn.sign_define("NvimTreeDiagnosticInfoIcon", { text = "", texthl = "DiagnosticInfo" })
vim.fn.sign_define("NvimTreeDiagnosticHintIcon", { text = "", texthl = "DiagnosticHint" })

-- Re-define signs when NvimTree is opened
vim.api.nvim_create_autocmd({"FileType", "BufEnter", "BufRead"}, {
  pattern = {"NvimTree", "*"},
  callback = function()
    vim.fn.sign_define("NvimTreeDiagnosticErrorIcon", { text = "", texthl = "DiagnosticError" })
    vim.fn.sign_define("NvimTreeDiagnosticWarnIcon", { text = "", texthl = "DiagnosticWarn" })
    vim.fn.sign_define("NvimTreeDiagnosticInfoIcon", { text = "", texthl = "DiagnosticInfo" })
    vim.fn.sign_define("NvimTreeDiagnosticHintIcon", { text = "", texthl = "DiagnosticHint" })
  end,
})

-- Additional highlight adjustments for transparent background
vim.cmd([[
  " Make current line number more visible
  highlight CursorLineNr guifg=#ff9e64 gui=bold
  highlight LineNr guifg=#737aa2
  
  " Make matching brackets more visible
  highlight MatchParen guibg=#364a82 guifg=#c0caf5 gui=bold
  
  " Make visual selection more visible
  highlight Visual guibg=#364a82
  highlight VisualNOS guibg=#364a82
  
  " Make search more visible
  highlight Search guibg=#3d59a1 guifg=#c0caf5
  highlight IncSearch guibg=#ff9e64 guifg=#1f2335
  
  " Make diagnostics more visible
  highlight DiagnosticError guifg=#f7768e
  highlight DiagnosticWarn guifg=#e0af68
  highlight DiagnosticInfo guifg=#0db9d7
  highlight DiagnosticHint guifg=#10b981
  
  " Make diff colors more visible
  highlight DiffAdd guibg=#20303b guifg=#9ece6a
  highlight DiffChange guibg=#1f2d3d guifg=#7aa2f7
  highlight DiffDelete guibg=#37222c guifg=#f7768e
  highlight DiffText guibg=#394b70 guifg=#c0caf5
  
  " Make cursor more visible - RED cursor
  highlight Cursor guifg=bg guibg=#ff0000
  highlight iCursor guifg=bg guibg=#ff0000
  highlight CursorIM guifg=bg guibg=#ff0000
  highlight TermCursor guifg=bg guibg=#ff0000
  highlight TermCursorNC guifg=bg guibg=#cc0000
  
  " Enhance cursor visibility with bold/underline
  highlight CursorLine guibg=#292e42 gui=NONE
  highlight CursorColumn guibg=#292e42 gui=NONE
]])

-- Format on save configuration
vim.api.nvim_create_autocmd("BufWritePre", {
  callback = function()
    vim.lsp.buf.format()
  end,
})

-- Plugin configuration
require("lazy").setup({
  { import = "plugins.ui" },
  { import = "plugins.ferrite" },
  -- Colorscheme
  {
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
          -- Make comments more visible on transparent background
          colors.comment = "#9ca0b0"
          -- Make line numbers more visible
          colors.fg_gutter = "#737aa2"
          -- Make selection more visible
          colors.bg_visual = "#364a82"
          -- Make search highlights more visible
          colors.bg_search = "#3d59a1"
          -- Make current line more visible
          colors.bg_highlight = "#292e42"
        end,
        on_highlights = function(highlights, colors)
          -- Make floating windows slightly visible
          highlights.NormalFloat = { bg = colors.none, fg = colors.fg }
          highlights.FloatBorder = { bg = colors.none, fg = colors.blue }
          -- Make popup menu more visible
          highlights.Pmenu = { bg = colors.bg_dark, fg = colors.fg }
          highlights.PmenuSel = { bg = colors.bg_highlight, fg = colors.fg }
          -- Make cursor line more visible
          highlights.CursorLine = { bg = colors.bg_highlight }
          highlights.IndentBlanklineChar = { fg = colors.dark3 }
          -- Make split lines more visible
          highlights.VertSplit = { fg = colors.dark5 }
          highlights.WinSeparator = { fg = colors.dark5 }
        end,
      })
      vim.cmd.colorscheme("tokyonight-night")
    end,
  },

  -- Icons
  {
    "nvim-tree/nvim-web-devicons",
    lazy = true,
    opts = { default = true, strict = true, color_icons = true },
  },

  -- File explorer
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      vim.g.loaded_netrw = 1
      vim.g.loaded_netrwPlugin = 1
      require("nvim-tree").setup({
        sync_root_with_cwd = true,
        update_focused_file = { enable = true, update_root = false },
        view = { width = 35, side = "left" },
        renderer = {
          group_empty = true,
          highlight_git = true,
          indent_markers = { enable = true },
        },
        filters = { dotfiles = false },
        git = { enable = true },
      })
    end,
  },

  -- Statusline
  {
    "nvim-lualine/lualine.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      require("lualine").setup({
        options = {
          theme = "tokyonight",
          globalstatus = true,
          component_separators = { left = '', right = ''},
          section_separators = { left = '', right = ''},
          disabled_filetypes = {
            statusline = {},
            winbar = {},
          },
          ignore_focus = {},
          always_divide_middle = true,
          refresh = {
            statusline = 1000,
            tabline = 1000,
            winbar = 1000,
          }
        },
        sections = {
          lualine_a = {'mode'},
          lualine_b = {'branch', 'diff', 'diagnostics'},
          lualine_c = {'filename'},
          lualine_x = {'encoding', 'fileformat', 'filetype'},
          lualine_y = {'progress'},
          lualine_z = {'location'}
        },
      })
    end,
  },

  -- Bufferline
  {
    "akinsho/bufferline.nvim",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      require("bufferline").setup({
        options = {
          mode = "tabs",
          separator_style = "slant",
        },
      })
    end,
  },

  -- Fuzzy finder
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      "nvim-lua/plenary.nvim",
      {
        "nvim-telescope/telescope-fzf-native.nvim",
        build = "make",
        cond = function()
          return vim.fn.executable("make") == 1
        end,
      },
    },
    config = function()
      require("telescope").setup({
        defaults = {
          mappings = {
            i = {
              ["<C-u>"] = false,
              ["<C-d>"] = false,
            },
          },
        },
      })
      pcall(require("telescope").load_extension, "fzf")
    end,
  },

  -- Mason (Tool installer)
  {
    "williamboman/mason.nvim",
    config = function()
      require("mason").setup()
    end,
  },

  -- Mason LSP Config (disabled due to conflicts)
  -- {
  --   "williamboman/mason-lspconfig.nvim",
  --   dependencies = { "williamboman/mason.nvim" },
  --   config = function()
  --     require("mason-lspconfig").setup({})
  --   end,
  -- },

  -- Mason Tool Installer
  {
    "WhoIsSethDaniel/mason-tool-installer.nvim",
    dependencies = { "williamboman/mason.nvim" },
    config = function()
      local tools = {
        -- Python tools (ruff for linting and formatting)
        "pyright",
        "ruff",
        "debugpy", -- Python DAP
        "mypy", -- Python static type checker (nvim-lint)
        
        -- Web Development (HTML/CSS/JS/TS)
        "typescript-language-server",
        "html-lsp",
        "css-lsp",
        "eslint-lsp",
        "prettier",
        "emmet-ls",
        "tailwindcss-language-server",
        "js-debug-adapter", -- JavaScript/TypeScript DAP
        
        -- Docker  
        "dockerfile-language-server",
        
        -- YAML/JSON
        "yaml-language-server",
        
        -- Shell/Bash
        "bash-language-server",
        "shellcheck",
        "shfmt",
        
        -- Markdown
        
        -- Rust tools (conditional)
        "rust-analyzer",
        "rustfmt",
        
        -- Lua tools
        "lua-language-server",
        "stylua",
        
        -- SQL
        "sqlls",
        
        -- TOML
        "taplo", -- TOML LSP
        
        -- Additional formatters
        "prettierd", -- Faster prettier
      }
      
      -- Add Go tools only if Go is installed
      if vim.fn.executable("go") == 1 then
        vim.list_extend(tools, {
          "gofumpt",
          "goimports",
          "golangci-lint",
          "delve", -- Go DAP
        })
      end
      
      require("mason-tool-installer").setup({
        ensure_installed = tools,
      })
    end,
  },

  -- LSP Configuration
  {
    "neovim/nvim-lspconfig",
    dependencies = {
      "williamboman/mason.nvim",
      { "j-hui/fidget.nvim", opts = {} },
    },
    config = function()
      -- Neovim 0.11+ native LSP configuration.
      -- Older nvim-lspconfig per-server setup APIs are deprecated and can
      -- print stacktraces on startup with current nvim-lspconfig.
      local mason_bin = vim.fn.stdpath("data") .. "/mason/bin"
      if vim.fn.isdirectory(mason_bin) == 1 and not string.find(vim.env.PATH or "", mason_bin, 1, true) then
        vim.env.PATH = mason_bin .. ":" .. (vim.env.PATH or "")
      end

      local capabilities = vim.lsp.protocol.make_client_capabilities()
      capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

      local function has(cmd)
        return vim.fn.executable(cmd) == 1
      end

      local function enable(name, config, executables)
        if executables then
          local ok = false
          for _, exe in ipairs(executables) do
            if has(exe) then
              ok = true
              break
            end
          end
          if not ok then
            return
          end
        end
        config = vim.tbl_deep_extend("force", { capabilities = capabilities }, config or {})
        vim.lsp.config(name, config)
        vim.lsp.enable(name)
      end

      enable("pyright", {
        settings = {
          python = {
            analysis = {
              autoSearchPaths = true,
              diagnosticMode = "workspace",
              typeCheckingMode = "basic",
              useLibraryCodeForTypes = true,
            },
          },
        },
      }, { "pyright-langserver", "pyright" })

      enable("ruff", {
        init_options = {
          settings = {
            lint = { enable = true },
            format = { enable = true },
          },
        },
      }, { "ruff" })

      enable("html", {}, { "vscode-html-language-server" })
      enable("cssls", {}, { "vscode-css-language-server" })

      enable("ts_ls", {
        init_options = {
          hostInfo = "neovim",
        },
        settings = {
          typescript = {
            inlayHints = {
              includeInlayParameterNameHints = "all",
              includeInlayParameterNameHintsWhenArgumentMatchesName = false,
              includeInlayFunctionParameterTypeHints = true,
              includeInlayVariableTypeHints = true,
              includeInlayPropertyDeclarationTypeHints = true,
              includeInlayFunctionLikeReturnTypeHints = true,
              includeInlayEnumMemberValueHints = true,
            },
          },
          javascript = {
            inlayHints = {
              includeInlayParameterNameHints = "all",
              includeInlayParameterNameHintsWhenArgumentMatchesName = false,
              includeInlayFunctionParameterTypeHints = true,
              includeInlayVariableTypeHints = true,
              includeInlayPropertyDeclarationTypeHints = true,
              includeInlayFunctionLikeReturnTypeHints = true,
              includeInlayEnumMemberValueHints = true,
            },
          },
        },
      }, { "typescript-language-server" })

      enable("eslint", {
        on_attach = function(_, bufnr)
          vim.api.nvim_create_autocmd("BufWritePre", {
            buffer = bufnr,
            command = "EslintFixAll",
          })
        end,
      }, { "vscode-eslint-language-server" })

      enable("emmet_ls", {
        filetypes = {
          "html",
          "css",
          "scss",
          "javascript",
          "javascriptreact",
          "typescript",
          "typescriptreact",
        },
      }, { "emmet-ls" })

      enable("tailwindcss", {}, { "tailwindcss-language-server" })
      enable("dockerls", {}, { "docker-langserver" })

      enable("yamlls", {
        settings = {
          yaml = {
            schemas = {
              ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
              ["https://json.schemastore.org/github-action.json"] = "/.github/actions/*/action.yml",
              ["https://json.schemastore.org/docker-compose.json"] = "/docker-compose.yml",
            },
          },
        },
      }, { "yaml-language-server" })

      enable("jsonls", {
        settings = {
          json = { validate = { enable = true } },
        },
      }, { "vscode-json-language-server" })

      enable("bashls", {}, { "bash-language-server" })
      enable("sqlls", {}, { "sql-language-server" })
      enable("taplo", {}, { "taplo" })

      if has("go") then
        local go_bin = vim.fn.expand("$HOME/go/bin")
        if vim.fn.isdirectory(go_bin) == 1 and not string.find(vim.env.PATH or "", go_bin, 1, true) then
          vim.env.PATH = go_bin .. ":" .. (vim.env.PATH or "")
        end
        enable("gopls", {
          settings = {
            gopls = {
              analyses = {
                unusedparams = true,
                unreachable = true,
                unusedwrite = true,
              },
              staticcheck = true,
              gofumpt = true,
            },
          },
        }, { "gopls" })
      end

      enable("rust_analyzer", {
        settings = {
          ["rust-analyzer"] = {
            cargo = {
              allFeatures = true,
              loadOutDirsFromCheck = true,
              runBuildScripts = true,
            },
            checkOnSave = {
              allFeatures = true,
              command = "clippy",
              extraArgs = { "--no-deps" },
            },
            procMacro = { enable = true },
          },
        },
      }, { "rust-analyzer" })

      enable("lua_ls", {
        settings = {
          Lua = {
            completion = { callSnippet = "Replace" },
            diagnostics = {
              disable = { "missing-fields" },
              globals = { "vim" },
            },
            workspace = {
              library = vim.api.nvim_get_runtime_file("", true),
              checkThirdParty = false,
            },
          },
        },
      }, { "lua-language-server" })
    end,
  },

  -- Autocompletion
  {
    "hrsh7th/nvim-cmp",
    event = "InsertEnter",
    dependencies = {
      {
        "L3MON4D3/LuaSnip",
        build = "make install_jsregexp",
      },
      "saadparwaiz1/cmp_luasnip",
      "hrsh7th/cmp-nvim-lsp",
      "hrsh7th/cmp-path",
      "hrsh7th/cmp-buffer",
      "rafamadriz/friendly-snippets",
    },
    config = function()
      local cmp = require("cmp")
      local luasnip = require("luasnip")
      luasnip.config.setup({})

      cmp.setup({
        snippet = {
          expand = function(args)
            luasnip.lsp_expand(args.body)
          end,
        },
        completion = { completeopt = "menu,menuone,noinsert" },
        mapping = cmp.mapping.preset.insert({
          ["<C-n>"] = cmp.mapping.select_next_item(),
          ["<C-p>"] = cmp.mapping.select_prev_item(),
          ["<C-b>"] = cmp.mapping.scroll_docs(-4),
          ["<C-f>"] = cmp.mapping.scroll_docs(4),
          ["<C-y>"] = cmp.mapping.confirm({ select = true }),
          ["<C-Space>"] = cmp.mapping.complete({}),
          ["<C-l>"] = cmp.mapping(function()
            if luasnip.expand_or_locally_jumpable() then
              luasnip.expand_or_jump()
            end
          end, { "i", "s" }),
          ["<C-h>"] = cmp.mapping(function()
            if luasnip.locally_jumpable(-1) then
              luasnip.jump(-1)
            end
          end, { "i", "s" }),
        }),
        sources = {
          { name = "nvim_lsp" },
          { name = "luasnip" },
          { name = "path" },
          { name = "buffer" },
        },
      })
    end,
  },

  -- Formatting and linting
  {
    "stevearc/conform.nvim",
    opts = {
      notify_on_error = false,
      format_on_save = function(bufnr)
        local disable_filetypes = { c = true, cpp = true }
        return {
          timeout_ms = 500,
          lsp_fallback = not disable_filetypes[vim.bo[bufnr].filetype],
        }
      end,
      formatters_by_ft = {
        python = { "ruff_format", "ruff_organize_imports" },
        javascript = { { "prettierd", "prettier" } },
        typescript = { { "prettierd", "prettier" } },
        javascriptreact = { { "prettierd", "prettier" } },
        typescriptreact = { { "prettierd", "prettier" } },
        html = { { "prettierd", "prettier" } },
        css = { { "prettierd", "prettier" } },
        scss = { { "prettierd", "prettier" } },
        json = { { "prettierd", "prettier" } },
        yaml = { { "prettierd", "prettier" } },
        markdown = { { "prettierd", "prettier" } },
        go = { "gofumpt", "goimports" },
        rust = { "rustfmt" },
        lua = { "stylua" },
        sh = { "shfmt" },
        bash = { "shfmt" },
        sql = { "sqlfluff" },
        toml = { "taplo" },
        dockerfile = { "dockerfile_lint" },
      },
      formatters = {
        ruff_format = {
          command = "uvx",
          args = { "ruff", "format", "--stdin-filename", "$FILENAME", "-" },
        },
      },
    },
  },

  -- Linting (mypy for Python; ESLint via LSP for JS/TS)
  {
    "mfussenegger/nvim-lint",
    event = { "BufReadPost", "BufWritePost", "InsertLeave" },
    config = function()
      local lint = require("lint")
      lint.linters_by_ft = {
        python = { "mypy" },
      }

      local group = vim.api.nvim_create_augroup("nvim_lint", { clear = true })
      vim.api.nvim_create_autocmd({ "BufReadPost", "BufWritePost", "InsertLeave" }, {
        group = group,
        callback = function()
          local linters = lint.linters_by_ft[vim.bo.filetype]
          if linters and #linters > 0 then
            lint.try_lint()
          end
        end,
      })
    end,
  },

  -- Syntax highlighting
  {
    "nvim-treesitter/nvim-treesitter",
    build = ":TSUpdate",
    config = function()
      require("nvim-treesitter.configs").setup({
        ensure_installed = { 
        "python", 
        "typescript", 
        "javascript", 
        "tsx", 
        -- "jsx", -- JSX is included in tsx parser
        "html", 
        "css", 
        "scss",
        "json", 
        "yaml", 
        "toml",
        "go", 
        "rust", 
        "lua", 
        "vim", 
        "vimdoc", 
        "markdown",
        "dockerfile",
        "bash",
        "sql",
        "regex",
        "gitignore",
        "gitcommit",
      },
        auto_install = true,
        highlight = {
          enable = true,
          additional_vim_regex_highlighting = { "ruby" },
        },
        indent = { enable = true, disable = { "ruby" } },
      })
    end,
  },

  -- Git integration
  {
    "lewis6991/gitsigns.nvim",
    opts = {
      signs = {
        add = { text = "+" },
        change = { text = "~" },
        delete = { text = "_" },
        topdelete = { text = "‾" },
        changedelete = { text = "~" },
      },
      on_attach = function(bufnr)
        local gs = package.loaded.gitsigns
        local function map(mode, lhs, rhs, desc)
          vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = desc })
        end

        map("n", "]g", function()
          if vim.wo.diff then
            vim.cmd.normal({ "]c", bang = true })
          else
            gs.nav_hunk("next")
          end
        end, "Next Git hunk")

        map("n", "[g", function()
          if vim.wo.diff then
            vim.cmd.normal({ "[c", bang = true })
          else
            gs.nav_hunk("prev")
          end
        end, "Previous Git hunk")

        map("n", "<leader>gp", gs.preview_hunk, "Preview Git hunk")
        map("n", "<leader>gb", function()
          gs.blame_line({ full = true })
        end, "Git blame line")
        map("n", "<leader>gs", gs.stage_hunk, "Stage Git hunk")
        map("n", "<leader>gr", gs.reset_hunk, "Reset Git hunk")
        map("v", "<leader>gs", function()
          gs.stage_hunk({ vim.fn.line("."), vim.fn.line("v") })
        end, "Stage selected Git hunk")
        map("v", "<leader>gr", function()
          gs.reset_hunk({ vim.fn.line("."), vim.fn.line("v") })
        end, "Reset selected Git hunk")
      end,
    },
  },

  {
    "kdheepak/lazygit.nvim",
    cmd = {
      "LazyGit",
      "LazyGitConfig",
      "LazyGitCurrentFile",
      "LazyGitFilter",
      "LazyGitFilterCurrentFile",
    },
    dependencies = { "nvim-lua/plenary.nvim" },
    keys = {
      { "<leader>gg", "<cmd>LazyGit<cr>", desc = "LazyGit" },
      { "<leader>gf", "<cmd>LazyGitCurrentFile<cr>", desc = "LazyGit current file" },
    },
  },

  {
    "sindrets/diffview.nvim",
    cmd = {
      "DiffviewOpen",
      "DiffviewClose",
      "DiffviewToggleFiles",
      "DiffviewFocusFiles",
      "DiffviewFileHistory",
      "DiffviewRefresh",
    },
    dependencies = { "nvim-lua/plenary.nvim", "nvim-tree/nvim-web-devicons" },
    keys = {
      { "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diffview working tree" },
      { "<leader>gh", "<cmd>DiffviewFileHistory %<cr>", desc = "Git file history" },
    },
    opts = {
      enhanced_diff_hl = true,
      default_args = {
        DiffviewOpen = { "--imply-local", "--unified=999999" },
      },
      view = {
        default = {
          layout = "diff2_horizontal",
          disable_diagnostics = false,
        },
        file_history = {
          layout = "diff2_horizontal",
          disable_diagnostics = false,
        },
      },
      file_panel = {
        listing_style = "tree",
        win_config = {
          position = "left",
          width = 35,
        },
      },
    },
  },

  -- Terminal
  {
    "akinsho/toggleterm.nvim",
    config = function()
      require("toggleterm").setup({
        size = 20,
        open_mapping = [[<c-\>]],
        direction = "float",
        float_opts = {
          border = "curved",
        },
      })
    end,
  },


  -- Comments
  {
    "numToStr/Comment.nvim",
    opts = {},
  },

  -- Auto pairs
  {
    "windwp/nvim-autopairs",
    event = "InsertEnter",
    config = true,
  },

  -- Testing support
  {
    "nvim-neotest/neotest",
    dependencies = {
      "nvim-neotest/nvim-nio",
      "nvim-lua/plenary.nvim",
      "nvim-treesitter/nvim-treesitter",
      "nvim-neotest/neotest-python",
      "nvim-neotest/neotest-go",
      "rouge8/neotest-rust",
      "nvim-neotest/neotest-jest", -- JavaScript/TypeScript testing
    },
    config = function()
      require("neotest").setup({
        adapters = {
          require("neotest-python")({
            dap = { justMyCode = false },
            args = { "--log-level", "DEBUG" },
            runner = "pytest",
          }),
          require("neotest-go"),
          require("neotest-rust"),
          require("neotest-jest")({
            jestCommand = "npm test --",
            jestConfigFile = "jest.config.js",
            env = { CI = true },
            cwd = function(path)
              return vim.fn.getcwd()
            end,
          }),
        },
      })
    end,
  },

  -- Claude Code integration
  {
    "greggh/claude-code.nvim",
    dependencies = { "nvim-lua/plenary.nvim" },
    config = function()
      require("claude-code").setup({
        -- Claude Code executable path (auto-detected if in PATH)
        claude_code_path = "claude",
        
        -- Default model to use
        model = "claude-3-opus-20240229",
        
        -- Window settings
        window = {
          width = 80,
          height = 20,
          border = "rounded",
        },
        
        -- Keymaps (set to false to disable)
        keymaps = {
          -- Send selected text to Claude
          send_selection = "<leader>cs",
          -- Send current buffer to Claude
          send_buffer = "<leader>cb",
          -- Open Claude chat
          open_chat = "<leader>cc",
          -- Apply Claude's suggestion
          apply_suggestion = "<leader>ca",
        },
        
        -- Auto-save before sending to Claude
        auto_save = true,
        
        -- Show notifications
        notify = true,
      })
    end,
  },


  -- Enhanced markdown editing
  {
    "plasticboy/vim-markdown",
    ft = { "markdown" },
    dependencies = { "godlygeek/tabular" },
    config = function()
      vim.g.vim_markdown_folding_disabled = 1
      vim.g.vim_markdown_conceal = 0
      vim.g.vim_markdown_math = 1
      vim.g.vim_markdown_frontmatter = 1
      vim.g.vim_markdown_strikethrough = 1
      vim.g.vim_markdown_autowrite = 1
      vim.g.vim_markdown_edit_url_in = "tab"
      vim.g.vim_markdown_follow_anchor = 1
    end,
  },

  -- Debug Adapter Protocol (DAP)
  {
    "mfussenegger/nvim-dap",
    dependencies = {
      "rcarriga/nvim-dap-ui",
      "theHamsta/nvim-dap-virtual-text",
      "nvim-neotest/nvim-nio",
      "williamboman/mason.nvim",
    },
    config = function()
      local dap = require("dap")
      local dapui = require("dapui")

      -- Setup DAP UI with custom configuration
      dapui.setup({
        icons = { expanded = "▾", collapsed = "▸", current_frame = "▸" },
        mappings = {
          -- Use a table to apply multiple mappings
          expand = { "<CR>", "<2-LeftMouse>" },
          open = "o",
          remove = "d",
          edit = "e",
          repl = "r",
          toggle = "t",
        },
        expand_lines = vim.fn.has("nvim-0.7") == 1,
        layouts = {
          {
            elements = {
              -- Elements can be strings or a table with id and size keys.
              { id = "scopes", size = 0.25 },
              "breakpoints",
              "stacks",
              "watches",
            },
            size = 40, -- 40 columns
            position = "left",
          },
          {
            elements = {
              "repl",
              "console",
            },
            size = 0.25, -- 25% of total lines
            position = "bottom",
          },
        },
        controls = {
          -- Requires Neovim nightly (or 0.8 when released)
          enabled = true,
          -- Display controls in this element
          element = "repl",
          icons = {
            pause = "",
            play = "",
            step_into = "",
            step_over = "",
            step_out = "",
            step_back = "",
            run_last = "↻",
            terminate = "□",
          },
        },
        floating = {
          max_height = nil, -- These can be integers or a float between 0 and 1.
          max_width = nil, -- Floats will be treated as percentage of your screen.
          border = "rounded", -- Border style. Can be "single", "double" or "rounded"
          mappings = {
            close = { "q", "<Esc>" },
          },
        },
        windows = { indent = 1 },
        render = {
          max_type_length = nil, -- Can be integer or nil.
          max_value_lines = 100, -- Can be integer or nil.
        }
      })
      
      -- Setup virtual text with custom icons
      require("nvim-dap-virtual-text").setup({
        enabled = true,                        -- enable this plugin (the default)
        enabled_commands = true,               -- create commands DapVirtualTextEnable, DapVirtualTextDisable, DapVirtualTextToggle
        highlight_changed_variables = true,   -- highlight changed values with NvimDapVirtualTextChanged
        highlight_new_as_changed = false,     -- highlight new variables in the same way as changed variables
        show_stop_reason = true,              -- show stop reason when stopped for exceptions
        commented = false,                    -- prefix virtual text with comment string
        only_first_definition = true,         -- only show virtual text at first definition (if there are multiple)
        all_references = false,               -- show virtual text on all all references of the variable
        filter_references_pattern = '<module', -- filter references (not definitions) pattern when all_references is activated
        virt_text_pos = 'eol',               -- position of virtual text, see `:h nvim_buf_set_extmark()`
        all_frames = false,                   -- show virtual text for all stack frames not only current
        virt_lines = false,                   -- show virtual lines instead of virtual text (will flicker!)
        virt_text_win_col = nil              -- position the virtual text at a fixed window column (starting from the first text column)
      })

      -- Auto-open/close DAP UI
      dap.listeners.after.event_initialized["dapui_config"] = function()
        dapui.open()
      end
      dap.listeners.before.event_terminated["dapui_config"] = function()
        dapui.close()
      end
      dap.listeners.before.event_exited["dapui_config"] = function()
        dapui.close()
      end

      -- Python DAP
      dap.adapters.python = {
        type = "executable",
        command = "python",
        args = { "-m", "debugpy.adapter" },
      }
      dap.configurations.python = {
        {
          type = "python",
          request = "launch",
          name = "Launch file",
          program = "${file}",
          console = "integratedTerminal",
          pythonPath = function()
            local cwd = vim.fn.getcwd()
            if vim.fn.executable(cwd .. "/venv/bin/python") == 1 then
              return cwd .. "/venv/bin/python"
            elseif vim.fn.executable(cwd .. "/.venv/bin/python") == 1 then
              return cwd .. "/.venv/bin/python"
            else
              return "/usr/bin/python3"
            end
          end,
        },
        {
          type = "python",
          request = "launch",
          name = "Launch file with arguments",
          program = "${file}",
          console = "integratedTerminal",
          args = function()
            local args_string = vim.fn.input("Arguments: ")
            return vim.split(args_string, " +")
          end,
          pythonPath = function()
            local cwd = vim.fn.getcwd()
            if vim.fn.executable(cwd .. "/venv/bin/python") == 1 then
              return cwd .. "/venv/bin/python"
            elseif vim.fn.executable(cwd .. "/.venv/bin/python") == 1 then
              return cwd .. "/.venv/bin/python"
            else
              return "/usr/bin/python3"
            end
          end,
        },
        {
          type = "python",
          request = "launch",
          name = "Django",
          program = "${workspaceFolder}/manage.py",
          args = { "runserver" },
          console = "integratedTerminal",
          pythonPath = function()
            local cwd = vim.fn.getcwd()
            if vim.fn.executable(cwd .. "/venv/bin/python") == 1 then
              return cwd .. "/venv/bin/python"
            elseif vim.fn.executable(cwd .. "/.venv/bin/python") == 1 then
              return cwd .. "/.venv/bin/python"
            else
              return "/usr/bin/python3"
            end
          end,
        },
        {
          type = "python",
          request = "launch",
          name = "FastAPI",
          module = "uvicorn",
          args = { "main:app", "--reload" },
          console = "integratedTerminal",
          pythonPath = function()
            local cwd = vim.fn.getcwd()
            if vim.fn.executable(cwd .. "/venv/bin/python") == 1 then
              return cwd .. "/venv/bin/python"
            elseif vim.fn.executable(cwd .. "/.venv/bin/python") == 1 then
              return cwd .. "/.venv/bin/python"
            else
              return "/usr/bin/python3"
            end
          end,
        },
        {
          type = "python",
          request = "launch",
          name = "pytest",
          module = "pytest",
          args = { "${file}" },
          console = "integratedTerminal",
          pythonPath = function()
            local cwd = vim.fn.getcwd()
            if vim.fn.executable(cwd .. "/venv/bin/python") == 1 then
              return cwd .. "/venv/bin/python"
            elseif vim.fn.executable(cwd .. "/.venv/bin/python") == 1 then
              return cwd .. "/.venv/bin/python"
            else
              return "/usr/bin/python3"
            end
          end,
        },
      }

      -- Go DAP
      dap.adapters.delve = {
        type = "server",
        port = "${port}",
        executable = {
          command = "dlv",
          args = { "dap", "-l", "127.0.0.1:${port}" },
        },
      }
      dap.configurations.go = {
        {
          type = "delve",
          name = "Debug",
          request = "launch",
          program = "${file}",
        },
        {
          type = "delve",
          name = "Debug test",
          request = "launch",
          mode = "test",
          program = "${file}",
        },
        {
          type = "delve",
          name = "Debug test (go.mod)",
          request = "launch",
          mode = "test",
          program = "./${relativeFileDirname}",
        },
      }

      -- JavaScript/TypeScript DAP
      dap.adapters["pwa-node"] = {
        type = "server",
        host = "localhost",
        port = "${port}",
        executable = {
          command = "js-debug-adapter",
          args = { "${port}" },
        },
      }
      dap.configurations.javascript = {
        {
          type = "pwa-node",
          request = "launch",
          name = "Launch file",
          program = "${file}",
          cwd = "${workspaceFolder}",
        },
      }
      dap.configurations.typescript = {
        {
          type = "pwa-node",
          request = "launch",
          name = "Launch file",
          program = "${file}",
          cwd = "${workspaceFolder}",
          runtimeExecutable = "npx",
          runtimeArgs = { "ts-node" },
        },
      }

      -- Rust DAP
      dap.adapters.codelldb = {
        type = "server",
        port = "${port}",
        executable = {
          command = "codelldb",
          args = { "--port", "${port}" },
        }
      }
      dap.configurations.rust = {
        {
          name = "Launch",
          type = "codelldb",
          request = "launch",
          program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/target/debug/", "file")
          end,
          cwd = "${workspaceFolder}",
          stopOnEntry = false,
          args = {},
        },
        {
          name = "Launch with arguments",
          type = "codelldb",
          request = "launch",
          program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/target/debug/", "file")
          end,
          cwd = "${workspaceFolder}",
          stopOnEntry = false,
          args = function()
            local args_string = vim.fn.input("Arguments: ")
            return vim.split(args_string, " +")
          end,
        },
      }

      -- C/C++ DAP (using CodeLLDB for better compatibility)
      dap.configurations.cpp = {
        {
          name = "Launch",
          type = "codelldb",
          request = "launch",
          program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/", "file")
          end,
          cwd = "${workspaceFolder}",
          stopOnEntry = false,
          args = {},
        },
        {
          name = "Launch with arguments",
          type = "codelldb",
          request = "launch",
          program = function()
            return vim.fn.input("Path to executable: ", vim.fn.getcwd() .. "/", "file")
          end,
          cwd = "${workspaceFolder}",
          stopOnEntry = false,
          args = function()
            local args_string = vim.fn.input("Arguments: ")
            return vim.split(args_string, " +")
          end,
        },
      }
      dap.configurations.c = dap.configurations.cpp

      -- Custom DAP signs
      vim.fn.sign_define("DapBreakpoint", { text = "🔴", texthl = "DiagnosticError" })
      vim.fn.sign_define("DapBreakpointCondition", { text = "🟡", texthl = "DiagnosticWarn" })
      vim.fn.sign_define("DapBreakpointRejected", { text = "⚪", texthl = "DiagnosticInfo" })
      vim.fn.sign_define("DapStopped", { text = "▶️", texthl = "DiagnosticInfo" })
      vim.fn.sign_define("DapLogPoint", { text = "📝", texthl = "DiagnosticInfo" })
    end,
  },

  -- Database viewers
  {
    "kristijanhusak/vim-dadbod-ui",
    dependencies = {
      { "tpope/vim-dadbod", lazy = true },
      { "kristijanhusak/vim-dadbod-completion", ft = { "sql", "mysql", "plsql" }, lazy = true },
    },
    cmd = {
      "DBUI",
      "DBUIToggle",
      "DBUIAddConnection",
      "DBUIFindBuffer",
    },
    init = function()
      -- Your DBUI configuration
      vim.g.db_ui_use_nerd_fonts = 1
      vim.g.db_ui_show_database_icon = 1
      vim.g.db_ui_force_echo_messages = 1
      vim.g.db_ui_win_position = "left"
      vim.g.db_ui_winwidth = 40
      
      -- Disable vim-dadbod-completion in certain filetypes
      vim.g.db_ui_disable_mappings = 0
    end,
    keys = {
      { "<leader>Db", ":DBUIToggle<CR>", desc = "Toggle DBUI" },
      { "<leader>Df", ":DBUIFindBuffer<CR>", desc = "Find DB Buffer" },
      { "<leader>Dr", ":DBUIRename<CR>", desc = "Rename DB Buffer" },
      { "<leader>Dq", ":DBUILastQueryInfo<CR>", desc = "Last Query Info" },
    },
    config = function()
      -- SQL 실행 키맵 (vim-dadbod)
      vim.api.nvim_create_autocmd("FileType", {
        pattern = { "sql", "mysql", "plsql" },
        callback = function()
          -- 현재 줄 실행
          vim.keymap.set("n", "<leader>De", "<Plug>(DBUI_ExecuteQuery)", { buffer = true, desc = "Execute query under cursor" })
          -- 선택된 쿼리 실행

          vim.keymap.set("v", "<leader>De", "<Plug>(DBUI_ExecuteQuery)", { buffer = true, desc = "Execute selected query" })
          -- 전체 파일 실행
          vim.keymap.set("n", "<leader>DE", ":%DB<CR>", { buffer = true, desc = "Execute entire file" })
          -- 쿼리 저장 후 실행
          vim.keymap.set("n", "<leader>Dw", ":w<CR>:DBUIFindBuffer<CR>", { buffer = true, desc = "Save and execute" })
        end,
      })
    end,
  },
})

-- Key mappings
local keymap = vim.keymap

-- Basic movements
keymap.set("n", "<C-s>", ":w<CR>", { desc = "Save file" })
keymap.set("n", "<leader>q", ":q<CR>", { desc = "Quit" })
keymap.set("n", "<leader>Q", ":qa!<CR>", { desc = "Quit all without saving" })

-- File explorer
keymap.set("n", "<leader>e", ":NvimTreeToggle<CR>", { desc = "Toggle file explorer" })

-- Telescope
keymap.set("n", "<leader>ff", require("telescope.builtin").find_files, { desc = "Find files" })
keymap.set("n", "<leader>fg", require("telescope.builtin").live_grep, { desc = "Live grep" })
keymap.set("n", "<leader>fb", require("telescope.builtin").buffers, { desc = "Find buffers" })
keymap.set("n", "<leader>fh", require("telescope.builtin").help_tags, { desc = "Help tags" })


local function git_output(args)
  local result = vim.system(vim.list_extend({ "git" }, args), { text = true }):wait()
  if result.code ~= 0 then
    return nil
  end
  return vim.trim(result.stdout or "")
end

local function git_rev_exists(rev)
  return git_output({ "rev-parse", "--verify", rev .. "^{commit}" }) ~= nil
end

local function add_git_base_candidate(candidates, seen, rev)
  if rev and rev ~= "" and not seen[rev] and git_rev_exists(rev) then
    seen[rev] = true
    table.insert(candidates, rev)
  end
end

local function resolve_git_base_ref()
  local candidates = {}
  local seen = {}
  local branch = git_output({ "branch", "--show-current" }) or ""

  if vim.fn.executable("gh") == 1 then
    local pr_base = vim.system({ "gh", "pr", "view", "--json", "baseRefName", "--jq", ".baseRefName" }, { text = true }):wait()
    if pr_base.code == 0 then
      local base = vim.trim(pr_base.stdout or "")
      add_git_base_candidate(candidates, seen, "origin/" .. base)
      add_git_base_candidate(candidates, seen, base)
    end
  end

  add_git_base_candidate(candidates, seen, git_output({ "config", "branch." .. branch .. ".mergeBase" }))
  add_git_base_candidate(candidates, seen, git_output({ "config", "branch." .. branch .. ".gh-merge-base" }))

  local upstream = git_output({ "rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}" })
  local upstream_branch = upstream and upstream:match("([^/]+)$") or nil
  if upstream and upstream ~= "" and upstream_branch ~= branch then
    add_git_base_candidate(candidates, seen, upstream)
  end

  local origin_head = git_output({ "symbolic-ref", "--short", "refs/remotes/origin/HEAD" })
  add_git_base_candidate(candidates, seen, origin_head)
  add_git_base_candidate(candidates, seen, "origin/main")
  add_git_base_candidate(candidates, seen, "origin/master")
  add_git_base_candidate(candidates, seen, "main")
  add_git_base_candidate(candidates, seen, "master")

  return candidates[1]
end

local function open_diffview_branch()
  local base = resolve_git_base_ref()
  if not base then
    vim.notify("No git base branch found for Diffview", vim.log.levels.ERROR)
    return
  end
  vim.cmd("DiffviewOpen " .. base .. "...HEAD")
  vim.notify("Diffview base: " .. base .. "...HEAD", vim.log.levels.INFO)
end

keymap.set("n", "<leader>gD", open_diffview_branch, { desc = "Diffview smart branch diff" })
-- Diff navigation
keymap.set("n", "<leader>g]", function()
  vim.cmd("normal! ]c")
  vim.cmd("normal! zz")
end, { desc = "Next diff change" })
keymap.set("n", "<leader>g[", function()
  vim.cmd("normal! [c")
  vim.cmd("normal! zz")
end, { desc = "Previous diff change" })



-- Diagnostics
keymap.set("n", "<leader>dd", function()
  vim.diagnostic.open_float({ scope = "line", border = "rounded" })
end, { desc = "Show line diagnostics" })
keymap.set("n", "[d", function()
  vim.diagnostic.jump({ count = -1, float = true })
end, { desc = "Previous diagnostic" })
keymap.set("n", "]d", function()
  vim.diagnostic.jump({ count = 1, float = true })
end, { desc = "Next diagnostic" })
keymap.set("n", "<leader>dq", vim.diagnostic.setqflist, { desc = "Diagnostics to quickfix" })
-- LSP
vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("lsp-attach", { clear = true }),
  callback = function(event)
    local map = function(keys, func, desc)
      keymap.set("n", keys, func, { buffer = event.buf, desc = "LSP: " .. desc })
    end

    map("gd", require("telescope.builtin").lsp_definitions, "Goto Definition")
    map("gr", require("telescope.builtin").lsp_references, "Goto References")
    map("gI", require("telescope.builtin").lsp_implementations, "Goto Implementation")
    map("<leader>D", require("telescope.builtin").lsp_type_definitions, "Type Definition")
    map("<leader>ds", require("telescope.builtin").lsp_document_symbols, "Document Symbols")
    map("<leader>ws", require("telescope.builtin").lsp_dynamic_workspace_symbols, "Workspace Symbols")
    map("<leader>rn", vim.lsp.buf.rename, "Rename")
    map("<leader>ca", vim.lsp.buf.code_action, "Code Action")
    map("K", vim.lsp.buf.hover, "Hover Documentation")
    map("gD", vim.lsp.buf.declaration, "Goto Declaration")
  end,
})

-- Testing
keymap.set("n", "<leader>tt", function() require("neotest").run.run() end, { desc = "Run nearest test" })
keymap.set("n", "<leader>tf", function() require("neotest").run.run(vim.fn.expand("%")) end, { desc = "Run file tests" })
keymap.set("n", "<leader>ts", function() require("neotest").summary.toggle() end, { desc = "Toggle test summary" })

-- Debugging (DAP)
keymap.set("n", "<leader>db", function() require("dap").toggle_breakpoint() end, { desc = "Toggle Breakpoint" })
keymap.set("n", "<leader>dB", function() require("dap").set_breakpoint(vim.fn.input("Breakpoint condition: ")) end, { desc = "Conditional Breakpoint" })
keymap.set("n", "<leader>dc", function() require("dap").continue() end, { desc = "Continue" })
keymap.set("n", "<leader>di", function() require("dap").step_into() end, { desc = "Step Into" })
keymap.set("n", "<leader>do", function() require("dap").step_over() end, { desc = "Step Over" })
keymap.set("n", "<leader>dO", function() require("dap").step_out() end, { desc = "Step Out" })
keymap.set("n", "<leader>dr", function() require("dap").repl.toggle() end, { desc = "Toggle REPL" })
keymap.set("n", "<leader>dl", function() require("dap").run_last() end, { desc = "Run Last" })
keymap.set("n", "<leader>du", function() require("dapui").toggle() end, { desc = "Toggle Debug UI" })
keymap.set("n", "<leader>dt", function() require("dap").terminate() end, { desc = "Terminate" })
keymap.set("n", "<leader>dx", function() require("dap").clear_breakpoints() end, { desc = "Clear All Breakpoints" })
keymap.set("n", "<leader>dp", function() require("dap").pause() end, { desc = "Pause" })
keymap.set("n", "<leader>dR", function() require("dap").restart() end, { desc = "Restart" })
keymap.set("n", "<leader>ds", function() require("dap").session() end, { desc = "Show Session" })
keymap.set("n", "<leader>dh", function() require("dap.ui.widgets").hover() end, { desc = "Hover Variables" })
keymap.set("n", "<leader>dS", function() require("dap.ui.widgets").scopes() end, { desc = "Scopes" })
keymap.set("v", "<leader>de", function() require("dapui").eval() end, { desc = "Evaluate Selection" })
keymap.set("n", "<leader>de", function() require("dapui").eval() end, { desc = "Evaluate Expression" })
keymap.set("n", "<leader>df", function() require("dapui").float_element() end, { desc = "Float Element" })

-- Terminal
keymap.set("t", "<esc>", [[<C-\><C-n>]], { desc = "Exit terminal mode" })


-- Highlight on yank
vim.api.nvim_create_autocmd("TextYankPost", {
  desc = "Highlight when yanking text",
  group = vim.api.nvim_create_augroup("highlight-yank", { clear = true }),
  callback = function()
    vim.highlight.on_yank()
  end,
})
