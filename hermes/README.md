# Hermes Agent

NousResearch의 Hermes Agent 설정 모음이다. 실제 런타임 환경은 `~/.hermes`에 자리 잡는다. 여기에는 다른 머신에서 환경을 그대로 재현하는 데 필요한 수동 설정 파일만 모아 두었다. 런타임 본체(`hermes-agent/`, `tools/`), 세션 기록, 캐시, 로그, 비밀값은 저장소에 넣지 않는다.

## 구성 파일

| dotfile 경로 | 실제 경로 | 설명 |
| --- | --- | --- |
| `home/config.yaml` | `~/.hermes/config.yaml` | 모델, 프로바이더, UI 테마(`omarchy` 스킨), MCP 서버 등의 설정. 비밀값은 `${VAR}` 형태로 참조하며, 저장소에 올리지 않는 `~/.hermes/.env` 파일에서 읽어온다. |
| `home/SOUL.md` | `~/.hermes/SOUL.md` | 에이전트 페르소나 정의 |
| `home/memories/` | `~/.hermes/memories/` | 장기 기억(`MEMORY.md`)과 사용자 프로필(`USER.md`) |
| `home/cron/jobs.json` | `~/.hermes/cron/jobs.json` | 정기 작업 정의: LLM 서빙 일일 리포트, arXiv 논문 요약, 주간 업계 동향, 학습/PR 계획, 에이전트 OSS 모니터링 |
| `home/scripts/` | `~/.hermes/scripts/` | cron 작업에서 실행하는 보조 스크립트 |
| `home/plugins/` | `~/.hermes/plugins/` | 자체 제작 플러그인(`herdr-agent-state`, `orca-status`) |
| `home/skills/` | `~/.hermes/skills/` | 기본 내장이 아닌 스킬 모음(스킬 허브 설치본 및 자체 제작 스킬). 공식 설치 시 자동으로 내려받는 기본 스킬은 제외했다. |
| `systemd/hermes-gateway.service` | `~/.config/systemd/user/` | 메시징 게이트웨이(Discord 연동 등)와 cron 작업을 백그라운드에서 구동하는 systemd 유저 서비스 |

## 동기화 및 관리

Hermes는 실행 중에 설정, 기억, cron 작업을 스스로 덮어쓴다. 따라서 심볼릭 링크를 걸지 않고 파일을 복사해 동기화한다.

설정, 기억, 작업, 스킬을 바꾼 뒤에는 다음 명령어로 변경 사항을 가져온다:

```bash
cd ~/workspaces/sharosoo/dotfile/hermes
./sync.sh capture
git -C .. diff --stat hermes
```

> **주의:** 이 저장소는 공개 저장소다. 커밋하기 전에 비밀값이 diff에 섞여 들어가지 않았는지 반드시 확인한다.

## 새 머신에서 복원하기

1. 공식 설치 스크립트로 Hermes를 설치한다 (`~/.hermes/hermes-agent`와 `hermes` 명령어가 생성된다).
2. 기존 머신의 비밀값 파일(`~/.hermes/.env`)을 수동으로 복사해 온다 (필요하면 `hermes` 명령어로 프로바이더 로그인을 다시 진행한다).
3. 저장소의 설정을 반영하고 게이트웨이를 구동한다:
   ```bash
   cd ~/workspaces/sharosoo/dotfile/hermes
   ./sync.sh restore
   systemctl --user enable --now hermes-gateway
   ```
   `restore` 스크립트는 `~/.hermes/skins/omarchy.yaml`을 현재 활성화된 Omarchy 테마의 `hermes.yaml`로 심볼릭 링크해 두므로, 테마 변경 시에도 설정을 그대로 따라간다.
4. 데스크톱 앱: Omarchy 패키지 관리자의 `hermes-desktop`을 설치하지 말고, `hermes desktop --build-only`로 직접 빌드해 사용한다 (자세한 내용은 `omarchy/NEW-PC.md` 참고).

## Git 추적 제외 대상

아래 항목과 `~/.hermes`에 남겨진 작성 중인 임시 문안은 Git으로 관리하지 않는다:

`.env`, `auth.json`, `vault/`, `state.db*`를 비롯한 데이터베이스 파일 전체, `sessions/`, `state-snapshots/`, `cache/`, `logs/`, `downloads/`, `hermes-agent/`, `tools/`, `installs/`
