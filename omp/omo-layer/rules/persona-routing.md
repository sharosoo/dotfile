---
name: persona-routing
description: Maps task kinds to OMO persona agents — read this before delegating non-trivial work
globs:
  - "**/*"
---
# Persona routing guide

Read this (via `rule://persona-routing`) before delegating or when a task's
shape is unclear. It is advisory — on-demand, not always injected.

## When to use which persona

| Task shape | Persona | Why |
|---|---|---|
| "Help me figure out what to build / scope is fuzzy" | `prometheus` | Interviews first, decision-complete plan, no code |
| "Hard technical problem, give it a goal" | `hephaestus` | Autonomous deep worker (GPT-only; no substitute) |
| "Execute this decided plan end to end" | `atlas` | Durable Boulder progress, stops only on completion |
| "Review this plan/change before I ship" | `momus` | Ruthless, multi-angle, exploitability-calibrated |
| "Coordinate everything, delegate, finish it" | `sisyphus` | The sociable lead; parallel delegation |
| "Find where X is in this codebase" | `explore` / `librarian` | Read-only scouting, cheap models |
| "Is this architecture sound?" | `oracle` | Read-only consultation |

## Forbidden combinations (router warns)

- `sisyphus` on MiniMax / Qwen / DeepSeek — holds up poorly under nested
  todo+delegation. Avoid even when pinned.
- `hephaestus` on anything but GPT — principle-driven style is GPT-specific.
- Any deep/review persona on MiniMax — loses coherence on multi-step work.
- Utility agents (`explore`, `librarian`) on Opus — expensive overkill for grep.

## Model families at a glance

- **Claude** (opus/fable/sonnet) — communicative, mechanics-driven. Sisyphus/
  Atlas/ Metis prompts tuned here.
- **GPT** (5.5) — principle-driven, autonomous. Hephaestus requires this.
- **Kimi** (K2.x) — Claude-like fallback; ≻ GLM for orchestration.
- **GLM** (5/5.1) — acceptable fallback, looser on long workflows.
- **Gemini/Qwen** — visual / different reasoning style.
- **MiniMax** — utility only (explore/librarian).
