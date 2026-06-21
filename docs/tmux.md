# Tmux

Fish + Ghostty + Neovim 조합 기준.

## 링크

```bash
ln -sfn ~/workspaces/sharosoo/dotfile/tmux/.tmux.conf ~/.tmux.conf
tmux source-file ~/.tmux.conf
```

## 핵심 설정

| 설정 | 값 / 이유 |
|------|-----------|
| `default-shell` | `/usr/bin/fish` |
| `default-terminal` | `tmux-256color` |
| true color | `terminal-overrides ... RGB`, `*:Tc` |
| `escape-time 0` | Neovim ESC 지연 제거 |
| `focus-events on` | Neovim autoread/focus 이벤트 |
| mouse | on |
| history | 50000 |

## Neovim 관련

- Ghostty → tmux → Neovim truecolor 유지
- `escape-time 0`으로 insert/normal 전환 지연 감소
- `focus-events on`으로 파일 변경 감지/자동 리로드가 안정적
- copy-mode는 vi 키 기반

## 주요 키

| 키 | 동작 |
|----|------|
| `prefix + |` | 세로 split |
| `prefix + -` | 가로 split |
| `prefix + h/j/k/l` | pane 이동 |
| `Alt + Arrow` | prefix 없이 pane 이동 |
| `Shift + Left/Right` | window 이동 |
| `Alt + 1..9` | window 직접 이동 |
| `prefix + r` | 설정 reload |
| `prefix + [` | copy-mode |
| copy-mode `v` / `y` | select / yank |

## TPM

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
```

tmux 안에서 **prefix + I**.

플러그인:
- `tmux-sensible`
- `tmux-resurrect`
- `tmux-continuum`
- `tmux-yank`

## clipboard

현재 copy pipe는 `xclip` 사용:

```tmux
copy-pipe-and-cancel "xclip -selection clipboard"
```

Wayland 순정으로 바꾸려면 `wl-copy`를 설치하고 `.tmux.conf`에서 교체.