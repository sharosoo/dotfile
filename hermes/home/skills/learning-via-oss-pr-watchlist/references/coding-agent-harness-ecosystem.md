# Coding-agent harness ecosystem: OmO / senpi / oh-my-pi (as-of 2026-08-22)

Condensed knowledge bank from a deep-dive on `code-yeongyu/oh-my-openagent` (dev, v5.0.0-beta.14, snapshot 74094829e — repo cloned locally at `~/workspaces/omo-study/oh-my-openagent`; study docs at `~/workspaces/omo-study/*.md`). Facts drift fast here — re-verify before reuse. User context: wants to port the OMO plugin to run on top of oh-my-pi (omp).

## The three forks of pi-mono

| Project | Owner | Strategy | License |
|---|---|---|---|
| pi-mono (upstream) | badlogic (Mario Zechner) | minimal terminal coding harness, extension-first | MIT |
| **oh-my-pi (omp)** | can1357 | rewrite toward coding-first; own dialects (omptype-based `pi.zod`, hashline pkg, v17.x churn); npm `@oh-my-pi/pi-*` | MIT |
| **senpi** | code-yeongyu | stay close to upstream; OMO ideas absorbed as builtin extensions; single CLI binary; Dori's runtime; npm `@code-yeongyu/senpi` / `@earendil-works/pi-*` | MIT |

## oh-my-openagent (OmO) — what it actually provides

Value thesis ("human removes the loop"): big-task handoff, not small-task polish. Four pillars:

1. **Category-based multi-model routing** — tasks specify intent categories (`visual-engineering`, `ultrabrain`, `deep`, `quick`, `artistry`, `writing`…), not model names; each category has a fallback chain (authoritative source: `packages/model-core/src/category-model-requirements.ts`). Premium models reserved for planning/search goes to ultra-cheap fallback chains.
2. **Autonomous completion loops** — `ulw`/`ultrawork` keyword arms a directive-injection mode; `ulw-loop`; boulder state machine (`.omo/boulder.json`) enables crash-resume via `/start-work` and continuation hooks (cap 8 consecutive).
3. **Expression hierarchy** Skill(MD, zero runtime) → MCP(process boundary) → Tool(first-party) → Hook(loop injection).
4. **11 discipline agents** — Prometheus(planner, Write restricted to `.omo/*.md` by hook), Atlas(executes plans, delegates all writes), Sisyphus-Junior(worker: delegation blocked, must pass lsp_diagnostics), Oracle/Metis/Momus(review lanes), Hephaestus(GPT-native autonomous), Explore/Librarian(cheap search).

Systems worth studying (each solves one vanilla-agent failure mode):
- Plan quality gate: Metis gap-analysis + Momus+Oracle parallel independent review (both must approve, ≤5 rounds, "80% clear = executable").
- Wisdom accumulation: `.omo/notepads/{plan}/` learnings/decisions/issues/problems forwarded to every later subagent.
- 54+ lifecycle hooks incl. preemptive compaction, edit/json error recovery, model fallback, TODO continuation reminders (`packages/omo-opencode/src/hooks/`).
- Shared LSP daemon (per-user unix socket, warm servers across sessions); task engine with in-process vs process runners, exactly-once completion routing.

Skills inventory: 17 shared skills (`debugging`, `review-work`(5 parallel review subagents), `remove-ai-slops`(regression-test-first then batch cleanup), `git-master`, `programming`, `frontend`, …) + workflow skills (`ulw-plan`, `hyperplan` adversarial planning, `ulw-research`). SKILL.md = router/index; real content in `references/`. Trigger phrasing style: aggressive "MUST USE for…".

## Editions & the senpi porting architecture

Three editions: Ultimate (OpenCode plugin, `bunx oh-my-openagent install`), Light/LazyCodex (Codex CLI plugin, `npx lazycodex-ai install`), Senpi/native beta (`npm i -g omo-ai@beta` → standalone `omo` command spawning exact-pinned senpi + staged plugin payload; `packages/omo-native/`).

