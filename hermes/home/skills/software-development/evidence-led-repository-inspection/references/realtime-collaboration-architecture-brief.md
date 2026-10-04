# Realtime collaboration architecture brief pattern

Use this reference when a repository-grounded architecture document combines federated chat, durable domain events, stream relays, live WebSocket fan-out, and CRDT documents. It records the reusable boundary and contract checks; re-check all product behavior against current official documentation.

## 1. Start with three evidence lanes

Keep these visibly separate throughout the document:

1. **Current implementation:** exact repository path, line range, symbol, test, and deployment evidence.
2. **Target design:** proposed owners, ports, contracts, state machines, SLOs, migration, and forbidden dependencies.
3. **Product facts:** official specification or vendor documentation with an as-of date and inline citation.

A dependency in a lockfile is not evidence of an active realtime/CRDT integration. To support a negative finding, search source, manifests, schemas, tests, and deployment/configuration vocabulary before saying an integration is absent.

## 2. Build an authority matrix before drawing the flow

Record `plane | single owner | authoritative identity/sequence | retention | not authoritative for`.

Typical split:

- federated conversation transport owns room/event and federation semantics;
- application conversation/run stores own durable coordination and replay sequence;
- stream service owns publication operation receipts, not domain facts;
- Redis Streams owns bounded relay and consumer work state, not the business journal;
- Redis Pub/Sub owns loss-tolerant live propagation only;
- a realtime gateway owns active connections, presence, and bounded recovery offsets;
- the CRDT service owns document updates, state vectors, journal, and snapshots;
- object storage owns immutable binary blobs under metadata recorded by the CRDT owner;
- Awareness/presence owns ephemeral cursor/typing hints and must not enter the durable content journal.

Never collapse domain sequence, broker entry ID, live gateway epoch/offset, receipt cursor, and CRDT state vector into one “global cursor.”

## 3. Put implementation clients behind external operation APIs

Thin domain APIs and orchestrators should import only generated versioned HTTP/gRPC clients. Add architecture tests forbidding Redis, realtime-gateway, Yjs/pycrdt, and provider SDKs in those callers.

For every external operation define:

- versioned service/method and HTTP mapping;
- `operation_id`, canonical `request_hash`, tenant, producer, principal, trace, correlation, and causation;
- same ID/same hash replay result versus same ID/different hash conflict;
- admission receipt versus side-effect completion receipt;
- terminal and retryable states, receipt version, retention, and timeout ambiguity recovery;
- batch atomicity scope and per-item result;
- ordering key, source sequence, publication sequence, and predecessor semantics;
- opaque resume cursor, cursor expiry behavior, and polling fallback;
- count/byte/in-flight/rate limits and `RESOURCE_EXHAUSTED`/retry-after behavior;
- ACL/audience reference plus immutable policy snapshot for audit;
- payload inline threshold and immutable blob/event references.

### Stream operations

A useful minimum is:

- `PublishBatch`: admission of independently receipted items; a batch is not a distributed transaction.
- `GetReceipt`: resolve an ambiguous timeout and fetch current monotonic receipt state.
- `Watch`: durable producer receipt stream, at-least-once, deduped by `(operation_id, receipt_version)`; it is not the browser’s realtime subscription.

Use a producer domain outbox, stream-service operation inbox, and stream-service dispatch outbox. Durable commit happens before external operation; live delivery happens last. Redis consumer ACK occurs only after the durable receipt transition commits.

### CRDT operations

A useful minimum is:

- `ApplyUpdate`: binary update or immutable blob reference, digest, encoding, actor/principal, policy snapshot, resulting document sequence and state vector;
- `GetSnapshot`: immutable verified snapshot, state vector, digest, and `covered_through_sequence`;
- `GetMissingUpdates`: client state vector, diff or journal mode, count/byte budgets, opaque page cursor, final server state vector, and reset-snapshot fallback.

CRDT update idempotency does not make ACL, audit rows, projection triggers, or publication receipts exactly-once. Deduplicate both operation identity and repeated update digests.

## 4. Journal, snapshot, and object storage

