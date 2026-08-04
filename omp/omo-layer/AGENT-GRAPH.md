# Agent-call-agent reproduction in OMP (verification)

> User concern: OMO agents call other agents while working (Sisyphus→Hephaestus/Oracle,
> Atlas→specialists, Metis→explore/librarian/oracle, …). Is this reproducible in OMP?
> **Answer: yes.** Verified against `omp://task-agent-discovery.md`.

## How OMP reproduces nested agent calls

| Concept | OMP mechanism | Source |
|---|---|---|
| Spawn a subagent | the `task` tool with `agent: "<name>"` | task-agent-discovery §agent-lookup |
| Who an agent may spawn | frontmatter `spawns`: `*` (any) · `""` (none) · CSV list (only named) | §agent-definition-shape |
| Parent controls children | parent session's `getSessionSpawns()` is checked at spawn time; denied → immediate `Cannot spawn '...'. Allowed: ...` | §parent-spawn-policy |
| Recursion depth cap | `task.maxRecursionDepth`; at max depth the child's `task` tool is removed and its spawns set empty | §recursion-depth-gating |
| Self-recursion guard | `PI_BLOCKED_AGENT` env rejects matching spawn | §blocked-self-recursion |
| Backward-compat | if `spawns` is **omitted** but `tools` includes `task`, spawns becomes `*` (explicit `""` stays none) | §agent-definition-shape |

So a chain like Sisyphus → Hephaestus → explore terminates correctly: explore has `spawns: ""`, so it cannot spawn further, and the depth gate is a backstop.

## Delegation graph (audited against the ported prompts)

| Agent | Role | spawns | Has `task`? | Spawns whom (per its prompt) |
|---|---|---|---|---|
| **sisyphus** | orchestrator | `*` | yes | hephaestus, momus, atlas, explore, librarian, oracle, metis, prometheus |
| **atlas** | plan executor | `*` | yes | specialists (hephaestus, sisyphus-junior, explore, librarian) + reviewers (momus) |
| **prometheus** | planner | `explore,librarian,oracle,metis,momus` | yes | read-only scouts + momus review (never implementers) |
| **metis** | pre-planning consultant | `explore,librarian,oracle` | yes | read-only scouts + oracle |
| **hephaestus** | deep worker | `explore,librarian,oracle` | yes | read-only scouts for context |
| **sisyphus-junior** | focused executor | `explore,librarian` | yes | read-only scouts only (no executor delegation) |
| **momus** | reviewer | `""` | no | none (read-only) |
| **oracle** | advisor | `""` | no | none (read-only) |
| **librarian** | docs/code search | `""` | no | none (read-only) |
| **explore** | codebase grep | `""` | no | none (read-only) |
| **multimodal-looker** | vision | `""` | no | none (read-only, inspect_image/read only) |

**Read-only leaf agents** (momus, oracle, librarian, explore, multimodal-looker) terminate every chain — they cannot spawn, so recursion always bottoms out.

## Required configuration

The deepest intended chain is 3 levels (e.g. sisyphus → atlas → hephaestus → explore is 3 hops to a leaf). Ensure your config allows it:

```yaml
# ~/.omp/agent/config.yml
task:
  maxRecursionDepth: 4   # default not confirmed in docs; set explicitly to be safe
```

> The default value of `task.maxRecursionDepth` is **not stated** in `omp://task-agent-discovery.md`.
> Set it explicitly. If a spawn fails with a depth-related message, raise it. (TODO: confirm the
> default from `src/config.ts` or `settings.md` — left as a live-verification item.)

## OMO → OMP spawn-tool mapping note

OMO uses `task(subagent_type=…, category=…, load_skills=…, run_in_background=…)` and a separate
`call_omo_agent`. OMP has a single `task` tool (with `agent`, batch `tasks[]`, async via `job`).
The ported prompts map every OMO spawn instruction to OMP's `task`. There is no `call_omo_agent`
in OMP — its allow/deny semantics collapse into `spawns` (CSV permit list).

## OMO fidelity caveat (atlas / hephaestus `task` denial)

OMO's `agents/AGENTS.md` roster lists "Atlas | denied: task, call_omo_agent", yet the Atlas prompt
is built entirely around `task()` delegation, and `atlas/agent.ts` sets **no** denial in its
factory. The roster row appears stale or refers to a different layer. For the OMP port we follow
the **prompt** (the behavioral spec): Atlas orchestrates → `spawns: "*"`, has `task`. Flagged as
a fidelity item to reconcile with upstream if contributing back.
