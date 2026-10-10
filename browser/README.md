# Browser (agent 브라우저 자동화)

코딩 에이전트(omp)가 터미널 포커스를 뺏기지 않고 브라우저를 백그라운드에서 제어할 수 있도록 구성한 환경. 에이전트 로그인에 필요한 로컬 자격 증명, TOTP, 세션 관리도 함께 포함한다.

에이전트 측 브라우저 조작 규칙은 omp 전역 스킬인 `skill://browser-agent`(`omp/agent/managed-skills/browser-agent/`)를 따른다.

## 구성 파일

- `relay-extension/` — omp 기본 확장인 "OMP Browser Relay"(omp 18.8.6)를 포크한 확장(sharosoo Browser Relay).
  - 변경 사항: CDP `Page.bringToFront` 및 `activateTab` 호출 시 창 포커스를 올리지 않고 탭만 전환, 새 탭은 `active: false`로 생성, 연결된 모든 탭에 `Emulation.setFocusEmulationEnabled`를 적용해 백그라운드 탭도 렌더링 유지.
  - 포크 이유: Hyprland 환경에서 Chromium의 창 포커스 요청이 작업 중인 터미널 포커스를 가로채는 문제를 방지. 또한 omp 업그레이드나 재설치 시 `~/.omp/browser-relay/extension`이 덮어쓰여지므로 dotfile에서 독립 관리함.
- `bin/browser-vault` — GNOME keyring(`sharosoo-browser` 서비스) 자격 증명 보관, TOTP 코드 생성, 세션 저장 파일(`storageState`) 관리, 액션별 허용/확인/차단(allow/confirm/deny) 정책 검사를 수행하는 CLI.
- `policy.toml` — 직접 작성하는 기본 정책 파일. 사용자 확인이 필요한 작업(`confirm`)과 차단할 작업(`deny`), 기본 세션 TTL 등을 설정한다. 등록되지 않은 사이트는 요청이 모두 거부된다.
- `sites.toml` — `browser-vault add`나 `forget` 명령어가 관리하는 사이트 목록 파일. 손으로 직접 수정하지 않고 CLI로 갱신한다. 시크릿은 포함되지 않으며 도메인, 허용 필드, OTP 및 세션 설정 플래그만 저장된다.
- `install.sh` — `$HOME`에 심볼릭 링크를 연결하는 멱등 설치 스크립트.

## 설치 (새 머신)

```bash
./browser/install.sh
```

1. 위 스크립트를 실행해 심볼릭 링크를 연결한다.
2. Chromium에서 `chrome://extensions` 접속 → **개발자 모드(Developer mode)** 켜기 → **압축해제된 확장 프로그램을 로드합니다(Load unpacked)** 클릭 → `~/.config/sharosoo-browser/relay-extension` 선택.
3. 기존 "OMP Browser Relay"가 설치되어 있다면 삭제한다 (두 확장이 동시에 실행되면 둘 다 릴레이에 연결됨).
4. `omp/agent/config.yml`의 `browser.relay` 설정은 `false`로 유지한다. 에이전트는 호출 시 `app: { relay: true }` 옵션으로 개별 활성화한다.

## 계정 추가

사이트와 계정은 TOML 파일을 직접 수정하지 않고 CLI로 등록한다. 명령어를 실행하면 사이트 정보를 등록한 뒤 각 시크릿 값을 숨김 프롬프트로 차례대로 묻는다. 값을 입력하지 않고 엔터를 치면 해당 항목을 건너뛰거나 기존 값을 유지한다. 시크릿은 절대 대화창에 직접 붙여넣지 않는다.

```bash
browser-vault add korail --domain korail.com --domain www.korail.com
browser-vault add google:work --domain accounts.google.com --otp     # TOTP 시드(base32 또는 otpauth:// URI)도 함께 입력받음
browser-vault add google:personal                                   # 이미 등록된 사이트에 두 번째 계정 추가
```

한 사이트에 여러 계정을 둘 수 있으며 `SITE:ACCOUNT` 형식으로 지정한다. 사이트 이름만 단독으로 쓰면(`SITE`) 해당 사이트에 하나뿐인 계정을 가리키며, 최초 등록 시 계정 이름은 기본적으로 `default`가 된다. 계정이 여러 개 등록된 사이트에 계정 이름 없이 `SITE`만 넘기면 오류가 나므로 반드시 계정을 명시해야 한다.

기타 명령어:
```bash
browser-vault set google:work password   # 특정 항목 값 변경
browser-vault list                       # 등록된 사이트·계정·저장된 필드 이름만 출력 (값은 표시하지 않음)
browser-vault forget google:personal     # 특정 계정 삭제 (시크릿 및 저장된 세션 제거)
browser-vault forget google              # 사이트 및 소속 계정 전체 삭제
```

`add` 명령어 옵션:
- `--field <name>`: 허용 필드 추가 (`totp`를 지정하면 `--otp`가 함께 적용됨)
- `--no-session`: 세션 저장을 비활성화
- `--confirm` / `--deny`: 확인 또는 차단 대상 액션 목록을 새로 지정
- `--no-prompt`: 프롬프트를 띄우지 않고 사이트 메타데이터만 갱신

저장된 세션은 계정별로 `~/.local/share/sharosoo-browser/sessions/<site>.<account>.json` 파일에 저장되며(권한 700/600), 저장소에는 커밋되지 않는다. `add`나 `forget`으로 사이트 설정을 변경한 뒤에는 `sites.toml`을 dotfile 저장소에 커밋한다.

## 확장 프로그램 업데이트 시 (omp 공식 확장이 변경되었을 때)

`omp browser-relay install` 실행 후 `~/.omp/browser-relay/extension/background.js`와 `relay-extension/background.js`를 비교한다. `Local patch`로 표시된 세 가지 변경 사항을 새 버전에 다시 적용하고, `manifest.json`의 `version`을 올린 뒤 `chrome://extensions`에서 확장을 다시 로드한다.
