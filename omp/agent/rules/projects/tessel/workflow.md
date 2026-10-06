# tessel workflow (project rules for Main and subagents)

Repository: `git@github.com:sharosoo/tessel.git` (any worktree). This file replaces the old untracked `tessel/.omp/agents/tessel-*` agents and `tessel/.omp/skills/tessel-contract-implementation`. Global routing comes from `rules/subagent-routing.md`, `skill://agent-orchestration` and `skill://model-routing`. This file adds only what is specific to Tessel.

## 1. Authority

- `docs/implementation/decisions/0004-sol-orchestrator-advisor-routing.md` (IMP-0004) is committed in the repo and governs **workflow controls**: one accountable Main per ticket, packet literals, editing-wave execution ban, evidence vocabulary, cross-model review identity, repair policy, and the prompt-feedback loop. Read it before dispatch.
- Its **model table** (§ Cost, capability and quota evidence) dates from 2026-09-22 and is superseded by `skill://model-routing`: SWE-2 is the workhorse while its promotion lasts, and Grok is disabled (2026-10-07), so no Grok review opinion. If you change routing for Tessel, update IMP-0004 in the same ticket so the repo record stays true.
- Authoritative contracts are the repo's SPECs, `contracts/`, `contracts-v2/` and ADRs. When a contract and an owner API conflict, that is the only legitimate reason for a coder to stop.

## 2. Data classification

Tessel is **contributor-safe**: `muse` (Muse Spark 1.3 Contributor) may receive Tessel slices. Credentials, secrets, customer data, private incident material and personal data are still excluded from every packet.

## 3. Routing (old agent → model agent + `Role:`)

| old Tessel agent | now |
|---|---|
| `tessel-orchestrator` / `-opus` | Main itself (Sol or Opus), chosen before the ticket from `headroom.sh`; never switched mid-ticket |
| `swe2-coder`, `tessel-luna-contributor`, `tessel-muse-contributor`, `tessel-mimo-coder` | `swe` (default), overflow `luna` / `muse` / `mimo`, with `Role: coder` |
| `tessel-sol-coder`, `tessel-opus-coder` | `sol` / `opus` with `Role: coder`, critical slots only. Never the same family as Main when that slot will need independent review |
| `tessel-glm-mechanical`, `tessel-deepseek-mechanical` | `deepseek` (or `mimo`) with `Role: coder`, fill-in only |
| `tessel-advisor-fable` / `-astra` | `fable` / `astra` with `Role: advisor` |
| `tessel-reviewer`, `tessel-sol-verifier` | review panel / `verifier` per `skill://model-routing` §5. `tessel-grok-reviewer` is retired: Grok is disabled (2026-10-07); give its seat to `gemini`. |
| `tessel-gemini-routine`, `tessel-mimo-routine` | `reporter` / `gemini` with `Role: researcher` (docs, summaries, QA evidence) |
| `tessel-committer` | `committer` + §6 below |

## 4. Coder additions (put this section reference in every coder packet)

- Read the cited contracts and the named upstream references under `.references/` before coding. Report which reference patterns you adopted, adapted or rejected, and why.
- Preserve exact ownership, state transitions, canonical identities, security boundaries and non-goals.
- Decide within the packet's rules and list your assumptions instead of stopping. Stop only for a genuine contradiction between a registered contract and an owner API.
- Size or coupling is not a blocker. A packet naming a multi-site change is one deliverable: finish every named site and reach the packet's compile check. A partial edit set is never a valid handoff.
- Taking over a slice another worker started: read its transcript and the current files first, then continue from that state.
- Write **no code or doc comments** unless a safety constraint cannot be expressed in code; name that exception in the handoff.
- Tests must be consumer-observable. No unrequested exports, aliases, fallback paths or shims.
- Report: changed paths, behaviour, executed / not-run commands, assumptions, references used, blockers, `effectiveModel`.

## 5. Advisor, review and documentation additions

- **Advisor**: return `ADVICE <id>` with a recommendation or `ABSTAIN`, evidence, preserved invariants and failure modes (plus a counterexample or state trace where useful), alternatives, blast radius, the strongest counterargument, unresolved facts and confidence. Label claims `FACT`, `OBSERVED` or `INFERENCE`. Do not plan the wave, approve, or broaden the question.
- **Review / verify**: the packet must record the author agent with its effective model and Main's model. If either is missing, or matches the reviewer's model, refuse with no findings. Each finding has severity, exact location, affected contract, failing input or transition, expected vs actual, and the smallest correction. Treat every new comment as a defect unless it records a non-obvious safety constraint. With no defect, name the inspected and executed scope and its proof limits.
- **Documentation / summaries**: every factual sentence must trace to a named source, diff or command output. Do not infer physical topology (separate files, processes, databases) from logical owner isolation. Never add encryption, retention, deletion or ephemeral-storage guarantees unless a source states them; copy exact schema fields. Deduplicate: update one canonical occurrence instead of repeating a rule.

## 6. Commits

- English subjects and bodies; no emojis; no `Co-authored-by` or generated-attribution footer.
- Stage only from the explicit owned-path allowlist Main supplies, after Main approves the verification evidence. Never include another session's work, preexisting changes, credentials or ignored outputs.
- If unrelated changes are already staged, or an unborn repository makes the commit depend on an uncommitted baseline, report the risk to Main. Never reset or unstage user work. If safe atomic staging is impossible, stop without committing.
- One commit per coherent ownership cluster in dependency order, docs/plan last; verify each commit with `git show`.

## 7. Prompt feedback for Tessel

A cross-role worker mistake in Tessel updates §4–§6 of this file; a routing lesson updates `skill://model-routing`. Record the trigger, the violated invariant and the smallest corrective line, then exercise it on the next suitable dispatch.
