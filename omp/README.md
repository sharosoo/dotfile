# OMP (oh-my-pi)

CLI: `omp` — bun 전역 설치 (`@oh-my-pi/pi-coding-agent`), 실체는 `~/.bun/bin/omp`.
런타임 디렉터리는 `~/.omp/`.

## 여기 들어있는 것

설정과 직접 만든 플러그인 소스 가운데 다른 머신에서 환경을 재현하는 데 필요한 것만 담는다. 런타임 데이터와 설치된 의존성은 담지 않는다.

| dotfile | 원래 위치 | 내용 |
|---------|-----------|------|
| `agent/config.yml` | `~/.omp/agent/config.yml` | 모델 role 매핑, 테마, provider 우선순위 |
| `agent/mcp.json` | `~/.omp/agent/mcp.json` | MCP 서버 목록 |
| `agent/agents/` | `~/.omp/agent/agents/` | 커스텀 서브에이전트 |
| `marketplaces.json` | `~/.omp/marketplaces.json` | 플러그인 마켓플레이스 등록 |
| `installed_plugins.json` | `~/.omp/plugins/installed_plugins.json` | 설치된 플러그인 목록 |
| `omo-layer/` | `~/workspaces/sharosoo/omo-omp/omo-layer` | Prometheus, Sisyphus 등 OMO 페르소나 11개, 모델 라우터, 규칙, 스킬 |

## 복원

```bash
DOT=~/workspaces/sharosoo/dotfile
mkdir -p ~/.omp/agent/agents ~/.omp/plugins
cp -r "$DOT/omp/agent/." ~/.omp/agent/
cp "$DOT/omp/marketplaces.json" ~/.omp/
cp "$DOT/omp/installed_plugins.json" ~/.omp/plugins/

cd "$DOT/omp/omo-layer"
bun install
omp plugin link .
omp plugin list          # omo-layer@0.1.0이 표시되어야 함
```

`omo-layer`에는 런타임 extension이 포함되어 있으므로 marketplace에서 설치하지 말고 `omp plugin link`로 연결해야 한다. 별도의 `~/.omp/agent/omo-personas.json`이 없으면 각 페르소나는 `agent/config.yml`에 지정된 OMP 모델 role을 따른다. 특정 페르소나의 모델을 고정하려면 `omo-layer/omo-personas.example.json`을 `~/.omp/agent/omo-personas.json`으로 복사한 뒤 `pins`를 수정한다.

`marketplaces.json`과 `installed_plugins.json`에는 `/home/global/...` 절대경로가 박혀 있다.
계정이 다르면 경로를 고치거나, 그냥 `omp`에서 마켓플레이스를 다시 추가하고 플러그인을 재설치하는 편이 낫다.

## Git에 넣지 않는 것

`~/.omp/` 아래 런타임 데이터는 제외한다 — `agent/*.db*`, `agent/sessions/`,
`agent/memories/`(mnemopi 벡터 DB, 수십 MB), `logs/`, `cache/`, `webcache/`,
`plugins/cache/`, `wt/`, `run/`, `install-id`.
