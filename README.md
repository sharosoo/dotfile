# Sharosoo's Dotfiles

개인 개발 환경 설정 파일들을 관리하는 dotfiles 저장소입니다.

## 🚀 주요 기능

- **크로스 플랫폼 지원**: macOS, Linux 자동 감지 및 설정
- **Warp Terminal 최적화**: Warp 터미널 환경에 맞춘 설정
- **모던 CLI 도구**: eza, bat, ripgrep, fzf 등 최신 도구 통합
- **개발 환경 자동화**: Python venv, Node.js nvm 자동 전환
- **보안 중심**: API 키와 민감한 정보는 버전 관리에서 제외

## 📁 구조

```
dotfile/
├── .env.example          # 환경변수 예제
├── install.sh           # 자동 설치 스크립트
├── Brewfile            # macOS 패키지 목록
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
ln -sf ~/dotfiles/nvim ~/.config/nvim

# 3. 필요한 패키지 설치 (macOS)
brew bundle --file=~/dotfiles/Brewfile
```

## 🔧 설정

### 환경 변수

1. `.env.example`을 `~/.env.local`로 복사
2. 실제 값으로 수정

```bash
cp .env.example ~/.env.local
# 편집기로 ~/.env.local 수정
```

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
- **eza**: 모던 `ls` 대체
- **bat**: 문법 강조가 있는 `cat`
- **ripgrep**: 빠른 검색 도구
- **fzf**: 퍼지 파인더
- **zoxide**: 스마트 디렉토리 이동
- **tldr**: 간단한 man 페이지

### 개발 도구
- **Neovim**: 확장 가능한 편집기
- **tmux**: 터미널 멀티플렉서
- **git**: 버전 관리
- **gh**: GitHub CLI
- **jq**: JSON 프로세서

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

## 📝 라이선스

MIT License

## 🤝 기여

이슈나 PR은 언제나 환영합니다!