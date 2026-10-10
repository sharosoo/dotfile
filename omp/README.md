# OMP (oh-my-pi)

mise(`github-can1357-oh-my-pi`)로 설치한 CLI `omp`의 설정 디렉터리다. 런타임 경로는 `~/.omp/`를 쓴다.
다른 머신에서 OMP 환경을 그대로 재현하는 데 필요한 직접 작성한 파일(설정, 커스텀 서브에이전트, 스킬, 룰, 확장)을 이 디렉터리에 모아 둔다. 런타임 데이터와 설치된 의존성은 담지 않는다.

## 구성

| 도트파일 경로 | 실제 위치 | 내용 |
|---|---|---|
| `agent/config.yml` | `~/.omp/agent/config.yml` | 모델 역할(roles), `task.agentModelOverrides`, 폴백 체인, 테마 및 기타 설정 |
| `agent/mcp.json` | `~/.omp/agent/mcp.json` | MCP 서버 설정. 저장소가 공개되어 있어 헤더의 시크릿은 `${ARTIFACT_HUB_TOKEN}` 형식 플레이스홀더로 저장한다. omp 실행 시 헤더의 `${VAR}`를 환경 변수로 치환한다. |
| `agent/agents/` | `~/.omp/agent/agents/` | 커스텀 서브에이전트. 모델 에이전트(`opus`, `fable`, `sol`, `astra`, `swe`, `gemini`, `luna`, `deepseek`, `mimo`, `grok`, `muse`) 및 고정 목적 에이전트(`ci`, `committer`, `pr`, `reporter`, `naturalizer`) |
| `agent/managed-skills/` | `~/.omp/agent/managed-skills/` | 에이전트가 자체 생성한 스킬: `agent-orchestration`, `model-routing`(`headroom.sh` 포함), `omarchy-turing-customize`, `omp-turing-config` |
| `agent/rules/` | `~/.omp/agent/rules/` | 전역 룰(서브에이전트 라우팅, 승인 없는 배포 금지, naturalizer 기반 한국어 작성) 및 `projects/` 하위 저장소별 룰(`gpai-monorepo`, `tessel`) |
| `agent/skills/` | `~/.omp/agent/skills/` | 사용자 스킬 `git-master` |
| `agent/extensions/` | `~/.omp/agent/extensions/` | 확장 기능: herdr 에이전트 상태 연동, Orca 상태 표시/사전 입력(prefill)/타이틀바 스피너 |
| `agents-skills/` | `~/.agents/skills/` | 전체 에이전트 공용 설치형 스킬(`naturalize`, `korean-review`, `wiki`, better-auth 관련 스킬 등). 심볼릭 링크 항목(`artifact-hub` 저장소의 `arthub`, `sharosoo-cdn` 저장소의 `sharosoo-cdn`, Omarchy 자체에서 제공하는 `omarchy`와 `diagnose-crash`) 및 Claude 앱이 관리하는 `synced/` 디렉터리는 제외 |
| `cap-context.py` | `~/.omp/agent/models.yml` (생성 대상) | ~1M 컨텍스트 모델을 320K로 제한해 272K 부근에서 컴팩션이 동작하도록 설정. omp가 새 모델을 탐색한 뒤 `python3 omp/cap-context.py`로 다시 실행한다. |
| `marketplaces.json` | `~/.omp/marketplaces.json` | 플러그인 마켓플레이스 등록 정보 |
| `installed_plugins.json` | `~/.omp/plugins/installed_plugins.json` | 설치된 플러그인 목록 |
| `omo-layer/` | `~/workspaces/sharosoo/omo-omp/omo-layer` | OMO 페르소나(Prometheus, Sisyphus 등 총 11종), 모델 라우터, 룰, 스킬 |

## 변경 사항 동기화

omp와 스킬 도구가 파일을 수시로 덮어쓰므로 심볼릭 링크 대신 복사본으로 관리한다. 실제 환경에서 파일(새 에이전트, 스킬, 룰, 설정 등)을 변경한 뒤에는 아래 명령으로 동기화한다.

```bash
cd ~/workspaces/sharosoo/dotfile/omp
./sync.sh capture
git -C .. diff --stat omp
```

`capture`는 삭제 내역까지 포함해 디렉터리를 그대로 미러링하며, MCP 헤더에 들어 있는 시크릿을 플레이스홀더로 마스킹한다. 공개 저장소이므로 커밋하기 전에 `git diff`로 시크릿이 노출되지 않았는지 반드시 확인한다.

## 복원 (새 머신)

```bash
cd ~/workspaces/sharosoo/dotfile/omp
./sync.sh restore

cd omo-layer
bun install
omp plugin link .
omp plugin list          # omo-layer@0.1.0이 표시되어야 한다
```

