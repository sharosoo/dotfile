# CRDT collaborative-artifact reference

Use this reference when an Artifact Hub brief describes collaborative editing, offline work, shared canvases, Yjs, or CRDTs.

## Core decision

Treat CRDT as a first-class content model, not as a transport feature. For a Yjs-based artifact:

```text
Y.Doc / Yjs updates
  = collaborative content, conflict resolution, merge semantics

Spanner or equivalent durable DB
  = artifact identity, ACL, metadata, audit, revision index,
    update manifest, snapshot manifest

GCS/object storage
  = large binary Yjs updates, snapshots, attachments

Redis Streams / queue
  = dispatch, retry, indexing, compaction, outbox work

Centrifugo / WebSocket provider
  = live update fan-out and ephemeral Awareness/presence
```

Do not call Centrifugo history the source of truth. Do not put artifact CRDT updates in the DBOS run journal: execution events and collaborative-document updates have different retention, replay, authorization, and compaction semantics.

## Durable update contract

Model an update receipt with at least:

- `artifact_id`, stable `doc_guid`, workspace/visibility scope
- `update_id`, canonical update hash, payload size/content type
- Yjs binary update and optional base/result state vectors
- actor/principal, client/session identifier, schema version
- aggregate/revision version, `correlation_id`, `causation_id`, timestamp
- outbox/inbox processing state

Yjs document updates are commutative, associative, and idempotent. State vectors allow a provider to calculate only the missing diff. This does **not** make indexing, notifications, audit, or business side effects exactly-once. Put a unique key on `update_id`/canonical hash and make outbox consumers idempotent.

Keep a snapshot manifest containing `snapshot_id`, artifact/doc identifiers, state vector, content hash, covered update version, schema version, and blob reference. Compact only after the snapshot is durable and stale/offline clients can still reconcile from that snapshot. Loading a `Y.Doc` is required for garbage collection; merely merging binary updates does not remove deleted content.

## Sync and presence

A reconnect path should be state-vector reconciliation, not blind replay of a bounded realtime cache:

1. authenticate the artifact subscription and permission scope;
2. open local Yjs persistence when offline support is required;
3. exchange the client's state vector;
4. compute and apply the missing diff from snapshot + retained updates;
5. fan out subsequent binary updates through the realtime provider;
6. repeat reconciliation after reconnect or history loss.

Yjs Awareness is separate from the document. Cursors, selections, typing, and online state are ephemeral and should not enter snapshots, audit, billing, or long-term search. Add heartbeat/TTL handling and server-side identity enforcement; never trust an arbitrary client-supplied actor identity in presence data.

## Authorization and domain boundaries

Yjs supplies merge semantics, not product ACLs. The server must authenticate each artifact channel and reject document-update frames from read-only or unauthorized principals. Keep ACL/visibility in the owning service. Domain/application code depends on ports such as `CrdtDocumentPort`, `ArtifactUpdatePort`, `ArtifactPolicyPort`, and `OutboxPort`; adapters own Yjs, persistence, and realtime details.

Agent edits must go through the same authorized artifact-update port as user edits. Link the update to the agent run with correlation/causation IDs, but do not overwrite the artifact's Yjs state with a final Markdown string or bypass the CRDT log.

Prefer one stable document/room per large artifact. A workspace index and artifact documents can be separate Yjs documents; use subdocuments/lazy loading only after the provider contract supports them. Keep attachments in object storage and reference them from the CRDT document rather than embedding large binaries.

## Quality gate

For architecture artifacts, require explicit coverage of:

- concurrent insert/delete convergence;
- duplicate and reordered update delivery;
- offline persistence and reconnect merge;
- state-vector recovery after realtime-history loss;
- snapshot/compaction crash recovery;
- read-only and cross-workspace authorization;
- update-size/rate limits;
- client-ID/session safety;
- separation of Awareness from durable content;
- agent mutation through the same policy and CRDT contract.

## Primary references

- Yjs document updates: https://docs.yjs.dev/api/document-updates
- Yjs Awareness: https://docs.yjs.dev/api/about-awareness
- Offline editing: https://docs.yjs.dev/getting-started/allowing-offline-editing
- Yjs subdocuments: https://docs.yjs.dev/api/subdocuments
- Yjs protocol and read-only enforcement: https://github.com/yjs/y-protocols/blob/master/PROTOCOL.md
- Yjs WebSocket provider: https://docs.yjs.dev/ecosystem/connection-provider/y-websocket
