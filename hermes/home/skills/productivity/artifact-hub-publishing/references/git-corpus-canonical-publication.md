# Git-backed corpus to canonical Artifact Hub publication

Use this workflow when a local Git repository is the editable source of truth and Artifact Hub is the reader-facing publication. It is especially useful when the repository contains many decision/evidence documents but the user wants one canonical artifact.

## 1. Audit before composition

Do not concatenate the corpus mechanically. First classify statements as:

- current evidence;
- Accepted decision;
- Proposed option;
- unresolved implementation question;
- historical/superseded hypothesis.

Search for conflicts between earlier evidence documents and later Accepted decisions. Typical examples are an early service-count proposal that still reads like the target, deployment tables whose row count differs from the canonical service map, or stale publication/deletion status in the README.

Run local checks before writing the publication body:

- one H1 and balanced code fences per active document;
- relative links;
- decision registry/file parity;
- duplicate requirement/question IDs;
- source-reference existence against the pinned application snapshot;
- canonical boundary names/counts across maps, deployment tables, and project structure;
- credential, token, private-key, and authenticated connection-string patterns;
- stale target names and deprecated generic deployable names.

## 2. Compose a reader-facing canonical body

Create one local publication file from active decisions. It should explain the architecture rather than mirror every source document.

Recommended order:

1. verdict and maturity/status;
2. pinned current-state evidence and claim boundary;
3. Accepted principles;
4. canonical ownership/service map;
5. detailed boundaries and non-goals;
6. duplicate-owner consolidation;
7. durable operations and state authority;
8. persistence/integration/deployment;
9. migration phases and quality gates;
10. Accepted, Proposed, and unresolved decisions;
11. official references.

Exclude execution envelopes, tool chatter, duplicated appendices, stale alternatives framed as current, and secrets. Keep local evidence detail in the corpus; publish enough evidence to make claims auditable without turning the artifact into a raw repository dump.

## 3. Freeze before remote mutation

This ordering is mandatory for exact local/remote equality:

1. Write the final local publication body.
2. Run body preflight: H1, fences, heading spacing, raw HTML, secret patterns, stale names.
3. Run repository-wide validation.
4. Run `git diff --check`.
5. Compute size and SHA-256.
6. Only now publish those exact bytes.

A post-publish whitespace or heading edit changes the canonical hash even when the rendered page looks identical. Do not claim byte equality against the earlier version.

## 4. Reuse artifact identity safely

Before mutation:

1. `list_artifacts` by distinctive title.
2. `read_artifact` to confirm exact ID, project, slug, and version.
3. `get_draft` on the confirmed ID; do not overwrite a human draft.
4. Reuse the exact `(project, slug)` and use `base_version`.

For bodies over about 30 KB, read the body from disk and call the in-process MCP registry handler; do not send the full body through the deferred tool argument boundary.

## 5. Verify publication

Require all of the following:

- update response returns the expected incremented version and `warnings: []`;
- canonical `read_artifact(version=N)` body equals the local file byte-for-byte;
- local and remote SHA-256 match;
- `list_artifacts` reports the same ID/project/slug/version;
- cache-busted raw URL serves the new H1 and distinctive beginning/end markers;
- cache-busted detail page shows version, format, visibility, and size;
- visual inspection confirms callouts, tables, code blocks, navigation, and long rows render without literal Markdown or clipping.

The raw endpoint is rendered HTML, so byte equality belongs to canonical MCP read-back, not raw HTTP.

## 6. Record and commit

Store a local publication record containing:

- artifact ID, project, slug, title, version, visibility;
- raw and detail URLs with `?v=N`;
- local path, bytes, characters, lines, SHA-256;
- no-draft result;
- warnings count;
- canonical equality and raw/detail/list/visual verification.

Update README, decision status, verification report, and generated inventory. Then rerun corpus validation and `git diff --check`, stage all final records, run staged diff check, commit, and confirm a clean working tree.

## 7. Post-publish mutation repair

Observed failure pattern: a Markdown hard-break used trailing spaces. Publication succeeded, but later `git diff --check` rejected the local file. Removing the spaces changed the local hash after publication.

Correct repair:

1. normalize the local body;
2. publish a new version with `base_version` set to the last remote version;
3. canonical-read the new version and compare exact bytes/hash;
4. verify raw/detail/list/render again;
5. update every local version, URL, size, and hash record;
6. regenerate inventory;
7. commit only after final diff checks.

Prevention is better: run `git diff --check` before the first publication.
