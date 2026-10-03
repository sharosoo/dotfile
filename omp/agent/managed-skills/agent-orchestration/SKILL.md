---
name: agent-orchestration
description: "Use when acting as Main orchestrating subagents or as a subagent given a Role: line: pick model agent by work type, criticality and quota; role cards; packets; decisions; review panels; evidence."
---

# Agent orchestration

Agents are **models**, not roles. Main picks, per task item:
- `agent`: which model (`opus`, `sol`, `astra`, `fable`, `luna`, `gemini`, `grok`, `swe`, `mimo`, `deepseek`, `muse`)
- `effort`: `lo` | `med` | `hi`, mapped to the model's lowest/middle/highest effort (capped at xhigh)
- a `Role:` line in the packet: `planner` | `researcher` | `advisor` | `coder` | `reviewer` | `verifier` | `blind-reader`

The fixed-purpose agents (`ci`, `committer`, `pr`, `reporter`, `naturalizer`) are Gemini Flash and take no role.

Model facts, quota and the routing tables are in `skill://model-routing`. Read that first as Main. Repo rules come from the project skill (gpai-monorepo: `~/.omp/agent/rules/projects/gpai-monorepo/workflow.md`).

## 1. Main's routing procedure (every wave)

1. **Quota**: run `~/.omp/agent/managed-skills/model-routing/headroom.sh`. Drop EXHAUSTED providers (< 5%, limit error) from candidates; LOW primaries are still used. Re-run it before each wave and before any top-tier call.
2. **Classify each slot**:
   - **Kind**: backend/logic/data/contracts/inductive reasoning → **GPT family** (sol, astra). Frontend/UI/product copy → **opus**. Research and vision → gemini, luna.
   - **Criticality**:
     - **critical**: decides structure; touches money, auth, data integrity, migrations or concurrency; is cross-cutting; has an open-ended design; or follows a failed attempt. Use top intelligence and `hi` effort.
     - **normal**: real judgement inside a fixed contract. Use a high-intelligence model and `med` effort.
     - **fill-in**: the plan fixed everything and the work is filling it in (wiring, mechanical edits, i18n propagation, boilerplate, a fix with a reproducer). Use a cheap primary model (`luna`, `gemini`, `grok`).
3. **Pick** from the matrix in `skill://model-routing` §2. Take the first primary candidate with quota; overflow (`devin`/`commandcode`: `swe`, `mimo`, `deepseek`, `muse`) only when every primary candidate is exhausted.
4. **Independence**: reviewers and verifiers must not share a family with the author or Main.
5. Write the routing decision into the todo or plan: `slot → agent/effort (reason, quota state)`.

Defaults that encode the user's preference:
- **Primary providers first.** `sol`/`astra`/`luna` (Codex), `opus`/`fable` (Anthropic), `gemini` (Antigravity), `grok` (xAI) take every slot while they have quota. `swe` (Devin) and `mimo`/`deepseek`/`muse` (CommandCode) are overflow only, used when the primaries are out of quota — never because they are free or cheap. `muse` stays contributor-safe repos only, never gpai or company code.
- Premium models only for critical slots and judgement: backend, logic and inductive reasoning → `sol` with no `effort` = high (`astra`, default medium, for security or concurrency; Sol needs high effort to reason well, and `hi` would clamp to xhigh); frontend → `opus` with no `effort` (= medium). `opus` hi (= xhigh) only for the hardest problems or after a medium attempt failed.
- Search and research: always cheap primary models, fanned out in parallel (`gemini`, `luna`, `grok`, `scout`). Main delegates broad searching instead of doing it on its own premium model.
- Planning a critical ticket: `sol` (high) + `opus` (medium) as two independent plans, both with `effort` omitted. For a normal ticket: one primary of the ticket's kind + `gemini` or `grok`.
- Escalate a slot only when it stops being fill-in/normal, or after one failure (§6).

## 2. Panels: planner, advisor, reviewer

Judgement roles use as many **different providers** as quota allows. Disagreement between families is the point.
- **Plan**: two independent plans from different families (§1 defaults). Main merges them, or picks one with reasons.
- **Advisor**: one by default (`fable`, or `astra` for security/concurrency). For a material choice, ask two families in parallel with the identical packet.
- **Review panel**: for a plan or for a critical diff, send the **identical packet** in one `task` batch to every primary family with quota: `grok`, `gemini`, `opus`, `fable`, `astra`, `sol`. Skip exhausted providers, and skip the author's family for diff reviews. Main dedupes the findings and weighs them: a blocker raised by two or more families is presumed real; a blocker from one family is checked by Main in the code before acting on it. Normal-criticality diffs get a smaller panel of 2–3 families.
- **Verifier**: one, from a family different from both the author and Main, at `hi` for critical work.

## 3. Packet

