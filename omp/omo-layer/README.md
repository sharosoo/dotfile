# omo-layer

OMO (Oh My OpenAgent) persona + model-router layer for **oh-my-pi** (`omp`).

It ports OMO's *opinionation* layer — discipline agents, smart model
assignment, orchestrator habits, edit-time slop checking — onto OMP's native
primitives. OMP already owns hashline edits, LSP, AST, subagents, hooks, skills,
the rulebook, and multi-model routing; this package adds the opinions on top.

> Background research: see `../README.md` and `../06-precedents.md`,
> `../07-model-router.md` in the parent workspace.

## What's inside

| Layer | Mechanism | OMP surface |
|---|---|---|
| **Model router** (`/omo-doctor`, `/omo-route`, `/omo-apply`) | runtime extension | `omp.extensions` (must be linked, not marketplace) |
| **Personas** (`agents/*.md`) | task agents | `~/.omp/agent/agents` discovery |
| **git-master** (`skills/git-master/SKILL.md`) | skill | skill discovery |
| **Rules** (`rules/*.md`) | injected rules (always-apply + TTSR + rulebook) | `omp-plugins` rule provider |

### The injecting-rules pattern (OMP-native)

`rules/` is discovered automatically by the `omp-plugins` provider — no runtime
code needed for these:

- `omo-orchestration.md` — `alwaysApply: true` → injected into every system
  prompt. Orchestrator discipline (parallel delegation, no half-stops, verify
  before done) applies even to the default session.
- `no-ai-slop.md` — TTSR (`condition` regex + `globs`) → fires only when an
  edit/write introduces slop phrases into source files. Comment-checker as a
  triggered rule.
- `persona-routing.md` — rulebook (`description`, on-demand via
  `rule://persona-routing`) → read before delegating.

## Install

This package ships a runtime extension, so install via **link** (a marketplace
install would not load `omp.extensions`):

```bash
cd ~/workspaces/sharosoo/omo-omp/omo-layer
bun install            # dev deps only (@types/bun, typescript)
omp plugin link .      # register the package with omp
# restart omp, then:
/omo-doctor            # report effective persona→model resolution
/omo-route             # compute + write resolved models into agents/*.md
```

Optional config: copy `omo-personas.example.json` to `~/.omp/agent/omo-personas.json`.

## Commands

| Command | Action |
|---|---|
| `/omo-doctor` | Report each persona's resolved model + warnings (no writes). Like OMO's `doctor`. |
| `/omo-route` | Compute assignments and rewrite `agents/*.md` `model:`/`thinkingLevel:` frontmatter. |
| `/omo-apply` | Alias for `/omo-route`. |

## Personas

| Persona | Role | Default family |
|---|---|---|
| `sisyphus` | orchestrator, parallel delegation | claude → kimi → glm → gpt |
| `atlas` | Boulder (todo) plan execution | claude → kimi → gpt → minimax |
| `prometheus` | interview planner (md-only writes) | claude → gpt → glm → gemini |
| `hephaestus` | autonomous deep worker (**GPT-only**) | gpt-5.5 |
| `momus` | ruthless reviewer (read-only) | gpt → claude → gemini → glm |

`git-master` ships as a skill (atomic commits, rebase surgery).

## Customize

`~/.omp/agent/omo-personas.json` (all optional):

```json
{
  "pins":            { "sisyphus": "anthropic/claude-opus-4-7:high" },
  "familyPriority":  { "sisyphus": ["kimi", "claude", "glm"] },
  "disable":         ["hephaestus"]
}
```

Precedence: **pin > family-priority override > default chain > unassigned**.
Invalid family values are dropped, never thrown.

## Verification status

| Check | Status |
|---|---|
| Router brain (`src/router.test.ts`) | ✅ **19/19 pass**, 37 assertions (bun) |
| Frontmatter (agents + skill) | ✅ all valid |
| TypeScript (`tsc --noEmit`, strict) | run `bun run typecheck` |
| `no any`, named return types | ✅ enforced by project rules |
| Live load in `omp` (`/omo-doctor` output) | ⬜ requires `omp plugin link` + restart — verify on your install |
| TTSR `no-ai-slop` triggering | ⬜ TTSR condition semantics best validated live |

## Caveats

- **Marketplace can't load the extension.** `omp.extensions` entry points load
  only for npm-installed or `omp plugin link`ed packages. The `rules/`,
  `agents/`, and `skills/` *would* load from a marketplace install, but the
  router commands would not — so link is the supported path.
- **Model ids must match what omp reports.** The router matches against
  `provider/id` strings from `ctx.models.list()`. If your proxy renames models,
  pin them explicitly.
- **`hephaestus` has no fallback.** Without a GPT-family model it stays
  unassigned (with a warning), by design.
