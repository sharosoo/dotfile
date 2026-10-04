# Cross-Runtime Domain Consolidation

Use this reference when a monorepo has two language runtimes or deployables that appear to implement the same product concerns. The goal is not “merge all code into one process.” The goal is to remove duplicate domain authority, then choose process boundaries independently.

## Problem signature

Common warning signs:

- both runtimes have similarly purposed routes/controllers and repositories;
- one runtime creates an aggregate while another updates its status/result;
- both execute SQL against the same tables;
- schema migrations live in one directory but runtime writes happen elsewhere;
- policy config is parsed independently in two languages;
- public clients know both physical upstream names;
- an API process also starts consumers, schedulers, reconciliation loops, and indexers.

Do not conclude overlap from top-level directory names alone. Trace executable writes and decisions.

## Four-way classification

| Class | Diagnostic question | Examples | Action |
|---|---|---|---|
| Domain duplication | Do both sides decide the same invariant or mutate the same aggregate? | credit reserve/settle, session/message writes, task lifecycle | choose one canonical owner and delete the other implementation |
| Adapter duplication | Is the code local transport/platform glue around one shared contract? | JWT verification, OTel, generated clients | keep per runtime; test conformance |
| Projection duplication | Is the state derived and rebuildable? | search index, cache, export read model | allow read/projection ownership; deny authority writes |
| Process co-location | Are unrelated lifecycle types started by one entrypoint? | HTTP + consumers + cron + reconciliation | split after owner consolidation |

## Evidence sequence

1. Pin branch, HEAD, and dirty state. Keep source inspection read-only unless edits were requested.
2. Inventory route mounts, controllers, repositories, SQL/query builders, migrations, DI roots, runtime entrypoints, consumers, and schedulers in each runtime.
3. Search authoritative table names for `INSERT`, `UPDATE`, `DELETE`, ORM mutations, and stored-procedure calls across all languages.
4. Trace each aggregate's create, transition, terminal result, cancellation, retry, and deletion paths.
5. Inspect database enforcement: uniqueness, compare-and-set predicates, transaction scope, locks, and actual DB roles.
6. Trace queue/outbox behavior. Record whether persistence and enqueue are atomic and whether redelivery has a durable receipt.
7. Separate provider/workload computation from domain-state ownership.
8. Validate every evidence path against the pinned repository snapshot.

## Writer matrix template

| Aggregate/table | Runtime A create/update/delete | Runtime B create/update/delete | Current invariant owner | DB enforcement | Target owner | Non-owner contract | Removal gate |
|---|---|---|---|---|---|---|---|
| financial ledger | reserve/debit | settle/release | split | unique/CAS status | Commerce | `Reserve/Settle/Release` | old role cannot write |
| conversation | session CRUD | model/message/artifact append | split | expected sequence | Conversation | append/query API | duplicate repository deleted |
| workload task/run | admission/create | create/status/result | split | expected revision | Agent Run | transition operation | worker SQL removed |

Record actual symbols and path:line evidence in each cell. “Migration owner” and “runtime writer” are separate columns if they differ.

## Worked overlap patterns

### Financial ledger

A frequent pattern is an edge/API runtime reserving quota while a model worker settles actual usage. This creates a two-writer aggregate even if each side owns a different phase.

Target:

```text
caller → Billing API ReserveUsage
worker → Billing API SettleUsage
failure → Billing API ReleaseUsage
```

Each command carries stable usage/reservation identity, tenant/principal, payload fingerprint, policy version, and returns a durable receipt. Workload code has no ledger-table credential.

### Conversation/session persistence

Another pattern is an API runtime owning session CRUD while the execution runtime writes generated messages, tool records, and artifacts into the same session tables.

Target:

```text
client/edge → Conversation API AppendMessage(expected_sequence)
model runtime → Generate operation
model runtime → Conversation API AppendAgentResult(operation_id, refs)
```

The model runtime owns generation, not conversation ordering or persistence.

### Task/run lifecycle

A misleading architecture description may claim “API creates tasks; worker only computes,” while source inspection reveals that onboarding, retry, or specialized workload repositories also insert tasks and directly update status/results.

Target:

```text
CreateRun
StartRun
ReportDurableMilestone
CompleteRun
FailRun
RequestCancel
AcknowledgeCancel
```

High-frequency transient progress belongs in a stream/publication path; durable lifecycle transitions belong to Agent Run authority.

### Split billing policy

Shared config files do not establish single ownership. If one runtime interprets eligibility/trial/quota and another owns checkout, provider webhooks, subscriptions, and reconciliation, policy semantics can drift.

