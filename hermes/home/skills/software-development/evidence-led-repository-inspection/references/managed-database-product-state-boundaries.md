# Managed Database and Product-Owned State Boundaries

Use this reference when evaluating one managed database across memory, agent runs, workflow engines, realtime brokers, search indexes, caches, and collaboration state.

## Core rule

Do not ask only “Can this product store the data?” Ask two separate questions:

1. **Can the application choose it for an application-owned domain store?**
2. **Does each embedded/third-party product officially support it as that product's system backend?**

A database can be excellent for application-owned run or memory state while being unsupported for a workflow engine's checkpoints or a broker's history tables.

## Start with a state-plane matrix

| Plane | Authority owner | Lifecycle | Transaction model | Native backend requirement | Derived/rebuildable? |
|---|---|---|---|---|---|
| Memory record/provenance | Memory service | policy, retention, deletion | application transaction | application adapter | No |
| Embedding/vector index | Retrieval adapter | re-indexable | projection | vector/search capability | Yes |
| User-visible agent run | Agent-run service | admission to terminal state | aggregate transaction | application adapter | No |
| Workflow checkpoint/queue | Workflow engine | replay/retention/versioning | engine-defined | upstream-supported DB | No, but engine-owned |
| Domain outbox | Domain owner | publish/receipt retention | same transaction as aggregate | application adapter | No until delivered |
| Realtime history/presence | Broker | short TTL/reconnect | broker-defined | upstream-supported broker | Yes/bounded |
| CRDT update authority | Collaboration service | journal/compaction | CRDT-specific | update/object store | No |
| Large payload | Owning service | object retention | pointer/digest in DB | object store | No |

Keep logical ownership separate even when several planes share one physical instance.

## Backend compatibility proof

Never infer product support from a compatibility label such as “PostgreSQL dialect,” “wire-compatible,” or “Redis-compatible.” Verify the exact product path against upstream documentation and, when necessary, a focused integration test.

Check whether the dependent product requires:

- a minimum server version;
- `LISTEN/NOTIFY` or equivalent session semantics;
- user-defined functions, procedures, triggers, or extensions;
- advisory locks or row-lock behavior;
- partition creation/drop and background cleanup;
- sequences, generated columns, transaction isolation, or system catalogs;
- session-mode rather than transaction-mode pooling;
- specific drivers or DSN behavior;
- engine-managed migrations, tables, schemas, and privileges;
- failover behavior the compatibility layer does not emulate.

A syntax subset plus a proxy is not proof that an engine using these features is supported. If upstream does not name the backend or guarantee the required semantics, classify it as **unsupported/unproven**, not “probably compatible.”

## Application domain state versus workflow state

Agent applications commonly need two stores with related IDs but different owners:

```text
Application-owned AgentRun
  run identity
  user-visible status
  policy/provenance
  signals/cancellation request
  operation references and receipts
  artifact/memory/conversation references
  terminal result/error summary

Workflow-engine-owned state
  workflow input/output
  step checkpoints
  durable queue/schedule state
  replay/recovery metadata
```

Link them with `run_id`, `workflow_id`, and `operation_id`; do not share table ownership.

A safe operation flow is:

```text
workflow step
  → versioned operation API
  → domain transaction:
      compare expected aggregate version
      apply transition
      persist stable operation receipt
      append explicit outbox event
  ← receipt
  → workflow engine checkpoints receipt
```

Replay reuses the same operation identity and request fingerprint. Only `attempt` changes.

Do not introduce a distributed transaction between the workflow system database and the domain database. Use idempotent operations and persisted receipts.

## Outbox, CDC, and realtime delivery

A database change stream or CDC feed is a delivery substrate, not automatically a domain event contract.

Prefer:

```text
business transaction
  aggregate mutation
  + explicit versioned OutboxEvent

CDC / claim poller
  detects committed outbox row
  → stream publication API
  → broker/realtime adapter
```

The explicit outbox supplies event type, schema version, aggregate sequence, correlation/causation, principal/policy snapshot, destination, and redaction rules. Consumers deduplicate by event/operation ID.

