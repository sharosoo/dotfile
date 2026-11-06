# Browser (agent 브라우저 자동화)

코딩 에이전트(omp)가 백그라운드에서 브라우저를 다루고, 로컬 자격 증명과 TOTP 코드, 저장된 세션으로 사이트에 로그인할 수 있게 구성한 환경이다. 에이전트는 사용자가 herdr 오른쪽 패널에서 화면을 볼 수 있고 사용자의 Chromium 세션을 그대로 이어받는 herdr 브라우저를 쓰거나, omp가 자체 관리하는 헤드리스 Chromium을 쓴다.

에이전트 측 브라우저 조작 규칙은 omp 전역 스킬인 `skill://browser-agent`(`omp/agent/managed-skills/browser-agent/`)를 따른다.

## 구성 파일

- `bin/browser-vault` — 자격 증명과 세션을 관리하는 CLI. GNOME 키링(`sharosoo-browser` 서비스)에 자격 증명을 저장하고, TOTP 코드를 생성하며, 에이전트가 사이트 2FA 설정 화면에서 읽은 TOTP 시드를 등록(`otp-enroll`)한다. 저장된 세션 파일(`storageState`)을 관리하고 작업별 `allow`/`confirm`/`deny` 정책도 검사한다.
- `policy.toml` — 직접 작성하는 기본 정책 파일. 사용자 확인이 필요한 작업(`confirm`)과 차단할 작업(`deny`), 기본 세션 TTL은 물론 에이전트가 이미 저장된 TOTP 시드를 덮어쓸 수 있는지(`otp_replace`, 기본값 꺼짐)도 설정한다. 등록되지 않은 사이트는 요청이 모두 거부된다.
- `sites.toml` — `browser-vault add`나 `forget` 명령어가 관리하는 사이트 목록 파일. 손으로 직접 수정하지 않고 CLI로 갱신한다. 시크릿은 담지 않으며 도메인, 허용 필드, OTP 및 세션 플래그, 로그인 설정(`login_paths`, `login_selectors`, `identity_selector`, `identity_paths`, `session_domains`) 같은 사이트 설정만 저장한다.
- `install.sh` — `$HOME`에 심볼릭 링크를 연결하는 멱등 설치 스크립트.

## 설치 (새 머신)

```bash
./browser/install.sh
```

1. 위 스크립트를 실행해 심볼릭 링크를 연결한다.
2. `omp/agent/config.yml`의 `browser.relay`는 `false`로 유지해 omp 기본 브라우저 릴레이를 꺼 둔다. 에이전트는 릴레이를 쓰지 않는다.
3. Chromium에 예전 `sharosoo Browser Relay` 확장 프로그램이 아직 설치되어 있다면 `chrome://extensions`에서 삭제한다.

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
- `--login-url <url>`: 사이트의 로그인 페이지. 이어서 진행할 페이지가 없을 때 `vaultLogin`이 이 주소를 열며, 그 경로(path)가 자격 증명을 입력하는 기본 경로가 된다.
- `--login-selector KEY=CSS`: 내장 어댑터가 없는 사이트에서 `vaultLogin`이 입력할 CSS 선택자. KEY는 `username`, `password`, `otp`, `submit` 중 하나다. 여러 번 지정할 수 있으며, `KEY=` 뒤에 아무 값도 적지 않으면 해당 항목을 지운다.
- `--login-path <path>`: 자격 증명을 입력할 수 있는 경로(정확히 일치하거나 `/`로 끝나는 접두사). 여러 번 지정할 수 있다. 기본값은 `login_url`의 경로이며, `''`를 주면 설정을 지운다.
- `--identity-selector <css>`: 로그인된 사용자 이름과 텍스트가 정확히 일치하는 요소. `vaultLogin`이 어떤 계정으로 로그인되었는지 확인할 때 쓴다. `''`를 주면 설정을 지운다.
- `--identity-path <path>`: `identity_selector`를 읽을 경로(정확히 일치하거나 `/`로 끝나는 접두사. `/`는 루트 페이지만 뜻함). 여러 번 지정할 수 있으며 기본값은 `/`다.
- `--session-domain <host>`: 저장된 세션이 쿠키를 보관할 호스트(서브도메인은 `*.example.com`). 여러 번 지정할 수 있으며 기본값은 `--domain` 목록이다. 자격 증명 입력을 허용할 위치를 판단할 때는 절대 쓰이지 않는다. `''`를 주면 설정을 지운다. google처럼 상위 도메인 쿠키에 로그인 상태를 유지하는 사이트에 필요하다(예: `--session-domain google.com --session-domain '*.google.com'`).
- `--no-session`: 세션 저장을 비활성화
- `--confirm` / `--deny`: 확인 또는 차단 대상 액션 목록을 새로 지정
- `--no-prompt`: 프롬프트를 띄우지 않고 사이트 메타데이터만 갱신

