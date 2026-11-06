# Browser (agent 브라우저 자동화)

코딩 에이전트(omp)가 터미널 포커스를 뺏기지 않고 브라우저를 백그라운드에서 제어할 수 있도록 구성한 환경. 에이전트 로그인에 필요한 로컬 자격 증명, TOTP, 세션 관리도 함께 포함한다.

에이전트 측 브라우저 조작 규칙은 omp 전역 스킬인 `skill://browser-agent`(`omp/agent/managed-skills/browser-agent/`)를 따른다.

## 구성 파일

- `relay-extension/` — omp 기본 확장인 "OMP Browser Relay"(omp 18.8.6)를 포크한 확장(sharosoo Browser Relay).
  - 변경 사항: CDP `Page.bringToFront` 및 `activateTab` 호출 시 창 포커스를 올리지 않고 탭만 전환, 새 탭은 `active: false`로 생성, 연결된 모든 탭에 `Emulation.setFocusEmulationEnabled`를 적용해 백그라운드 탭도 렌더링 유지.
  - 포크 이유: Hyprland 환경에서 Chromium의 창 포커스 요청이 작업 중인 터미널 포커스를 가로채는 문제를 방지. 또한 omp 업그레이드나 재설치 시 `~/.omp/browser-relay/extension`이 덮어쓰여지므로 dotfile에서 독립 관리함.
- `bin/browser-vault` — 자격 증명과 세션을 관리하는 CLI. GNOME 키링(`sharosoo-browser` 서비스)에 자격 증명을 저장하고, TOTP 코드를 생성하며, 에이전트가 사이트 2FA 설정 화면에서 읽은 TOTP 시드를 등록(`otp-enroll`)한다. 저장된 세션 파일(`storageState`)을 관리하고 작업별 `allow`/`confirm`/`deny` 정책도 검사한다.
- `policy.toml` — 직접 작성하는 기본 정책 파일. 사용자 확인이 필요한 작업(`confirm`)과 차단할 작업(`deny`), 기본 세션 TTL은 물론 에이전트가 이미 저장된 TOTP 시드를 덮어쓸 수 있는지(`otp_replace`, 기본값 꺼짐)도 설정한다. 등록되지 않은 사이트는 요청이 모두 거부된다.
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
- `--otp-replace`: 이 사이트에 이미 저장된 TOTP 시드를 `otp-enroll --replace`로 덮어쓸 수 있게 허용한다(기본값 꺼짐).
- `--otp-enroll confirm|auto`: 에이전트가 TOTP를 등록할 때마다 사용자 확인을 거칠지(`"confirm"`, 기본값), 상시 허용할지(`"auto"`) 정한다.
- `--otp-issuer <name>`: 등록할 `otpauth://` URI에 들어 있어야 하는 발급자(issuer) 이름을 지정한다(기본값: `domains` 중 하나의 등록 가능 도메인 이름). `--otp-issuer ''`를 주면 설정을 지운다.
- `--ignore-port`: `domains`를 비교할 때 포트를 무시하고 호스트만 대조한다(기본값 꺼짐).
- `--no-session`: 세션 저장을 비활성화
- `--confirm` / `--deny`: 확인 또는 차단 대상 액션 목록을 새로 지정
- `--no-prompt`: 프롬프트를 띄우지 않고 사이트 메타데이터만 갱신

저장된 세션은 계정별로 `~/.local/share/sharosoo-browser/sessions/<site>.<account>.json` 파일에 저장되며(권한 700/600), 저장소에는 커밋되지 않는다. `add`나 `forget`으로 사이트 설정을 변경한 뒤에는 `sites.toml`을 dotfile 저장소에 커밋한다.

## 2FA(TOTP) 등록