Broker history and presence remain bounded caches. A reconnect miss must fall back to the authoritative conversation/run API.

## Memory-specific rules

- Policy-bearing memory records and provenance are authoritative.
- Embeddings, graph edges, summaries, and caches are rebuildable projections.
- Explicit user values outrank inferred values.
- A unified SQL/vector database may reduce projection lag, but the domain port must remain vendor-neutral.
- Managed extraction services are optional processors, never the policy owner.
- Asynchronous database TTL is physical cleanup, not immediate privacy deletion. Mark a logical tombstone first, exclude it from every read/search path, then track physical deletion and backup retention.

## Distributed schema checks

For high-write event tables, inspect key distribution before recommending a distributed database.

- Avoid a global timestamp or global monotonic sequence as the leading key.
- Prefer random IDs or a tenant/hash bucket before aggregate IDs.
- Use aggregate-local ordering such as `(tenant_bucket, tenant_id, run_id, sequence)`.
- Allocate sequence and append the event in one aggregate transaction.
- Benchmark one-hot-tenant and one-hot-run patterns, not only uniform load.

## Decision status and evaluation gate

A user's interest in a product is not an Accepted architecture decision. Record it as **Proposed** until the following are measured:

- steady and peak admission/action rate;
- events/steps and payload sizes per aggregate;
- tenant skew and hot-key contention;
- point/range/vector query mix;
- vector dimension, recall, filter selectivity, and latency;
- regional versus multi-region SLO/RPO/RTO;
- abort/retry amplification;
- compute, storage, replication, CDC, and egress cost;
- operational ownership and migration/stressed-exit cost.

Always compare against a simpler baseline, usually managed PostgreSQL plus a replaceable vector adapter. A globally distributed database is justified by measured scale, availability, consistency, or simplification—not by future possibility alone.

## Architecture-corpus integration

When the investigation belongs to an existing architecture corpus:

1. Create one focused evaluation brief.
2. Add a **Proposed** ADR, not an Accepted ADR.
3. Add requirement IDs for each affected plane.
4. Split the source-of-truth matrix where one row had collapsed domain and engine state.
5. Add product-specific open questions with unique IDs.
6. Cross-link the existing memory, durable-run, and realtime briefs.
7. Keep a task-local citation ledger and verify it strictly.
8. Regenerate active-document hashes and rerun link/H1/fence/duplicate/secret/ADR checks.
9. Commit the clean local source-of-truth; do not publish until review.

## Worked pattern: Cloud Spanner, DBOS, and Centrifugo

This is an illustrative pattern; re-check live official documentation before reuse.

```text
Cloud Spanner candidate
  application-owned conversation
  user-visible agent run
  memory records/provenance
  operation receipts
  transactional outbox

Upstream-supported PostgreSQL
  DBOS system database/checkpoints/queues

Redis or upstream-supported PostgreSQL
  Centrifugo broker/history/presence
```

Why the separation matters:

- Cloud Spanner's PostgreSQL interface exposes a PostgreSQL subset and proxy/client compatibility, not every PostgreSQL server feature.
- DBOS production operation depends on PostgreSQL system tables and semantics such as `LISTEN/NOTIFY`.
- Centrifugo's PostgreSQL broker may depend on PostgreSQL-version-specific functions, partitions, notifications, and cleanup.
- Centrifugo history is bounded and non-authoritative even when persisted.

Useful live source families to re-check:

- Cloud Spanner PostgreSQL interface, schema design, vector search, change streams, TTL
- DBOS architecture and production checklist
- Centrifugo engines and history/recovery

## Pitfalls

- “One common database” silently becoming shared-table ownership.
- Treating an application adapter decision as official engine backend support.
- Equating workflow checkpoints with user-visible run state.
- Treating vector indexes or broker history as source of truth.
- Publishing raw CDC as a public event contract.
- Using TTL eligibility as proof of immediate deletion.
- Selecting a global distributed store without a workload and cost baseline.
- Marking the ADR Accepted because the product is technically capable.