자격 증명을 어디에 입력할지는 `--domain`, `--login-path`, `--login-selector`로 결정하고, 저장된 세션 파일에 어떤 쿠키를 담을지는 오직 `--session-domain`으로만 결정한다.

저장된 세션은 계정별로 `~/.local/share/sharosoo-browser/sessions/<site>.<account>.json` 파일에 저장되며(권한 700/600), 저장소에는 커밋되지 않는다. `add`나 `forget`으로 사이트 설정을 변경한 뒤에는 `sites.toml`을 dotfile 저장소에 커밋한다.

## 에이전트 로그인 (`vaultLogin`)

에이전트는 자격 증명을 직접 입력하지 않고 `vaultLogin` 헬퍼(`~/.omp/agent/managed-skills/browser-agent/login.mjs`, dotfile `omp/agent/managed-skills/browser-agent/`)로 로그인한다. 이 헬퍼는 이미 로그인된 세션, 저장된 세션, 볼트의 사용자 이름 → 비밀번호 → TOTP 코드 순서로 로그인을 시도하며, `session_domains`에 속하는 쿠키만 저장한다. Google과 GitHub는 내장 어댑터가 있고, 그 밖의 사이트는 `--login-selector`가 필요하며 없으면 `needs_user`로 멈춘다. 결과 `status`는 `logged_in`(볼트 계정으로 로그인된 것을 페이지에서 확인함), `needs_user`(캡차, 패스키, 기기 승인, 미설정 사이트 등 사용자가 이어서 마쳐야 함), `wrong_account`(다른 계정으로 로그인되어 있음), `failed` 중 하나다.

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

## herdr 브라우저

로컬 웹앱 QA나 사용자의 로그인 세션이 필요한 작업에서는 에이전트가 herdr 브라우저(`herdr-browser.service`: 영구 프로필을 쓰는 헤드리스 Chromium)를 쓰며, 사용자는 herdr 오른쪽 패널의 `Browser` 탭에서 그 화면을 볼 수 있다. 에이전트는 항상 CDP `127.0.0.1:9333`으로 연결한다. Chromium 자체 포트인 `9334`는 프록시를 우회하므로 일시 정지, 에이전트 배지, 에이전트가 조작하는 페이지를 패널이 따라가는 기능이 동작하지 않아 에이전트가 절대 써서는 안 된다. 서비스와 유닛 파일은 `omarchy/` 아래에 있고, 로그인 순서를 포함한 에이전트 측 규칙은 `skill://browser-agent`에 있다.

사용자가 패널에서 클릭, 입력, 스크롤, 탭 전환, 페이지 이동을 하면 제어권이 사용자에게 넘어간다. 페이지를 바꾸는 에이전트 명령은 사용자의 마지막 입력 후 5초가 지나거나 사용자가 **Hand back**(`POST /handback`)을 누를 때까지 보류된다. DOM 조회나 스크린샷 같은 읽기 작업은 그대로 통과한다. 60초 넘게 보류된 명령은 에이전트가 다시 시도할 수 있도록 오류를 내며 실패한다. 현재 상태는 `GET /state`의 `userControl`(`active`, `until`, `held`)에 나타난다.

