#!/usr/bin/env python3
"""One-shot slimming of monolithic init.lua (devicons, nvim-tree, dead plugins)."""
from pathlib import Path
import re
import sys

MINIMAL_DEVICONS = """  -- Icons
  {
    "nvim-tree/nvim-web-devicons",
    lazy = true,
    opts = { default = true, strict = true, color_icons = true },
  },
"""

SLIM_NVIM_TREE = """  -- File explorer
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
"""


def replace_block(text: str, start_marker: str, end_marker: str, replacement: str) -> str:
    i = text.find(start_marker)
    if i == -1:
        raise SystemExit(f"start marker not found: {start_marker!r}")
    j = text.find(end_marker, i)
    if j == -1:
        raise SystemExit(f"end marker not found: {end_marker!r}")
    return text[:i] + replacement + text[j:]


def remove_plugin_block(text: str, repo: str) -> str:
    pattern = rf'\n  --[^\n]*\n  \{{\n    "{re.escape(repo)}"'
    m = re.search(pattern, text)
    if not m:
        pattern = rf'\n  \{{\n    "{re.escape(repo)}"'
        m = re.search(pattern, text)
    if not m:
        print(f"skip remove (not found): {repo}", file=sys.stderr)
        return text
    start = m.start()
    depth = 0
    i = m.end() - 1
    while i < len(text):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                end = i + 1
                if end < len(text) and text[end] == ",":
                    end += 1
                if end < len(text) and text[end] == "\n":
                    end += 1
                return text[:start] + text[end:]
        i += 1
    raise SystemExit(f"unbalanced braces removing {repo}")


def main(path: Path) -> None:
    text = path.read_text()
    orig_len = len(text.splitlines())

    text = replace_block(
        text,
        "  -- Icons (must be loaded before nvim-tree)",
        "  -- File explorer",
        MINIMAL_DEVICONS + "\n",
    )
    text = replace_block(
        text,
        "  -- File explorer",
        "  -- Statusline",
        SLIM_NVIM_TREE + "\n",
    )

    for repo in [
        "lukas-reineke/indent-blankline.nvim",
        "b0o/schemastore.nvim",
        "pmizio/typescript-tools.nvim",
        "dhruvasagar/vim-table-mode",
    ]:
        text = remove_plugin_block(text, repo)

    text = text.replace('      "antoinemadec/FixCursorHold.nvim",\n', "")
    text = text.replace('        "marksman",\n', "")
    text = text.replace('        "markdownlint",\n', "")
    text = text.replace('      enable("marksman", {}, { "marksman" })\n', "")

    old_json = """      local json_schemas = {}
      local ok_schemastore, schemastore = pcall(require, "schemastore")
      if ok_schemastore then
        json_schemas = schemastore.json.schemas()
      end
      enable("jsonls", {
        settings = {
          json = {
            schemas = json_schemas,
            validate = { enable = true },
          },
        },
      }, { "vscode-json-language-server" })"""
    new_json = """      enable("jsonls", {
        settings = {
          json = { validate = { enable = true } },
        },
      }, { "vscode-json-language-server" })"""
    text = text.replace(old_json, new_json)

    text = re.sub(
        r"\n-- Markdown table mode \(only in markdown files\)\n"
        r"vim\.api\.nvim_create_autocmd\(\"FileType\", \{.*?\}\)\n",
        "\n",
        text,
        flags=re.DOTALL,
    )

    path.write_text(text)
    new_len = len(text.splitlines())
    print(f"{path}: {orig_len} -> {new_len} lines (-{orig_len - new_len})")


if __name__ == "__main__":
    targets = sys.argv[1:] or [
        "/home/global/workspaces/sharosoo/dotfile/nvim/init.lua",
        "/home/global/.config/nvim/init.lua",
    ]
    for t in targets:
        main(Path(t))