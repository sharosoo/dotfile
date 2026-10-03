# 새 PC에서 Omarchy 환경 재현하기

새로 설치한 Omarchy 환경에서 현재 머신(`turing`)의 설정을 그대로 재현하기 위한 단계별 런북입니다. Omarchy `4.0.4`, Hyprland `0.56.2` 버전 기준으로 2026-10-02에 작성했습니다. 각 커스텀 설정의 구체적인 역할과 도입 이유는 같은 폴더의 `README.md`를 참고하시기 바랍니다. 이 문서는 작업 순서와 확인 절차만 다룹니다. (수동) 표기가 붙은 단계는 사용자 입력(비밀번호 입력, 로그인, 브라우저 조작 등)이 직접 필요합니다.

## 0. 사전 준비
- Omarchy를 새로 설치하고 Hyprland 세션으로 로그인해 둡니다.
- 저장소를 복제할 수 있도록 GitHub 접근 권한을 확인합니다.

## 1. dotfile 저장소 복제
```bash
mkdir -p ~/workspaces/sharosoo
git clone https://github.com/sharosoo/dotfile.git ~/workspaces/sharosoo/dotfile
```
경로가 맞아야 정상 동작합니다. `hyprland.lua`, `bindings.lua`, `config.fish` 파일이 `~/workspaces/sharosoo/dotfile`과 `/home/sharosoo` 경로를 직접 참조합니다. 다른 사용자 이름이나 경로를 쓴다면 먼저 해당 참조부터 고쳐야 합니다 (`grep -rn sharosoo omarchy/home`).

## 2. Omarchy 기본 패키지 외 추가 패키지 설치
```bash
omarchy pkg add fish fcitx5-hangul tailscale
```
- `fish`: Ghostty 및 herdr 내부에서 기본으로 쓰는 셸입니다 (로그인 셸은 bash를 그대로 유지합니다).
- `fcitx5-hangul`: 한글 입력기 엔진입니다.
- `tailscale`: VPN 연결 도구입니다.

다음 패키지는 Omarchy에 이미 들어 있으므로 따로 설치하지 않아도 됩니다: `herdr`, `chromium`, `ttfx` (화면 보호기), `bluez-tools` (bt-agent), `python-gobject`, `sqlite`, `imagemagick`, `jq`, `socat`.

그 외 개인 도구 모음은 선택 사항입니다. 필요하다면 `scripts/packages.arch`, `scripts/packages.aur`, `scripts/packages.mise` 및 루트 `README.md`를 참고하세요.

## 3. Omarchy 서드파티 플러그인 설치

서드파티 바 플러그인도 이 저장소에 함께 보관합니다(`omarchy/vendor/plugins/`, 커밋 및 업스트림 정보는 `omarchy/vendor/plugins.lock`에 고정). 따라서 직접 설치할 필요가 없습니다. 4단계에서 `./sync.sh`를 실행하면 설치되지 않은 플러그인을 지정된 커밋으로 알아서 복제해 오며, 네트워크 연결이 없거나 원본 저장소가 사라져 복제에 실패하더라도 저장소에 보관된 코드를 대신 복사합니다.

설치된 플러그인은 일반 git 저장소 상태를 유지하므로 `omarchy plugin update`로 바로 업데이트할 수 있습니다. 업데이트한 뒤에는 `./sync.sh capture`를 실행해 변경된 코드와 커밋 해시를 저장소에 기록하고 커밋하면 됩니다. 새 서드파티 플러그인을 추가할 때는 `omarchy plugin add <git-url>`로 설치하고 `vendor/plugins.lock`에 새 줄로 플러그인 ID를 추가한 다음 `./sync.sh capture`를 실행하세요.

```bash
omarchy plugin update
cd ~/workspaces/sharosoo/dotfile/omarchy && ./sync.sh capture
```

| 플러그인 | 용도 |
| --- | --- |
| `jankeesvw.herdr` | 바에서 herdr 에이전트 상태 확인 |
| `jankeesvw.notification-center` | 알림 히스토리 패널. 플러그인 자체는 원본 그대로 사용하며, 알림 커스텀(배경 투명도, 에이전트 아이콘, Chromium 사이트 아이콘)은 `shell.toml`, `notify-send`, 패치 파일에 적용되어 있습니다. 자세한 내용은 `README.md`를 참고하세요. |
| `quickshell.spotify` | 바에서 가볍게 쓸 수 있는 Spotify 플레이어. 공식 클라이언트(~950MB) 대비 메모리를 약 60MB만 차지합니다. Spotify Premium 계정이 필요합니다. |

