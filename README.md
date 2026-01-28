# Dotfiles

개인 개발 환경 설정 파일.

## 구조

```
dotfile/
├── install.sh              # 설치 스크립트
├── .env.example            # 환경변수 템플릿
├── fish/                   # Fish shell
├── ghostty/                # Ghostty 터미널
├── hypr/                   # Hyprland 설정
├── starship/               # Starship 프롬프트
├── opencode/               # OpenCode 설정
├── zsh/                    # Zsh 설정
├── nvim/                   # Neovim 설정
├── tmux/                   # Tmux 설정
└── docs/                   # 문서
```

## 설치

```bash
git clone https://github.com/sharosoo/dotfile.git
cd dotfile
./install.sh
```

## 설치 후 설정

```bash
# Fish shell 기본 설정
chsh -s $(which fish)

# 환경변수 설정
cp .env.example ~/.env.local
vim ~/.env.local

# fish-ai 설정 (Azure OpenAI)
cp fish/fish-ai.ini.example ~/.config/fish-ai.ini
vim ~/.config/fish-ai.ini

# Fisher 플러그인 설치
fisher install realiserad/fish-ai
fisher install jorgebucaran/nvm.fish

# TPM 플러그인 설치 (tmux에서)
# prefix + I

# Ghostty systemd 서비스 활성화 (빠른 윈도우 생성)
systemctl enable --user app-com.mitchellh.ghostty.service

# OpenCode 인증 (tmux에서)
opencode auth login
```

## Ghostty Systemd

로그인시 백그라운드 시작, 새 윈도우 즉시 생성 (~20ms).

```bash
# 서비스 활성화
systemctl enable --user app-com.mitchellh.ghostty.service

# 새 윈도우 생성 (D-Bus)
ghostty +new-window

# 상태 확인
systemctl status --user app-com.mitchellh.ghostty.service

# 로그 확인
journalctl -a -f --user -u app-com.mitchellh.ghostty.service

# 설정 리로드
systemctl reload --user app-com.mitchellh.ghostty.service
```

## Hyprland

`~/.config/hypr/hyprland.conf` 사용.

```bash
sudo add-apt-repository universe
sudo apt-get update
sudo apt-get install -y hyprland
```

install.sh로 설치:

```bash
INSTALL_HYPRLAND=1 ./install.sh
```

실행:

```bash
# 로그인 화면에서 Hyprland 세션 선택

# TTY에서 직접 실행
start-hyprland
```

기본 단축키 (dotfile 기준):

| 키 | 동작 |
|----|------|
| `Super+Enter` | Ghostty 새 창 |
| `Super+Q` | 창 닫기 |
| `Super+V` | 플로팅 토글 |
| `Super+S` | 스플릿 토글 |
| `Super+H/J/K/L` | 포커스 이동 |
| `Super+Shift+H/J/K/L` | 창 이동 |
| `Super+1..5` | 워크스페이스 이동 |
| `Super+Shift+1..5` | 창을 워크스페이스로 이동 |

상세 설정: `docs/DESKTOP_SETUP.md`

NVIDIA 요구사항:
- xorg-xwayland >= 24.1
- wayland-protocols >= 1.34
- NVIDIA driver >= 555

```
# /etc/modprobe.d/nvidia.conf
options nvidia_drm modeset=1
```

```bash
ln -sf ~/dotfiles/hypr/hyprland.conf ~/.config/hypr/hyprland.conf
```

## 환경변수

`~/.env.local`:

```bash
# AI
export OPENROUTER_API_KEY="sk-or-v1-..."
export ANTHROPIC_API_KEY="sk-ant-..."
export OPENAI_API_KEY="sk-..."

# Azure OpenAI (fish-ai)
export AZURE_OPENAI_API_KEY="..."
export AZURE_OPENAI_ENDPOINT="https://..."

# Cloud
export AWS_ACCESS_KEY_ID="..."
export AWS_SECRET_ACCESS_KEY="..."

# Dev
export GITHUB_TOKEN="ghp_..."
```

---

## OpenCode / Oh-My-OpenCode

AI 코딩 어시스턴트.

GitHub: https://github.com/code-yeongyu/oh-my-opencode

### 설치

```bash
# OpenCode 설치
curl -fsSL https://opencode.ai/install | bash

# Oh-My-OpenCode 설치
bunx oh-my-opencode install

# 인증
opencode auth login
```

