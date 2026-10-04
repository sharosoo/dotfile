---
name: evidence-led-repository-inspection
description: "Use for repository audits; return exact evidence."
version: 1.3.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [repository, codebase, architecture, evidence, symbols, tests, git, prompts, caching]
    related_skills: [github:codebase-inspection, software-development:systematic-debugging, software-development:requesting-code-review]
---

# Evidence-Led Repository Inspection

Use this class-level skill when the user asks where behavior is implemented, how a runtime path works, or for an architecture/implementation inventory. The default deliverable is an evidence index, not an essay and not a code change.

## Operating contract

- Inspect only unless the user explicitly authorizes edits.
- Prefer exact paths, line ranges, symbols/functions/classes, test names, commands, and Git SHAs.
- Separate implementation facts, test assertions, comments/design intent, documentation, and runtime verification.
- Never present an unexecuted test as passing.
- Never turn a comment such as “saves tokens” or “improves cache hits” into a measured result unless telemetry or a passing test establishes it.

## Workflow

1. **Scope the repository**
   - Resolve the repository root.
   - Capture `git status --short --branch`, `git log --oneline --decorate`, and the relevant branch/HEAD.
   - Preserve a clean/dirty finding; do not modify files.

2. **Search broadly, then narrow**
   - Search both domain terms from the request and likely implementation vocabulary.
   - Enumerate candidate files, then use exact symbol/function searches.
   - Read focused line ranges rather than dumping entire large files.

3. **Trace the full boundary path**
   - For runtime behavior, follow producer → domain type/port → router → adapter/transport → persistence/observability.
   - For prompt/LLM audits, explicitly record message order and stable/volatile boundaries.
   - For context audits, distinguish persisted context, re-resolved context, current-turn context, and provider-native state.

4. **Record evidence while reading**
   For every substantive claim, capture:
   - exact repository path;
   - line range;
   - symbol/function/class;
   - concrete branch, field, formula, or message ordering;
   - relevant test path and test function;
   - `git blame` or `git log --follow` SHA where useful.

5. **Inspect tests as executable contracts**
   - Look for byte-identity assertions, exact wire payloads, cache markers/keys, token ceilings, usage normalization, persistence/replay behavior, and mismatch/branch safety.
   - Run focused tests when the environment permits.
   - If collection fails, report the exact command and error; do not substitute source reasoning for test results.

6. **Report compactly**
   Group findings under the user’s requested concerns. Use evidence rows or tables with columns such as `Concern`, `Path:lines`, `Symbol`, `Observed behavior`, `Tests`, and `SHA`. Add `Not verified` for blocked execution or claims supported only by comments/docs.

## Database and storage architecture audit

When the request asks for an exact database/storage structure, treat storage as a graph of planes rather than assuming one database:

1. Identify every persistence plane separately: primary records, search/vector indexes, append-only source files, metadata/control-plane stores, workflow/session state, telemetry/usage stores, and external managed services.
2. Enumerate schema from executable definitions, not README prose: `CREATE TABLE`, `CREATE VIRTUAL TABLE`, ORM table declarations, collection creation calls, index declarations, key builders, and migration code. Record primary keys, uniqueness, nullable/default behavior, serialized JSON fields, vector dimensions/metrics, and filter/index fields.
3. Trace writes and reads end to end: producer/hook → domain writer → adapter/port → physical table/collection/file → reader/search path. Explicitly check dual-write, fallback, degraded-mode, and source-of-truth semantics.
4. Inspect configuration and factory code to distinguish selectable backends from the backend used by default. Record default paths, prefixes, TTLs, database/collection naming, embedding switches, and fallback order; redact credentials and connection strings.
5. Search for migrations in three forms: runtime idempotent DDL (`IF NOT EXISTS`, `ALTER TABLE`, `PRAGMA table_info`), destructive rebuilds (FTS/vector/index recreation), and standalone migration scripts. Do not infer that a schema is versioned merely because a `drizzle.config` or migration-like filename exists.
6. Audit tests independently. Enumerate tracked `test/spec/__tests__` files from the Git tree, inspect test runner include patterns, and run focused commands when dependencies permit. Distinguish “no test files,” runner/config failure, collection failure, and passing tests; never summarize an absent test suite as coverage.
7. If multiple components use similarly named tables, compare them explicitly (for example local SQLite tables versus remote collections versus per-tenant/per-wiki files). Call out stale comments or documentation when executable schema disagrees with them.

A useful output is a compact matrix: `Plane | Physical object | Schema/index | Write path | Read path | Config | Migration | Tests | Evidence`. Mark each conclusion as `Verified`, `Inference`, or `Not verified` and prefer immutable commit/blob URLs over moving branch links.

## Runtime concern-map audits

When the user asks for a current-state architecture map plus target boundaries, preserve a strict separation between **evidence** and **design**:

