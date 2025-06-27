# Sharosoo's Dotfiles

개인 개발 환경 설정 파일들을 관리하는 dotfiles 저장소입니다.

## 🚀 주요 기능

- **크로스 플랫폼 지원**: macOS, Linux 자동 감지 및 설정
- **Warp Terminal 최적화**: Warp 터미널 환경에 맞춘 설정
- **모던 CLI 도구**: eza, bat, ripgrep, fzf, zoxide 등 최신 도구 통합
- **개발 환경 자동화**: Python venv 자동 활성화, Volta로 Node.js 버전 관리
- **보안 중심**: API 키와 민감한 정보는 버전 관리에서 제외
- **백업 시스템**: 설치 시 기존 설정 자동 백업
- **비대화형 설치**: CI/CD 환경을 위한 자동 설치 지원

## 📁 구조

```
dotfile/
├── install.sh           # 자동 설치 스크립트
├── Brewfile            # macOS 패키지 목록
├── scripts/            # 설치 도우미
│   └── packages.apt   # Linux 패키지 목록
├── tmux/               # Tmux 설정
│   └── .tmux.conf     # Tmux 설정 파일
├── zsh/                # Zsh 설정
│   ├── .zshrc         # 메인 설정
│   ├── .zprofile      # 프로필 (ghc, ghcd 함수)
│   ├── aliases.zsh    # 별칭
│   ├── completions.zsh # 자동완성
│   └── environment.zsh # 환경변수
└── nvim/              # Neovim 설정
    ├── init.lua
    └── lua/
        ├── config/    # 핵심 설정
        └── plugins/   # 플러그인 설정
```

## 🛠️ 설치

### 자동 설치

```bash
git clone https://github.com/sharosoo/dotfile.git
cd dotfile
./install.sh
```

### 수동 설치

```bash
# 1. 저장소 클론
git clone https://github.com/sharosoo/dotfile.git ~/dotfiles

# 2. 심볼릭 링크 생성
ln -sf ~/dotfiles/zsh/.zshrc ~/.zshrc
ln -sf ~/dotfiles/zsh/.zprofile ~/.zprofile
ln -sf ~/dotfiles/tmux/.tmux.conf ~/.tmux.conf
ln -sf ~/dotfiles/nvim ~/.config/nvim

# 3. 필요한 패키지 설치 (macOS)
brew bundle --file=~/dotfiles/Brewfile

# 3. 필요한 패키지 설치 (Linux)
sudo apt update && sudo apt install $(cat ~/dotfiles/scripts/packages.apt)
```

## 🔧 설정

### Tmux

Tmux는 설치 스크립트를 통해 자동으로 설정됩니다:
- 마우스 지원 활성화
- 256 색상 지원
- 현재 경로 유지
- 직관적인 단축키 설정

### Zsh

Oh My Zsh와 함께 다음 플러그인들이 설치됩니다:
- zsh-autosuggestions: 명령어 자동 제안
- zsh-syntax-highlighting: 문법 강조
- fzf: 퍼지 검색 통합

### Warp Terminal

Warp 터미널 사용 시 자동으로 호환 설정이 적용됩니다.
추가 설정이 필요한 경우:

```bash
# Warp 설정 디렉토리
~/.warp/
```

## 🔄 업데이트

```bash
cd ~/dotfiles
git pull origin main
./install.sh --update
```

## 🔙 롤백

설치 시 자동으로 백업이 생성됩니다:

```bash
# 백업 위치 확인
ls -la ~/.dotfiles_backup_*

# 롤백
cp -r ~/.dotfiles_backup_[timestamp]/* ~/
```

## 📦 포함된 도구

### CLI 도구
- **eza**: 모던 `ls` 대체 (아이콘, 트리 뷰 지원)
- **bat**: 문법 강조가 있는 `cat` 대체
- **ripgrep**: 빠른 검색 도구
- **fzf**: 퍼지 파인더
- **zoxide**: 스마트 디렉토리 이동
- **tldr**: 간단한 man 페이지
- **fd**: 빠른 find 대체

### 개발 도구
- **Neovim**: LSP 지원 및 플러그인 확장
- **tmux**: 터미널 멀티플렉서
- **git**: 버전 관리
- **gh**: GitHub CLI
- **jq**: JSON 프로세서
- **Volta**: Node.js 버전 관리
- **neofetch**: 시스템 정보 표시

## 🎨 커스터마이징

### Zsh 별칭 추가

`zsh/aliases.zsh`에 추가:

```bash
alias myalias='my-command'
```

### Neovim 플러그인 추가

`nvim/lua/plugins/`에 새 파일 생성:

```lua
return {
  "plugin/name",
  config = function()
    -- 설정
  end
}
```

## 🐛 문제 해결

### Zsh 설정이 적용되지 않을 때

```bash
source ~/.zshrc
```

### Tmux에서 Zsh 설정이 로드되지 않을 때

```bash
# tmux 설정 재로드
tmux source-file ~/.tmux.conf
```

### Neovim 플러그인 문제

```bash
# 플러그인 캐시 정리
rm -rf ~/.local/share/nvim
rm -rf ~/.local/state/nvim

# Neovim 재시작
nvim
```

### 권한 문제

```bash
chmod +x install.sh
```

### 비대화형 설치

```bash
# CI/CD 환경에서 자동 설치
export DEBIAN_FRONTEND=noninteractive
./install.sh
```

## 📝 라이선스

MIT License

## 🤝 기여

이슈나 PR은 언제나 환영합니다!