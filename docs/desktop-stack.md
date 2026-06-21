# Desktop stack (source of truth)

**설치:** 자동 `install.sh` 없음 → [README.md](../README.md) 문서 표 · [linking.md](linking.md)


**Repo:** `~/workspaces/sharosoo/dotfile`

| Component | Live path | Dotfile |
|-----------|-----------|---------|
| Niri | `~/.config/niri/` | `niri/` |
| Noctalia settings | `~/.config/noctalia/settings.json` | `noctalia/` |
| Noctalia shell | `~/.config/quickshell/noctalia-shell/` | clone separately |
| fcitx5 | `~/.config/fcitx5/` | `fcitx5/` |
| systemd user | `~/.config/systemd/user/` | `systemd/user/` |
| OpenCode / OMP plugins | `~/.config/opencode/` | `opencode/` |
| OMP runtime | `~/.omp/` | not in git — `omp/README.md` |

**Apply:** `./scripts/link-desktop-config.sh`  
**Detail:** `docs/NIRI-NOCTALIA.md`