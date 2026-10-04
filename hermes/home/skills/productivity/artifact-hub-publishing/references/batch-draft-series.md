# Batch draft-series publishing notes

Use this for a user-requested series of many rough documents that must all be published, not merely generated locally.

## Resumable sequence

1. Create a local Markdown checklist before the first remote write.
2. Give every document a deterministic slug and one checklist row.
3. Search every exact title/slug before creation.
4. Publish each document separately and write its returned ID/detail URL into the checklist immediately.
5. Continue until all individual rows are complete.
6. Publish a separate navigational index only after the requested documents exist.

## Rough technical blog shape

Problem-revealing titles work better than component labels. Start each draft with one line each for:

- material
- problem definition
- alternatives
- trade-off or concern
- conclusion
- strength to emphasize

Then add a chronological or alternatives-based outline, repository/evidence TODOs, user questions, and claim boundaries.

## Verification matrix

For every document, verify:

- `list_artifacts`: project, slug, latest version, tags
- `read_artifact`: latest source body and headings
- detail URL: title, visibility, owner/source, tags, version
- raw/open URL: rendered headings, links, task lists, absence of literal Markdown markers

Programmatic verification is useful for a large batch, but visually inspect at least one representative full document and any document using fragile Markdown constructs.

## Observed Artifact Hub quirks

- An `update_artifact` call that cannot carry metadata may leave the new version with empty tags. Re-list immediately. If tags disappeared, check `get_draft`, then use `publish_artifact` with the same project/slug and explicit metadata; verify that the artifact ID stays stable and the version increments.
- Inline code inside task-list items can produce visible duplicate text and literal backticks even when the accessibility tree looks plausible. Keep checkbox text plain and move code-formatted hashes/paths/slugs to ordinary bullets or tables.
- Do not treat a successful MCP response as completion. Rendering problems appeared only after opening the raw document visually.