1. Trace current admission/identity, execution, provider routing, cache/context/history, persistence, tools, memory, delivery, observability, and tests.
2. For every current plane, identify the concrete assumption that constrains the target (for example one owning user, role without actor attribution, no durable run identity, or mutable whole-conversation snapshots).
3. Prove negative capability findings by triangulating source, tests, migrations/schemas, manifests, and documentation with synonym families. One empty search is insufficient.
4. Distinguish adjacent but non-equivalent concepts: provider routing versus agent routing; message role versus actor identity; snapshot replay versus authoritative event history; tool registry versus Skill Runtime; developer-assistant `SKILL.md` files versus application skill loading/execution.
5. Put proposed aggregates, ports, state machines, invariants, migration priorities, and test matrices in a clearly labeled target section. Do not imply they already exist.
6. Inspect concurrency guards exactly. A comparison that rejects only strictly older versions may still allow equal-version last-write-win; tests preserving that behavior are evidence of the current contract.
7. Treat passing tests as proof only of current behavior. If a test explicitly preserves an unsafe behavior, report it as a risk and required migration, not as endorsement.

Use the detailed checklist and reusable concern-map vocabulary in [`references/agent-runtime-conversation-skill-runtime-audit.md`](references/agent-runtime-conversation-skill-runtime-audit.md).

## Bounded-context, package, and deployable audit

When the user asks for a domain map or service partitioning, keep three layers separate: a **bounded context** owns business language and invariants, a **package** enforces source-level dependencies, and a **deployable** isolates workload, scaling, and failure. Do not infer any of these directly from top-level directories.

1. Inventory executable surfaces first: HTTP route mounts, background consumers and stream names, schedulers, web feature roots, repositories, migrations, DI/composition roots, build manifests, and runtime entrypoints.
2. Build each candidate context around responsibilities, source-of-truth data, writers/readers, invariants, transaction boundaries, and dependencies. Treat UI feature folders as consumption surfaces, not automatic data owners.
3. Determine schema ownership separately from write ownership. One component may own every migration while several runtimes write the tables; report this as shared-schema/multi-writer coupling.
4. Trace atomicity across persistence and messaging. For every persist-then-enqueue flow, verify outbox, inbox/idempotency, and compensation behavior. A DB transaction does not make a later Redis/queue write atomic.
5. Read DI containers and factories as dependency graphs. Cross-context repository injection, shared database handles, and one service constructing another context's repository are strong coupling evidence.
6. Read deployment manifests with process startup code. Record when HTTP APIs, consumers, and schedulers share one process despite different scaling and failure characteristics.
7. Inspect browser clients for multiple public upstreams. Direct worker calls leak deployment topology, auth, errors, and transport contracts into the UI.
8. Propose package boundaries before the smallest justified deployable split. Keep shared renderers or invariants together; split for independent scaling, SLO, security, or failure isolation. Include explicit `keep together` and `split` decisions.
9. Verify idempotency and single-writer claims against executable enforcement: unique indexes, tenant/user-scoped predicates, compare-and-set transitions, locks, ACK timing, and concurrent callers. Lookup-before-insert is not “exactly once” without a matching database constraint.
10. Distinguish dependency presence from active integration. A lockfile entry does not prove that CRDT/realtime code is instantiated, persisted, authorized, or connected.
11. Visibly separate current facts, inferences, and target proposals. Never describe proposed ownership, gateways, or event contracts as existing code.
12. Use configuration as architecture evidence but never reproduce credentials or connection strings. Redact values and report rotation/secret-store migration as a separate issue.

A useful matrix is: `Context | Responsibilities | API/worker surfaces | Source of truth | Actual writers/readers | Target single writer | Transaction boundary | Allowed contracts | Forbidden dependencies | Runtime/scaling signal | Tests | Gap`. See [`references/bounded-context-atlas-monorepo.md`](references/bounded-context-atlas-monorepo.md) for a worked evidence sequence and compact reporting shape.

### Cross-runtime duplicate authority and consolidation

When two language runtimes or deployables appear to contain overlapping modules, do not equate file-name duplication with domain duplication. Classify each overlap first:

- **Domain duplication:** both sides own the same invariant, transition, policy decision, repository, or table write. Consolidate this.
- **Adapter duplication:** per-runtime auth verification, telemetry, serialization, generated DTO/client. Usually expected; verify contract parity instead of centralizing it.
- **Projection duplication:** read models, search indexes, caches, exports. Allow only when rebuildable and denied authoritative write access.
- **Process co-location:** HTTP API, queue consumer, scheduler, and reconciliation share an entrypoint. Split lifecycle only after domain ownership is clear.

Audit SQL literals, query builders, repositories, route/controller surfaces, schedulers, and database roles across both runtimes. For each aggregate, build a writer matrix containing create/update/delete paths, transition ownership, transaction scope, unique/CAS enforcement, queue/outbox coupling, and current DB credential capability. A component that owns migrations is not automatically the only runtime writer.