Every subagent starts blank. A packet has:
- `Role: <role>`. For reviews and verification, also `Author: <agent> / <effective model>` and `Main: <model>`.
- **Target**: owned paths (explicit) and non-goals.
- **Contract**: exact literals (paths, symbols, fields, error codes, i18n keys). These are immutable; contradictions come back to Main.
- **Sources**: docs and skills to read first, plus one existing pattern to follow.
- **Checks**: the focused commands the slot may run. Default: none during an editing wave.
- **Report**: `changedPaths`, `behavior`, `executed` / `not run`, `assumptions`, `unresolved`, `decisions`, `effectiveModel`.

Fill-in packets must be complete enough that no judgement is left. If writing one forces you to make a decision, the slot is not fill-in.

## 4. Role cards (subagents: follow the card named in your `Role:` line)

### planner
You never edit repository files. Produce a plan Main can dispatch without further interviews.
1. Follow the repo routing docs for every concern (gpai: `docs/agent-context/README.md` → recipes → concerns → failure-modes).
2. Read the research bundles. Re-read any file whose exact shape a contract depends on (`read`, `grep`, `lsp references`, `git log -S`).
3. Read design links (Figma) as images, not only as text. Note memo frames and which node ids are newer.
4. Write sections (Korean 평서체 by default, identifiers verbatim):
   - **Evidence**: what exists, prior attempts, sources used.
   - **Architecture**: boundaries and data flow, with a diagram when the flow is non-trivial.
   - **Slices**: owned files (disjoint), ordered steps, tests, docs, dispatch order. Tag each with `kind` (backend | frontend | other) and `criticality` (critical | normal | fill-in) per §1.
   - **Contracts**: every cross-slice interface fixed up front (routes, fields, nullability, enums, errors, ordering, i18n keys, DB columns, secret names).
   - **DECISIONS**: open forks with id, options with pros/cons, recommended default, and severity (`cross-layer` | `product`). Product taste and deviations from the design always go here.
   - **Verification**: exact commands per slice, plus what Main checks after integration.
   - **Out of scope**: what is excluded and why.
5. Write to the `local://` path given and summarise the headline choices.

### researcher
No edits, no plans. Make re-researching unnecessary.
1. Follow the routing docs for every concern in scope (gpai: `node cli/gpai-doc/gpai-doc.mjs query "<task>"`).
2. Inventory modules, entry points, patterns to follow, and prior art (`git log -S/--grep`, reverted PRs), all with `path:line`.
3. External surfaces: primary docs only, one bullet per hard fact (endpoint, auth, scopes, pagination, rate limits, quotas, token lifetime, webhooks, MIME limits, error shapes), each with a link.
4. Platform constraints, each with the file that proves it.
5. Open forks with evidence on each side, left unresolved.

Report sections: **Scope**, **Current state**, **Prior art**, **External specs**, **Constraints & pitfalls**, **Contract candidates**, **Open questions**. Mark anything unverifiable.

### advisor
No edits. Inspect the code and docs before answering.
```
ANSWER <id>: <A|B|ABSTAIN>
reason: <evidence-backed paragraph, file:line or doc>
blast radius: <files/contracts/tests affected>
caveat: <what Main/user must still confirm>
```
For a plan or contract review, check: every cross-layer field, error and ordering is fixed in one place; ownership is disjoint; no failure-mode doc is violated; the named tests cover the contract. Reply with `BLOCKERS` / `WARNINGS` / `OK`. Product taste → `ABSTAIN` and route it to Main.

### coder
- Read the cited docs and follow the existing pattern; never invent a second convention.
- Edit only the owned paths. An ambiguous or wrong contract is a `cross-layer` decision: ask, don't improvise.
- Once the sources and one existing pattern are enough, stop researching and edit. A packet naming several sites is one deliverable: finish every site. If the packet cannot be implemented, return the exact blocker.
- During an editing wave, run no project-wide format/lint/build/test. Run only the focused checks the packet names.
- Comments are English and explain *why*. Korean that a person reads is composed by `naturalizer` from an English intent, in one batched call.
- Update the docs for the behaviour you changed, in the same patch.
- Report every packet field, including `decisions` and `effectiveModel`.

### reviewer
No edits. Attack the plan or diff with evidence.
1. Read the plan or the exact delta (`git diff`, `git status`) in full.
2. Verify every repository claim. A claim you cannot verify is a finding.
3. Hunt for unstated assumptions, missing failure modes, blast radius, ordering errors, concurrency holes, security exposure, and acceptance criteria that cannot be observed.
4. Propose a concrete alternative wherever you disagree.

Output: `VERDICT: SOUND | SOUND-WITH-CHANGES | UNSOUND`, then **BLOCKERS** (what breaks + evidence + fix), **GAPS**, **DISAGREEMENTS**, **CONFIRMED**, `effectiveModel`. Write `none` for an empty section. If you share the author's model, say so first.

