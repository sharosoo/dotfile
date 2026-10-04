# Agent Runtime, Many-to-Many Conversation, and Skill Runtime Audit Pattern

Use this reference when a repository audit must separate an existing single-agent/chat implementation from a proposed many-to-many conversation runtime and a first-class Skill Runtime.

## Evidence map

Trace the current system across these planes:

1. **Admission and identity** — HTTP/controller auth, commands, ownership checks, billing principal.
2. **Conversation schema** — session ownership, message actor/role fields, participants, visibility, branches, event ordering.
3. **Agent execution** — provider loop, tool rounds, cancellation, retry/attempt, durable run identity, leases.
4. **Provider boundary** — neutral LLM port, provider/model/transport routing, native replay.
5. **Cache/context/history** — stable versus volatile prompt segments, cache keys, snapshots, canonical history, truncation.
6. **Tools and memory** — tool context/principal, invocation provenance, personalization, history lookup, long-term memory scope.
7. **Delivery and observability** — SSE/event identity, actor/run attribution, cursor/resume, spans.
8. **Skills** — distinguish developer-assistant instruction files from application runtime loading and execution.

For each plane record: `Current evidence | Single-user/agent assumption | Missing capability | Target boundary | Contract tests`.

## Proving a negative capability finding

Do not claim that a capability is absent from one empty search. Triangulate:

- Search source, tests, migrations/schemas, package manifests, and documentation with synonym families.
- Inspect adjacent types to rule out the concept being encoded under a different name.
- Distinguish a presentation field named `role` or `visibility` from participant identity or authorization semantics.
- Distinguish static developer tooling (for example checked-in `SKILL.md` instructions) from an application Skill Runtime.
- State the searched scopes and exact terms, and qualify the conclusion as “no relevant implementation found.”

Useful synonym families:

- Actor: `actor`, `author`, `sender`, `principal`, `participant`, `member`.
- Run: `run_id`, `attempt`, `lease`, `active_run`, `idempotency`, `revision`.
- Many-to-many: `audience`, `recipient`, `visibility`, `routing`, `handoff`, `steer`, `branch`, `delivery`.
- Skill runtime: `SkillManifest`, `SKILL.md`, `skill resolver`, `dependency`, `progressive loading`, `evaluation`.

## Key architectural distinctions

- A provider-neutral model/tool loop is an **inner run engine**, not a conversation scheduler.
- A message `role` is protocol/presentation metadata, not actor attribution.
- Model/provider routing is not agent routing.
- A mutable provider snapshot is optimization/replay state, not the authoritative conversation event log.
- Personalization subject, message actor, request principal, conversation owner, and billing principal are separate identities.
- A tool registry is not a Skill Runtime. Skills may contribute instructions, tools, context resources, policies, lifecycle hooks, and evaluators.

## Many-to-many target checklist

Require explicit contracts for:

- Conversation, participant/membership, agent binding, branch, immutable event, and delivery/cursor.
- Durable run state machine, expected revision, attempt, lease, idempotency, cancellation and steering.
- Actor attribution and audience on every event/message/tool/memory object.
- Agent routing modes: direct, single-best, fanout, sequential, coordinator/review.
- Handoff offer/accept/reject/timeout with capability narrowing and context re-authorization.
- Visibility filtering consistently applied to API delivery, prompt context, search, memory, cache, and logs.
- Concurrent agent outputs appended independently; no whole-transcript equal-version last-write-win.

## Skill Runtime target checklist

Require:

- Immutable `(skill_id, version, content_digest)` packages and mutable aliases resolved before run start.
- Manifest compatibility, dependencies, capability requirements, policies, resources, tools/hooks, and evaluator declarations.
- Deterministic dependency locking, cycle/conflict detection, signature/digest verification.
- Progressive loading: catalog descriptor → manifest admission → instructions → on-demand resources/tools → evaluators.
- Typed execution principal, run/attempt, grants, audience, deadline, cancellation and idempotency.
- Invocation/evaluation provenance and resolved skill-graph digest in run state, observability, prompt/tool cache keys, and native-replay compatibility.

## Concurrency finding to check explicitly

For snapshot/version stores, inspect the exact comparison operator. A guard that rejects only `current_version > incoming_version` accepts equal versions; concurrent same-version payloads can last-write-win. Read the implementation and tests, not just comments claiming “version guarded.”

## Verification

Run focused tests that cover current behavior, and describe what passing tests prove versus what is unimplemented. A test that explicitly preserves unsafe behavior (such as unauthenticated cancellation) is valuable evidence and should be reported as a current contract, not interpreted as endorsement.
