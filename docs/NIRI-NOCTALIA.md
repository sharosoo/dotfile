# Niri + Noctalia (Quickshell v4)

Ubuntu Wayland 세션: **niri** + **Noctalia** (`qs -c noctalia-shell`).

## dotfile 경로

| 경로 | `~/.config` 대상 |
|------|------------------|
| `niri/*.kdl`, `logout-to-sddm.sh` | `~/.config/niri/` |
| `noctalia/settings.json` | `~/.config/noctalia/settings.json` |
| `fcitx5/` | `~/.config/fcitx5/` |
| `systemd/user/*.service` | `~/.config/systemd/user/` |
| `docs/niri-noctalia-단축키.md` | 참고용 (홈 `~/niri-noctalia-단축키.md` 링크 가능) |

Noctalia **셸 소스**는 별도 클론: `~/.config/quickshell/noctalia-shell` (공식 저장소).

## 설치 / 링크

```bash
cd ~/workspaces/sharosoo/dotfile
./scripts/link-desktop-config.sh
systemctl --user daemon-reload
systemctl --user enable kwalletd6.service noctalia-qs.service xdg-desktop-portal-gtk.service
```

SDDM 기본 niri (sudo):

```bash
sudo bash ~/tmp/set-niri-sddm-default.sh
```

## 유지보수 스크립트 (`~/tmp`)

- `set-niri-sddm-default.sh` / `set-plasma-sddm-default.sh`
- `enable-kwallet-niri-session.sh`
- `fix-gpai-srh-health.sh` (sudo, lullu compose)
- `install-noctalia-niri-session.sh`, `fix-niri-sddm-session.sh`

## 한영 / 런처

- **Mod+Space**, **Mod+D** → Noctalia 런처 (`allow-inhibiting=false`)
- **Ctrl+Space**, **한/영** → fcitx5 (`~/.config/fcitx5/config`)