Target ownership includes the policy schema/version/digest, provider mapping, entitlement decision, and ledger operations. Other contexts consume immutable decisions or receipts.

### Expected auth duplication

Token issuance/session rotation must have one Identity owner, but each service may validate a standard token locally. Treat verifier duplication as adapter duplication when issuer/audience/tenant semantics and conformance fixtures are shared.

## Owner-selection template

For each context, decide:

- canonical source package;
- implementation language for the first cutover;
- schema and migration owner;
- writer API/deployable;
- database role and table allowlist;
- public/generated contract;
- team/on-call owner;
- rollback writer grant;
- old package deletion criteria.

Prefer preserving the richer existing behavior over a big-bang cross-language rewrite. Language can change later after the writer cutover is stable.

## Consolidation-before-split sequence

### 1. Characterize

Lock current transitions, errors, retry behavior, authorization, and idempotency in characterization tests.

### 2. Declare owner

Publish the aggregate owner, canonical package, migration owner, operation contract, and DB role. Mark target proposals separately from current facts.

### 3. Freeze duplication

Add architecture rules that reject new raw SQL, repository imports, and policy services for non-owner contexts.

### 4. Add owner operation

A durable operation should include:

```text
operation_id
idempotency_key
payload_fingerprint
expected_revision
principal / tenant
contract_version
deadline
payload or payload_ref
```

Same identity/same fingerprint returns the prior receipt; same identity/different fingerprint conflicts.

### 5. Cut over one writer

Move new writes by cohort or feature flag. Shadow reads and result comparison are useful; concurrent authoritative dual writes are not.

### 6. Revoke permission

Remove table write grants from the old runtime and workers. Code convention alone is not a single-writer guarantee.

### 7. Delete duplicate implementation

Remove old routes, services, repositories, SQL, and physical-deployment clients. Keep the architecture allowlist as a permanent CI gate.

### 8. Split process types

Only now separate request API, queue consumer/Worker Pool, scheduler/Job, projection worker, and reconciliation process according to scaling and failure needs.

## Architecture-test gates

### Static writer inventory

Maintain `table → allowed writer deployables` and `context → canonical package` registries. Scan SQL literals, ORM mutation sites, query builders, and repository declarations.

### Import denylist

Reject:

- worker → Billing/Conversation/AgentRun repository;
- orchestrator → any domain repository;
- context A → context B concrete service/repository;
- browser → physical worker endpoint;
- non-owner language tree → handwritten duplicate policy service.

### Runtime permission test

Integration tests should prove forbidden table writes fail under each production-like DB role. This catches bypasses static scans miss.

### Contract conformance

Run identical fixtures against generated clients in each language: enums, versions, idempotency conflicts, principal/tenant propagation, deadlines, cancellation, and error mapping.

### State-machine concurrency

Test invalid transitions, expected revision, concurrent command convergence, duplicate queue delivery, workflow replay, and terminal-effect deduplication.

## Rollout and rollback

Safe order:

```text
expand schema
→ deploy owner API read-compatible
→ route a command cohort
→ compare projections/receipts
→ move all new writes
→ revoke old writer permission
→ drain old in-flight work
→ delete old code
→ contract schema
```

Rollback metadata must include active writer release, schema compatibility, DB grants, queue generation, client contract, and drain state. Route rollback alone is insufficient after write permission has moved. Never reactivate two writers as an emergency shortcut.

## Architecture-corpus integration

When the audit feeds a maintained architecture repository, update all of these together:

- current-state evidence and exact source paths;
- focused consolidation plan;
- Accepted ADR for owner-before-process-split;
- target macroservice and project structure;
- migration phase/exit gates;
- requirement IDs and open questions;
- generated file/hash inventory and verification report.

Verify local links, headings, unique IDs, ADR registry parity, secret patterns, deprecated names, and every pinned source path before committing. Do not publish an external artifact before review.

## Pitfalls

- Treating top-level deployables as domains.
- Treating shared config or shared DB as shared ownership contract.
- Moving duplicate repositories behind network APIs without deleting one.
- Splitting process types before eliminating multi-writer state.
- Calling auth verification or generated clients “domain duplication.”
- Assuming migration ownership implies runtime write ownership.
- Relying on lookup-before-insert for exactly-once without uniqueness/CAS.
- Using permanent dual writes and hoping reconciliation reconstructs intent.
- Revoking DB access without recording rollback grant state.
- Rewriting everything into one language before preserving current behavior.