### Spotify 로그인 (수동 작업, 5단계 이후)

5단계를 마친 뒤 수동으로 로그인을 진행합니다.

1. 바 왼쪽에 있는 Spotify 아이콘을 클릭합니다.
2. 미니 플레이어 화면에 **Set up and continue** 버튼이 나타나면 클릭합니다.
3. 브라우저에서 로그인 페이지가 열리면 계정 로그인 후 연동을 승인합니다.
4. 승인이 끝나면 로컬 재생 백엔드 설정을 진행합니다. (검증된 바이너리 다운로드, 로컬 Rust 빌드, 또는 Omarchy의 `spotifyd` 패키지 대체 설치 안내가 제공됩니다.)

나중에 "Spotify is busy" 오류가 뜬다면 공유 Client ID의 요청 한도가 초과된 상태입니다. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에서 Redirect URI를 `http://127.0.0.1:8989/login`으로 지정해 전용 앱을 직접 생성한 뒤, 발급받은 Client ID를 플러그인 설정에 입력하면 해결됩니다.

> **참고:** 개인 플러그인(`sharosoo.sysstat`, `sharosoo.omp-usage`, `sharosoo.workspaces`)은 저장소 안에 포함되어 있으므로 4단계에서 함께 반영됩니다.

## 4. 설정 동기화
```bash
cd ~/workspaces/sharosoo/dotfile/omarchy
./sync.sh
```
Omarchy 기본 설정 파일(`hyprland.lua`, `bindings.lua`, `looknfeel.lua`, `shell.json`, Ghostty 설정 등)은 기존 파일과 충돌하지 않도록 `*.bak.<timestamp>` 형태로 이름을 바꾸어 백업한 뒤 교체합니다. 복사 방식으로 관리하는 파일(`shell.json`, fcitx5 `profile`, herdr `config.toml`, `fish_plugins`)은 대상 경로에 직접 복사하며, 그 밖의 모든 파일은 심볼릭 링크로 연결합니다. Ghostty에서 쓰는 D2Coding Nerd Font도 함께 설치되므로(`~/.local/share/fonts/D2CodingNerd/`), 동기화가 끝나면 `fc-cache -f`를 실행합니다.

## 5. 테마 적용 및 다시 불러오기
```bash
omarchy-theme-set "Tokyo Night"
hyprctl reload
omarchy-restart-shell
```
UI 기본 글꼴은 Omarchy 기본값인 `JetBrainsMono Nerd Font`를 사용합니다. Ghostty 내부 글꼴만 `D2Coding Nerd Font` 9pt로 덮어씁니다.

## 6. Fish 설정
```bash
fish -c 'curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher update'
```
`fisher update`를 실행하면 `fish_plugins`에 명시된 플러그인(`jorgebucaran/fisher`, `realiserad/fish-ai`)을 설치합니다. fish-ai를 쓰려면 저장소의 `fish/fish-ai.ini.example` 파일을 `~/.config/fish-ai.ini`로 복사한 뒤 API 키를 직접 입력해야 합니다 (수동). 

`chsh`는 절대 실행하지 마세요. Omarchy 세션 스크립트가 문제없이 동작하려면 로그인 셸을 bash로 유지해야 합니다. Ghostty(`command = /usr/bin/fish`)와 herdr(`default_shell`)가 직접 fish를 실행합니다. 프롬프트는 저장소의 `starship/starship.toml` 설정을 바탕으로 Starship을 씁니다.

## 7. 한글 입력기 설정
4단계에서 반영한 fcitx5 프로필에 `keyboard-us`와 `hangul`이 들어 있습니다. fcitx5 프로세스는 Omarchy의 `omarchy-fcitx5.service`가 자동으로 띄웁니다. `fcitx5-hangul` 설치 후 시스템에서 한 번 로그아웃했다가 다시 로그인하세요. 기본 전환 단축키인 `Ctrl+Space`로 한영을 전환합니다.

## 8. 알림 웹사이트 아이콘 패치 (sudo 권한 필요)
```bash
notification-icons-patch
omarchy-restart-shell
```
Omarchy의 `NotificationCard.qml`을 패치하고 Chromium 파비콘을 추출합니다. 파비콘은 Chromium으로 방문한 사이트에서 가져오므로, 먼저 Chromium에서 Slack이나 Discord 등을 열고 알림을 허용해야 합니다 (수동). `notification-icons-sync`는 필요할 때마다 언제든 다시 실행해도 좋습니다. Omarchy 패키지가 업데이트되어 패치가 풀리면 다시 적용하라는 알림이 뜨니 그때 클릭해서 다시 실행하면 됩니다.

