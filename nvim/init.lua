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
          -- Make indent lines more visible
          highlights.IndentBlanklineChar = { fg = colors.dark3 }
          -- Make split lines more visible
          highlights.VertSplit = { fg = colors.dark5 }
          highlights.WinSeparator = { fg = colors.dark5 }
        end,
      })
      vim.cmd.colorscheme("tokyonight-night")
    end,
  },

  -- Icons (must be loaded before nvim-tree)
  {
    "nvim-tree/nvim-web-devicons",
    config = function()
      require("nvim-web-devicons").setup({
        override = {
          zsh = {
            icon = "",
            color = "#428850",
            cterm_color = "65",
            name = "Zsh"
          },
          js = {
            icon = "",
            color = "#cbcb41",
            cterm_color = "185",
            name = "Js"
          },
          ts = {
            icon = "",
            color = "#519aba",
            cterm_color = "67",
            name = "Ts"
          },
          jsx = {
            icon = "",
            color = "#61dafb",
            cterm_color = "81",
            name = "Jsx"
          },
          tsx = {
            icon = "",
            color = "#519aba",
            cterm_color = "67",
            name = "Tsx"
          },
          py = {
            icon = "",
            color = "#3572a5",
            cterm_color = "61",
            name = "Py"
          },
          go = {
            icon = "",
            color = "#00add8",
            cterm_color = "32",
            name = "Go"
          },
          rs = {
            icon = "",
            color = "#dea584",
            cterm_color = "180",
            name = "Rs"
          },
          lua = {
            icon = "",
            color = "#51a0cf",
            cterm_color = "74",
            name = "Lua"
          },
          json = {
            icon = "",
            color = "#cbcb41",
            cterm_color = "185",
            name = "Json"
          },
          yaml = {
            icon = "",
            color = "#fbc02d",
            cterm_color = "220",
            name = "Yaml"
          },
          yml = {
            icon = "",
            color = "#fbc02d",
            cterm_color = "220",
            name = "Yml"
          },
          toml = {
            icon = "",
            color = "#9c4221",
            cterm_color = "124",
            name = "Toml"
          },
          md = {
            icon = "",
            color = "#519aba",
            cterm_color = "67",
            name = "Md"
          },
          html = {
            icon = "",
            color = "#e34c26",
            cterm_color = "196",
            name = "Html"
          },
          css = {
            icon = "",
            color = "#563d7c",
            cterm_color = "54",
            name = "Css"
          },
          scss = {
            icon = "",
            color = "#f55385",
            cterm_color = "204",
            name = "Scss"
          },
          sql = {
            icon = "",
            color = "#dad8d8",
            cterm_color = "188",
            name = "Sql"
          },
          Dockerfile = {
            icon = "",
            color = "#384d54",
            cterm_color = "59",
            name = "Dockerfile"
          },
          ["docker-compose.yml"] = {
            icon = "",
            color = "#384d54",
            cterm_color = "59",
            name = "DockerCompose"
          },
          gitignore = {
            icon = "",
            color = "#f1502f",
            cterm_color = "196",
            name = "GitIgnore"
          },
          [".gitignore"] = {
            icon = "",
            color = "#f1502f",
            cterm_color = "196",
            name = "GitIgnore"
          },
          ["package.json"] = {
            icon = "",
            color = "#e8274b",
            cterm_color = "196",
            name = "PackageJson"
          },
          ["package-lock.json"] = {
            icon = "",
            color = "#7a2d2d",
            cterm_color = "52",
            name = "PackageLockJson"
          },
          ["yarn.lock"] = {
            icon = "",
            color = "#368fb9",
            cterm_color = "74",
            name = "YarnLock"
          },
          ["Cargo.toml"] = {
            icon = "",
            color = "#dea584",
            cterm_color = "180",
            name = "CargoToml"
          },
          ["Cargo.lock"] = {
            icon = "",
            color = "#dea584",
            cterm_color = "180",
            name = "CargoLock"
          },
          ["go.mod"] = {
            icon = "",
            color = "#00add8",
            cterm_color = "32",
            name = "GoMod"
          },
          ["go.sum"] = {
            icon = "",
            color = "#00add8",
            cterm_color = "32",
            name = "GoSum"
          },
          ["pyproject.toml"] = {
            icon = "",
            color = "#3572a5",
            cterm_color = "61",
            name = "PyprojectToml"
          },
          ["requirements.txt"] = {
            icon = "",
            color = "#3572a5",
            cterm_color = "61",
            name = "Requirements"
          },
          [".env"] = {
            icon = "",
            color = "#faf743",
            cterm_color = "226",
            name = "Env"
          },
          [".env.local"] = {
            icon = "",
            color = "#faf743",
            cterm_color = "226",
            name = "EnvLocal"
          },
          ["README.md"] = {
            icon = "",
            color = "#519aba",
            cterm_color = "67",
            name = "Readme"
          },
          ["LICENSE"] = {
            icon = "",
            color = "#d0bf41",
            cterm_color = "185",
            name = "License"
          },
          vim = {
            icon = "",
            color = "#019833",
            cterm_color = "28",
            name = "Vim"
          },
          sh = {
            icon = "",
            color = "#4d5a5e",
            cterm_color = "240",
            name = "Sh"
          },
          bash = {
            icon = "",
            color = "#4d5a5e",
            cterm_color = "240",
            name = "Bash"
          },
        },
        default = true,
        strict = true,
        override_by_filename = {
          [".gitignore"] = {
            icon = "",
            color = "#f1502f",
            name = "GitIgnore"
          },
          ["package.json"] = {
            icon = "",
            color = "#e8274b",
            name = "PackageJson"
          },
          ["package-lock.json"] = {
            icon = "",
            color = "#7a2d2d",
            name = "PackageLockJson"
          },
          ["yarn.lock"] = {
            icon = "",
            color = "#368fb9",
            name = "YarnLock"
          },
          ["Dockerfile"] = {
            icon = "",
            color = "#384d54",
            name = "Dockerfile"
          },
          ["docker-compose.yml"] = {
            icon = "",
            color = "#384d54",
            name = "DockerCompose"
          },
          ["docker-compose.yaml"] = {
            icon = "",
            color = "#384d54",
            name = "DockerCompose"
          },
          [".dockerignore"] = {
            icon = "",
            color = "#384d54",
            name = "DockerIgnore"
          },
          ["Cargo.toml"] = {
            icon = "",
            color = "#dea584",
            name = "CargoToml"
          },
          ["Cargo.lock"] = {
            icon = "",
            color = "#dea584",
            name = "CargoLock"
          },
          ["go.mod"] = {
            icon = "",
            color = "#00add8",
            name = "GoMod"
          },
          ["go.sum"] = {
            icon = "",
            color = "#00add8",
            name = "GoSum"
          },
          ["pyproject.toml"] = {
            icon = "",
            color = "#3572a5",
            name = "PyprojectToml"
          },
          ["requirements.txt"] = {
            icon = "",
            color = "#3572a5",
            name = "Requirements"
          },
          ["poetry.lock"] = {
            icon = "",
            color = "#3572a5",
            name = "PoetryLock"
          },
          [".env"] = {
            icon = "",
            color = "#faf743",
            name = "Env"
          },
          [".env.local"] = {
            icon = "",
            color = "#faf743",
            name = "EnvLocal"
          },
          [".env.example"] = {
            icon = "",
            color = "#faf743",
            name = "EnvExample"
          },
          ["README.md"] = {
            icon = "",
            color = "#519aba",
            name = "Readme"
          },
          ["readme.md"] = {
            icon = "",
            color = "#519aba",
            name = "Readme"
          },
          ["LICENSE"] = {
            icon = "",
            color = "#d0bf41",
            name = "License"
          },
          ["Makefile"] = {
            icon = "",
            color = "#427819",
            name = "Makefile"
          },
          [".vimrc"] = {
            icon = "",
            color = "#019833",
            name = "Vimrc"
          },
          ["init.vim"] = {
            icon = "",
            color = "#019833",
            name = "InitVim"
          },
          ["init.lua"] = {
            icon = "",
            color = "#51a0cf",
            name = "InitLua"
          },
          -- Build and Package Manager files
          ["composer.json"] = {
            icon = "",
            color = "#885630",
            name = "ComposerJson"
          },
          ["composer.lock"] = {
            icon = "",
            color = "#885630",
            name = "ComposerLock"
          },
          ["Gemfile"] = {
            icon = "",
            color = "#701516",
            name = "Gemfile"
          },
          ["Gemfile.lock"] = {
            icon = "",
            color = "#701516",
            name = "GemfileLock"
          },
          ["go.work"] = {
            icon = "",
            color = "#00add8",
            name = "GoWork"
          },
          ["pnpm-lock.yaml"] = {
            icon = "",
            color = "#f69220",
            name = "PnpmLock"
          },
          ["bun.lockb"] = {
            icon = "",
            color = "#fbf0df",
            name = "BunLock"
          },
          -- Python specific
          ["setup.py"] = {
            icon = "",
            color = "#3572a5",
            name = "SetupPy"
          },
          ["setup.cfg"] = {
            icon = "",
            color = "#3572a5",
            name = "SetupCfg"
          },
          ["Pipfile"] = {
            icon = "",
            color = "#3572a5",
            name = "Pipfile"
          },
          ["Pipfile.lock"] = {
            icon = "",
            color = "#3572a5",
            name = "PipfileLock"
          },
          ["tox.ini"] = {
            icon = "",
            color = "#3572a5",
            name = "ToxIni"
          },
          [".coveragerc"] = {
            icon = "",
            color = "#3572a5",
            name = "CoverageRc"
          },
          -- Config files
          ["tsconfig.json"] = {
            icon = "",
            color = "#519aba",
            name = "TsConfig"
          },
          ["jsconfig.json"] = {
            icon = "",
            color = "#cbcb41",
            name = "JsConfig"
          },
          ["webpack.config.js"] = {
            icon = "󰜫",
            color = "#8dd6f9",
            name = "WebpackConfig"
          },
          ["rollup.config.js"] = {
            icon = "",
            color = "#ec4a3f",
            name = "RollupConfig"
          },
          ["vite.config.js"] = {
            icon = "",
            color = "#646cff",
            name = "ViteConfig"
          },
          ["vite.config.ts"] = {
            icon = "",
            color = "#646cff",
            name = "ViteConfigTs"
          },
          ["tailwind.config.js"] = {
            icon = "󱏿",
            color = "#06b6d4",
            name = "TailwindConfig"
          },
          ["tailwind.config.ts"] = {
            icon = "󱏿",
            color = "#06b6d4",
            name = "TailwindConfigTs"
          },
          ["postcss.config.js"] = {
            icon = "",
            color = "#dd3a0a",
            name = "PostcssConfig"
          },
          -- Linting and formatting
          [".eslintrc.js"] = {
            icon = "",
            color = "#4b32c3",
            name = "EslintRc"
          },
          [".eslintrc.json"] = {
            icon = "",
            color = "#4b32c3",
            name = "EslintRcJson"
          },
          ["eslint.config.js"] = {
            icon = "",
            color = "#4b32c3",
            name = "EslintConfig"
          },
          [".prettierrc"] = {
            icon = "",
            color = "#f7b93e",
            name = "PrettierRc"
          },
          [".prettierrc.js"] = {
            icon = "",
            color = "#f7b93e",
            name = "PrettierRcJs"
          },
          [".prettierrc.json"] = {
            icon = "",
            color = "#f7b93e",
            name = "PrettierRcJson"
          },
          ["prettier.config.js"] = {
            icon = "",
            color = "#f7b93e",
            name = "PrettierConfig"
          },
          [".babelrc"] = {
            icon = "",
            color = "#f9dc3e",
            name = "BabelRc"
          },
          ["babel.config.js"] = {
            icon = "",
            color = "#f9dc3e",
            name = "BabelConfig"
          },
          -- Testing
          ["jest.config.js"] = {
            icon = "",
            color = "#c21325",
            name = "JestConfig"
          },
          ["jest.config.ts"] = {
            icon = "",
            color = "#c21325",
            name = "JestConfigTs"
          },
          ["vitest.config.js"] = {
            icon = "",
            color = "#6e9f18",
            name = "VitestConfig"
          },
          ["vitest.config.ts"] = {
            icon = "",
            color = "#6e9f18",
            name = "VitestConfigTs"
          },
          -- CI/CD
          [".travis.yml"] = {
            icon = "",
            color = "#3eaaaf",
            name = "TravisYml"
          },
          ["appveyor.yml"] = {
            icon = "",
            color = "#00b3e0",
            name = "AppveyorYml"
          },
          ["azure-pipelines.yml"] = {
            icon = "",
            color = "#0078d4",
            name = "AzurePipelines"
          },
          [".github"] = {
            icon = "",
            color = "#f1502f",
            name = "GitHub"
          },
          -- Docker
          [".dockerignore"] = {
            icon = "",
            color = "#384d54",
            name = "DockerIgnore"
          },
          -- Framework configs
          ["next.config.js"] = {
            icon = "",
            color = "#000000",
            name = "NextConfig"
          },
          ["next.config.ts"] = {
            icon = "",
            color = "#000000",
            name = "NextConfigTs"
          },
          ["nuxt.config.js"] = {
            icon = "",
            color = "#00c58e",
            name = "NuxtConfig"
          },
          ["nuxt.config.ts"] = {
            icon = "",
            color = "#00c58e",
            name = "NuxtConfigTs"
          },
          ["svelte.config.js"] = {
            icon = "",
            color = "#ff3e00",
            name = "SvelteConfig"
          },
          ["astro.config.mjs"] = {
            icon = "",
            color = "#ff5a03",
            name = "AstroConfig"
          },
          ["angular.json"] = {
            icon = "",
            color = "#dd0031",
            name = "AngularJson"
          },
          -- Mobile development
          ["ionic.config.json"] = {
            icon = "",
            color = "#3880ff",
            name = "IonicConfig"
          },
          ["Podfile"] = {
            icon = "",
            color = "#326ce5",
            name = "Podfile"
          },
          ["Podfile.lock"] = {
            icon = "",
            color = "#326ce5",
            name = "PodfileLock"
          },
          -- Rust specific
          ["rustfmt.toml"] = {
            icon = "",
            color = "#dea584",
            name = "RustfmtToml"
          },
          [".rustfmt.toml"] = {
            icon = "",
            color = "#dea584",
            name = "RustfmtToml"
          },
          ["clippy.toml"] = {
            icon = "",
            color = "#dea584",
            name = "ClippyToml"
          },
          -- Build systems
          ["CMakeLists.txt"] = {
            icon = "",
            color = "#064f8c",
            name = "CMakeLists"
          },
          ["meson.build"] = {
            icon = "",
            color = "#007acc",
            name = "MesonBuild"
          },
          -- Java/JVM
          ["build.gradle"] = {
            icon = "",
            color = "#02303a",
            name = "BuildGradle"
          },
          ["build.gradle.kts"] = {
            icon = "",
            color = "#02303a",
            name = "BuildGradleKts"
          },
          ["gradlew"] = {
            icon = "",
            color = "#02303a",
            name = "GradleWrapper"
          },
          ["pom.xml"] = {
            icon = "",
            color = "#f89820",
            name = "PomXml"
          },
          -- Documentation
          ["CHANGELOG.md"] = {
            icon = "",
            color = "#519aba",
            name = "Changelog"
          },
          ["CONTRIBUTING.md"] = {
            icon = "",
            color = "#519aba",
            name = "Contributing"
          },
          ["CODE_OF_CONDUCT.md"] = {
            icon = "",
            color = "#519aba",
            name = "CodeOfConduct"
          },
          ["SECURITY.md"] = {
            icon = "",
            color = "#519aba",
            name = "Security"
          },
          -- Other special files
          [".editorconfig"] = {
            icon = "",
            color = "#fff2cc",
            name = "EditorConfig"
          },
          ["vercel.json"] = {
            icon = "▲",
            color = "#000000",
            name = "VercelJson"
          },
          ["netlify.toml"] = {
            icon = "",
            color = "#00c7b7",
            name = "NetlifyToml"
          },
          ["deno.json"] = {
            icon = "",
            color = "#000000",
            name = "DenoJson"
          },
          ["deno.jsonc"] = {
            icon = "",
            color = "#000000",
            name = "DenoJsonc"
          },
        },
        override_by_extension = {
          ["log"] = {
            icon = "",
            color = "#ffa500",
            name = "Log"
          },
          ["txt"] = {
            icon = "",
            color = "#89e051",
            name = "Txt"
          },
          ["conf"] = {
            icon = "",
            color = "#6d8086",
            name = "Conf"
          },
          ["ini"] = {
            icon = "",
            color = "#6d8086",
            name = "Ini"
          },
          ["cfg"] = {
            icon = "",
            color = "#6d8086",
            name = "Cfg"
          },
          ["xml"] = {
            icon = "",
            color = "#e37933",
            name = "Xml"
          },
          ["lock"] = {
            icon = "",
            color = "#bbbbbb",
            name = "Lock"
          },
          ["env"] = {
            icon = "",
            color = "#faf743",
            name = "Env"
          },
          ["gitignore"] = {
            icon = "",
            color = "#f1502f",
            name = "GitIgnore"
          },
          ["gitattributes"] = {
            icon = "",
            color = "#f1502f",
            name = "GitAttributes"
          },
          ["gitmodules"] = {
            icon = "",
            color = "#f1502f",
            name = "GitModules"
          },
          ["dockerfile"] = {
            icon = "",
            color = "#384d54",
            name = "Dockerfile"
          },
          ["dockerignore"] = {
            icon = "",
            color = "#384d54",
            name = "DockerIgnore"
          },
          ["makefile"] = {
            icon = "",
            color = "#427819",
            name = "Makefile"
          },
          ["mk"] = {
            icon = "",
            color = "#427819",
            name = "Make"
          },
          ["cmake"] = {
            icon = "",
            color = "#064f8c",
            name = "CMake"
          },
          ["gradle"] = {
            icon = "",
            color = "#02303a",
            name = "Gradle"
          },
          ["properties"] = {
            icon = "",
            color = "#f89820",
            name = "Properties"
          },
          ["rb"] = {
            icon = "",
            color = "#701516",
            name = "Ruby"
          },
          ["php"] = {
            icon = "",
            color = "#4f5d95",
            name = "Php"
          },
          ["java"] = {
            icon = "",
            color = "#f89820",
            name = "Java"
          },
          ["kt"] = {
            icon = "",
            color = "#7f52ff",
            name = "Kotlin"
          },
          ["kts"] = {
            icon = "",
            color = "#7f52ff",
            name = "KotlinScript"
          },
          ["scala"] = {
            icon = "",
            color = "#c22d40",
            name = "Scala"
          },
          ["clj"] = {
            icon = "",
            color = "#8dc149",
            name = "Clojure"
          },
          ["cljs"] = {
            icon = "",
            color = "#8dc149",
            name = "ClojureScript"
          },
          ["dart"] = {
            icon = "",
            color = "#03589c",
            name = "Dart"
          },
          ["swift"] = {
            icon = "",
            color = "#fa7343",
            name = "Swift"
          },
          ["elm"] = {
            icon = "",
            color = "#60b5cc",
            name = "Elm"
          },
          ["ex"] = {
            icon = "",
            color = "#a270ba",
            name = "Elixir"
          },
          ["exs"] = {
            icon = "",
            color = "#a270ba",
            name = "ElixirScript"
          },
          ["erl"] = {
            icon = "",
            color = "#b83998",
            name = "Erlang"
          },
          ["hrl"] = {
            icon = "",
            color = "#b83998",
            name = "ErlangHeader"
          },
          ["ml"] = {
            icon = "",
            color = "#ff6000",
            name = "OCaml"
          },
          ["mli"] = {
            icon = "",
            color = "#ff6000",
            name = "OCamlInterface"
          },
          ["hs"] = {
            icon = "",
            color = "#5e5086",
            name = "Haskell"
          },
          ["lhs"] = {
            icon = "",
            color = "#5e5086",
            name = "LiterateHaskell"
          },
          ["nim"] = {
            icon = "",
            color = "#ffc200",
            name = "Nim"
          },
          ["nims"] = {
            icon = "",
            color = "#ffc200",
            name = "NimScript"
          },
          ["cr"] = {
            icon = "",
            color = "#000000",
            name = "Crystal"
          },
          ["zig"] = {
            icon = "",
            color = "#f7a41d",
            name = "Zig"
          },
          ["v"] = {
            icon = "",
            color = "#4f5d95",
            name = "Vlang"
          },
          ["fs"] = {
            icon = "",
            color = "#378bba",
            name = "FSharp"
          },
          ["fsx"] = {
            icon = "",
            color = "#378bba",
            name = "FSharpScript"
          },
          ["cs"] = {
            icon = "",
            color = "#239120",
            name = "CSharp"
          },
          ["vb"] = {
            icon = "",
            color = "#945db7",
            name = "VisualBasic"
          },
          ["pas"] = {
            icon = "",
            color = "#e3f171",
            name = "Pascal"
          },
          ["pp"] = {
            icon = "",
            color = "#ffa61a",
            name = "Pascal"
          },
          ["asm"] = {
            icon = "",
            color = "#6e4c13",
            name = "Assembly"
          },
          ["s"] = {
            icon = "",
            color = "#6e4c13",
            name = "Assembly"
          },
          ["c"] = {
            icon = "",
            color = "#555555",
            name = "C"
          },
          ["h"] = {
            icon = "",
            color = "#a074c4",
            name = "Header"
          },
          ["cpp"] = {
            icon = "",
            color = "#f34b7d",
            name = "Cpp"
          },
          ["cxx"] = {
            icon = "",
            color = "#f34b7d",
            name = "Cpp"
          },
          ["cc"] = {
            icon = "",
            color = "#f34b7d",
            name = "Cpp"
          },
          ["hpp"] = {
            icon = "",
            color = "#a074c4",
            name = "CppHeader"
          },
          ["hxx"] = {
            icon = "",
            color = "#a074c4",
            name = "CppHeader"
          },
          ["r"] = {
            icon = "ﳒ",
            color = "#358a5b",
            name = "R"
          },
          ["rmd"] = {
            icon = "",
            color = "#358a5b",
            name = "RMarkdown"
          },
          ["Rmd"] = {
            icon = "",
            color = "#358a5b",
            name = "RMarkdown"
          },
          ["jl"] = {
            icon = "",
            color = "#a270ba",
            name = "Julia"
          },
          ["m"] = {
            icon = "",
            color = "#519aba",
            name = "Matlab"
          },
          ["asv"] = {
            icon = "",
            color = "#563d7c",
            name = "SystemVerilog"
          },
          ["sv"] = {
            icon = "",
            color = "#563d7c",
            name = "SystemVerilog"
          },
          ["vhd"] = {
            icon = "",
            color = "#563d7c",
            name = "VHDL"
          },
          ["vhdl"] = {
            icon = "",
            color = "#563d7c",
            name = "VHDL"
          },
          ["tcl"] = {
            icon = "󰛓",
            color = "#1e5cb3",
            name = "Tcl"
          },
          ["fish"] = {
            icon = "",
            color = "#4d5a5e",
            name = "Fish"
          },
          ["zsh"] = {
            icon = "",
            color = "#89e051",
            name = "Zsh"
          },
          ["ps1"] = {
            icon = "",
            color = "#4273ca",
            name = "PowerShell"
          },
          ["psm1"] = {
            icon = "",
            color = "#4273ca",
            name = "PowerShellModule"
          },
          ["bat"] = {
            icon = "",
            color = "#c1f12e",
            name = "Batch"
          },
          ["cmd"] = {
            icon = "",
            color = "#c1f12e",
            name = "Command"
          },
        },
        override_by_operating_system = {
          ["Darwin"] = {
            icon = "",
            color = "#A2AAAD",
            name = "Darwin"
          },
          ["Linux"] = {
            icon = "",
            color = "#fcc624",
            name = "Linux"
          },
        },
        color_icons = true,
      })
    end,
  },

  -- File explorer
  {
    "nvim-tree/nvim-tree.lua",
    dependencies = { "nvim-tree/nvim-web-devicons" },
    config = function()
      -- Setup terminal cursor for better visibility
      local terminal_cursor_ok, terminal_cursor = pcall(require, "terminal-cursor")
      if terminal_cursor_ok then
        terminal_cursor.setup()
      end
      
      -- Apply Warp Terminal specific cursor fix
      local warp_fix_ok, warp_fix = pcall(require, "warp-cursor-fix")
      if warp_fix_ok then
        warp_fix.setup()
      end
      -- Disable netrw at the very start
      vim.g.loaded_netrw = 1
      vim.g.loaded_netrwPlugin = 1
      
      -- Set up folder-specific icons
      vim.cmd([[
        augroup NvimTreeFolderIcons
          autocmd!
          autocmd FileType NvimTree setlocal signcolumn=yes
        augroup END
      ]])
      
      require("nvim-tree").setup({
        disable_netrw = true,
        hijack_netrw = true,
        hijack_cursor = true,
        hijack_unnamed_buffer_when_opening = false,
        sync_root_with_cwd = true,
        update_focused_file = {
          enable = true,
          update_root = false,
        },
        respect_buf_cwd = true,
        view = {
          adaptive_size = false,
          centralize_selection = false,
          width = 35,
          side = "left",
          preserve_window_proportions = false,
          number = false,
          relativenumber = false,
          signcolumn = "yes",
        },
        renderer = {
          add_trailing = false,
          group_empty = false,
          highlight_git = true,
          full_name = false,
          highlight_opened_files = "name",
          root_folder_label = ":~:s?$?/..?",
          indent_width = 2,
          special_files = {
            ["node_modules"] = 1,
            [".git"] = 1,
            ["target"] = 1,
            ["build"] = 1,
            ["dist"] = 1,
          },
          indent_markers = {
            enable = true,
            inline_arrows = true,
            icons = {
              corner = "└",
              edge = "│",
              item = "│",
              bottom = "─",
              none = " ",
            },
          },
          icons = {
            webdev_colors = true,
            git_placement = "before",
            padding = " ",
            symlink_arrow = " ➛ ",
            show = {
              file = true,
              folder = true,
              folder_arrow = true,
              git = true,
              modified = true,
              diagnostics = true,
              bookmarks = true,
            },
            glyphs = {
              default = "",
              symlink = "",
              bookmark = "",
              modified = "●",
              folder = {
                arrow_closed = "",
                arrow_open = "",
                default = "",
                open = "",
                empty = "",
                empty_open = "",
                symlink = "",
                symlink_open = "",
              },
              git = {
                unstaged = "✗",
                staged = "✓",
                unmerged = "",
                renamed = "➜",
                untracked = "★",
                deleted = "",
                ignored = "◌",
              },
            },
          },
          special_files = { 
            "Cargo.toml", "Cargo.lock", "Makefile", "makefile", 
            "README.md", "readme.md", "README.rst", "README.txt",
            "package.json", "package-lock.json", "yarn.lock", "pnpm-lock.yaml",
            "composer.json", "composer.lock",
            "Gemfile", "Gemfile.lock",
            "go.mod", "go.sum", "go.work", 
            "pyproject.toml", "poetry.lock", "requirements.txt", "setup.py", "setup.cfg", "Pipfile", "Pipfile.lock",
            "CMakeLists.txt", "cmake", "meson.build",
            "Dockerfile", "docker-compose.yml", "docker-compose.yaml", ".dockerignore",
            ".gitignore", ".gitattributes", ".gitmodules",
            ".env", ".env.local", ".env.development", ".env.production", ".env.example",
            "LICENSE", "LICENSE.md", "LICENSE.txt", "COPYING",
            "CHANGELOG.md", "CHANGELOG.rst", "CHANGELOG.txt", "HISTORY.md", "NEWS.md",
            "CONTRIBUTING.md", "CODE_OF_CONDUCT.md", "SECURITY.md",
            "tsconfig.json", "jsconfig.json", "webpack.config.js", "rollup.config.js", "vite.config.js", "vite.config.ts",
            "tailwind.config.js", "tailwind.config.ts", "postcss.config.js",
            "babel.config.js", ".babelrc", ".eslintrc.js", ".eslintrc.json", "eslint.config.js",
            ".prettierrc", ".prettierrc.js", ".prettierrc.json", "prettier.config.js",
            "jest.config.js", "jest.config.ts", "vitest.config.js", "vitest.config.ts",
            ".travis.yml", ".github", "appveyor.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml",
            "tox.ini", ".coveragerc", "codecov.yml", ".codecov.yml",
            "rustfmt.toml", ".rustfmt.toml", "clippy.toml",
            "nuxt.config.js", "nuxt.config.ts", "next.config.js", "next.config.ts",
            "svelte.config.js", "astro.config.mjs",
            "deno.json", "deno.jsonc", "bun.lockb",
            ".editorconfig", ".gitpod.yml", ".devcontainer", "devcontainer.json",
            "vercel.json", "netlify.toml", "wrangler.toml",
            "angular.json", ".angular-cli.json", "ionic.config.json",
            "mix.exs", "mix.lock", "rebar.config", "rebar.lock",
            "pubspec.yaml", "pubspec.lock", "analysis_options.yaml",
            "build.gradle", "build.gradle.kts", "settings.gradle", "gradle.properties", "gradlew",
            "pom.xml", "build.xml", "ivy.xml",
            "Package.swift", "Package.resolved", 
            "manifest.json", "manifest.yml", "app.json",
            "Podfile", "Podfile.lock", "Cartfile", "Cartfile.resolved",
            "config.toml", "config.yaml", "config.yml", "config.json",
            ".vimrc", "init.vim", "init.lua", ".nvimrc",
            "_config.yml", "_config.toml", "hugo.toml", "hugo.yaml",
            "serverless.yml", "serverless.yaml", "sam.yaml", "template.yaml",
            ".pre-commit-config.yaml", ".pre-commit-hooks.yaml",
            "sonar-project.properties", ".sonarcloud.properties"
          },
          symlink_destination = true,
        },
        hijack_directories = {
          enable = true,
          auto_open = true,
        },
        update_cwd = true,
        diagnostics = {
          enable = false,  -- 진단 기능 비활성화로 에러 해결
          show_on_dirs = false,
          show_on_open_dirs = true,
          debounce_delay = 50,
          severity = {
            min = vim.diagnostic.severity.HINT,
            max = vim.diagnostic.severity.ERROR,
          },
          icons = {
            hint = "",
            info = "",
            warning = "",
            error = "",
          },
        },
        filters = {
          dotfiles = false,
          git_clean = false,
          no_buffer = false,
          custom = {},
          exclude = {},
        },
        filesystem_watchers = {
          enable = true,
          debounce_delay = 50,
          ignore_dirs = {},
        },
        git = {
          enable = true,
          ignore = false,
          show_on_dirs = true,
          show_on_open_dirs = true,
          timeout = 400,
        },
        modified = {
          enable = true,
          show_on_dirs = true,
          show_on_open_dirs = true,
        },
        actions = {
          use_system_clipboard = true,
          change_dir = {
            enable = true,
            global = false,
            restrict_above_cwd = false,
          },
          expand_all = {
            max_folder_discovery = 300,
            exclude = {},
          },
          file_popup = {
            open_win_config = {
              col = 1,
              row = 1,
              relative = "cursor",
              border = "shadow",
              style = "minimal",
            },
          },
          open_file = {
            quit_on_open = false,
            resize_window = true,
            window_picker = {
              enable = true,
              picker = "default",
              chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
              exclude = {
                filetype = { "notify", "packer", "qf", "diff", "fugitive", "fugitiveblame" },
                buftype = { "nofile", "terminal", "help" },
              },
            },
          },
          remove_file = {
            close_window = true,
          },
        },
        trash = {
          cmd = "gio trash",
        },
        live_filter = {
          prefix = "[FILTER]: ",
          always_show_folders = true,
        },
        tab = {
          sync = {
            open = false,
            close = false,
            ignore = {},
          },
        },
        notify = {
          threshold = vim.log.levels.INFO,
        },
        log = {
          enable = false,
          truncate = false,
          types = {
            all = false,
            config = false,
            copy_paste = false,
            dev = false,
            diagnostics = false,
            git = false,
            profile = false,
            watcher = false,
          },
        },
        system_open = {
          cmd = "",
          args = {},
        },
      })
      
      -- Custom highlights for better visibility on transparent background
      vim.cmd([[
        highlight NvimTreeNormal guibg=NONE guifg=#c0caf5
        highlight NvimTreeNormalNC guibg=NONE guifg=#c0caf5
        highlight NvimTreeRootFolder guifg=#7dcfff gui=bold
        highlight NvimTreeGitDirty guifg=#f7768e
        highlight NvimTreeGitNew guifg=#9ece6a
        highlight NvimTreeGitDeleted guifg=#f7768e
        highlight NvimTreeFolderName guifg=#7dcfff
        highlight NvimTreeFolderIcon guifg=#7dcfff
        highlight NvimTreeOpenedFolderName guifg=#7dcfff gui=bold
        highlight NvimTreeEmptyFolderName guifg=#737aa2
        highlight NvimTreeIndentMarker guifg=#3b4261
        highlight NvimTreeVertSplit guifg=#1f2335 guibg=NONE
        highlight NvimTreeStatusLine guifg=#1f2335 guibg=NONE
        highlight NvimTreeStatusLineNC guifg=#1f2335 guibg=NONE
        highlight NvimTreeWindowPicker guifg=#7dcfff guibg=#364a82 gui=bold
        
        " Diagnostic highlights for nvim-tree
        highlight NvimTreeDiagnosticError guifg=#f7768e
        highlight NvimTreeDiagnosticWarn guifg=#e0af68
        highlight NvimTreeDiagnosticInfo guifg=#0db9d7
        highlight NvimTreeDiagnosticHint guifg=#10b981
      ]])
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
        "marksman",
        "markdownlint",
        
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
      -- Wait a bit for mason to be ready
      vim.defer_fn(function()
        local lspconfig = require("lspconfig")
        local capabilities = vim.lsp.protocol.make_client_capabilities()
        capabilities = vim.tbl_deep_extend("force", capabilities, require("cmp_nvim_lsp").default_capabilities())

        -- Python
        if vim.fn.executable("pyright") == 1 or vim.fn.executable("pyright-langserver") == 1 then
          lspconfig.pyright.setup({
            capabilities = capabilities,
            settings = {
              python = {
                analysis = {
                  autoSearchPaths = true,
                  useLibraryCodeForTypes = true,
                  diagnosticMode = "workspace",
                },
              },
            },
          })
        end
        
        if vim.fn.executable("ruff") == 1 then
          lspconfig.ruff.setup({
            capabilities = capabilities,
            init_options = {
              settings = {
                lint = { enable = true },
                format = { enable = true },
                args = {}
              }
            }
          })
        end

        -- HTML
        if vim.fn.executable("vscode-html-language-server") == 1 then
          lspconfig.html.setup({
            capabilities = capabilities,
          })
        end

        -- CSS
        if vim.fn.executable("vscode-css-language-server") == 1 then
          lspconfig.cssls.setup({
            capabilities = capabilities,
          })
        end

        -- TypeScript/JavaScript
        if vim.fn.executable("typescript-language-server") == 1 then
          lspconfig.ts_ls.setup({
            capabilities = capabilities,
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
          })
        end

        -- ESLint
        if vim.fn.executable("vscode-eslint-language-server") == 1 then
          lspconfig.eslint.setup({
            capabilities = capabilities,
            on_attach = function(client, bufnr)
              vim.api.nvim_create_autocmd("BufWritePre", {
                buffer = bufnr,
                command = "EslintFixAll",
              })
            end,
          })
        end

        -- Emmet
        if vim.fn.executable("emmet-ls") == 1 then
          lspconfig.emmet_ls.setup({
            capabilities = capabilities,
            filetypes = { "html", "css", "scss", "javascript", "javascriptreact", "typescript", "typescriptreact" },
          })
        end

        -- TailwindCSS
        if vim.fn.executable("tailwindcss-language-server") == 1 then
          lspconfig.tailwindcss.setup({
            capabilities = capabilities,
          })
        end

        -- Docker
        if vim.fn.executable("docker-langserver") == 1 then
          lspconfig.dockerls.setup({
            capabilities = capabilities,
          })
        end

        -- Docker Compose (commented out - not available)
        -- if vim.fn.executable("docker-compose-langserver") == 1 then
        --   lspconfig.docker_compose_language_service.setup({
        --     capabilities = capabilities,
        --   })
        -- end

        -- YAML
        if vim.fn.executable("yaml-language-server") == 1 then
          lspconfig.yamlls.setup({
            capabilities = capabilities,
            settings = {
              yaml = {
                schemas = {
                  ["https://json.schemastore.org/github-workflow.json"] = "/.github/workflows/*",
                  ["https://json.schemastore.org/github-action.json"] = "/.github/actions/*/action.yml",
                  ["https://json.schemastore.org/docker-compose.json"] = "/docker-compose.yml",
                },
              },
            },
          })
        end

        -- JSON
        if vim.fn.executable("vscode-json-language-server") == 1 then
          lspconfig.jsonls.setup({
            capabilities = capabilities,
            settings = {
              json = {
                schemas = require("schemastore").json.schemas(),
                validate = { enable = true },
              },
            },
          })
        end

        -- Bash
        if vim.fn.executable("bash-language-server") == 1 then
          lspconfig.bashls.setup({
            capabilities = capabilities,
          })
        end

        -- Markdown
        if vim.fn.executable("marksman") == 1 then
          lspconfig.marksman.setup({
            capabilities = capabilities,
          })
        end

        -- SQL
        if vim.fn.executable("sql-language-server") == 1 then
          lspconfig.sqlls.setup({
            capabilities = capabilities,
          })
        end

        -- TOML
        if vim.fn.executable("taplo") == 1 then
          lspconfig.taplo.setup({
            capabilities = capabilities,
          })
        end

        -- Go (conditional setup)
        if vim.fn.executable("go") == 1 then
          -- Add Go bin to PATH if not already there
          local go_bin = vim.fn.expand("$HOME/go/bin")
          local current_path = vim.env.PATH or ""
          if not string.find(current_path, go_bin, 1, true) then
            vim.env.PATH = go_bin .. ":" .. current_path
          end
          
          -- Setup gopls if available
          if vim.fn.executable("gopls") == 1 then
            lspconfig.gopls.setup({
              capabilities = capabilities,
              settings = {
                gopls = {
                  analyses = {
                    unusedparams = true,
                  },
                  staticcheck = true,
                  gofumpt = true,
                },
              },
            })
          end
        end

        -- Rust
        if vim.fn.executable("rust-analyzer") == 1 then
          lspconfig.rust_analyzer.setup({
            capabilities = capabilities,
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
                procMacro = {
                  enable = true,
                  ignored = {
                    ["async-trait"] = { "async_trait" },
                    ["napi-derive"] = { "napi" },
                    ["async-recursion"] = { "async_recursion" },
                  },
                },
              },
            },
          })
        end

        -- Lua
        if vim.fn.executable("lua-language-server") == 1 then
          lspconfig.lua_ls.setup({
            capabilities = capabilities,
            settings = {
              Lua = {
                completion = {
                  callSnippet = "Replace",
                },
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
          })
        end
      end, 100) -- 100ms delay
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

  -- Which-key
  {
    "folke/which-key.nvim",
    event = "VimEnter",
    config = function()
      require("which-key").setup()
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

  -- Indent guides
  {
    "lukas-reineke/indent-blankline.nvim",
    main = "ibl",
    opts = {},
  },

  -- Testing support
  {
    "nvim-neotest/neotest",
    dependencies = {
      "nvim-neotest/nvim-nio",
      "nvim-lua/plenary.nvim",
      "antoinemadec/FixCursorHold.nvim",
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

  -- Additional web development plugins
  {
    "b0o/schemastore.nvim", -- JSON schemas
  },

  -- Better TypeScript/JavaScript support
  {
    "pmizio/typescript-tools.nvim",
    dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
    opts = {},
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

  -- Markdown preview
  {
    "iamcco/markdown-preview.nvim",
    cmd = { "MarkdownPreviewToggle", "MarkdownPreview", "MarkdownPreviewStop" },
    ft = { "markdown" },
    build = function() vim.fn["mkdp#util#install"]() end,
    config = function()
      -- Settings
      vim.g.mkdp_filetypes = { "markdown" }
      vim.g.mkdp_auto_start = 0
      vim.g.mkdp_auto_close = 1
      vim.g.mkdp_refresh_slow = 0
      vim.g.mkdp_command_for_global = 0
      vim.g.mkdp_open_to_the_world = 0
      vim.g.mkdp_open_ip = ""
      vim.g.mkdp_browser = ""
      vim.g.mkdp_echo_preview_url = 0
      vim.g.mkdp_browserfunc = ""
      vim.g.mkdp_preview_options = {
        mkit = {},
        katex = {},
        uml = {},
        maid = {},
        disable_sync_scroll = 0,
        sync_scroll_type = "middle",
        hide_yaml_meta = 1,
        sequence_diagrams = {},
        flowchart_diagrams = {},
        content_editable = false,
        disable_filename = 0,
        toc = {},
      }
      vim.g.mkdp_markdown_css = ""
      vim.g.mkdp_highlight_css = ""
      vim.g.mkdp_port = ""
      vim.g.mkdp_page_title = "「${name}」"
      vim.g.mkdp_theme = "dark"
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

  -- Table mode for markdown
  {
    "dhruvasagar/vim-table-mode",
    ft = { "markdown" },
    config = function()
      vim.g.table_mode_corner = "|"
      vim.g.table_mode_corner_corner = "|"
      vim.g.table_mode_header_fillchar = "-"
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

  -- SQL formatting and enhanced features
  {
    "nanotee/sqls.nvim",
    ft = "sql",
    config = function()
      require("sqls").setup({})
    end,
  },
})

-- Key mappings
local keymap = vim.keymap

-- Basic movements
keymap.set("n", "<C-s>", ":w<CR>", { desc = "Save file" })
keymap.set("n", "<leader>q", ":q<CR>", { desc = "Quit" })

-- File explorer
keymap.set("n", "<leader>e", ":NvimTreeToggle<CR>", { desc = "Toggle file explorer" })

-- Telescope
keymap.set("n", "<leader>ff", require("telescope.builtin").find_files, { desc = "Find files" })
keymap.set("n", "<leader>fg", require("telescope.builtin").live_grep, { desc = "Live grep" })
keymap.set("n", "<leader>fb", require("telescope.builtin").buffers, { desc = "Find buffers" })
keymap.set("n", "<leader>fh", require("telescope.builtin").help_tags, { desc = "Help tags" })

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

-- Markdown
keymap.set("n", "<leader>mp", ":MarkdownPreviewToggle<CR>", { desc = "Toggle Markdown Preview" })
keymap.set("n", "<leader>ms", ":MarkdownPreview<CR>", { desc = "Start Markdown Preview" })
keymap.set("n", "<leader>mS", ":MarkdownPreviewStop<CR>", { desc = "Stop Markdown Preview" })

-- Markdown table mode (only in markdown files)
vim.api.nvim_create_autocmd("FileType", {
  pattern = "markdown",
  callback = function()
    keymap.set("n", "<leader>tm", ":TableModeToggle<CR>", { desc = "Toggle Table Mode", buffer = true })
    keymap.set("n", "<leader>tt", ":Tableize<CR>", { desc = "Tableize", buffer = true })
    keymap.set("n", "<leader>tr", ":TableModeRealign<CR>", { desc = "Realign Table", buffer = true })
  end,
})

-- Highlight on yank
vim.api.nvim_create_autocmd("TextYankPost", {
  desc = "Highlight when yanking text",
  group = vim.api.nvim_create_augroup("highlight-yank", { clear = true }),
  callback = function()
    vim.highlight.on_yank()
  end,
})

-- Icon diagnostics command
vim.api.nvim_create_user_command("DiagnoseIcons", function()
  require("diagnose-icons").diagnose()
end, { desc = "Diagnose icon display issues" })

vim.api.nvim_create_user_command("CheckFont", function()
  require("diagnose-icons").check_font()
end, { desc = "Check font recommendations" })