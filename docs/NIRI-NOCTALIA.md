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

| 스크립트 | 용도 |
|----------|------|
| `set-niri-sddm-default.sh` | SDDM 기본 세션 → niri (sudo) |
| `set-plasma-sddm-default.sh` | SDDM 기본 세션 → Plasma (sudo) |
| `install-noctalia-niri-session.sh` | noctalia-qs 빌드·의존성·세션 준비 (sudo) |
| `enable-noctalia-qs-systemd.sh` | `noctalia-qs.service` enable/restart |
| `enable-kwallet-niri-session.sh` | kwalletd6 세션 점검·기동 |
| `fix-niri-sddm-session.sh` | niri SDDM 세션 경로 수정 |
| `install-niri-user.sh` | 사용자 niri 바이너리 설치 |
| `emergency-logout.sh` | `loginctl terminate-user` 로그아웃 |
| `test-fuzzel.sh` | 런처 대안 테스트 (Noctalia 사용 시 참고만) |

DNS / cloudflared / DB 관련 스크립트는 이 스택과 무관 — dotfile에 넣지 않음.

## 한영 / 런처

- **Mod+Space**, **Mod+D** → Noctalia 런처 (`allow-inhibiting=false`)
- **Ctrl+Space**, **한/영** → fcitx5 (`~/.config/fcitx5/config`)