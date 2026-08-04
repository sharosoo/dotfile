# Claude Code

`~/.claude/` 설정 중 다른 머신에서도 재현하는 데 필요한 것만 저장한다. 세션, 대화 기록, 캐시, 인증 정보처럼 머신에 종속되거나 민감한 런타임 데이터는 저장하지 않는다.

## 포함된 설정

- `settings.json`: 모델, UI, 활성 플러그인과 마켓플레이스 설정
- `CLAUDE.md`: 전역 지침
- `agents/`, `commands/`: 사용자 에이전트와 명령
- `skills/`: 직접 만든 스킬과 원래 심볼릭 링크로 연결해 두었던 스킬의 실제 파일

`settings.local.json`은 이 dotfile 저장소에서만 사용하는 프로젝트 설정이므로 전역 설정으로 복사하지 않는다.

## 복원

```bash
DOT=~/workspaces/sharosoo/dotfile
mkdir -p ~/.claude
cp "$DOT/.claude/settings.json" "$DOT/.claude/CLAUDE.md" ~/.claude/
cp -r "$DOT/.claude/agents" "$DOT/.claude/commands" "$DOT/.claude/skills" ~/.claude/

claude plugin marketplace add Lum1104/Understand-Anything
claude plugin marketplace add openai/codex-plugin-cc
claude plugin install pyright-lsp@claude-plugins-official
claude plugin install typescript-lsp@claude-plugins-official
claude plugin install understand-anything@understand-anything
claude plugin install frontend-design@claude-plugins-official
claude plugin install codex@openai-codex
```

`plugins/cache/`, `plugins/installed_plugins.json`, `plugins/known_marketplaces.json`, `.credentials.json`, `history.jsonl`, `projects/`, `sessions/`는 복원하지 않는다. 플러그인은 위 명령으로 다시 설치하므로 절대 경로와 설치 시각이 기록된 런타임 manifest를 복사할 필요가 없다.