The layering refactor IS the porting methodology:
```
Core 20 pure-TS packages (harness-import forbidden, neutrality tests)
→ MCP packages (lsp-tools-mcp, lsp-daemon, git-bash-mcp, ast-grep-mcp)
→ Skills (shared-skills)
→ Adapters: omo-opencode | omo-codex | ★omo-senpi★ | pi-goal | pi-webfetch
```
`packages/omo-senpi/` = the worked example of putting OmO on a pi-family host: 18 components (`config-startup`, `ultrawork`, `skill-pointers`, `start-work-continuation`, `ulw-loop`, `todo-fanout-reminder`, `git-master`, `fallback-architect`, `comment-checker`, `telemetry`, `lsp`, `task`, `memory`, `config-watch`, …). Porting patterns to steal:
- Stop hook → `agent_end` event; system injection → hidden custom message `pi.sendMessage({customType, display:false})` + `{action:'continue'}`.
- Deliberate non-porting also documented (rules component skipped because senpi has builtin rules).
- All components self-skip when host lacks required ExtensionAPI capability.
- Build: single bundled `extensions/omo.js`, senpi peer family externalized so the installed host resolves them (`SENPI_LOADER_ALIASES` pinned by `bundle-purity.test.ts`); skills synced from 3 pools with per-host overlay transforms (token substitution, compat banners).
- QA culture: "typecheck ≠ QA"; live harness drivers with isolated `SENPI_CODING_AGENT_DIR`, real-dir-untouched proof, evidence files mandatory before commit.

## Why yeongyu ported to senpi instead of omp

1. Control: exact-pin own engine; can fix API mismatches upstream-side. omp is externally owned and rewriting internally every release.
2. API stability doctrine (ROADMAP): "premature adapter-pattern abstraction across unstable interfaces causes more pain than duplication."
3. Host loop-control: OpenCode-style plugin systems exposing arbitrary loop injection are structurally unsafe (ROADMAP "Why Not OpenCode-Native") — same argument applies to any host whose extension surface they don't control.
4. senpi is Dori's production runtime → investment compounds in their own stack.
Despite this, cross-pollination continues: senpi ported omp's phased todo tool (MIT, credited); OmO scans `~/.omp` sessions as first-class (same JSONL family format); installer reads omp credential DBs.

## Compatibility matrix (omp ↔ senpi/OmO)

- Session transcripts: effectively compatible (shared pi-family JSONL).
- Skills/prompt templates/AGENTS.md conventions: mostly compatible (markdown).
- TS extensions: same lineage patterns but NOT drop-in — namespaces differ (`@oh-my-pi/pi-*` vs `@earendil-works/pi-*`), omp internals rewritten; expect porting, both directions already happened once each.
- Config stores separate (`~/.omp` vs `.senpi/agent` vs `~/.omo`).

## Licensing trap (important for any port)

Oh-my-openagent is **SUL (Sustainable Use License)**, not MIT: personal/internal use+modify OK; commercial distribution forbidden. omp/senpi/pi-mono are MIT. Consequence: an omp adapter written fresh (no OMO code included) can be MIT-published; shipping OMO code/skill text cannot. The todotools port shows the compliant direction (MIT code flows freely; SUL code doesn't).

## omp-porting strategy sketch (user's actual goal)

Order of attack derived from the omo-senpi reference implementation:
1. Scope cut first: Team Mode/Discipline Agents/OpenCode-specific hooks out of scope; target skills + ultrawork/skill-pointers/start-work-continuation + task(in-process) as MVP.
2. Diff omp `docs/extensions.md` against the ExtensionAPI surface omo.js uses (`pi.on/registerTool/registerCommand/sendMessage/setActiveTools` core is common; verify hidden-message semantics on omp).
3. Ship skills first (markdown, near-free) using the sync-skills overlay pattern.
4. Reuse harness-neutral cores directly (rules-engine, comment-checker-core, boulder-state, memory-core, lsp-core+daemon) — only the adapter is new work.
5. Keep personal use (SUL-safe); publish adapter separately without OMO payload.
