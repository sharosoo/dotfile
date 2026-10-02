# Omarchy

Omarchy(Hyprland Lua 설정 + Omarchy 셸) 위에 얹어 쓰는 개인 커스텀 설정입니다.
설정 파일은 `omarchy/home/` 아래에 있으며, `$HOME` 디렉터리 경로와 1:1로 대응합니다. 아래에서 설명하는 패치 1건을 제외하면 `/usr/share/omarchy` 아래 파일은 직접 수정하지 않습니다.

## 설치 / 반영

```bash
cd ~/workspaces/sharosoo/dotfile/omarchy
./sync.sh            # home/ 아래 모든 파일을 $HOME으로 심볼릭 링크
./sync.sh capture    # shell.json을 저장소로 다시 복사
hyprctl reload
```

`./sync.sh`는 `home/` 안의 각 파일을 `$HOME`의 동일한 경로로 심볼릭 링크합니다. 대상 경로에 이미 다른 내용의 파일이 있다면 `*.bak.<timestamp>`로 이름을 바꿔 백업한 뒤 링크하고, 내용이 같다면 링크로 바로 교체합니다. 언제든 다시 실행해도 안전합니다.

**`shell.json` 예외**: `.config/omarchy/shell.json`은 심볼릭 링크 대신 복사 방식으로 다룹니다. Omarchy 셸이 임시 파일을 작성한 뒤 이름을 바꾸는 방식(원자적 쓰기)으로 저장하므로, 심볼릭 링크를 걸어 두면 링크가 풀리고 일반 파일로 대체되기 때문입니다. 시스템에서 `shell.json`을 직접 수정했거나 바의 시계 형식 변경 등으로 파일이 갱신되었다면, `./sync.sh capture`를 실행해 저장소로 가져옵니다.

## 변경 내역

