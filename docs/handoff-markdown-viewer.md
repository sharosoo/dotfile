# Handoff: 마크다운 편집·뷰어 요구사항 정리

**작성 맥락:** Neovim ↔ Obsidian 연동 시도, 대안 검토, **Rust 기반 예쁜 마크다운 뷰어 신규 개발** 검토로 이어진 대화 요약.

---

## 1. 사용자가 원하는 것 (핵심)

### 1.1 워크플로

- **Neovim**에서 `.md`를 주 편집기로 쓰고, **GUI**로 “예쁘게” 보거나 편집하고 싶음.
- 단축키: **`<Space>mp`** (leader = Space, `m` = markdown/Obsidian 계열).
- **임의 경로**의 마크다운(예: `~/workspaces/sharosoo/infra-journey/notes/*.md`, `dotfile/docs/*.md`)도 동일 UX로 열고 싶음.

### 1.2 Obsidian 연동으로 표현했던 의도 (최종 명확화)

브릿지/복사/`_nvim-import`가 아님.

1. `<leader>mp`로 연 **노트가 있는 디렉터리**를 **Obsidian vault로 등록** (`~/.config/obsidian/obsidian.json`).
2. Vault **이름(URI)**:
   - 기본: 그 디렉터리 **마지막 폴더명** (예: `docs`, `notes`).
   - 다른 vault와 basename 충돌 시: **`부모폴더-마지막이름`** (예: `dotfile-docs`).
3. 등록 후 **그 vault에서 해당 파일**을 Obsidian 앱으로 연다 (원본 경로 유지, 복사 없음).

### 1.3 방향 전환 (대화 후반)

- Obsidian vault 자동 등록 + URI는 **“vault 없음”** 등으로 불안정 → 장기 해법으로 **마음에 안 듦**.
- `typora.nvim` **새 플러그인**은 비추 (Typora 비공개, 본질은 `typora <file>` 래퍼).
- **Rust로 예쁜 마크다운 뷰어를 새로 만들고 싶음** — **기존 오픈소스 활용** 전제.

---

## 2. 현재 환경·제약

| 항목 | 값 |
|------|-----|
| Neovim | 0.11.6, lazy.nvim |
| 설정 | `~/workspaces/sharosoo/dotfile/nvim` ↔ `~/.config/nvim` (심링크 또는 cp) |
| Leader | `<Space>` |
| Obsidian 앱 | AppImage `~/.local/share/obsidian`, `~/.local/bin/obsidian` |
| 등록 vault (앱) | `~/Documents/Obsidian/default` (이름 `default`) |
| Neovim workspace | `default`, `infra-journey`, `dotfile` — `obsidian.nvim` |
| OS | Linux (Omarchy, fish) |

### Neovim 쪽 이미 갖춘 것

- `obsidian.nvim`: wiki 링크, obsidian-ls, Telescope, `callbacks.enter_note` 키맵.
- `peek.nvim` / `markdown-preview.nvim`은 **제거됨** (브라우저 프리뷰 경로 폐기).

---

## 3. 시도했고 알게 된 것 (Obsidian 경로)

| 이슈 | 내용 |
|------|------|
| `symlink` | 이 Neovim 빌드에 `vim.fn.symlink` 없음 → `vim.uv.fs_symlink` / `ln -sfn` 폴백 필요했음 (이후 브릿지 방식 자체 폐기). |
| `vim.expand` | `vim.expand` nil → **`vim.fn.expand`** 사용. |
| URI `vault=` | hex id가 아니라 vault **폴더 basename** (`obsidian.nvim` `open.lua`와 동일). Advanced URI 플러그인 필요. |
| `obsidian.json` | `ts`는 ms 단위; 잘못 쓰면 vault 목록 깨짐. 앱 **실행 중**이면 json만 수정해도 목록 안 갱신될 수 있음. |
| 복사/미러/브릿지 | 사용자 의도와 불일치 → **요구사항에서 제외**. |

**구현 위치 (참고):** `dotfile/nvim/lua/plugins/obsidian.lua`, `dotfile/docs/obsidian.md`.

---

## 4. 신규 Rust 뷰어 — handoff용 요구사항 (초안)

대화에서 명시된 것 + 맥락상 필요한 것. **확정 전** — 다음 단계에서 사용자와 맞출 항목.

### 4.1 Must (추정)

- **Linux**에서 동작하는 **GUI** 마크다운 **뷰어** (편집까지 할지는 미정).
- **예쁜** 렌더링 (타이포, 코드 하이라이트, 다크/라이트 등).
- **기존 OSS 활용** (파서/렌더러/위젯 직접 전부 구현 X).
- Neovim에서 **현재 파일 경로**로 띄울 수 있음 (`<leader>mp` 후보).

### 4.2 Should (추정)

- **파일 경로 그대로** 열기 (vault 등록·URI 없음).
- **외부 디렉터리** `docs/`, `notes/` 등 repo 밖 경로 지원.
- 저장된 파일 기준 동작 (unsaved buffer는 경고 또는 임시 저장 — 미정).

### 4.3 Could

- Neovim 연동: CLI `viewer --line N path.md` 또는 socket/IPC.
- 라이브 리로드 (Neovim 저장 시 뷰어 갱신).
- 편집 모드 (Typora-lite) vs 읽기 전용.

### 4.4 Won’t (현 단계)

- Obsidian vault 자동 등록·`obsidian.json` 조작을 Rust 뷰어의 필수 기능으로 묶지 않음.
- `typora.nvim` 전용 레포 신규 (래퍼는 dotfile 한 파일로 충분).

---

## 5. Rust/OSS 후보 (다음 조사 과제)

아직 **선정 안 함**. 후속에서 비교할 축:

- **파싱:** `pulldown-cmark`, `comrak`, `markdown-rs`
- **GUI:** `egui`, `iced`, `slint`, `tauri`+web, `wry`
- **하이라이트:** `syntect`, tree-sitter
- **참고 앱:** Mark Text(아카이브), Zettlr, lapce/markdown 미니앱 등

---

## 6. 열린 결정 (사용자 확인 필요)

1. **뷰어 vs 편집기** — 읽기 전용 WYSIWYG vs 양방향 편집?
2. **Obsidian** — Neovim LSP/workspace만 유지하고 `<leader>mp`는 **Rust 뷰어**로 완전 교체?
3. **배포** — 단일 바이너리, `~/.local/bin`, dotfile `scripts/install-*.sh`?
4. **프로젝트 위치** — `infra-journey` vs `dotfile` vs 별도 repo?
5. **기술 스택** — 네이티브 Rust GUI vs Tauri (웹 렌더 + Rust 셸)?

---

## 7. 관련 파일

- `dotfile/nvim/lua/plugins/obsidian.lua`
- `dotfile/docs/obsidian.md`, `dotfile/docs/nvim.md`
- `~/.config/obsidian/obsidian.json`
- `dotfile/scripts/install-obsidian.sh`

---

## 8. 한 줄 요약

**Neovim에서 아무 `.md`나 `<Space>mp`로 예쁜 GUI 마크다운 경험**을 원함; Obsidian vault 자동 등록은 실패·복잡해서 **Rust OSS 기반 전용 뷰어**로 새로 가고 싶다.