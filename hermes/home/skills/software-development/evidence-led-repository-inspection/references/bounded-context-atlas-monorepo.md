# Bounded-Context Atlas for a Multi-Runtime Monorepo

This reference records a reusable evidence pattern from a read-only architecture audit of a TypeScript edge API, Python AI worker, and Next.js web application sharing PostgreSQL and Redis.

## High-value evidence sequence

1. Capture branch, HEAD, dirty state, top-level manifests, and deploy definitions before reading feature code.
2. Count and enumerate mounted HTTP routes, worker controllers, repositories, migrations, DI containers, web feature roots, stream consumers, and schedulers. Counts establish scope; mounted symbols establish what is actually executable.
3. Read runtime entrypoints and deployment manifests together. In the audited shape, one Python service started FastAPI, several Redis consumers, billing reconciliation, email/CRM jobs, and search indexing; this proved operational co-location rather than domain cohesion.
4. Read DI factories as a dependency graph. Solver depended on files, visual generation, personalization, credits, and history projection; chat directly injected solver, visual, document, canvas, and deep-explain repositories/use cases. These edges were stronger evidence than directory names.
5. Compare migration ownership with repository writers. All SQL migrations lived in one component while both TypeScript and Python repositories wrote the same tables. Therefore schema source of truth and data-write ownership were different facts.
6. Trace transactions across infrastructure boundaries. A task inserted in PostgreSQL and then enqueued to Redis was not atomic; another task flow added an explicit `markFailed` compensation. This justified a transactional-outbox proposal without claiming one already existed.
7. Inspect the browser client for physical server names and endpoint resolution. Direct browser calls to both the edge API and Python worker exposed deploy topology, auth refresh, SSE, and error contracts to the UI.
8. Map each concern as: responsibility, API/consumer surface, source-of-truth data, writers/readers, transaction boundary, dependencies, current coupling, target package, and justified deployable.
9. Audit every “exactly once” or idempotency claim down to executable enforcement. Check unique/partial indexes, lookup predicates (including tenant/user scope), row locks, compare-and-set transitions, and concurrent callers. A user-row lock can serialize one user's operations while still permitting cross-user key collisions; lookup-before-insert without a matching unique constraint is not exactly once.
10. Treat queue durability as a per-stream matrix rather than a transport-wide property: consumer-group creation offset, ACK timing, exception ACK behavior, XAUTOCLAIM opt-in, max delivery count, handler idempotency, DLQ, and compensation/refund. One Redis Stream consumer can contain both at-least-once and effectively at-most-once lanes.
11. Prove realtime/collaboration from instantiated code, not dependency metadata. Lockfile-only Yjs/Tiptap collaboration entries, cursor-like UI decorations, or Redis SSE streams do not establish CRDT persistence, awareness, WebSocket transport, or Centrifugo integration.
12. For Cloud Run split decisions, classify each resident loop by trigger and scaling signal: request-driven HTTP/SSE → Service; continuously polling consumers → Worker Pool; periodic reconciliation → Job or OIDC-protected scheduled endpoint. If one image starts all three, document the current coupling and migration invariant before proposing the split.

## Durable interpretation rules

- Top-level directories are deploy/code organization evidence, not bounded-context evidence.
- UI feature roots are user-experience slices and consumers, not automatic database owners.
- Redis stream names often reveal independently scalable workload lanes, but a stream alone does not prove a separate bounded context.
- A shared renderer/artifact pipeline can justify keeping several user-facing visual features in one context even when their routes differ.
- Payment processing and entitlement/quota policy can be separate contexts while remaining co-deployed until their shared transaction invariant is replaced by outbox/event coordination.
- Search tables fed by several source domains are projections; their source domains remain authoritative.
- Package separation should precede deployable separation. Split deployables only for independent scaling, SLO, security, or failure isolation.
- Mark every statement as current fact, inference, or target proposal. Never present proposed ownership, event names, or gateways as existing code.

## Minimal final-report shape

1. Snapshot and executable surfaces.
2. Current concern atlas.
3. Source-of-truth and multi-writer matrix.
4. Cross-context dependency and transaction findings.
5. Target package boundaries.
6. Target deployables with keep/split rationale.
7. Migration sequence: package boundaries → ownership/outbox → deploy split.
8. Verification: final Git state, tests run/not run, files changed.

## Security hygiene

Deployment files are useful architecture evidence but may contain credentials. Never quote values into notes or final reports. Cite only safe line ranges when possible, redact any unavoidable values, and report rotation plus migration to a secret store separately from the architecture findings.
