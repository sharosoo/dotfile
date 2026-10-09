# Dotfiles

개인 개발 환경 설정. **자동 `install.sh` 없음** — 영역별 문서 보고 필요한 것만 링크/설치.

**기본 셸:** [Fish](docs/fish.md) (`chsh -s $(which fish)`)

## 빠른 시작

```bash
git clone https://github.com/sharosoo/dotfile.git ~/workspaces/sharosoo/dotfile
cd ~/workspaces/sharosoo/dotfile
cp .env.example ~/.env.local   # 비밀키는 직접 편집
```

## 패키지 설치 (Omarchy / Arch)

```bash
omarchy pkg add $(sed 's/#.*//' scripts/packages.arch)   # 공식 저장소
omarchy pkg aur add $(sed 's/#.*//' scripts/packages.aur) # AUR
mise use -g $(sed 's/#.*//' scripts/packages.mise)       # 사용자 도구 (sudo 불필요)
```

Omarchy 기본 제공 패키지와 제외한 항목은 각 파일 주석에 적어 두었습니다. `packages.apt`·`Brewfile`은 Ubuntu·macOS용입니다.

## 문서 (영역별)

| 영역 | 문서 | dotfile 경로 |
|------|------|----------------|
| **인덱스 / 데스크톱** | [desktop-stack.md](docs/desktop-stack.md) | fcitx5, systemd |
| **Omarchy (Hyprland·셸)** | [omarchy/README.md](omarchy/README.md) | `omarchy/` |
| **Fish 셸** | [fish.md](docs/fish.md) | `fish/` |
| **터미널 (Ghostty, Starship)** | [TERMINAL_SETUP.md](docs/TERMINAL_SETUP.md) | `ghostty/`, `starship/` |
| **OMP (oh-my-pi)** | [omp/README.md](omp/README.md) | `omp/` |
| **에이전트 브라우저 (relay·vault)** | [browser/README.md](browser/README.md) | `browser/` |
| **Hermes Agent** | [hermes/README.md](hermes/README.md) | `hermes/` |
| **Claude Code** | [.claude/README.md](.claude/README.md) | `.claude/` |
| **Neovim** | [nvim.md](docs/nvim.md) | `nvim/` |
| **Tmux** | [tmux.md](docs/tmux.md) | `tmux/` |
| **설정 링크 방법** | [linking.md](docs/linking.md) | `scripts/link-desktop-config.sh` |

## 구조

```
dotfile/
├── scripts/link-desktop-config.sh
├── fcitx5/ systemd/user/
├── fish/ ghostty/ starship/ nvim/ tmux/
├── omp/ .claude/ browser/
└── docs/
```

## 환경변수

`~/.env.local` — 템플릿: [.env.example](.env.example). Fish가 로그인 시 `source` ([fish/config.fish](fish/config.fish)).

---

MIT