에이전트는 패널 API(`127.0.0.1:47825`)도 쓸 수 있다. `GET /wait`는 패널에 보이는 페이지의 화면 그리기(paint)가 멈추면 바로 반환되므로 에이전트가 무작정 대기(sleep)할 필요가 없고, `GET /screenshot?id=<tab id>`는 패널에 표시 중이거나 에이전트가 조작 중인 탭에 한해 뷰포트의 PNG 이미지를 반환한다. 패널은 폴링 없이 `GET /next`를 통해 새 프레임이 기록되는 즉시 받아 온다.

프레임은 `~/.config/herdr-app/mods/browser-frames/` 아래에 JPEG 파일로 저장되며 최신 30장만 남기고, `sync.sh capture`는 이 파일들을 저장소에 복사하지 않는다. 알려진 한계로, 패널이 새 이미지 파일을 그릴 때 2–4 화면 프레임 동안 프레임 이미지가 비어 패널이 잠깐 깜빡일 수 있다. 현재 수정 중이다.

### 사용자 Chromium 동기화 (`herdr-browser-sync`)

`herdr-browser-sync`는 평소 쓰는 Chromium(`~/.config/chromium/Default`)의 데이터를 herdr 브라우저로 단방향으로만 복사한다.

- 쿠키(실시간): `herdr-browser-sync.path`가 쿠키 파일을 감시하다가 변경 후 약 10초 뒤에 CDP로 변경 사항을 반영하며, 실행 간격은 최소 30초를 둔다. 사용자 브라우저에서 로그아웃하면 이 도구가 복사해 간 쿠키도 함께 지워지지만, 에이전트 브라우저에서만 로그인한 세션은 그대로 남는다.
- 방문 기록(병합), 사이트별 IndexedDB, 확장 프로그램과 그 데이터: herdr 브라우저가 시작될 때마다(`herdr-browser.service.d/sync.conf`) 복사하므로, 추가하거나 삭제한 확장 프로그램은 다음 시작 때 나타난다.
- Local Storage: 모든 사이트가 데이터베이스 하나를 공유하므로 요청할 때 한 번만 복사한다. herdr 브라우저를 멈추고 `herdr-browser-sync local-storage`를 실행하면 된다(에이전트 브라우저의 Local Storage를 덮어씀).
- 저장된 비밀번호는 절대 복사하지 않으며, 로그인은 계속 `browser-vault`를 거친다. 에이전트 브라우저에서 한 로그인을 포함해 에이전트 브라우저의 데이터는 사용자 브라우저로 일절 역류하지 않는다.

수동으로 실행할 때 `herdr-browser-sync cookies --dry-run`은 아무것도 바꾸지 않고 사이트별로 동기화될 쿠키 수만 보여 주며, `--domains a,b`는 지정한 도메인과 그 서브도메인으로만 실행 대상을 제한하고, `cookies --full`은 모든 쿠키를 다시 보낸다.

실패했을 때 자동으로 재시도하는 것은 쿠키 동기화(`herdr-browser-sync.service`)뿐이다. 브라우저 시작 시 실행되는 복사는 실패하면 로그만 남기고 다음 시작 때 다시 시도한다. 이 도구는 사용자의 Chromium 프로필과 `~/.local/share/herdr-browser`가 같은 사용자 소유라고 전제한다. 경로 검사로 심볼릭 링크가 복사 대상을 다른 곳으로 돌리는 일은 막아주지만, 같은 사용자 권한으로 실행되는 다른 프로그램까지는 방어하지 않는다.

herdr 브라우저는 사용자의 계정으로 로그인된 상태이므로, 에이전트는 여기서도 `skill://browser-agent`의 확인 규칙을 그대로 따른다.
