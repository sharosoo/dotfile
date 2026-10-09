# Obsidian (앱)

Obsidian **데스크톱 앱**(AppImage)만 사용한다. Neovim ↔ Obsidian 플러그인 연동
(`obsidian.nvim`)은 **제거**했고, Neovim의 마크다운 GUI는 [Ferrite](https://github.com/OlaProeis/Ferrite)로 대체했다 (→ `docs/nvim.md` § Markdown / Ferrite GUI 연동).

## Vault

| Vault | 경로 |
|-------|------|
| default | `~/Documents/Obsidian/default` |
| infra-journey | `~/workspaces/sharosoo/infra-journey` |

앱의 vault 목록은 `~/.config/obsidian/obsidian.json`이 관리한다. (예전 `<leader>mp`의
자동 vault 등록 로직은 폐기 — 앱에서 직접 vault를 열 것.)

## 설치 (AppImage)

```bash
cd ~/workspaces/sharosoo/dotfile/scripts
./install-obsidian.sh
```

- `libfuse.so.2` 없으면 래퍼가 `APPIMAGE_EXTRACT_AND_RUN=1` 사용 (`packages.apt`의 `libfuse2`)

## 관련

- `dotfile/desktop/obsidian.desktop`, `dotfile/scripts/install-obsidian.sh`
- Neovim 마크다운: `dotfile/docs/nvim.md` (Ferrite)
