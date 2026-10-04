# Benchmark Deep Facts (component-level)

Condensed from session research 2026-08; full write-ups in `~/workspaces/sharosoo-factory/docs/02`–`05`. Re-verify anything version-sensitive before citing.

## OmO — senpi adapter's 18 components (registration order)

config-startup, native-badge, onboarding, init-deep-advisor, telemetry, ultrawork, skill-pointers, start-work-continuation, ulw-loop, todo-fanout-reminder, git-master, fallback-architect, comment-checker, ast-grep, lsp, task, memory, config-watch.

Key mechanics worth copying:
- **ultrawork injection**: hidden custom message (`pi.sendMessage({customType, display:false})` + `{action:'continue'}`). Idle path never rewrites user text; queued prompts get directive appended inside the message (queue drains one at a time).
- **start-work-continuation**: reads `.omo/boulder.json` on `agent_end`; repeat suppression via `work_id:updated_at:completed/total` signature; 8 consecutive continuation cap.
- **task engine** (`senpi-task`): spawn by `category` XOR `subagent_type` (mutually exclusive); runners in-process (default, shares parent tool closures) vs process (JSON-RPC steering, persisted transcript, respawn); team members always process-mode with member-scoped inbox extension. Exactly-once completion routing + chaos tests for kill/restart recovery.
- All components: capability-check → self-skip if missing; per-component disable flags (`omo-senpi-<name>-disabled`).

## OmO — build/QA conventions

- Plugin artifacts are generated: `build-extension.mjs` bundles to one `omo.js`, **externalizing the senpi peer family** (`@code-yeongyu/senpi`, `@earendil-works/pi-*`, `@mariozechner/pi-*`, TypeBox) so the installed runtime resolves them; `bundle-purity.test.ts` pins this.
- QA culture: "typecheck is NOT QA" — live harness drive + evidence file under `.omo/evidence/<slug>/` required before commit; drivers run in isolated agent dirs and prove real dir untouched.

## SSSF — config & workflow shapes

Roster YAML per role = core four:
```yaml
planner:
  model: kimi-k3        # provider included
  thinking: high
  prompts: {system: ..., user: ...}
  harness: ...          # pi extension; can grant/withhold subagent spawning
```
12 starter ADWs (thin Python scripts): prompt / scout / plan / build / quality / plan_build / build_test / build_review / plan_build_test / plan_build_test_quality / document / simple_sdlc (~180 lines). No tester agent — running a suite is a known command, hence code. Phase kinds tagged in source: engineer / agent / code. Typed JSON envelope handoff; gate failure loops back to same responsible agent (correction, not restart). `--adw-id` reuse resumes context via `agent_map.json`. Observability: SQLite WAL events, readable while running; swimlane visualizer (engineer/agent/code lanes). Sandbox tier (inkwell repo): commits return as `refs/sandbox/*`, harvest compares but never merges — human picks winner.

## ACP surface (stable v1)

initialize (version+capability+auth negotiation) → session/new|prompt|resume|list|cancel → notifications `session/update`: message/thought chunks, tool call lifecycle (kind read/edit/delete/move/search/execute/think/fetch/switch_mode), **plan updates**, slash-command availability, config options. ToolCallContent includes `diff` (path/oldText/newText). Client-side methods: permission requests, elicitation (optional capability). Cancellation contract: pending permissions → `cancelled`, final stopReason `cancelled`. SDKs: Rust/TS/Python/Kotlin/Java.

## SDD tool matrix

| Tool | License | Worktrees | Best fit | Notable |
|---|---|---|---|---|
| Spec-Kit | OSS | no | greenfield | constitution file; checklist DoD per step; ~800-line output |
| Spec Kitty | OSS | **yes** | parallel dev | built-in worktree orchestration |
| BMad | OSS | no | enterprise | 21 role agents, heavy setup |
| OpenSpec | MIT | no | brownfield | delta format ADDED/MODIFIED/REMOVED; archive folds into specs/; `validate --strict` |
| Kiro | prop. | no | AWS/Claude IDE | EARS notation; SMT-solver requirement contradiction check |
| Tessl | prop. | no | spec-as-source | `// GENERATED FROM SPEC - DO NOT EDIT`; MDD risks |

Fowler levels: spec-first (discard after task) / spec-anchored (persists) / spec-as-source (only spec edited).
