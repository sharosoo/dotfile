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

**복사 방식 파일**: `.config/omarchy/shell.json`, `.config/fcitx5/profile`, `.config/herdr/config.toml`, `.config/fish/fish_plugins`는 심볼릭 링크 대신 복사해서 관리합니다. 해당 프로그램들이 설정을 덮어쓸 때 심볼릭 링크가 일반 파일로 풀려버리기 때문입니다. Omarchy shell은 `shell.json`을 임시 파일 생성 후 이름 변경(rename) 방식으로 원자적으로 저장하고, fcitx5의 `profile`도 같은 방식으로 동작합니다. fisher는 `fish_plugins`를 삭제한 뒤 새로 만들며, herdr 설정 역시 안전을 위해 복사 방식을 적용했습니다. 상단 바의 시계 형식 순환 등으로 `shell.json`이 갱신되는 경우를 포함해 로컬에서 설정을 바꾼 뒤에는 `./sync.sh capture`를 실행해 저장소로 가져와야 합니다. 서드파티 플러그인도 심볼릭 링크로 연결하지 않습니다. `~/.config/omarchy/plugins/`에 일반 git 저장소 형태로 유지하며, 최신 코드는 `./sync.sh capture`로 다시 복사해 가져옵니다.

## 변경 내역

| 기능 | 파일 | 내용 |
| --- | --- | --- |
| 스크롤링 레이아웃 기본 적용 및 라운딩 10 | `.config/hypr/looknfeel.lua` | 모든 워크스페이스의 기본 레이아웃을 스크롤링(scrolling)으로 지정합니다. |
| `Super+F` 열 너비 전체 확장 | `.config/hypr/bindings.lua`<br>`.local/bin/scroll-full-width` | 스크롤링 레이아웃을 유지하면서 현재 포커스된 열(column) 너비를 화면 전체와 이전 너비 사이에서 토글합니다. 열이 화면 전체를 채워도 `Super+방향키` 슬라이드 이동이 유지됩니다. 실제 전체화면(fullscreen)은 `Super+Alt+F`로 옮겼습니다. |
| `Super+Shift+←/→` 열 순서 변경 | `.config/hypr/bindings.lua`<br>`.local/bin/scroll-swap` | 창 단위가 아니라 열 전체 단위로 맞바꿉니다(`swapcol`). Omarchy 기본 창 교체는 슬롯 너비를 그대로 유지해 옮겨진 창이 화면 전체로 늘어나는 문제가 있었습니다. 열 단위로 바꾸면 각 창의 원래 너비가 유지됩니다. |
| 스크린샷 단축키 | `.config/hypr/bindings.lua`<br>`.local/bin/screenshot-upload.sh` | `Super+Shift+S`는 일반 스크린샷을 찍습니다. `Super+Ctrl+Shift+S`는 영역 스크린샷을 찍어 `sharosoo-cdn` CLI([sharosoo/sharosoo-cdn](https://github.com/sharosoo/sharosoo-cdn))로 `cdn.sharosoo.com`(Cloudflare R2)의 `screenshots/<연>/<월>/`에 올리고 클립보드에 링크를 복사합니다. |
| 브라우저 반투명화 | `.config/hypr/hyprland.lua` | Chromium/Firefox 계열 브라우저에도 일반 창과 동일한 불투명도(포커스 시 `0.985`, 비포커스 시 `0.96`)를 적용합니다 (Omarchy 기본 설정은 브라우저를 예외 처리함). |
| 차분한 화면보호기 | `.local/share/omarchy-overrides/bin/omarchy-screensaver`<br>`.config/hypr/hyprland.lua` (PATH 블록) | 무작위 효과를 `colorshift highlight sweep wipe middleout slide rain print`로 한정합니다. `hyprland.lua`에서 `~/.local/share/omarchy-overrides/bin`을 Omarchy 자체 bin보다 PATH 앞쪽에 두어 오버라이드합니다. |
| 유휴(idle) 시간 조정 | `.config/omarchy/shell.json` (`idle`) | 600초(10분) 뒤 화면보호기를 켜고, 1800초(30분) 뒤 화면을 잠급니다. |
| 바 워크스페이스 1–2 상시 표시 | `.config/omarchy/plugins/sharosoo.workspaces/`<br>`shell.json` | 1~5번이 하드코딩된 `omarchy.workspaces` 플러그인의 포크입니다. `persistent`로 지정한 워크스페이스(기본 2개)와 창이 열려 있는 다른 워크스페이스를 표시합니다. |
| 알림 창 반투명화 | `.config/omarchy/shell.toml` | `[notifications] background-alpha = 0.55`를 적용합니다. |
| 알림 에이전트 아이콘 | `.local/bin/notify-send`<br>`.local/share/notification-icons/agents/*.png` | herdr 및 에이전트들이 인자 없이 호출하는 `notify-send`를 감싸는 래퍼입니다. 제목 첫 단어(`omp`, `claude`, `codex`)를 파싱해 알맞은 아이콘을 고르며, 그 외 herdr가 보낸 알림에는 herdr 아이콘을 띄웁니다. `--app-icon`을 사용해 알림 센터 기록에도 아이콘이 남습니다. 에이전트를 추가하려면 해당 디렉터리에 소문자로 `<name>.png`를 넣으면 됩니다. |
| Chromium 알림 사이트 아이콘 | `.local/bin/notification-icons-sync`<br>`.local/bin/notification-icons-patch`<br>`.local/share/omarchy-overrides/notification-card.patch`<br>`.config/omarchy/hooks/post-update.d/notification-site-icons.hook` | 리눅스 환경의 Chromium은 모든 알림에 브라우저 자체 로고만 보냅니다. `notification-icons-sync`가 Chromium에 저장된 파비콘을 `~/.local/share/notification-icons/<host>.png`로 추출하고, 패치를 통해 Omarchy의 `NotificationCard.qml`이 본문 시작 부분에 해당 사이트 호스트 아이콘을 표시하도록 수정합니다 (없으면 Chromium 로고 표시). |
| 알림 닫기 버튼 | `.local/share/omarchy-overrides/notification-card.patch` | 알림 카드 오른쪽 위에 × 버튼을 붙입니다. 카드를 누르면 알림의 링크나 동작이 실행되므로, 닫기만 하려면 이 버튼을 누릅니다. 마우스를 올리면 버튼이 진해집니다. Chromium 사이트 아이콘과 같은 패치 파일에 들어 있습니다. |
| Ghostty 설정 | `.config/ghostty/config` | Omarchy 환경에 맞춘 터미널 설정입니다. Omarchy 테마 색상을 따르며 `D2Coding Nerd Font` 9pt, 배경 불투명도 0.6을 적용했습니다. 로그인 셸은 bash로 유지하되 터미널 창은 fish(`command = /usr/bin/fish`)로 열리며, TUI 환경을 위해 Shift+Enter를 CSI-u로 전송합니다. |
| D2Coding Nerd Font | `.local/share/fonts/D2CodingNerd/D2CodingNerdFont.ttf` | Ghostty에서 쓰는 폰트입니다. Omarchy 기본 설치에는 포함되어 있지 않습니다. |
| Fish | `.config/fish/config.fish`<br>`.config/fish/fish_plugins` | 기존 개인 fish 설정을 Omarchy에 맞게 다듬었습니다. Omarchy의 PATH(mise shims, `~/.local/bin`)와 일치시키고 mise·zoxide·fzf·starship 초기화, Omarchy 스타일의 eza 별칭과 개인 git/에이전트 별칭(`h`=herdr, `cx`=claude, `cy`=codex)을 등록했습니다. fisher를 통해 `fish-ai` 플러그인을 설치해 사용합니다. |
| 한글 입력 | `.config/fcitx5/profile` | fcitx5 입력기 설정입니다. 입력기로 `keyboard-us`와 `hangul`을 등록해 두었습니다(`fcitx5-hangul` 패키지 필요). |
| herdr | `.config/herdr/config.toml`<br>`.local/bin/herdr-agent-picker` | Omarchy의 tmux 키바인딩(접두사 `ctrl+b`)을 그대로 따르며, 새 창은 fish로 열립니다. Hyprland 그룹 바에 맞춘 창 제목 형식을 지원하고 시스템 알림 연동(`[ui.toast] delivery = "system"`, 에이전트 아이콘 표시용)을 사용합니다. `prefix+f`를 누르면 fzf 기반 에이전트 선택기가 열려 원하는 창으로 바로 전환할 수 있습니다. |
| 바 위젯: 시스템 통계 및 OMP 사용량 | `.config/omarchy/plugins/sharosoo.sysstat/`<br>`.config/omarchy/plugins/sharosoo.omp-usage/` | 상단 바에 CPU·메모리 사용량을 표시(클릭 시 btop 실행)하고 OMP 사용량 패널을 제공합니다. 기존 `~/workspaces/sharosoo/omarchy-plugins`에서 이곳으로 옮겨왔습니다. 패널의 전체 요약과 각 프로바이더 탭에서 꺼둔 계정을 포함한 모든 계정을 온·오프 스위치와 함께 표시합니다(Command Code API 키처럼 식별 정보가 없는 계정은 스위치 제외). 스위치는 `bin/omp-accounts`를 실행해 `~/.omp/agent/agent.db`의 `disabled_cause`를 설정·해제하며, 인증 실패로 omp가 비활성화한 계정은 제외하고 사용자가 직접 끈 계정만 다시 켭니다. |
| 블루투스 키보드 페어링 | `.local/bin/bt-keyboard-pair` | 페어링 모드 상태인 키보드를 찾아 페어링·신뢰·연결까지 진행하며, 화면 알림으로 패스키를 보여줍니다. |
| 서드파티 바 플러그인 | `vendor/plugins/`<br>`vendor/plugins.lock` | `jankeesvw.herdr`, `jankeesvw.notification-center`, `quickshell.spotify`(MIT)의 코드(업스트림 문서·스크린샷 제외)와 업스트림 주소 및 커밋 해시입니다. `sync.sh`가 해당 커밋으로 복제하며 실패 시 보관된 코드로 대체합니다. `omarchy plugin update` 후에는 `sync.sh capture`로 코드와 락 파일을 갱신합니다. |

## Omarchy 업데이트 후

'Chromium 알림 사이트 아이콘'과 '알림 닫기 버튼'만 시스템 파일(`/usr/share/omarchy/shell/plugins/notifications/components/NotificationCard.qml`)을 직접 수정하므로, Omarchy가 업데이트되면 패치가 풀립니다.
업데이트 후 훅(post-update hook)이 알림을 띄우며, 해당 알림을 클릭하면 `notification-icons-patch`가 실행됩니다(sudo 비밀번호 필요). 패치 후에는 `omarchy-restart-shell`을 실행해 셸을 다시 시작합니다.
업스트림에서 카드 컴포넌트를 크게 변경해 패치가 자동 적용되지 않으면 스크립트가 안내 메시지를 출력하므로 직접 수동으로 다시 패치해야 합니다.
또한 '차분한 화면보호기' 스크립트는 Omarchy 스크립트를 복사해 둔 것이므로, 업스트림의 변경 사항이 자동으로 반영되지 않습니다.

## 새 PC

새 PC에 필요한 패키지 설치부터 서드파티 플러그인, 동기화, 테마, fish, 한글 입력, 알림 패치, 서비스 설정, 검증 체크리스트까지의 전체 재현 절차는 [NEW-PC.md](NEW-PC.md)에 정리해 두었습니다.
