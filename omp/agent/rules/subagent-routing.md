---
description: >-
  Every subagent spawn names a model agent chosen by skill://model-routing; never default to
  the orchestrator's own model family.
alwaysApply: true
---

# Subagent routing

- Before the first `task`/`agent()` spawn in a session, read `skill://agent-orchestration` and `skill://model-routing`, and run `~/.omp/agent/managed-skills/model-routing/headroom.sh`.
- Always set `agent` explicitly to a model agent (`swe`, `gemini`, `luna`, `deepseek`, `mimo`, `sol`, `astra`, `opus`, `fable`, `muse`) or to a fixed-purpose agent (`ci`, `committer`, `pr`, `reporter`, `naturalizer`). Omitting `agent` runs the generic `task` agent on SWE-2, which is not a routing decision. Grok is disabled (2026-10-07): no `grok` agent, no xAI routes.
- **Do not route to your own family by habit.** An Opus or Fable Main spawns `opus`/`fable` only for a critical frontend/product slot, a hardest-tier problem, or a review panel seat. A GPT Main follows the same rule for `sol`/`astra`.
- Research, search, exploration and summaries go to cheap models fanned out in parallel (`gemini`, `swe`, `luna`, `deepseek`). Never to `opus`, `fable`, `sol` or `astra`.
- Normal and fill-in code goes to `swe` (free promo), with `luna`/`mimo`/`deepseek` as overflow.
- `muse` never touches gpai-monorepo or company code.

## Project rules

Per-repository rules live under `~/.omp/agent/rules/projects/<repo>/`. omp loads only the top level of `rules/`, so nothing in that subdirectory is auto-injected; read it on demand. They are kept out of the repository's own `.omp/` because those files are uncommitted and other worktrees would never see them. Identify the repository from `git remote get-url origin` (worktrees share it), not from the directory path:

| origin | rules | what it means |
|---|---|---|
| `weareteamturing/gpai-monorepo` (any worktree, including `~/.herdr/worktrees/gpai-monorepo/*`) | `~/.omp/agent/rules/projects/gpai-monorepo/workflow.md` | Main reads it before planning. Every packet includes `Project rules: ~/.omp/agent/rules/projects/gpai-monorepo/workflow.md §<section>`. No `muse`. |
| `sharosoo/tessel` (any worktree) | `~/.omp/agent/rules/projects/tessel/workflow.md` | Main reads it and IMP-0004 (committed in the repo) before planning. Every packet includes `Project rules: ~/.omp/agent/rules/projects/tessel/workflow.md §<section>`. Contributor-safe: `muse` allowed. |

Subagents do not load project rules by themselves; that packet line is how they get them. To add a repository: create `rules/projects/<repo>/` and add a row here.

## Effort

`effort` maps to the model's lowest, middle or top level; the top is clamped to xhigh. A missing `effort` uses the agent's default thinking level.

| agent | for real work | `hi` only when |
|---|---|---|
| `sol` | **omit `effort`** (= high). GPT-6.1 Sol needs high effort to reason. Never `lo`/`med` | the hardest problem → xhigh |
| `astra` | **omit `effort`** (= medium; Astra reasons well at medium) | the hardest problem → xhigh |
| `opus` | **omit `effort`** (= medium) | the hardest problem, or after a medium attempt failed → xhigh |
| `fable` | **omit `effort`** (= medium) | the hardest architecture question → xhigh |
| `swe` | `hi` for normal slots, `med` for fill-in | — |
| `gemini`, `luna`, `deepseek`, `mimo` | omit | — |

Never use `hi` for search, reading or summaries.
