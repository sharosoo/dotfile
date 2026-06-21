# Oh My Pi (OMP) / oh-my-openagent

**런타임 데이터** (에이전트 DB, 로그, 캐시)는 Git에 넣지 않음.

| 위치 | 용도 |
|------|------|
| `~/.omp/` | OMP v16+ 런타임 (agent, logs, cache) |
| `~/.config/opencode/` | OpenCode + **oh-my-openagent** (`opencode.json`, `oh-my-openagent.jsonc`) |

dotfile의 `opencode/`를 `~/.config/opencode/`에 링크하면 OpenCode/플러그인 설정이 동기화됨.

OMP CLI: `~/.bun/bin/omp` — 설정 변경은 주로 OpenCode 쪽 `opencode.json` / `oh-my-openagent.jsonc`.