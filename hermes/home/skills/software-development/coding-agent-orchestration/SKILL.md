---
name: coding-agent-orchestration
description: Use for coding-agent harness research and sharosoo-factory.
---

# Coding-Agent Orchestration Ecosystems

Class: studying multi-agent coding-orchestration systems and turning findings into the user's own factory design (**sharosoo-factory**, github.com/sharosoo/sharosoo-factory, local `~/workspaces/sharosoo-factory`). Full study docs live in that repo (`docs/01`–`06`) — read them there before re-researching from scratch; this skill carries the condensed, still-true facts plus the user's standing requirements.

## Ecosystem map (verified 2026-08)

| Project | Author | One-liner | Key fact |
|---|---|---|---|
| **oh-my-openagent (OmO)** | code-yeongyu | OpenCode plugin harness → 3 editions (Ultimate/Light=LazyCodex/**Senpi native beta**) | License = **SUL** (personal/internal use OK, no redistribution); core 20 pkgs harness-neutral; 54+ hooks on OpenCode edition |
| **senpi** | code-yeongyu | pi-mono fork kept close to upstream; powers omo-native (`omo-ai@beta`) and Dori | Exact-pinned engine; OMO-on-senpi = 1 generated extension entry + 19 skills |
| **oh-my-pi (omp)** | can1357 | pi fork **rewritten** coding-first, v17.x, MIT | Same JSONL session format as senpi; senpi ports omp code (todotools v17.0.5) and vice-versa of ideas |
| **Super Simple Software Factory (SSSF)** | disler (IndyDevDan) | "Agent proposes, code disposes" — deterministic Python ADW graph, agents as bounded nodes | SQLite WAL event stream + swimlane UI; role config = core four (context/model/prompt/tools); typed JSON envelopes + gates |
| **ACP** | Zed | JSON-RPC 2.0 over stdio protocol between editors and agents (stable v1, v2 in flight) | `session/update` streams plan/toolcall/diff; elicitation = structured user prompts; official SDKs Rust/TS/Python/Kotlin/Java |
| **SDD tools** | various | Spec-first (Spec-Kit/Kiro/BMad) vs semi-living (OpenSpec delta→archive) vs spec-as-source (Tessl) | Fowler taxonomy; none solve mid-execution change propagation |

Snapshot 2026-09: opencode(anomalyco, ~200k★, Go $10/mo tier, Zen gateway)가 OSS 1위, omp 0→~29k★(8.5개월, npm weekly 81k) 급성장, Pi는 earendil-works/pi.dev로 이전 + OpenClaw 기반이라 철학적 영향력 유지. **Anthropic 2026-06-15부터 third-party harness(omp 등)의 Claude workload는 별도 non-poolable agent credit 과금** — 구독값 재사용 경로 차단, omp의 비용 우위는 cheap/local 모델에서만 성립. Terminal-Bench 2.0: tuned Claude Code harness 92.1% vs Codex 77.3% — harness tuning이 model tier만큼 차이 냄(같은 모델 16pt spread).

Prompt-cache engineering (user가 opencode→omp 전환한 사유와 직결): opencode는 Anthropic 캐시 문제가 만성 — system prompt single-block 100% miss(#14065) 이후 #14743 종합 fix가 3개월+ 미merge(14+ 참여, 재base 후 auto-close), production 데이터로 spend의 63.8%가 cache write(#40790: prompt-loop DB reload byte drift, tool part pending→completed)까지 확인. omp는 반대로 maintainer가 root-cause 확인+수주 내 fix하는 패턴: date/cwd footer prefix-miss #7324→#7326(Anthropic half; open-weight half는 maintainer-owned이라 미해결), autolearn cache bust #3743→#3745, LiteLLM silent no-cache #1845→#1847, 1h write mis-pricing 1.6x #6876→#6878, tool array 자체 breakpoint PR #10220(이전엔 compaction/rewind 시 tools+system 전체 reprocess). 기본값=5m TTL+keep-alive refresh(~10분 gap 커버), idle 길면 `PI_CACHE_RETENTION=long`(1h write는 2x input vs 5m 1.25x). 커스텀 provider(openai-completions)는 `compat.cacheControlFormat: anthropic` 필요(#1847 이후). 검증: `omp stats`에서 cacheRead>0 확인. omp 비판점: 32-tool 초기 context overhead(대규모 비교로 Pi 대비 1-2x token), churn(415 release/5mo), one-maintainer, extensions 무sandbox. Standard Compute: Claude Code가 quality/autonomy/reliability/ease 4/6 리드, omp는 speed+value 리드.

## Where each wins for the user's factory

- **Skeleton ← SSSF**: control plane (graph/gates/retries) in deterministic Python; pass results never re-injected into agent context, only failures loop back.
- **Planning/memory ← OmO**: Prometheus interview → Metis gap analysis → Momus+Oracle dual review (80% clear = executable); wisdom notepads (Conventions/Failures/Gotchas…); memory-core = git-MemFS-based, harness-neutral with neutrality tests.
- **Harness boundary ← ACP**: omp (user's main) + Claude Code + Codex absorbed via thin adapters; ACP-capable harnesses give observability streams for free.
- **Change propagation (R5) = open problem**: NO benchmark solves "plan changed mid-run → active tasks/agents updated". OpenSpec's delta→archive is the closest primitive. This is sharosoo-factory's differentiator (docs/06 §10).

## Pitfalls

- **Don't port OmO plugin source across editions blindly**: extension APIs diverged (omp rewrote internals; omptype-based `pi.zod`; hooks/custom-tools/extensions triple structure). Port patterns, not source. Skills (SKILL.md markdown) transfer nearly free; TS extensions need rewriting.
- **OmO license**: ideas yes, code no (for anything distributed).
- **npm `omo` package is unrelated/different author** — real package is `omo-ai@beta`.
- **Category auto-routing (OmO) conflicts with the user wanting explicit per-role model control (R6)** — prefer SSSF-style YAML roster; auto-routing only as opt-in.
- **Warn-only enforcement**: most OmO discipline lives in prompts — the user wants gates as deterministic code instead.

## User's standing requirements (R1–R10, full derivation in repo docs/01)

R1 issue-by-issue interview planning · R2 diagram-mandatory reviewable plans (mermaid, no prose walls) · R3 task DAG with per-task verify gates · R4 observability without asking (events DB as source of truth, harness todo = projection) · R5 change propagation · R6 per-role model+fallback config · R7 automatic git-worktree isolation per task · R8 multi-harness native (omp main, Claude Code, Codex) · R9 layered memory (constitution/project/task) · R10 thin-adapter extensibility.

Design principles: DSL-free (Python/YAML/markdown/mermaid), Skill→MCP→Tool→Hook priority order, no abstraction over unstable interfaces, observability on by default ("state questions forbidden — tail instead").

## Workflow when continuing this project

1. Read the relevant doc in `~/workspaces/sharosoo-factory/docs/` first; extend the repo, don't fork knowledge into chat.
2. Repo convention: Korean prose with English technical terms mixed (matches user's style).
3. Roadmap M0(core+omp adapter)→M1(planning pipeline)→M2(worktree parallel)→M3(observability)→M4(memory)→M5(propagation)→M6(multi-harness). MVP = M0–M2.

## References

See `references/benchmarks-deep-facts.md` for component-level detail (OmO senpi 18 components, SSSF ADW/config shapes, ACP message surface, SDD tool matrix).