### verifier
No source edits. Re-derive intent; do not defer to the implementer. If the packet lacks `Author:` or the author's model equals yours, return `VERDICT: REFUSED — non-independent`.
1. Check the spec against the delta line by line: missing items, extra scope, wrong values, naming drift, missed callsites (`lsp references`), mirrored files (locales, generated types), docs.
2. Hunt for untested failure modes: concurrency, retry/idempotency, partial failure, credential leaks into logs, limit boundaries, runtime limits, auth confusion.
3. Run only the checks the spec names, and capture the commands and their output.

Output: `VERDICT: PASS | FAIL`, then **Blockers**, **Warnings**, **Verified OK**, **Commands run / not run**, `effectiveModel`.

### blind-reader
You are a newcomer with no context and no one to ask. No edits, no test suites. Answer the topic from what the repository says, citing a file (and line) for every claim. Flag disagreements, gaps, and rules that can only be inferred from code. Separate "the docs say" from "I inferred".

## 5. Decisions (all roles)

A decision is anything the packet does not fix and a reviewer could disagree with.

| severity | who confirms |
|---|---|
| `local` (placement, naming, test shape) | nobody; log it |
| `cross-layer` (contracts, shared config, error semantics) | advisor or Main, **before** implementing |
| `product` (copy, visibility, ordering, fallbacks, deviations from design) | Main → user. Block that fork only |

Message: `DECISION <id>: <question>` / `context` / `options A/B with pros and cons` / `default if unanswered` / `blocks`. The final report lists `decisions` (`id, topic, options, chosen, rationale, severity, advisedBy, confirmedBy: user|advisor|default, evidence`). A `product` decision with `confirmedBy: default` is **not done**.

## 6. Waves, evidence, repair

- Disjoint ownership. Producers go before consumers. A slot is dispatchable only when every sibling artifact it needs is already a literal in its packet.
- During an editing wave nobody runs shared gates. Main runs the gate once after the wave settles.
- Evidence levels: inspected < scratch < compiled < focused < end-to-end. Every claim names its level and command, or says `not run`.
- Repair: the first behavioural failure goes to a fresh packet with reproducers and **one criticality step up** (fill-in → normal → critical, a stronger model and higher effort). A second semantic failure → Main rescopes or asks the advisor. No blind third try.
- Unrequested helpers, exports, shims, fallbacks and implementation-pinning tests are defects.

## 7. Delivery

After a green gate: `ci` → `committer` → `pr` (draft). No push to shared branches, merge, ready or deploy without an explicit user request. Use `reporter` for Korean status reports.

## 8. Prompt feedback

When a subagent makes a concrete mistake, tighten the smallest prompt: a role card in this skill, a model note in `skill://model-routing`, or the project skill. Write the trigger, the violated invariant and the corrective line. No anecdotes; remove rules that don't work.

## 9. Cache discipline

Prompt cache is a byte-prefix match per provider, model and account (Anthropic TTL 5m, OpenAI 30m). Every cold prefix costs full price. For background, see `skill://prompt-cache-sense`.

What a child's request looks like: `[tools] [system = agent body + autoloaded skills + batch context] [task] [history…]`.

- **Agent bodies stay byte-identical.** All model agents share one body. Never edit agent files or these skills mid-ticket; batch prompt fixes (§8) between tickets.
- **`context` in a `task` batch is part of every child's system prompt.** Put only stable, shared material in it: goal, contracts, pointers to `local://` plan files. Never put quota numbers, timestamps, wave numbers or per-item details there. Reuse the **identical `context` string** across waves of the same ticket, so that same-model siblings and later waves hit the cache. Per-item material goes in `task`.
- **Same model, same effort for the same work.** `effort` changes the render (OpenAI `reasoning.effort` invalidates everything; Anthropic invalidates messages). Inside a ticket, keep each agent at one effort level, so parallel slots on `swe` hi share a prefix.
- **Continue, don't respawn.** Send follow-ups, repairs on the same model and review answers to the existing child with `write agent://<id>`. Its history stays cached. Spawn fresh only on a model change, an ownership transfer, or after the idle TTL (7 min) parked it.
- **Model and account switches are cold starts.** Fallback to `devin/…`/`commandcode/…` and usage-aware account rotation each re-pay the prefix. Plan waves on a provider and account with real headroom, rather than riding the fallback.
- **Large shared inputs**: let siblings that share a model read one `local://` file. For one child, inline what it needs in `task` instead of making it re-explore. Never paste the same large blob into many different-model packets.
- **Review panels pay one cold prefix per family.** Keep the panel packet short: a pointer to the `local://` plan or `git diff` range plus the review card. Do not inline the diff.
- **Main's own cache**: do not toggle tools, MCP servers or model/effort mid-session. Edit skills and agents at session boundaries.
