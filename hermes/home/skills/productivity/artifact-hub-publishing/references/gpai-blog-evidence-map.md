# GPAI monorepo evidence map (blog deepen)

Use when evidence-deepening 정혁’s English `blog` keep-list (LLM runtime, Context/Cost/Caching, Durable Execution) against `~/workspaces/weareteamturing/gpai-monorepo`. Paths are **private evidence**; public prose must externalize product names (`Solver` → long-form answer generation, etc.).

## Preflight (always)

1. `list_artifacts(project="blog")` allow-list only.
2. Keep-list (after 2026-08-06 index cleanup): Runtime 1–9, Context 10–17, Evaluation appendix, Durable 18–25. Index ID `6iy4apc4suk4`.
3. Title form: `# N. Bare Title` matching index numbers — never `Part N —`.
4. Mode honesty: hygiene ≠ editorial ≠ evidence deepen (see `iterative-blog-draft-series.md`).

## Context / cache / native continuity (articles ~10–17)

| Topic | Primary evidence |
|---|---|
| Stable vs volatile prompt topology | `python-worker/app/infrastructure/adapters/outbound/llm/llm_cache_derivation.py` (`cache_prefix`, `stable_prefix_key` vs `conversation_affinity_key`) |
| Message byte-stability + tool topology | `python-worker/app/schemas/llm.py` (`Message.cache_prefix`, `ThinkingContent.signature`) |
| Native extract/replay | `python-worker/app/infrastructure/adapters/outbound/llm/native_replay.py`; router `prune_native_for_call` in `llm_provider_router_adapter.py` |
| Signature provider gating | `python-worker/app/domain/types/llm_continuity.py` |
| Tool-turn byte-identical rebuild | `python-worker/tests/domain/types/test_ai_chat_tool_turn_replay.py`; `ai_chat_prompt.reconstruct_assistant_tool_turn` |
| Cache topology tests | `python-worker/tests/infrastructure/adapters/outbound/llm/test_provider_cache_topology.py` |
| Native fidelity | `python-worker/tests/infrastructure/adapters/outbound/llm/test_native_roundtrip_fidelity.py` (+ per-provider `test_*_native_replay.py`) |
| Runtime guide | `docs/llm_runtime_guide.md` §§ conversation store, cache options, reasoning |
| Usage buckets / cost shape | `LLMUsage` in `python-worker/app/domain/ports/outbound/llm_port.py` (thinking/cache tokens + optional USD) |
| Feature/operation attribution | `docs/llm_tracking.md` (`llm_span` feature/operation catalog) |
| Describe-change not full regen | `python-worker/app/domain/services/llm_tools/edit_figure/definition.py` (minimal `prompt`; server loads current source) |
| Model vs UI vs billing projections | tool record `llmResultJson` vs `content` vs `billing` in chat types / reconstruction |

## Durable execution / side effects (articles ~18–25)

| Topic | Primary evidence |
|---|---|
| Payment mutation idempotency capability | `docs_feature/paddle_billing_integration.md`; `paddle_mutation_coordinator.py` (`unknown_after_timeout`, reconcile) |
| Mutation coordinator tests | `python-worker/tests/infrastructure/adapters/outbound/billing/test_paddle_mutation_coordinator.py` |
| History-search outbox materialization | `docs/history_search_pipeline.md`, `docs/history_search_backfill_runbook.md` |
| Outbox claim/attempt limits | history_search outbox repository + sync cron (search under `python-worker/app`) |

Public durable articles may cite public queue/stream/task docs; monorepo paths stay private or generalized.

## Evidence-class wording (required in public body)

- **repository / integration tests** — contract shape, fidelity, coordinator policy
- **design docs** — intended architecture
- **synthetic illustration** — e.g. triangular token growth tables
- **production measurement** — only with retained metrics (usually absent → do not invent)

Never upgrade repository tests into production cost/latency claims.

## MCP batch tip

If deferred `tool_call` bridge fails for arthub, fallback (same profile):

```python
from tools.mcp_tool import discover_mcp_tools
from tools.registry import registry
discover_mcp_tools()
registry.get_entry("mcp__arthub__list_artifacts").handler({...})
```

Prefer native MCP tools when available. Never print credentials.

## Anti-patterns from 2026-08-06 session

- Deepening `blog-draft` while user scoped `blog` + keep-list
- Reporting “살 붙임” after failure-opening + discarded-alternatives template only
- Leaving `Part N —` / `Agent Runtime Series — Part 1` after index uses `N. Title`
- Series-wide identical `Generalization beyond…` paste
- Thin durable essays (~600w) marked done without capability matrix or code contract
