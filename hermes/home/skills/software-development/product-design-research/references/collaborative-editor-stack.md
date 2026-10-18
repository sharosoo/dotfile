# Collaborative editor product stack notes

Facts gathered while designing a Notion-like workspace on Cloudflare. Re-verify versions and licenses before relying on a row; items marked (unverified) were read but not run.

## Block editor and CRDT

- BlockNote: block editor with slash menu, drag handles, nesting, and Yjs collaboration (PartyKit/y-partyserver examples). Custom blocks via `createReactBlockSpec` (prop schema + React render); block props live in the Yjs doc, so they sync and enter version history. Its AI/export packages are separately licensed, so check before use.
- Tiptap is the ProseMirror alternative; `loro-prosemirror` binds Loro to ProseMirror/Tiptap. BlockNote is Yjs-based and is being decoupled from Yjs; Loro support for it is (unverified).
- Loro 1.0: stable format, rich text, movable list and tree, Git-like history DAG with checkout/fork. Loro Protocol multiplexes rooms over one WebSocket, fragments messages under 256 KiB for Cloudflare limits, interoperates with Yjs rooms, MIT.

## Notion-like version history

- Notion rules (help center): a version every 10 minutes while actively editing plus one 2 minutes after the last edit; viewable history 7/30/90 days by plan; trash 30 days; per-minute server backups; enterprise shows per-change authorship.
- BlockNote ships a versioning extension with a sidebar (save, preview, rename, restore). The Yjs 13 variant takes a pluggable storage adapter; preview swaps the editor to a temporary doc built from the snapshot. The Yjs 14 variant uses YHub (records every edit, groups by gap, attribution, compare) but Yjs 14 was pre-release and YHub is beta needing Redis, Postgres and S3, which does not fit a Cloudflare-only stack.
- Yjs 13 restore needs gc disabled for the history window, and restore is a new change that makes the doc equal the old content, never a rewind. Plan compaction of the non-gc history after retention, keep named versions forever, snapshot before every agent-applied edit and before every restore, and build block-level diff yourself.

## Local-first sync for structured records

- Split data: co-edited text uses a CRDT; records and events (episodes, stages, comments, activity) use server-sequenced sync, because they are mostly single-writer or append-only.
- Linear model: global monotonic sync id assigned by the server, delta packets, local IndexedDB, optimistic transaction outbox, permission boundary as sync groups. An open-source implementation exists (maturity unverified).
- TanStack DB: normalized collections, live queries, optimistic mutations, OPFS SQLite persistence and an offline-transactions outbox; custom backends plug in through a collection adapter whose sync function calls begin/write/commit/markReady. Official Electric adapter needs Postgres. The project is young; an open issue shows a persisted collection blocking render when the sync service is down.
- Cloudflare-only sync options (partysync, durable-sync) are small projects; Zero, Electric and PowerSync need a database plus a long-running service.
- Design pattern: one sync Durable Object per workspace as the single ordering point, change log in its SQLite mirrored to D1, client collection fed by WebSocket deltas with HTTP catch-up from the last sync id.

## Generated UI blocks (OpenUI)

- OpenUI Lang is a streaming-first language a model writes; the app registers components with Zod schemas (`defineComponent`, `createLibrary`) and a `Renderer` draws partial output. A custom editor block can hold the source string in a prop and render it; validate agent output with the parser before accepting it. Event handling for action buttons is (unverified).

## Agent access to documents

- A file-oriented agent harness explores best over a read-only markdown mirror of the documents, rebuilt on save and synced at session start; writes go through proposal tools. Keep full-text search (D1 FTS5) as a tool for when the mirror outgrows file search.