The target is **one bounded context → one canonical source package → one transaction/schema owner → one versioned write contract**. Language is an implementation choice, not an ownership boundary. The non-owner runtime keeps generated clients and allowed adapters, not a handwritten repository or policy service.

Use this migration order:

1. Characterize existing behavior and state transitions.
2. Declare the canonical package, table/migration owner, writer deployable, and database role.
3. Freeze new duplicate SQL/repositories with architecture tests.
4. Introduce an idempotent owner operation with stable identity, payload fingerprint, expected revision, and receipt.
5. Cut over one writer cohort at a time; shadow reads/results if useful, but do not use permanent dual writers.
6. Revoke the old runtime's write permission before deleting code.
7. Delete duplicate routes/services/repositories and promote the allowlist/denylist to a permanent CI gate.
8. Only then split API, consumer, scheduler, and Job deployables.

A process split is incomplete if duplicate repositories remain behind different network endpoints. Rollback must track the active writer, schema compatibility, database grants, queue generation, and in-flight drain; route rollback alone is unsafe after permission revocation. Prefer the first migration slice with a clear invariant and measurable duplicate-effect risk, such as a financial ledger or user-visible run state.

See [`references/cross-runtime-domain-consolidation.md`](references/cross-runtime-domain-consolidation.md) for the worked overlap matrix, owner-selection template, cutover sequence, and architecture-test gates.

## Multi-document architecture corpus assembly

When an architecture request spans several concerns, stop treating one monolithic draft or published artifact as working memory. Establish a local source-of-truth repository with active concern briefs, a current-state evidence lane, ADRs, an open-question registry, generated hash inventory, and a provenance-only archive. Parallel researchers should write non-overlapping concern files; the parent verifies official sources and performs synthesis only after those files are stable.

Before publication, require traceable requirement IDs, exact current/target/reference separation, resolving links, unique ADR/question IDs, secret scans, deprecated-name scans, and exact active-file hashes. Archive contradictory old target documents rather than leaving them active, then commit a clean local baseline. Assemble and publish the canonical reader-facing artifact only after review. Follow [`references/architecture-corpus-assembly.md`](references/architecture-corpus-assembly.md) for the reusable directory shape, workflow, gates, and pitfalls.

## Prompt/cache/token audit checklist

When the repository involves LLM prompts or token/cost behavior, inspect:

- Prompt topology/envelope types and message assembly order.
- Stable system prefix versus per-turn language, temporal context, personalization, references, attachments, tool guidance, and editor/document context.
- Cache-key derivation, canonicalization, model scoping, conversation affinity, disabled-cache behavior, and provider transport mapping.
- Provider-specific cache semantics: explicit breakpoints, TTLs, cached resources, sticky sessions, cache-control blocks, and whether volatile content is marked.
- Continuation construction, restored-history merging, native payload replay, provider/model mismatch pruning, and append-only mismatch stopping.
- Context-window profiles, preflight input-token counting, truncation heuristics, output reserves, reasoning/thinking tokens, cache read/write tokens, and pricing formulas.
- Tests that prove stable-prefix equality, dynamic placement, cache key/marker behavior, exact token limits, cost-bucket accounting, persistence, and replay safety.

## Git evidence

Use targeted history commands:

```bash
git log --follow --format='%h %s' -- path/to/file
git log -8 --oneline -- path/to/file
git blame -L start,end -- path/to/file
```

Report SHAs exactly as returned. A commit subject is provenance, not proof that the current code still behaves identically; pair it with current source and tests.

## Verification and failure handling

- Keep source inspection and runtime verification separate.
- If a focused test run is blocked by an environment dependency, preserve the exact blocker in the final report.
- Do not capture transient setup failures as permanent tool limitations. The durable lesson is to report the blocker and, when appropriate, identify the setup command needed by the repository.

## Repository-grounded vendor architecture briefs

When current repository evidence must be combined with external product research, establish three evidence lanes before drafting: **Current implementation**, **Target design**, and **Product examples**. Do not let vendor terminology collapse these lanes or define the bounded context.

