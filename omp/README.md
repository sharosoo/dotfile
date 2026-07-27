# OMP (oh-my-pi)

CLI: `omp` — bun 전역 설치 (`@oh-my-pi/pi-coding-agent`), 실체는 `~/.bun/bin/omp`.
런타임 디렉터리는 `~/.omp/`.

## 여기 들어있는 것

설정만 스냅샷으로 담아둔다. 심링크는 걸지 않고, 새 머신에서 필요한 것만 골라 복사한다.

| dotfile | 원래 위치 | 내용 |
|---------|-----------|------|
| `agent/config.yml` | `~/.omp/agent/config.yml` | 모델 role 매핑, 테마, provider 우선순위 |
| `agent/mcp.json` | `~/.omp/agent/mcp.json` | MCP 서버 목록 |
| `agent/agents/` | `~/.omp/agent/agents/` | 커스텀 서브에이전트 |
| `marketplaces.json` | `~/.omp/marketplaces.json` | 플러그인 마켓플레이스 등록 |
| `installed_plugins.json` | `~/.omp/plugins/installed_plugins.json` | 설치된 플러그인 목록 |

## 복원

```bash
DOT=~/workspaces/sharosoo/dotfile
mkdir -p ~/.omp/agent/agents ~/.omp/plugins
cp -r "$DOT/omp/agent/." ~/.omp/agent/
cp "$DOT/omp/marketplaces.json" ~/.omp/
cp "$DOT/omp/installed_plugins.json" ~/.omp/plugins/
```

`marketplaces.json`과 `installed_plugins.json`에는 `/home/global/...` 절대경로가 박혀 있다.
계정이 다르면 경로를 고치거나, 그냥 `omp`에서 마켓플레이스를 다시 추가하고 플러그인을 재설치하는 편이 낫다.

## Git에 넣지 않는 것

`~/.omp/` 아래 런타임 데이터는 제외한다 — `agent/*.db*`, `agent/sessions/`,
`agent/memories/`(mnemopi 벡터 DB, 수십 MB), `logs/`, `cache/`, `webcache/`,
`plugins/cache/`, `wt/`, `run/`, `install-id`.
