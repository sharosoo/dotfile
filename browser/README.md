# Browser (agent 브라우저 자동화)

코딩 에이전트(omp)가 터미널 포커스를 뺏기지 않고 브라우저를 백그라운드에서 제어할 수 있도록 구성한 환경. 에이전트 로그인에 필요한 로컬 자격 증명, TOTP, 세션 관리도 함께 포함한다.

에이전트 측 브라우저 조작 규칙은 omp 전역 스킬인 `skill://browser-agent`(`omp/agent/managed-skills/browser-agent/`)를 따른다.

## 구성 파일

- `relay-extension/` — omp 기본 확장인 "OMP Browser Relay"(omp 18.8.6)를 포크한 확장(sharosoo Browser Relay).
  - 변경 사항: CDP `Page.bringToFront` 및 `activateTab` 호출 시 창 포커스를 올리지 않고 탭만 전환, 새 탭은 `active: false`로 생성, 연결된 모든 탭에 `Emulation.setFocusEmulationEnabled`를 적용해 백그라운드 탭도 렌더링 유지.
  - 포크 이유: Hyprland 환경에서 Chromium의 창 포커스 요청이 작업 중인 터미널 포커스를 가로채는 문제를 방지. 또한 omp 업그레이드나 재설치 시 `~/.omp/browser-relay/extension`이 덮어쓰여지므로 dotfile에서 독립 관리함.
- `bin/browser-vault` — GNOME keyring(`sharosoo-browser` 서비스) 자격 증명 보관, TOTP 코드 생성, 세션 저장 파일(`storageState`) 관리, 액션별 허용/확인/차단(allow/confirm/deny) 정책 검사를 수행하는 CLI.
- `policy.toml` — 에이전트가 접근 가능한 사이트, 필드, TOTP, 세션 사용 범위와 확인(confirm) 또는 차단(deny) 대상 동작 정의. 명시되지 않은 사이트는 기본 차단됨.
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

1. `policy.toml`에 `[sites.<name>]` 항목을 추가한다 (domains, fields, otp, session).
2. 비밀값은 챗에 노출하지 말고 터미널의 입력 숨김 프롬프트로 직접 등록한다:
   ```bash
   browser-vault set github username
   browser-vault set github password
   browser-vault set github totp   # base32 seed or otpauth:// URI
   ```
3. 등록 확인:
   ```bash
   browser-vault list
   ```
   저장된 필드 이름만 표시되며, 실제 값은 출력되지 않는다.

저장된 세션 파일은 저장소에 커밋되지 않고 `~/.local/share/sharosoo-browser/sessions/`(권한 700/600)에 보관된다. 세션을 삭제할 때는 아래 명령을 실행한다:
```bash
browser-vault session rm <site>
```

## 확장 프로그램 업데이트 시 (omp 공식 확장이 변경되었을 때)

`omp browser-relay install` 실행 후 `~/.omp/browser-relay/extension/background.js`와 `relay-extension/background.js`를 비교한다. `Local patch`로 표시된 세 가지 변경 사항을 새 버전에 다시 적용하고, `manifest.json`의 `version`을 올린 뒤 `chrome://extensions`에서 확장을 다시 로드한다.
