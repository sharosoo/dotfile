-- LSP Plugins Configuration
-- This file is managed by dotfiles - https://github.com/sharosoo/dotfile

-- Shared configuration for all LSP servers
local get_common_on_attach = function()
  return function(client, bufnr)
    local opts = { noremap = true, silent = true, buffer = bufnr }
    local keymap = vim.keymap
    
    -- Keybindings
    opts.desc = "Show LSP references"
    keymap.set("n", "gR", "<cmd>Telescope lsp_references<CR>", opts)
    
    opts.desc = "Go to declaration"
    keymap.set("n", "gD", vim.lsp.buf.declaration, opts)
    
    opts.desc = "Show LSP definitions"
    keymap.set("n", "gd", "<cmd>Telescope lsp_definitions<CR>", opts)
    
    opts.desc = "Show LSP implementations"
    keymap.set("n", "gi", "<cmd>Telescope lsp_implementations<CR>", opts)
    
    opts.desc = "Show LSP type definitions"
    keymap.set("n", "gt", "<cmd>Telescope lsp_type_definitions<CR>", opts)
    
    opts.desc = "See available code actions"
    keymap.set({ "n", "v" }, "<leader>ca", vim.lsp.buf.code_action, opts)
    
    opts.desc = "Smart rename"
    keymap.set("n", "<leader>rn", vim.lsp.buf.rename, opts)
    
    opts.desc = "Show buffer diagnostics"
    keymap.set("n", "<leader>D", "<cmd>Telescope diagnostics bufnr=0<CR>", opts)
    
    opts.desc = "Show line diagnostics"
    keymap.set("n", "<leader>d", vim.diagnostic.open_float, opts)
    
    opts.desc = "Go to previous diagnostic"
    keymap.set("n", "[d", vim.diagnostic.goto_prev, opts)
    
    opts.desc = "Go to next diagnostic"
    keymap.set("n", "]d", vim.diagnostic.goto_next, opts)
    
    opts.desc = "Show documentation for what is under cursor"
    keymap.set("n", "K", vim.lsp.buf.hover, opts)
    
    opts.desc = "Restart LSP"
    keymap.set("n", "<leader>rs", ":LspRestart<CR>", opts)
  end
end