Store metadata transactionally: document head, update journal row, operation receipt, and publication outbox. Store large binary updates/snapshots as immutable objects addressed and verified by digest.

For large payloads:

1. upload to a staging object;
2. verify digest, size, content type, and tenant scope during apply/finalize;
3. commit metadata reference and outbox;
4. garbage-collect unreferenced staging objects after a grace period.

Compaction uses a document lease, latest verified snapshot plus journal tail, immutable candidate upload, read-back/hash/interoperability verification, and a compare-and-set latest pointer. Do not delete journal entries before snapshot verification, backup, offline-client, audit, and legal-retention watermarks all permit it.

## 5. Reconnect and bounded recovery

Realtime history is a short disconnect cache. On successful bounded recovery, still deduplicate by durable event/update identity. On recovery failure, epoch change, slow-client disconnect, or cursor expiry, return to authoritative APIs.

Avoid a load-then-subscribe gap. Prefer:

1. subscribe and buffer live items;
2. read authoritative state/events to a returned watermark;
3. apply durable data;
4. drop buffered duplicates or items at/below the watermark;
5. apply the remainder and enter live mode;
6. restart durable catch-up if a gap or buffer overflow is observed.

For CRDTs, use state-vector diff as the completeness check; document sequence remains useful for audit, pagination, compaction, and policy history but is not the CRDT merge priority.

## 6. Blue-green and connection drain

- Expand schemas and formats before routing traffic.
- Start green and verify dependency/read-back/contract health.
- Stop blue admission while it drains accepted outbox work and leases.
- Reconnect durable `Watch` clients using their receipt cursor; use receipt polling if the cursor expired.
- For long-lived realtime connections, route new connections to green first, drain blue in batches, issue reconnect-capable shutdown, add jitter, and fall back to durable catch-up.
- Share broker history/presence state only when channel semantics and key prefixes are compatible. For breaking channel changes, dual-publish versioned channels with the same durable event IDs, migrate cohorts, then drain the old namespace.
- Pin CRDT encoding/compactor versions per document cohort during mixed-version rollout and prove JavaScript↔Python interoperability before cutover.

## 7. Migration guardrails

- Shadow publication before client cutover; compare missing, duplicate, and lag metrics.
- Introduce live fan-out with durable API fallback before removing SSE/polling.
- Canary federated bridge ingress and deterministic outbound transaction IDs.
- Never run whole-document OCC and CRDT as simultaneous canonical writers. Freeze a document, generate and verify the initial CRDT snapshot, then atomically flip authority; HTML/text becomes a projection.
- Enable compaction in read-back-only mode before any journal deletion.

## 8. Verification checklist

- Current claims have exact repository evidence; target claims are labeled.
- Every vendor behavior has an official citation and as-of date.
- Authority, identity, ordering, cursor, duplicate, ACL, backpressure, reconnect, binary storage, and failure tables are present.
- Contract tests cover same-ID replay/conflict, partial batch results, timeout ambiguity, cursor resume/expiry, state-vector diff, and snapshot+tail recovery.
- Failure injection covers commit-before-call crashes, broker response loss, consumer reclaim, publish-before-receipt crash, object upload orphaning, compactor races, and ACL downgrade races.
- Load tests cover hot keys/documents, slow clients, and reconnect storms.
- Security tests cover cross-tenant substitution, stale ACL epochs, private audiences, signed blob references, and Awareness payload limits.
- Mechanical checks cover required sections, balanced fences, relative links, official-source host allowlists, secret/deprecated-name scans, and forbidden dependency imports.

## Citation note for clickable inline URLs

The `grounded-citations` verifier recognizes a bare numeric marker such as `[7]` and intentionally ignores Markdown links shaped like `[7](url)`. If a deliverable explicitly requires clickable URLs at each claim, use `[Source title](registered-url) [7]`, then render the normal Sources block and run `sources.py verify draft.md`. Do not manufacture a citation merely to satisfy `--strict`; an exploratory but irrelevant registered source should remain uncited and be handled as a warning or in a clean final ledger built from saved retrieval output.