1. Decompose ambiguous labels such as “database-like memory” into workload roles: hot cache, authoritative relational/event store, document snapshot store, semantic index, integrated SQL/vector/graph backend, managed extraction service, and application-embedded personalization.
2. For each state class, record source of truth, read/write path, retention, ACL/tenant isolation, indexing/compaction, deletion/export, freshness, provenance, and evaluation. Mark proposed defaults as target policy rather than product facts.
3. State whether each product is authoritative, derived/rebuildable, or an optional processor. In particular, vector indexes and provider prompt caches are not sources of truth.
4. Preserve domain authority: durable workflow checkpoints are not working memory; conversation event history is not an episodic summary; immutable Skill versions are not model-inferred procedures; explicit profile values outrank inferred preferences.
5. Put vendor SDKs behind owned ports. A thin durable orchestrator should call only versioned, idempotent API/gRPC operations with operation IDs and receipts; enforce the absence of database/vector/provider SDKs with architecture tests.
6. Treat conflicting vendor documentation as an explicit open question. Do not silently pick a value for retention, deletion, isolation, or SLA when official pages disagree.
7. Verify the artifact mechanically: repository paths exist, branch/HEAD and dirty state are disclosed, official URLs resolve, required sections are present, code fences are balanced, and no credential/example secret leaked.

Use the worked method and Tencent Cloud role/caveat bank in [`references/memory-hierarchy-vendor-architecture-brief.md`](references/memory-hierarchy-vendor-architecture-brief.md). Re-check live product documentation before reuse.

## Managed database and product-owned state evaluation

When one managed database is proposed for memory, agent runs, workflow checkpoints, broker history, vectors, or CRDT state, split the question by **authority owner and native backend contract** before comparing products.

1. Build a state-plane matrix: application-owned authoritative records, derived indexes, engine-owned checkpoints/queues, bounded realtime history/presence, CRDT authority, and large-object storage.
2. Distinguish “the application can implement an adapter” from “the dependent product officially supports this backend.” A PostgreSQL dialect, wire proxy, or Redis-compatible label is not backend proof.
3. For workflow engines and brokers, verify exact upstream requirements such as server version, `LISTEN/NOTIFY`, procedures/functions, extensions, advisory locks, partition DDL, session pooling, drivers, migrations, and failover semantics.
4. Keep user-visible run state separate from workflow-engine checkpoints. Link them by stable IDs and idempotent operation receipts rather than shared tables or distributed transactions.
5. Keep explicit outbox events separate from raw CDC records; CDC may deliver committed outbox rows but should not define the public domain event contract.
6. Treat vector indexes, graph projections, summaries, and broker history as rebuildable/bounded. They are not the policy-bearing source of truth.
7. Record a vendor choice as **Proposed** until it passes a simpler baseline on workload skew, latency, abort/retry behavior, retrieval quality, multi-region requirements, cost, and stressed-exit complexity.
8. When updating an architecture corpus, add a focused brief, Proposed ADR, requirement IDs, source-of-truth matrix split, unique open questions, cross-links, citation verification, regenerated hashes, and a clean local commit before publication.

See [`references/managed-database-product-state-boundaries.md`](references/managed-database-product-state-boundaries.md) for the compatibility checklist, state matrix, operation/outbox pattern, evaluation gates, and a Cloud Spanner/DBOS/Centrifugo worked pattern.

## External research and publication handoff

When repository inspection feeds a cited research artifact, keep repository evidence and public reaction evidence separate. Register immutable blob URLs (prefer the inspected commit SHA over a moving branch URL) in the citation ledger before drafting. Map each structural claim to the smallest source file that proves it: core persistence implementation, DDL, schema definition, backend adapter, or issue/discussion. Report repository snapshot metadata (branch, HEAD, stars/forks/issues) with an explicit as-of date, because these values are volatile.

When parallel researchers are involved, children may return candidate URLs and quoted evidence, but the parent/orchestrator owns the canonical citation ledger. Never let a child reset or renumber a ledger already used by the draft; if that happens, restore the original URL order, regenerate the Sources block, and rerun citation verification.

## Support references

- Cross-runtime domain consolidation (duplicate-authority classification, writer matrix, owner cutover, DB-role and architecture-test gates): [`references/cross-runtime-domain-consolidation.md`](references/cross-runtime-domain-consolidation.md)
- Managed database/product-owned state evaluation (authority matrix, backend compatibility proof, outbox/CDC, PoC gates): [`references/managed-database-product-state-boundaries.md`](references/managed-database-product-state-boundaries.md)
- Realtime collaboration/messaging architecture briefs (federation, durable streams, fan-out, CRDT APIs, reconnect, blue-green): [`references/realtime-collaboration-architecture-brief.md`](references/realtime-collaboration-architecture-brief.md)
- Session-specific prompt/cache audit evidence: [`references/prompt-cache-audit-2026-08.md`](references/prompt-cache-audit-2026-08.md)

## Pitfalls

1. A metrics-only scan is insufficient for an architecture question; trace symbols and tests.
2. Do not stop at the first matching file; inspect both orchestration and provider boundaries.
3. Do not confuse dynamic system text with a stable cached system prompt; verify the final wire message order.
4. Do not infer cache savings from a source comment; label it as an implementation claim unless measured.
5. Do not report test success after pytest collection errors.
6. Do not omit Git SHAs when the user requested provenance.
7. Keep the output evidence-first and targeted; avoid a long flat inventory of incidental matches.