### 사용법

```bash
# 기본 실행
opencode

# ultrawork 모드
# 프롬프트에 "ultrawork" 또는 "ulw" 포함
```

---

## fish-ai

LLM 기반 명령어 자동완성. Azure OpenAI GPT 사용.

GitHub: https://github.com/realiserad/fish-ai

### 설정

`~/.config/fish-ai.ini`:

```ini
[fish-ai]
configuration = azure
keymap_1 = ctrl-g
keymap_2 = ctrl-y
language = Korean

[azure]
provider = azure
server = https://YOUR_ENDPOINT.openai.azure.com
model = gpt-4
api_key = YOUR_API_KEY
```

### 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+G` | 주석 → 명령어 변환 |
| `Ctrl+G` | 명령어 → 설명 (Korean) |
| `Ctrl+Y` | AI 자동완성 |
| `Ctrl+Y` | 실패한 명령어 수정 |

### 사용 예시

```fish
# 주석을 명령어로 변환
# 100MB 이상 파일 찾기
# Ctrl+G 누르면:
find . -type f -size +100M

# 명령어 설명 (Korean)
kubectl get pods -A -o wide
# Ctrl+G 누르면:
# 모든 네임스페이스에서 파드 목록을 상세 정보와 함께 표시합니다

# 오타 수정
gti status
# Ctrl+Y 누르면:
git status
```

### Ghostty 키 설정

Ghostty에서 Ctrl+G, Ctrl+Y가 작동하려면:

```ini
# ~/.config/ghostty/config
keybind = ctrl+g=unbind
keybind = ctrl+y=unbind
keybind = ctrl+shift+m=toggle_maximize
keybind = ctrl+shift+f=toggle_fullscreen
keybind = ctrl+alt+up=resize_split:up,10
keybind = ctrl+alt+down=resize_split:down,10
keybind = ctrl+alt+left=resize_split:left,10
keybind = ctrl+alt+right=resize_split:right,10
```

창 최소화는 Ghostty 액션이 없음. WM/DE 단축키 사용.

---

## fzf

퍼지 파인더. 파일, 히스토리, 프로세스 검색.

### 단축키

| 단축키 | 기능 |
|--------|------|
| `Ctrl+R` | 명령어 히스토리 검색 |
| `Ctrl+T` | 파일 검색 후 경로 삽입 |
| `Alt+C` | 디렉토리 검색 후 cd |

### fzf 내부 조작

| 키 | 기능 |
|----|------|
| `Ctrl+J` / `Ctrl+N` | 아래로 이동 |
| `Ctrl+K` / `Ctrl+P` | 위로 이동 |
| `Enter` | 선택 |
| `Tab` | 다중 선택 토글 |
| `Ctrl+A` | 전체 선택 |
| `Ctrl+D` | 전체 선택 해제 |
| `Esc` / `Ctrl+C` | 취소 |

### 사용 예시

```fish
# 히스토리에서 docker 명령어 찾기
# Ctrl+R 누르고 "docker" 입력

# 파일 찾아서 vim으로 열기
vim (Ctrl+T)

# 디렉토리 이동
# Alt+C 누르고 검색

# 프리뷰와 함께 파일 검색
preview
# 또는
fzf --preview 'batcat --color "always" {}'

# git branch 선택
git checkout (git branch | fzf)

# 프로세스 kill
kill -9 (ps aux | fzf | awk '{print $2}')
```

### 파이프라인 활용

```fish
# 파일 내용 검색 후 열기
rg --files-with-matches "pattern" | fzf | xargs nvim

# git log에서 커밋 선택
git log --oneline | fzf | awk '{print $1}' | xargs git show

# 패키지 검색 후 설치
apt-cache search keyword | fzf | awk '{print $1}' | xargs sudo apt install
```

---

## ripgrep (rg)

빠른 텍스트 검색. grep 대체.

### 기본 사용

```fish
# 기본 검색
rg "pattern"

# 대소문자 무시
rg -i "pattern"

# 단어 단위 검색
rg -w "word"

# 파일 타입 지정
rg -t py "def "
rg -t js "function"
rg -t ts "interface"

# 특정 파일 제외
rg "pattern" -g '!node_modules'
rg "pattern" -g '!*.min.js'

# 숨김 파일 포함
rg --hidden "pattern"

# 컨텍스트 표시
rg -C 3 "pattern"    # 전후 3줄
rg -B 2 "pattern"    # 이전 2줄
rg -A 2 "pattern"    # 이후 2줄
```

