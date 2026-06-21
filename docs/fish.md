# Fish shell

**기본 로그인 셸**으로 사용.

## 링크

```bash
DOT=~/workspaces/sharosoo/dotfile
mkdir -p ~/.config/fish/functions ~/.config/fish/conf.d
ln -sfn "$DOT/fish/config.fish" ~/.config/fish/config.fish
ln -sfn "$DOT/fish/functions/ghc.fish" ~/.config/fish/functions/ghc.fish
ln -sfn "$DOT/fish/functions/ghcd.fish" ~/.config/fish/functions/ghcd.fish
ln -sfn "$DOT/fish/conf.d/python_venv.fish" ~/.config/fish/conf.d/python_venv.fish
```

## 기본 셸로 지정

```bash
sudo apt install fish   # 없을 때
chsh -s "$(which fish)"
```

## 의존 도구 (config.fish 가정)

- **starship** — 프롬프트
- **eza**, **batcat/bat**, **fzf**, **fd**, **prettyping** (선택)
- `~/.env.local` — API 키 등 ([../.env.example](../.env.example))

## fish-ai (선택)

```bash
cp fish/fish-ai.ini.example ~/.config/fish-ai.ini
fisher install realiserad/fish-ai
fisher install jorgebucaran/nvm.fish
```

Ghostty에서 Ctrl+G / Ctrl+Y: [TERMINAL_SETUP.md](TERMINAL_SETUP.md) 참고.

## fzf / rg

Fish에서 `Ctrl+R` 히스토리, `Ctrl+T` 파일, `Alt+C` 디렉터리. `rg`는 일반 CLI — README 구버전의 긴 예시는 필요 시 ripgrep 공식 문서 참고.