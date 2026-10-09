# Desktop stack (source of truth)

**설치:** 자동 `install.sh` 없음 → [README.md](../README.md) 문서 표 · [linking.md](linking.md)


**Repo:** `~/workspaces/sharosoo/dotfile`

| Component | Live path | Dotfile |
|-----------|-----------|---------|
| fcitx5 | `~/.config/fcitx5/` | `fcitx5/` |
| systemd user | `~/.config/systemd/user/` | `systemd/user/` |
| OMP (oh-my-pi) 설정 | `~/.omp/` | `omp/` (런타임 DB·로그·캐시는 제외) |

**Apply:** `./scripts/link-desktop-config.sh`
