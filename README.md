# Dotfiles

개인 개발 환경 설정. **자동 `install.sh` 없음** — 영역별 문서 보고 필요한 것만 링크/설치.

**기본 셸:** [Fish](docs/fish.md) (`chsh -s $(which fish)`)

## 빠른 시작

```bash
git clone https://github.com/sharosoo/dotfile.git ~/workspaces/sharosoo/dotfile
cd ~/workspaces/sharosoo/dotfile
cp .env.example ~/.env.local   # 비밀키는 직접 편집
```

## 문서 (영역별)

| 영역 | 문서 | dotfile 경로 |
|------|------|----------------|
| **인덱스 / 데스크톱** | [desktop-stack.md](docs/desktop-stack.md) | niri, noctalia, fcitx5, systemd |
| **Niri + Noctalia** | [NIRI-NOCTALIA.md](docs/NIRI-NOCTALIA.md) · [단축키](docs/niri-noctalia-단축키.md) | `niri/`, `noctalia/`, `systemd/user/` |
| **Fish 셸** | [fish.md](docs/fish.md) | `fish/` |
| **터미널 (Ghostty, Starship)** | [TERMINAL_SETUP.md](docs/TERMINAL_SETUP.md) | `ghostty/`, `starship/` |
| **OpenCode / OMP** | [opencode.md](docs/opencode.md) | `opencode/`, `omp/README.md` |
| **Neovim** | [nvim.md](docs/nvim.md) | `nvim/` |
| **Tmux** | [tmux.md](docs/tmux.md) | `tmux/` |
| **설정 링크 방법** | [linking.md](docs/linking.md) | `scripts/link-desktop-config.sh` |

## 구조

```
dotfile/
├── scripts/link-desktop-config.sh
├── niri/ noctalia/ fcitx5/ systemd/user/
├── fish/ ghostty/ starship/ nvim/ tmux/ opencode/
├── omp/README.md
└── docs/
```

## 환경변수

`~/.env.local` — 템플릿: [.env.example](.env.example). Fish가 로그인 시 `source` ([fish/config.fish](fish/config.fish)).

---

MIT