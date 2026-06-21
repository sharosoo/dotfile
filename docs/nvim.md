# Neovim

Neovim **0.11+** 기준 설정. 현재 시스템은 `NVIM v0.11.6`이며 Ubuntu 저장소 기준 최신 후보도 `0.11.6-1`.

## 핵심 결정

- 플러그인 매니저: **lazy.nvim** (`init.lua`에서 직접 bootstrap)
- LSP: Neovim 0.11 네이티브 **`vim.lsp.config()` / `vim.lsp.enable()`** 사용
- `require("lspconfig").SERVER.setup()`는 nvim-lspconfig 최신판에서 deprecated라 사용하지 않음
- 포맷: **conform.nvim**
- 린트: **nvim-lint** (`mypy`)
- 자동 설치: **mason.nvim** + **mason-tool-installer.nvim**

## 링크

```bash
ln -sfn ~/workspaces/sharosoo/dotfile/nvim ~/.config/nvim
```

## 최초 / 업데이트

```bash
nvim +Lazy sync
nvim +checkhealth
```

## 언어별

### Python / FastAPI

| 기능 | 도구 |
|------|------|
| 타입/LSP | `pyright` |
| lint/format/import | `ruff` |
| 정적 타입 검사 | `mypy` via `nvim-lint` |
| debug | `debugpy` |
| format-on-save | `ruff_format`, `ruff_organize_imports` |

FastAPI는 Python LSP/타입힌트 기반. 프로젝트별 `pyproject.toml`에서 `pyright`, `mypy`, `ruff` 세부 조정.

### TypeScript / Next.js

| 기능 | 도구 |
|------|------|
| LSP | `ts_ls` (`typescript-language-server`) |
| React/TSX | `typescriptreact`, `javascriptreact` |
| lint/fix | `eslint` LSP (`EslintFixAll` on save) |
| Tailwind | `tailwindcss-language-server` |
| Emmet | `emmet-ls` |
| format | `prettierd` → `prettier` fallback |

Next.js는 프로젝트 로컬 `typescript`, `eslint`, `next` 설정을 우선 사용.

### Go

| 기능 | 도구 |
|------|------|
| LSP | `gopls` |
| format | `gofumpt`, `goimports` |
| lint | `golangci-lint` |
| debug | `delve` |

`$HOME/go/bin`을 Neovim PATH에 추가해 `gopls` 감지.

## Git 워크플로우

| 용도 | 도구 | 명령/키 |
|------|------|---------|
| 현재 파일 변경 라인 표시 | `gitsigns.nvim` | 자동 표시 |
| gitui 스타일 TUI | `lazygit.nvim` + `lazygit` | `<leader>gg`, `:LazyGit` |
| 현재 파일 중심 lazygit | `lazygit.nvim` | `<leader>gf`, `:LazyGitCurrentFile` |
| 브랜치/PR 전체 diff | `diffview.nvim` | `<leader>gd`, `:DiffviewOpen origin/main...HEAD` |
| 현재 파일 히스토리 | `diffview.nvim` | `<leader>gh`, `:DiffviewFileHistory %` |

`gitsigns.nvim`은 편집 중인 파일 왼쪽 sign column에 Git 변경사항을 표시한다.
`+`는 추가, `~`는 수정, `_`/`‾`는 삭제 hunk다. 버퍼 안에서 빠르게 hunk를 확인/이동/스테이지할 때 쓰고,
repo 전체 조작은 `lazygit`, 브랜치 전체 리뷰는 `diffview`를 쓴다.

자주 쓰는 명령:

```vim
:LazyGit
:LazyGitCurrentFile
:DiffviewOpen
:DiffviewOpen origin/main...HEAD
:DiffviewFileHistory %
:DiffviewClose
```

브랜치 전체 변경사항을 GitHub PR처럼 보려면 보통:

```vim
:DiffviewOpen origin/main...HEAD
```

## 주요 단축키

| 키 | 동작 |
|----|------|
| `<leader>ff` | 파일 검색 |
| `<leader>fg` | live grep |
| `gd` / `gr` / `gI` | definition / references / implementation |
| `<leader>rn` | rename |
| `<leader>ca` | code action |
| `K` | hover |
| `<leader>tt` / `<leader>tf` | 테스트 nearest / file |
| `<leader>db` / `<leader>dc` | breakpoint / continue |
| `<C-\\>` | ToggleTerm |

## 문제 해결

### 시작할 때 `lspconfig ... deprecated` 경고

해결됨: 0.11 네이티브 LSP API로 교체.

### 도구 설치 확인

```vim
:Mason
:checkhealth vim.lsp
```

### Python mypy가 너무 느릴 때

프로젝트 `mypy.ini`/`pyproject.toml`에서 범위를 줄이거나, 필요 시 `nvim-lint`의 python linters에서 `mypy` 제거.

## 관련 파일

- `nvim/init.lua` — 단일 설정 진입점
- `nvim/lazy-lock.json` — 플러그인 lock
- `nvim/docs/` — DAP/DB/Claude Code 상세 문서