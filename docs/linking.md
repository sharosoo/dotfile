# 설정 링크 (symlink)

일괄 설치 스크립트 대신 **영역별 심링크** 또는 아래 스크립트 사용.

## 데스크톱 (niri / Noctalia / fcitx / systemd)

```bash
cd ~/workspaces/sharosoo/dotfile
./scripts/link-desktop-config.sh
systemctl --user daemon-reload
```

이미 일반 파일이 있으면 `skip (not symlink)` — 백업 후 삭제하고 다시 실행.

## Fish

[fish.md](fish.md)

## Ghostty / Starship

```bash
DOT=~/workspaces/sharosoo/dotfile
ln -sfn "$DOT/ghostty/config" ~/.config/ghostty/config
ln -sfn "$DOT/starship/starship.toml" ~/.config/starship.toml
```

macOS Ghostty: `ghostty/config.macos` → `~/Library/Application Support/com.mitchellh.ghostty/config`

## Neovim

```bash
ln -sfn ~/workspaces/sharosoo/dotfile/nvim ~/.config/nvim
nvim +Lazy sync   # 최초 1회
```

## Tmux

```bash
ln -sfn ~/workspaces/sharosoo/dotfile/tmux/.tmux.conf ~/.tmux.conf
# TPM: prefix + I (플러그인 매니저는 별도 설치)
```

## OMP (oh-my-pi)

설정 스냅샷은 `omp/`에 파일로만 보관. 링크하지 않고 필요한 것만 `~/.omp/`로 복사.
자세한 내용은 [omp/README.md](../omp/README.md).