`restore`는 설정, 에이전트, 스킬, 룰, 확장을 대상 경로로 복사하고, 이미 존재하는 `mcp.json`은 덮어쓰지 않고 유지하며, `cap-context.py`를 실행한다(단, `cap-context.py`는 omp가 모델을 최소 한 번은 탐색해야 동작하므로 최초 로그인 후에 다시 실행한다). 저장소에 있던 `mcp.json`을 새로 복원했다면 환경 변수 `ARTIFACT_HUB_TOKEN`을 설정하거나 플레이스홀더 자리에 실제 토큰을 직접 입력한다. `arthub` 스킬은 artifact-hub 체크아웃 경로에서 심볼릭 링크로 연결한다(`ln -s ~/workspaces/sharosoo/artifact-hub/skills/arthub ~/.agents/skills/arthub`). `sharosoo-cdn` 스킬도 같은 방식으로 sharosoo-cdn 체크아웃에서 `~/.agents/skills/sharosoo-cdn`과 `~/.claude/skills/sharosoo-cdn`에 연결하고, CLI는 `curl -fsSL https://cdn.sharosoo.com/tools/sharosoo-cdn/install.sh | sh`로 설치한다.

omo-layer는 런타임 확장을 포함하므로 마켓플레이스에서 설치하지 말고 반드시 `omp plugin link`로 연결해야 한다. `~/.omp/agent/omo-personas.json` 파일이 없으면 각 페르소나는 `agent/config.yml`에 지정된 모델 역할을 따른다. 특정 페르소나의 모델을 고정하려면 `omo-layer/omo-personas.example.json`을 `~/.omp/agent/omo-personas.json`으로 복사한 뒤 `pins` 항목을 수정한다.

`marketplaces.json`과 `installed_plugins.json`에는 `/home/sharosoo` 기준 절대 경로가 들어 있다. 다른 계정에서 복원할 때는 경로를 알맞게 수정하거나, omp에서 마켓플레이스를 다시 등록하고 플러그인을 재설치한다.

## auth broker를 Tailscale로 공유하기

전체 AI 제공자 계정을 관리하는 omp auth broker는 turing 머신 한 대에서만 띄운다. 테일넷(tailnet)에 연결된 다른 머신들은 각자 로그인하지 않고 broker 모드로 turing에 붙어 인증을 공유한다.

turing 내부에서 broker 프로세스는 `127.0.0.1:8765`에 바인딩되어 동작한다. 외부 요청은 `omp-auth-broker-tailnet.socket`이 turing의 Tailscale IP에서 수신한 뒤 `systemd-socket-proxyd`를 거쳐 로컬 루프백으로 넘겨준다. 통신 구간은 Tailscale로 자동 암호화되며, 헬스체크 외의 모든 요청은 broker token 검증을 거친다.

### turing 설정 (최초 1회)

```bash
d=~/.omp/agent/managed-skills/omp-auth-broker/systemd
ln -sfn $d/omp-auth-broker.service $d/omp-auth-broker-tailnet.socket $d/omp-auth-broker-tailnet.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now omp-auth-broker.service omp-auth-broker-tailnet.socket
```

### 새 머신(클라이언트) 설정

새 머신에서 `./sync.sh restore`를 실행한 뒤, 아래 두 단계로 broker 모드를 켠다.

```bash
# 1. copy the token from turing (never via this repo)
scp turing:.omp/auth-broker.token ~/.omp/auth-broker.token && chmod 600 ~/.omp/auth-broker.token
# 2. machine-local switch, sourced by the fish config
echo 'export OMP_AUTH_BROKER_URL=http://turing:8765' >> ~/.env.local
```

새 셸을 열고 아래 명령어로 확인한다. turing에 등록된 계정 목록이 보이면 정상이다.

```bash
omp usage --redact
```

### 주의 사항

- **`agent/config.yml`에 broker URL을 적지 않는다.** 이 파일은 turing을 포함한 모든 머신에 그대로 동기화되므로, 여기에 주소를 넣으면 turing 본인마저 로컬 볼트 대신 broker 모드로 동작하게 된다.
- **클라이언트 머신에서 계정을 직접 로그인하거나 broker 및 계정 로테이션 서비스를 켜지 않는다.** `restore` 스크립트는 유닛 파일만 복사할 뿐 서비스를 활성화하지 않으므로 그대로 둔다.
- broker 모드를 끄려면 `~/.env.local`에서 해당 줄을 삭제한다.
- 토큰 교체나 IP 변경 등 자세한 내용은 `omp-auth-broker` 스킬을 참고한다.
- gpai-monorepo처럼 회사 내부 식별자가 들어 있는 룰은 `*.local.md` 이름으로 두면 `capture`가 저장소로 복사하지 않는다(이 저장소는 공개 저장소다). 새 머신에는 직접 옮긴다.

## Git 관리 제외 대상

`~/.omp/` 하위의 런타임 데이터는 Git 관리 대상에서 제외한다: `agent/*.db*`, `agent/sessions/`, `agent/memories/`(mnemopi 벡터 DB, 수십 MB), `agent/custom-session-files/`, `agent/backup-*`, `logs/`, `cache/`, `webcache/`, `plugins/cache/`, `wt/`, `run/`, `install-id`.