return {
  -- LSP Config
  {
    "neovim/nvim-lspconfig",
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "hrsh7th/cmp-nvim-lsp",
      { "antosha417/nvim-lsp-file-operations", config = true },
      "williamboman/mason.nvim",
      "williamboman/mason-lspconfig.nvim",
    },
    config = function()
      local lspconfig = require("lspconfig")
      local cmp_nvim_lsp = require("cmp_nvim_lsp")

      local on_attach = get_common_on_attach()

      -- Used to enable autocompletion
      local capabilities = cmp_nvim_lsp.default_capabilities()

      -- Change the Diagnostic symbols in the sign column (gutter)
      local signs = { Error = " ", Warn = " ", Hint = "󰠠 ", Info = " " }
      for type, icon in pairs(signs) do
        local hl = "DiagnosticSign" .. type
        vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = "" })
      end

      -- Manual server configurations are now handled by mason-lspconfig.setup_handlers
      -- This prevents duplicate configurations and potential conflicts
    end,
  },

  -- Mason
  {
    "williamboman/mason.nvim",
    dependencies = {
      "williamboman/mason-lspconfig.nvim",
      "WhoIsSethDaniel/mason-tool-installer.nvim",
    },
    config = function()
      local mason = require("mason")
      local mason_lspconfig = require("mason-lspconfig")
      local mason_tool_installer = require("mason-tool-installer")
      local lspconfig = require("lspconfig")
      local cmp_nvim_lsp = require("cmp_nvim_lsp")

      mason.setup({
        ui = {
          icons = {
            package_installed = "✓",
            package_pending = "➜",
            package_uninstalled = "✗",
          },
        },
      })

      -- Setup mason-lspconfig
      mason_lspconfig.setup({
        ensure_installed = {
          "ts_ls",
          "html",
          "cssls",
          "tailwindcss",
          "svelte",
          "lua_ls",
          "graphql",
          "emmet_ls",
          "prismals",
          "pyright",
          "gopls",
          "rust_analyzer",
          "clangd",
          "jdtls",
          "terraformls",
          "tflint",
        },
        automatic_installation = true,
      })
      
      -- Define server configurations
      local server_configs = {
        -- Default config for all servers
        default = {
          capabilities = cmp_nvim_lsp.default_capabilities(),
          on_attach = get_common_on_attach(),
        },
        -- Server-specific configs
        lua_ls = {
          capabilities = cmp_nvim_lsp.default_capabilities(),
          on_attach = get_common_on_attach(),
          settings = {
            Lua = {
              diagnostics = {
                globals = { "vim" },
              },
              workspace = {
                library = {
                  [vim.fn.expand("$VIMRUNTIME/lua")] = true,
                  [vim.fn.stdpath("config") .. "/lua"] = true,
                },
              },
            },
          },
        },
        emmet_ls = {
          capabilities = cmp_nvim_lsp.default_capabilities(),
          on_attach = get_common_on_attach(),
          filetypes = {
            "html",
            "typescriptreact",
            "javascriptreact",
            "css",
            "sass",
            "scss",
            "less",
            "svelte",
          },
        },
        ts_ls = {
          capabilities = cmp_nvim_lsp.default_capabilities(),
          on_attach = get_common_on_attach(),
          init_options = {
            preferences = {
              disableSuggestions = true,
            },
          },
        },
      }
      
      -- Setup each LSP server
      local function setup_servers()
        -- Get list of installed servers
        local installed_servers = mason_lspconfig.get_installed_servers()
        
        for _, server_name in ipairs(installed_servers) do
          local config = server_configs[server_name] or server_configs.default
          lspconfig[server_name].setup(config)
        end
      end
      
      -- Setup servers after a small delay to ensure mason-lspconfig is ready
      vim.defer_fn(setup_servers, 100)

      mason_tool_installer.setup({
        ensure_installed = {
          "prettier",
          "stylua",
          "isort",
          "black",
          "pylint",
          "eslint_d",
          "gofumpt",
          "goimports",
          "golangci-lint",
          "rustfmt",
        },
      })
    end,
  },

  -- None-ls (formatting & linting)
  {
    "nvimtools/none-ls.nvim",
    lazy = true,
    event = { "BufReadPre", "BufNewFile" },
    dependencies = {
      "jay-babu/mason-null-ls.nvim",
    },
    config = function()
      local mason_null_ls = require("mason-null-ls")
      local null_ls = require("null-ls")

      local null_ls_utils = require("null-ls.utils")

      mason_null_ls.setup({
        ensure_installed = {
          "prettier",
          "stylua",
          "black",
          "pylint",
          "eslint_d",
          "gofumpt",
          "goimports",
          "golangci-lint",
          "rustfmt",
        },
      })

      local formatting = null_ls.builtins.formatting
      local diagnostics = null_ls.builtins.diagnostics

      local augroup = vim.api.nvim_create_augroup("LspFormatting", {})

      null_ls.setup({
        root_dir = null_ls_utils.root_pattern(".null-ls-root", "Makefile", ".git", "package.json"),
        sources = {
          formatting.prettier.with({
            extra_filetypes = { "svelte" },
          }),
          formatting.stylua,
          formatting.isort,
          formatting.black,
          formatting.gofumpt,
          formatting.goimports,
          formatting.rustfmt,
          formatting.terraform_fmt,
          diagnostics.eslint_d.with({
            condition = function(utils)
              return utils.root_has_file({ ".eslintrc.js", ".eslintrc.json" })
            end,
          }),
          diagnostics.pylint,
          diagnostics.golangci_lint,
          diagnostics.terraform_validate,
        },
        on_attach = function(current_client, bufnr)
          if current_client.supports_method("textDocument/formatting") then
            vim.api.nvim_clear_autocmds({ group = augroup, buffer = bufnr })
            vim.api.nvim_create_autocmd("BufWritePre", {
              group = augroup,
              buffer = bufnr,
              callback = function()
                vim.lsp.buf.format({
                  filter = function(client)
                    return client.name == "null-ls"
                  end,
                  bufnr = bufnr,
                })
              end,
            })
          end
        end,
      })
    end,
  },
}