에이전트가 작업하는 도중 사이트에 2FA 설정 화면이 나타나면 `browser-vault otp-enroll <site[:account]> --host <page origin>`로 직접 TOTP를 등록한다. `tab.run` 안에서 설정 키(‘스캔할 수 없나요? 이 키를 입력하세요’ 같은 안내 텍스트나 `zbarimg`로 디코딩한 QR의 `otpauth://` 값)를 읽어 stdin으로만 넘기므로, 시크릿이 대화 내역이나 argv, 파일에 드러나지 않는다. 이 명령은 시크릿을 키링에 저장한 뒤 현재 코드만 출력하며, 에이전트는 그 코드를 설정 화면에 입력해 등록을 마친다. 사이트에서 코드를 거부하면 에이전트는 작업을 멈추고 보고하며, 필요하면 사용자가 `browser-vault rm <site:account> totp`로 저장된 시드를 삭제한다.

- 기본 설정(`otp_enroll = "confirm"`)에서는 에이전트가 등록할 때마다 채팅에서 정확한 `site:account`를 밝히고 사용자에게 먼저 물어, 승낙을 받은 뒤에야 `--confirmed`를 넘긴다(이 옵션이 없으면 명령은 종료 코드 3으로 멈춘다). `otp_enroll = "auto"`는 발급자(issuer)가 사이트와 일치하고 계정 레이블이 저장된 사용자 이름이나 이메일과 일치하는 `otpauth://` URI(QR)에 한해서만 상시 허용으로 동작한다. 그 밖의 경우(순수 base32 키, 발급자나 계정 레이블이 빠진 URI, 저장된 사용자 이름이나 이메일이 없는 계정)에는 여전히 사용자 승낙과 `--confirmed`가 필요하다.
- `otp = true`로 설정된 사이트이면서 볼트에 이미 자격 증명이 저장된 계정만 등록할 수 있다.
- `--host`에는 경로(path), 쿼리, 프래그먼트를 뺀 페이지 오리진(`new URL(tab.url()).origin`)만 넘기므로 URL에 든 토큰이 argv에 들어가지 않는다. 오리진은 사용자 정보(userinfo)가 없는 `https`여야 하며(`localhost`만 `http` 허용), 호스트는 소문자 변환과 끝점(`.`) 제거, IDNA 변환을 거친 뒤 비교한다. 호스트와 포트가 `domains` 항목과 정확히 일치해야 한다(포트가 없는 항목은 기본 포트를 뜻하고, `*.example.com` 형태는 서브도메인만 허용하며, `ignore_port = true`이면 포트를 구분하지 않는다).
- 입력이 `otpauth://` URI이면 발급자(issuer)가 사이트(`otp_issuer`가 설정되어 있으면 그 값, 없으면 사이트 `domains` 중 하나의 등록 가능 도메인 이름 — 예: `github.com`이면 `github`, `www.example.co.kr`이면 `example`, `com`이나 `co` 같은 TLD는 제외)와 일치해야 하고, 계정 레이블도 저장된 계정의 사용자 이름이나 이메일과 일치해야 한다.
- 시크릿을 명령행 인자(argv)로 넘기면 거부된다(해당 키는 노출된 것으로 보고 2FA 설정을 처음부터 다시 시작해야 한다). 오류 메시지에는 호출자가 입력한 값을 절대 그대로 다시 출력하지 않는다.
- 이미 저장된 시드는 덮어쓰지 않으며, 사용자가 `browser-vault add <site> --otp-replace`로 `otp_replace`를 켜 두었고 `--replace`를 함께 지정했을 때만 덮어쓴다.
- 볼트를 변경하는 명령(`add`, `set`, `rm`, `forget`, `otp-enroll`)은 정책을 읽기 전에 공통 파일 잠금(file lock)을 먼저 잡으므로, 검사와 쓰기 사이에 다른 명령이 끼어들어 상태를 바꿀 수 없다. 30초 넘게 잠금을 얻지 못하면 명령은 실행을 포기한다.
- base32 시크릿과 자릿수(6~8자리), 갱신 주기(period), 알고리즘(SHA1/SHA256/SHA512)을 검증한다.
- 키링 오류(예: D-Bus 장애)가 발생하면 ‘저장된 시드 없음’으로 처리하지 않고 즉시 명령을 중단한다.
- 등록할 때마다 시크릿은 빼고 저장 전에 `pending` 줄을, 저장 후에 `ok`(또는 `failed`) 줄을 `~/.local/share/sharosoo-browser/otp-enroll.log`(권한 600)에 기록한다. 저장한 뒤 `ok` 줄을 기록하지 못하면 저장을 되돌리고(이전 시드를 복원하거나 새로 저장한 시드를 삭제함) 코드도 출력하지 않은 채 실패로 끝난다. 아예 로그를 쓸 수 없거나 데이터 디렉터리 또는 로그 파일이 심볼릭 링크이면 아무것도 저장하지 않는다.

