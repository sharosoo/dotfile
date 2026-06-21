# OpenCode / oh-my-openagent / OMP

## 설치 (최초)

```bash
curl -fsSL https://opencode.ai/install | bash
bunx oh-my-openagent install   # 또는 oh-my-opencode — dotfile은 openagent jsonc 사용
opencode auth login
```

OMP CLI: `~/.bun/bin/omp` — 런타임 데이터는 **`~/.omp/`** (Git 제외, [../omp/README.md](../omp/README.md)).

## dotfile 동기화

```bash
./scripts/link-desktop-config.sh
```

- `opencode/opencode.json` → `~/.config/opencode/opencode.json`
- `opencode/oh-my-openagent.jsonc` → `~/.config/opencode/oh-my-openagent.jsonc`

`node_modules/`, `antigravity-accounts.json` 등은 `.gitignore` — 커밋하지 않음.

## 사용

```bash
opencode          # TUI
omp               # Oh My Pi harness (별도)
```

프롬프트에 `ultrawork` / `ulw` 등은 oh-my-openagent 문서 참고.

## 참고

- Oh My OpenCode: https://github.com/code-yeongyu/oh-my-opencode
- Fish + Azure: `AZURE_RESOURCE_NAME` — [fish/config.fish](../fish/config.fish)