# Canonical slug identity and duplicate recovery

## Durable rule

Artifact identity for revisions is the exact `(project, slug)` pair returned by the original publish response. A known Artifact ID, title, or detail URL is not enough to target an update.

## Safe update sequence

1. Read the existing artifact by ID and copy its exact `project` and `slug` from the response.
2. Call `get_draft(id)` and stop if a human unpublished draft exists.
3. Publish or update using the copied `(project, slug)`. Do not invent a cleaner slug during an update.
4. Read back the artifact and verify that its version incremented. If the response says `Created v1`, treat that as a duplicate-creation alarm and stop.
5. Verify title, visibility, tags, and rendered body from the canonical detail URL.

## If a duplicate was accidentally created

Artifact Hub may expose update but not delete/archive operations. When deletion is unavailable:

1. Keep the original artifact as canonical and update it using its original `(project, slug)`.
2. Republish the accidental duplicate with `visibility=private`, an unmistakable internal duplicate title/body, and minimal `internal,duplicate` tags.
3. Verify the duplicate's public detail URL is inaccessible and the canonical URL remains shared.
4. Record only the canonical ID and URL in indexes and manifests.

## Collection bookkeeping

- Keep stable topic numbers across filenames, manifests, checklists, and indexes, even when the index groups entries by domain.
- Track reader-ready documents and selection-oriented rough drafts as separate progress counts.
- Publisher warnings are not cosmetic: fix them and publish a clean revision before marking verification complete.
