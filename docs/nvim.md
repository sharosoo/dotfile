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

## Git / Diagnostic 라인 표시

### Git 표시 (`gitsigns.nvim`)

왼쪽 sign column에 현재 파일의 Git 변경사항이 표시된다.

| 표시 | 의미 | 확인/조작 |
|------|------|-----------|
| `+` | 추가된 줄 | `<leader>gp` hunk preview |
| `~` | 수정된 줄 | `<leader>gp` hunk preview |
| `_` / `‾` | 삭제된 hunk | `<leader>gp` hunk preview |

키:

| 키 | 동작 |
|----|------|
| `]g` | 다음 Git hunk |
| `[g` | 이전 Git hunk |
| `<leader>gp` | 현재 hunk 미리보기 |
| `<leader>gb` | 현재 줄 Git blame |
| `<leader>gs` | 현재 hunk stage |
| `<leader>gr` | 현재 hunk reset |
| visual `<leader>gs` | 선택 영역 stage |
| visual `<leader>gr` | 선택 영역 reset |

Repo 전체 조작은 `lazygit`, 변경사항 리뷰는 항상 split 기반 `diffview`를 쓴다.
Diffview는 `--unified=999999`를 기본 인자로 넣어 context 생략을 최대한 줄인다.

| 용도 | 도구 | 명령/키 |
|------|------|---------|
| gitui 스타일 TUI | `lazygit.nvim` + `lazygit` | `<leader>gg`, `:LazyGit` |
| 현재 파일 중심 lazygit | `lazygit.nvim` | `<leader>gf`, `:LazyGitCurrentFile` |
| working tree split diff | `diffview.nvim` | `<leader>gd`, `:DiffviewOpen` |
| 브랜치/PR split diff | `diffview.nvim` | `<leader>gD`, `:DiffviewOpen origin/main...HEAD` |
| 현재 파일 히스토리 | `diffview.nvim` | `<leader>gh`, `:DiffviewFileHistory %` |

Diffview 안에서 변경 블록을 넘길 때:

| 키 | 동작 |
|----|------|
| `<leader>g]` | 다음 diff change/hunk |
| `<leader>g[` | 이전 diff change/hunk |
| `]c` | 다음 diff change (`vimdiff` 기본) |
| `[c` | 이전 diff change (`vimdiff` 기본) |

### Diagnostic 표시 (`vim.diagnostic`)

왼쪽 sign column의 에러/경고 표시는 LSP/린터 diagnostic이다.
해당 줄에 커서를 두고 아래 키를 누르면 메시지를 바로 볼 수 있다.

| 키 | 동작 |
|----|------|
| `<leader>dd` | 현재 줄 diagnostic 메시지 float |
| `]d` | 다음 diagnostic으로 이동하고 메시지 표시 |
| `[d` | 이전 diagnostic으로 이동하고 메시지 표시 |
| `<leader>dq` | diagnostics를 quickfix로 보내기 |

전체 목록이 필요하면:

```vim
:Telescope diagnostics
:lua vim.diagnostic.setqflist()
:copen
```

## 주요 단축키

| 키 | 동작 |
|----|------|
| `<leader>ff` | 파일 검색 |
| `<leader>fg` | live grep |
| `<leader>dd` / `]d` / `[d` | diagnostic 메시지 / 다음 / 이전 |
| `]g` / `[g` | 다음 / 이전 Git hunk |
| `<leader>gp` / `<leader>gb` | Git hunk preview / blame |
| `<leader>gs` / `<leader>gr` | Git hunk stage / reset |
| `<leader>gd` / `<leader>gD` | Diffview working tree / branch diff |
| `<leader>gh` | Diffview file history |
| `<leader>g]` / `<leader>g[` | Diffview 변경 블록 이동 |
| `gd` / `gr` / `gI` | definition / references / implementation |
| `<leader>rn` | rename |
| `<leader>ca` | code action |
| `K` | hover |
| `<leader>tt` / `<leader>tf` | 테스트 nearest / file |
| `<leader>db` / `<leader>dc` | breakpoint / continue |
| `<C-\\>` | ToggleTerm |
| `<leader>q` / `<leader>Q` | 현재 창 종료 / Neovim 전체 강제 종료 |

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