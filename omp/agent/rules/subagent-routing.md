---
description: >-
  Every subagent spawn names a model agent chosen by skill://model-routing; never default to
  the orchestrator's own model family.
alwaysApply: true
---

# Subagent routing

- Before the first `task`/`agent()` spawn in a session, read `skill://agent-orchestration` and `skill://model-routing`, and run `~/.omp/agent/managed-skills/model-routing/headroom.sh`. Re-run it before each later spawn wave and keep concurrent subagents per model family within its `SUBAGENT BUDGET` lines (set by the account-rotation service from quota state and the number of working omp sessions).
- Always set `agent` explicitly to a model agent (`swe`, `gemini`, `luna`, `deepseek`, `minimax`, `sol`, `astra`, `opus`, `sonnet`, `haiku`, `fable`, `muse`) or to a fixed-purpose agent (`ci`, `committer`, `pr`, `reporter`, `naturalizer`). Omitting `agent` runs the generic `task` agent on SWE-2, which is not a routing decision. Grok is disabled (2026-10-07) and MiMo (`mimo`) is retired (2026-10-18, superseded by `deepseek` V4.1-Flash-1017 and `minimax` M3.1-Flash).
- **Spend Claude and Argon actively (2026-10-20).** Claude save mode is OFF (`anthropic` is uncapped up to 12 concurrent subagents per session). Especially in `gpai-monorepo` (where `deepseek`/`minimax`/`muse` are forbidden, `swe` is overflow only, and Claude has 3 open accounts), use **`opus`** (omit `effort`), **`sonnet`**, **`fable`** (advisor/architecture/second-plan), and **`gemini` (Gemini 4 Argon, AA index 53, DeepSWE 77.9%)** heavily across **both backend/python-worker and frontend/web** in parallel waves for implementation, audits, tests, planning, reviews, and verification alongside `sol` (omit `effort`) and `astra` (omit `effort`).
- Research, search, exploration and summaries go to cheap/fast models fanned out in parallel (`gemini`, `haiku`, `luna`, and outside gpai-monorepo `swe`, `deepseek` `lo`, `minimax`).
- Outside `gpai-monorepo`, run **`opus`** (omit `effort`), **`sonnet`**, **`gemini` (Argon)**, **`sol`** (omit `effort`), **`swe`** (`hi` normal, `med` fill-in), **`deepseek`** (V4.1-Flash-1017; omit `effort` normal, `lo` fill-in/scans), and **`minimax`** (MiniMax M3.1-Flash, AA index 42, DeepSWE 73.7%) in parallel waves — do not hold off on `opus` while `sonnet` is running.
- `muse`, `deepseek`, and `minimax` never touch gpai-monorepo; `muse` never touches company code, and no CommandCode route (`deepseek`, `minimax`, `muse`) ever receives credentials, API keys, or customer/personal data.

## Project rules

Per-repository rules live under `~/.omp/agent/rules/projects/<repo>/`. omp loads only the top level of `rules/`, so nothing in that subdirectory is auto-injected; read it on demand. They are kept out of the repository's own `.omp/` because those files are uncommitted and other worktrees would never see them. Identify the repository from `git remote get-url origin` (worktrees share it), not from the directory path:

| origin | rules | what it means |
|---|---|---|
| `weareteamturing/gpai-monorepo` (any worktree, including `~/.herdr/worktrees/gpai-monorepo/*`) | `~/.omp/agent/rules/projects/gpai-monorepo/workflow.md` | Main reads it before planning. Every packet includes `Project rules: ~/.omp/agent/rules/projects/gpai-monorepo/workflow.md §<section>`. No `muse`, `deepseek`, or `minimax`. Every reply to the user is in Korean, from the first turn, even before workflow.md is read (identifiers, paths, commands verbatim). |
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
| `deepseek` | omit (`high`) for normal coding/reviews, `lo` (`low`) for fill-in/scans | hard bug-hunting → `hi` (`max`) |
| `gemini`, `minimax`, `luna`, `sonnet`, `haiku` | omit | — |

Never use `hi` for search, reading or summaries.