로컬 웹앱 QA에서는 사용자가 herdr 오른쪽 패널에서 실행 화면을 볼 수 있도록 에이전트가 herdr 브라우저(`herdr-browser.service`, CDP `127.0.0.1:9333`, 영구 프로필)를 쓰며, 해당 서비스 파일은 `omarchy/` 아래에, 로그인 순서(기존 세션 → 저장된 세션 → `browser-vault` 자격 증명/OTP → 세션 저장)를 포함한 에이전트 측 규칙은 `skill://browser-agent`에 있다.

herdr 에이전트 브라우저는 `herdr-browser-sync`를 통해 평소 쓰는 Chromium(`~/.config/chromium/Default`)의 환경을 사용자에서 에이전트 쪽으로만 단방향 공유한다. 쿠키 파일이 바뀌면 `herdr-browser-sync.path`가 이를 감지해 약 10초 뒤 CDP(`Storage.setCookies`)로 실시간 반영하며, 원래 브라우저에서 로그아웃하면 이 도구가 복사해 간 쿠키도 에이전트 쪽에서 함께 지우지만 에이전트 브라우저에서 따로 로그인한 세션은 그대로 유지한다. 방문 기록(병합), 사이트별 IndexedDB, 확장 프로그램과 그 저장 데이터는 에이전트 브라우저 서비스가 시작될 때마다(`herdr-browser.service.d/sync.conf`) 복사하므로 확장 프로그램을 추가하거나 지우면 다음 시작 때 반영되며, 모든 사이트가 하나의 데이터베이스를 쓰는 Local Storage는 서비스를 멈춘 상태에서 `herdr-browser-sync local-storage`로 요청할 때 한 번만 복사한다. 저장된 비밀번호는 절대 복사하지 않고 로그인할 때 계속 `browser-vault`를 쓰며, 에이전트 브라우저의 데이터가 원래 브라우저로 역류하는 일도 없고, `sharosoo Browser Relay` 확장 프로그램은 에이전트 브라우저에 의도적으로 불러오지 않는다. 에이전트 브라우저도 사용자 본인의 계정으로 로그인된 상태이므로 `skill://browser-agent`의 확인 규칙을 그대로 따른다.

쿠키 동기화(`herdr-browser-sync.service`)만 실패했을 때 자동으로 재시도하며, 방문 기록, IndexedDB, 확장 프로그램 복사는 에이전트 브라우저 서비스가 시작될 때만 실행되고 실패하면 로그만 남긴 뒤 다음 시작 때 다시 시도한다. 이 도구는 원래 Chromium 프로필과 `~/.local/share/herdr-browser`가 같은 사용자 소유라고 전제하므로, 경로 검사로 심볼릭 링크가 복사 대상을 다른 곳으로 빼돌리는 일은 막아주지만 같은 사용자 권한으로 실행되는 다른 프로그램까지는 방어하지 않는다.

## 확장 프로그램 업데이트 시 (omp 공식 확장이 변경되었을 때)

`omp browser-relay install` 실행 후 `~/.omp/browser-relay/extension/background.js`와 `relay-extension/background.js`를 비교한다. `Local patch`로 표시된 세 가지 변경 사항을 새 버전에 다시 적용하고, `manifest.json`의 `version`을 올린 뒤 `chrome://extensions`에서 확장을 다시 로드한다.
