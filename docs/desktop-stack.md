# Desktop stack (source of truth)

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