| 기능 | 파일 | 내용 |
| --- | --- | --- |
| 스크롤링 레이아웃 기본 적용 및 라운딩 10 | `.config/hypr/looknfeel.lua` | 모든 워크스페이스의 기본 레이아웃을 스크롤링(scrolling)으로 지정합니다. |
| `Super+F` 열 너비 전체 확장 | `.config/hypr/bindings.lua`<br>`.local/bin/scroll-full-width` | 스크롤링 레이아웃을 유지하면서 현재 포커스된 열(column) 너비를 화면 전체와 이전 너비 사이에서 토글합니다. 열이 화면 전체를 채워도 `Super+방향키` 슬라이드 이동이 유지됩니다. 실제 전체화면(fullscreen)은 `Super+Alt+F`로 옮겼습니다. |
| `Super+Shift+←/→` 열 순서 변경 | `.config/hypr/bindings.lua`<br>`.local/bin/scroll-swap` | 창 단위가 아니라 열 전체 단위로 맞바꿉니다(`swapcol`). Omarchy 기본 창 교체는 슬롯 너비를 그대로 유지해 옮겨진 창이 화면 전체로 늘어나는 문제가 있었습니다. 열 단위로 바꾸면 각 창의 원래 너비가 유지됩니다. |
| 스크린샷 단축키 | `.config/hypr/bindings.lua`<br>`.local/bin/screenshot-upload.sh` | `Super+Shift+S`는 일반 스크린샷을 찍습니다. `Super+Ctrl+Shift+S`는 영역 스크린샷을 찍어 GitHub `sharosoo/image` 저장소에 올리고 클립보드에 CDN 링크를 복사합니다. |
| 브라우저 반투명화 | `.config/hypr/hyprland.lua` | Chromium/Firefox 계열 브라우저에도 일반 창과 동일한 불투명도(포커스 시 `0.985`, 비포커스 시 `0.96`)를 적용합니다 (Omarchy 기본 설정은 브라우저를 예외 처리함). |
| 차분한 화면보호기 | `.local/share/omarchy-overrides/bin/omarchy-screensaver`<br>`.config/hypr/hyprland.lua` (PATH 블록) | 무작위 효과를 `colorshift highlight sweep wipe middleout slide rain print`로 한정합니다. `hyprland.lua`에서 `~/.local/share/omarchy-overrides/bin`을 Omarchy 자체 bin보다 PATH 앞쪽에 두어 오버라이드합니다. |
| 유휴(idle) 시간 조정 | `.config/omarchy/shell.json` (`idle`) | 600초(10분) 뒤 화면보호기를 켜고, 1800초(30분) 뒤 화면을 잠급니다. |
| 바 워크스페이스 1–2 상시 표시 | `.config/omarchy/plugins/sharosoo.workspaces/`<br>`shell.json` | 1~5번이 하드코딩된 `omarchy.workspaces` 플러그인의 포크입니다. `persistent`로 지정한 워크스페이스(기본 2개)와 창이 열려 있는 다른 워크스페이스를 표시합니다. |
| 알림 창 반투명화 | `.config/omarchy/shell.toml` | `[notifications] background-alpha = 0.55`를 적용합니다. |
| 알림 에이전트 아이콘 | `.local/bin/notify-send`<br>`.local/share/notification-icons/agents/*.png` | herdr 및 에이전트들이 인자 없이 호출하는 `notify-send`를 감싸는 래퍼입니다. 제목 첫 단어(`omp`, `claude`, `codex`)를 파싱해 알맞은 아이콘을 고르며, 그 외 herdr가 보낸 알림에는 herdr 아이콘을 띄웁니다. `--app-icon`을 사용해 알림 센터 기록에도 아이콘이 남습니다. 에이전트를 추가하려면 해당 디렉터리에 소문자로 `<name>.png`를 넣으면 됩니다. |
| Chromium 알림 사이트 아이콘 | `.local/bin/notification-icons-sync`<br>`.local/bin/notification-icons-patch`<br>`.local/share/omarchy-overrides/notification-card-site-icons.patch`<br>`.config/omarchy/hooks/post-update.d/notification-site-icons.hook` | 리눅스 환경의 Chromium은 모든 알림에 브라우저 자체 로고만 보냅니다. `notification-icons-sync`가 Chromium에 저장된 파비콘을 `~/.local/share/notification-icons/<host>.png`로 추출하고, 패치를 통해 Omarchy의 `NotificationCard.qml`이 본문 시작 부분에 해당 사이트 호스트 아이콘을 표시하도록 수정합니다 (없으면 Chromium 로고 표시). |

## Omarchy 업데이트 후

'Chromium 알림 사이트 아이콘'만 시스템 파일(`/usr/share/omarchy/shell/plugins/notifications/components/NotificationCard.qml`)을 직접 수정하므로, Omarchy가 업데이트되면 패치가 풀립니다.
업데이트 후 훅(post-update hook)이 알림을 띄우며, 해당 알림을 클릭하면 `notification-icons-patch`가 실행됩니다(sudo 비밀번호 필요). 패치 후에는 `omarchy-restart-shell`을 실행해 셸을 다시 시작합니다.
업스트림에서 카드 컴포넌트를 크게 변경해 패치가 자동 적용되지 않으면 스크립트가 안내 메시지를 출력하므로 직접 수동으로 다시 패치해야 합니다.
또한 '차분한 화면보호기' 스크립트는 Omarchy 스크립트를 복사해 둔 것이므로, 업스트림의 변경 사항이 자동으로 반영되지 않습니다.

## 새 PC

`./sync.sh` 실행 후 `notification-icons-patch`를 한 번 실행하고(sudo 필요), `omarchy-restart-shell`을 실행합니다. 사이트 파비콘은 저장소에 커밋하지 않으며, 로컬 Chromium 프로필에서 `notification-icons-sync`가 직접 추출해 생성합니다(`notification-icons-patch` 스크립트 내부에서도 함께 실행됩니다).