## 9. 기타 앱 및 서비스 구성
- Discord 웹 앱: `omarchy-webapp-install Discord https://discord.com/channels/@me omarchy-discord`
- omp(에이전트, 스킬, 룰, 모델 설정): `dotfile/omp/sync.sh restore`를 실행합니다. 이어지는 플러그인 연결과 MCP 토큰 설정은 [`omp/README.md`](../omp/README.md)를 따릅니다.
- Tailscale (수동): `sudo systemctl enable --now tailscaled && sudo tailscale up`
- 블루투스 키보드: `systemctl --user enable --now bt-agent`를 실행하고 키보드를 페어링 모드로 둔 뒤 `bt-keyboard-pair`를 실행합니다. 패스키 알림이 화면에 뜹니다.
- herdr: Omarchy 기본 포함 프로그램입니다. 설정은 4단계에서 반영됩니다. herdr 알림이 데스크톱으로 전달되고 `notify-send` 래퍼를 통해 에이전트 아이콘이 제대로 표시되려면 `[ui.toast]` 섹션의 `delivery = "system"` 설정을 반드시 유지해야 합니다.

## 10. 정상 동작 확인
다음 체크리스트를 따라 각 항목이 의도대로 동작하는지 확인합니다.

| 항목 | 확인 방법 | 기대 결과 |
|---|---|---|
| 전체 화면 토글 | 스크롤 작업 공간에서 `Super+F` 입력 | 현재 열이 화면 전체 너비로 확장되며 `Super+방향키` 슬라이드는 유지됨. 다시 누르면 원래 너비로 복귀 |
| 열 위치 교환 | `Super+Shift+←/→` 입력 | 현재 열과 좌우 열의 위치가 바뀌며 각 열 너비는 그대로 유지됨 |
| 작업 공간 패널 표시 | 상단 바 확인 | 1번과 2번 작업 공간이 항상 화면에 표시됨 |
| 유휴 상태 설정 | `omarchy-shell idle status` 실행 | `"screensaver":600`, `"lock":1800` 값 반환 |
| 화면 보호기 | `omarchy-launch-screensaver force` 실행 | 차분한 연출 중 하나가 실행되며 아무 키나 누르면 바로 닫힘 |
| 에이전트 알림 아이콘 | `notify-send -- "omp needs attention" test` 실행 | omp 아이콘이 알림 팝업 및 알림 센터에 정상 표시됨 |
| 브라우저 반투명 효과 | Chromium 창에서 `hyprctl getprop active opacity` 실행 | `0.985` 반환 |
| 한글 입력 | 텍스트 입력창에서 `Ctrl+Space` 입력 | 한글/영문 입력 모드가 정상 전환됨 |
| Hyprland 설정 오류 여부 | `hyprctl configerrors` 실행 | 아무런 오류 메시지도 출력되지 않음 |

## 11. 제외 대상 (머신별 독립 설정 항목)
`turing` 머신에서 쓰고 있지만 자격 증명을 포함하거나 다른 프로젝트에 속해 있어 이 저장소에서는 관리하지 않는 항목들입니다. 새 머신에서 별도로 설정해야 합니다:
- `cloudflared-sharosoo.service` (Cloudflare 터널, `~/.cloudflared/` 필요)
- `hermes-gateway.service`
- `cargo-cache-sweep.timer`
- 클라우드 CLI 인증 정보 (`gcloud`, `wrangler` 등)
- Tailscale 로그인 세션
- herdr 플러그인 `heeler`

## 12. 저장소 최신 상태 유지하기
- 링크로 관리하는 파일: 원본 위치에서 바로 수정하면 저장소에 즉시 반영되므로, 수정 후 커밋하기만 하면 됩니다.
- 복사 방식으로 관리하는 파일(`shell.json`, fcitx5 `profile`, herdr `config.toml`, `fish_plugins`): 머신에서 설정을 바꾼 뒤 저장소 폴더에서 `./sync.sh capture`를 실행하고 커밋합니다.
- 새로운 커스텀 추가: 파일을 저장소 내 `omarchy/home/` 아래의 `$HOME` 상대 경로에 맞게 넣고, `./sync.sh`를 실행한 다음 `README.md` 표에 항목을 추가하세요. 필요한 경우 이 문서에도 작업 단계를 추가합니다.