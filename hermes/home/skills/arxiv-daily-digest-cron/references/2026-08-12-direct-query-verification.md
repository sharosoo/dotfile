# Direct-query and Artifact Hub verification — 2026-08-12

## Run facts

- UTC run: 2026-08-12 03:00.
- The exact combined arXiv API query returned HTTP 200 and 20 complete Atom entries.
- State before the run had 859 normalized base IDs and last run `2026-08-10`; the run found 15 unseen candidates in the returned window.
- Five papers passed the system-level rubric and were published; only those five IDs were added to `seen_ids`. Excluded candidates were not marked seen merely because the query returned them.
- Artifact Hub target: project `llm-serving`, slug `llm-serving-arxiv-2026-08-12`, Markdown, shared-link visibility, explicit tags, and cron agent source.

## Canonical publication checks

1. Search the exact title/slug before creation.
2. Publish once with the deterministic slug and explicit metadata; `Created v1` is expected when the slug is new.
3. Immediately call `read_artifact(id)` and compare the returned `structuredContent.content` with the local body after stripping only the server-generated prefix:
   - `# Title (vN, md)`
   - `slug=<slug> project=<project>`
4. Re-list by project/query and verify project, slug, version, format, tags, and visibility.
5. Fetch the cache-busted detail URL (`?v=<version>`) and the raw content URL. Both returned HTTP 200 in this run.
6. Open `Open vN` in the detail page. The rendered document had the expected H1, five paper headings, five arXiv links, and no literal `**` in visible text.

## Renderer observation

The compact browser accessibility snapshot showed empty list-item nodes for several Markdown summary bullets even though the content was rendered correctly. Do not treat missing AX text as a publication failure. Check `document.body.innerText`, `document.querySelectorAll('h1,h2').length`, arXiv-link count, and visible literal-star presence. A screenshot/visual inspection remains the decisive check for legibility.

The raw endpoint serves a complete rendered HTML wrapper rather than the source Markdown. Validate it by checking distinctive paper IDs/phrases, HTTP status, and `**` count; do not compare its byte length to the Markdown source.

## State update invariant

Use an atomic temp-file plus `os.replace`. Set `last_yield` to the number of papers actually present in the final digest, not the number of API candidates. Put the source path, candidate count, selected IDs, and Artifact Hub verification result in the internal `last_run_note`, not in the reader-facing artifact body.