### 고급 사용

```fish
# 정규식
rg "console\.(log|error|warn)"

# 파일명만 출력
rg -l "pattern"

# 매칭 수만 출력
rg -c "pattern"

# JSON 출력
rg --json "pattern"

# 멀티라인 검색
rg -U "function.*\n.*return"

# 교체 미리보기
rg "old" --replace "new"

# 특정 디렉토리만
rg "pattern" src/

# glob 패턴
rg "pattern" -g '*.{ts,tsx}'
```

### 파일 타입 목록

```fish
rg --type-list
```

주요 타입: `py`, `js`, `ts`, `go`, `rust`, `java`, `cpp`, `css`, `html`, `json`, `yaml`, `md`

---

## tmux 단축키

| 단축키 | 기능 |
|--------|------|
| `prefix + \|` | 세로 분할 |
| `prefix + -` | 가로 분할 |
| `prefix + hjkl` | 패널 이동 (vim-style) |
| `prefix + HJKL` | 패널 크기 조절 |
| `Alt + 방향키` | 패널 이동 (prefix 없이) |
| `Shift + 방향키` | 윈도우 전환 |
| `Alt + 1-9` | 윈도우 직접 선택 |
| `prefix + S` | 패널 동기화 토글 |
| `prefix + x` | 패널 닫기 |
| `prefix + X` | 윈도우 닫기 |
| `prefix + c` | 새 윈도우 |
| `prefix + s` | 세션 선택 |
| `prefix + N` | 새 세션 |
| `prefix + d` | 세션 분리 |
| `prefix + [` | 복사 모드 진입 |
| `v` (복사모드) | 선택 시작 |
| `y` (복사모드) | 복사 |
| `prefix + ]` | 붙여넣기 |
| `prefix + I` | TPM 플러그인 설치 |
| `prefix + U` | TPM 플러그인 업데이트 |
| `prefix + Ctrl+s` | 세션 저장 |
| `prefix + Ctrl+r` | 세션 복원 |
| `prefix + r` | 설정 리로드 |

---

## 모던 CLI Aliases

| Alias | 명령어 | 설명 |
|-------|--------|------|
| `ls` | `eza --group-directories-first` | 디렉토리 우선 정렬 |
| `ll` | `ls -la` | 상세 목록 |
| `l` | `ls -1` | 한 줄씩 |
| `cat` | `batcat` | 문법 강조 |
| `ping` | `prettyping --nolegend` | 시각화 |
| `preview` | `fzf --preview 'batcat ...'` | 미리보기 |
| `help` | `tldr` | 간단한 매뉴얼 |

---

## Git Aliases

| Alias | 명령어 |
|-------|--------|
| `g` | `git` |
| `ga` | `git add` |
| `gaa` | `git add --all` |
| `gb` | `git branch` |
| `gc` | `git commit -v` |
| `gca` | `git commit -v -a` |
| `gco` | `git checkout` |
| `gd` | `git diff` |
| `gl` | `git pull` |
| `glg` | `git log --stat` |
| `glog` | `git log --oneline --decorate --graph` |
| `gm` | `git merge` |
| `gp` | `git push` |
| `gpf` | `git push --force` |
| `gst` | `git status` |
| `gs` | `git stash` |
| `gsp` | `git stash pop` |
| `gu` | `gitui` |

---

## 커스텀 함수

### ghc - GitHub 클론

```fish
ghc https://github.com/org/repo
# ~/workspaces/org/repo 로 클론
```

### ghcd - 워크스페이스 이동

```fish
ghcd react
# fzf로 매칭되는 repo 선택 후 cd
```

---

## 문제 해결

### fish-ai

```bash
ghostty +list-keybinds | grep ctrl
~/.local/share/fish-ai/bin/codify "# list files"
```

### fzf

```fish
# Fish에서 키바인딩 확인
bind | grep fzf
```

### Starship

```fish
starship init fish | source
```

### Neovim

```bash
rm -rf ~/.local/share/nvim ~/.local/state/nvim
nvim
```

### tmux

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
# tmux에서: prefix + I
```

### OpenCode

```bash
opencode auth login
```

## 라이선스

MIT
