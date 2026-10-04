# Memory hierarchy and vendor-option architecture briefs

Use this reference when a repository audit must become a cited target architecture for an agent-memory system. It captures the reusable method and Tencent Cloud product-role distinctions verified on 2026-08-10; re-check live documentation before reusing volatile product details.

## Evidence lanes

Keep three visibly separate lanes throughout the artifact:

1. **Current implementation evidence** — exact repository root, branch/HEAD, dirty-state warning, executable paths, schemas, adapters, tests, fallback and failure semantics.
2. **Target design** — proposed ownership, ports, data model, SLOs, retention defaults, migration, tests, and open ADRs. Label these as proposals rather than current facts or vendor guarantees.
3. **Product examples** — capabilities confirmed by official vendor documentation, mapped to target roles without letting product names define the domain model.

Never blend a current snapshot/cache implementation into an authoritative event-history claim. A passing current test proves current behavior, not that the behavior is safe for the target.

## Disambiguating “database-like memory”

Before recommending a product, split the phrase into roles:

- hot working/cache tier;
- relational event/record source of truth;
- flexible document snapshot store;
- semantic/vector retrieval projection;
- unified SQL + vector + graph implementation;
- managed memory extraction/recall service;
- application-embedded personalization feature.

For each candidate, state explicitly whether it may be authoritative, derived/rebuildable, or only an optional processor. A vector index and a provider prompt-cache handle should not be authoritative.

## Required per-memory contract

For working/run, conversation/event, episodic, semantic, procedural/Skill, profile/preferences, and provider prompt-cache state, record:

- source of truth and ownership collision rules;
- read/write path and idempotency/revision semantics;
- retention and freshness;
- tenant, workspace, user, agent, branch, and purpose-based ACL;
- indexing, compaction, and rebuild strategy;
- correction, deletion, export, backup-expiry behavior;
- provenance and model/prompt/index generation;
- quality, security, latency, and cost evaluation.

Important authority boundaries:

- run/DBOS checkpoint owns execution progress; working memory owns prompt context only;
- Conversation domain event log owns history; summaries and snapshots are projections;
- Skill Catalog immutable version owns procedures; memory stores search projections and usage observations;
- explicit profile values outrank inferred preferences;
- provider cache objects are expiring optimizations and must fail as normal cache misses.

## Contract-first service boundary

Use a GPAI-owned Memory Service with generated, versioned API/gRPC contracts. Thin durable orchestrators may call only idempotent remote operations carrying an operation ID, expected revision, and receipt. Forbid Redis, SQL, vector, embedding, managed-memory, and provider SDKs in the orchestrator via import-graph and image/SBOM tests.

The recommended projection flow is:

```text
authoritative transaction + outbox
  -> idempotent capture
  -> candidate extraction and policy gate
  -> active versioned memory + provenance
  -> Redis/vector projections
  -> lag/reconciliation/backfill metrics
```

A deletion tombstone must outrank stale projection upserts. Restore drills must replay the deletion ledger before traffic resumes.

## Tencent Cloud role map (as-of 2026-08-10)

- **Tencent Cloud Distributed Cache (Redis OSS-Compatible):** hot working state, recent snapshots, leases, and caches; not the sole durable truth.
- **TencentDB for PostgreSQL:** relational/JSONB authority, outbox, RLS, and optionally pgvector/graph for an integrated first phase.
- **TencentDB for MySQL:** relational authority when MySQL is the operational standard; pair with a separate semantic index.
- **TencentDB for MongoDB:** flexible document snapshots/tool/provider envelopes; application must still enforce event and tenant invariants.
- **Tencent Cloud VectorDB:** large-scale dense/sparse hybrid retrieval with scalar filters; derived projection linked to authoritative memory ID/revision/source hash.
- **TencentDB Agent Memory:** managed raw-conversation to atomic/scenario/core extraction and recall; place behind an adapter and evaluate as a processor before granting authority.
- **Tencent Cloud ADP `SYS.Memory`:** application-scoped user personalization, not a general cross-product Memory Service.

Official starting points:

- Distributed Cache overview: https://www.tencentcloud.com/document/product/239/3205
- PostgreSQL Agent Long-Term Memory: https://www.tencentcloud.com/document/product/409/80363
- PostgreSQL AI capabilities: https://www.tencentcloud.com/document/product/409/80347
- VectorDB overview/architecture: https://cloud.tencent.com/document/product/1709/94945 and https://cloud.tencent.com/document/product/1709/95010
- VectorDB sparse/hybrid retrieval: https://cloud.tencent.com/document/product/1709/110110
- TencentDB Agent Memory introduction/API: https://cloud.tencent.com/document/product/1813/132100 and https://cloud.tencent.com/document/product/1813/132001
- Self-developed Agent integration: https://cloud.tencent.com/document/product/1813/132103
- ADP long-term memory: https://www.tencentcloud.com/document/product/1254/73194

## Verified caveats worth re-checking

- TencentDB Agent Memory documentation says `agent_id` is the extraction/organization grain, while `team_id` and `user_id` are required auxiliary tags. Do not equate this automatically with an application's tenant/user authorization contract; test cross-user contamination and choose instance/namespace boundaries deliberately.
- Managed message/atomic deletion APIs do not by themselves prove cascade deletion from raw conversation through scenario/core memory and backups. Obtain contractual confirmation and run end-to-end delete probes.
- The Agent Memory instance-delete documentation observed on 2026-08-10 conflicted internally on recycle-bin retention (7 versus 15 days). Surface documentation conflicts as open compliance questions; never silently choose one value.
- VectorDB backup documentation described backup-set-based whole-instance cloning with limited retention, so retain a logical rebuild path from the authoritative source.

## Verification checklist

- Confirm every cited repository path exists in the inspected checkout.
- Confirm branch/HEAD and disclose dirty-state limitations.
- Check all official URLs and prefer extracted page bodies over search snippets for load-bearing claims.
- Scan the artifact for credentials and copied example secrets.
- Check required memory classes and operational dimensions mechanically.
- Balance code fences and parse/inspect the generated Markdown.
- Report source-document conflicts instead of harmonizing them.
