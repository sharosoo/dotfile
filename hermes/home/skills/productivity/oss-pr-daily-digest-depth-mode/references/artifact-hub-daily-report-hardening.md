# Artifact Hub daily-report hardening

Observed during the 2026-08-11 LLM-serving cron run. Use this as a compact operational reference; the main SKILL.md contains the class-level workflow.

## Data and link contracts

- Search buckets should use GitHub Search qualifiers in an exact UTC window: `merged:`, `closed:` + `is:unmerged`, `created:` + `is:open`, and `created:` + `is:issue` + `is:open`.
- With `gh api` form fields, force GET: `gh api -X GET search/issues -f 'q=...'`. Validate a successful response has `items`; a non-empty error object is not a result set.
- For REST issue payloads, prefer `html_url` over `url`; `url` is the API endpoint.
- Treat search body text as evidence, not publication prose. Curate the WHY/impact sentence and strip headings, tables, code fences, environment dumps, comments, and placeholders from any fallback excerpt.

## Large-body publication

1. Write one canonical Markdown source file and run the GitHub-Markdown sanitizer with `--strict`.
2. Search `list_artifacts` by exact project/title before creating.
3. For a body over ~30KB, call the in-process registry handler with `content=open(source).read()` rather than putting the body in a deferred `tool_call` JSON argument.
4. Preserve `(project, slug)` and use `base_version` for updates. Check `get_draft` before overwriting an existing artifact.
5. Immediately call `read_artifact` on the returned version. Remove only the generated prefix (`# Title (vN, md)` and `slug=... project=...`) and compare the remainder byte-for-byte with the local source.
6. Re-list to confirm version, tags, format, and link visibility. Then inspect the detail page and the rendered content origin with `?v=<version>`.

## Warning cleanup

Artifact Hub's `prefer-table` detector treats repeated colon-bearing bullets as key/value data. Use `배경/요약 —`, `labels —`, `코드 위치 —`, and `URL —`; rewrite label tokens such as `op: moe` as `op-moe` or `op - moe`. Republish/update sequentially until the response reports `warnings: []`.

## Focused post-publish probe

Create a temporary script with an OS-safe `hermes-verify-` prefix. It should:

- compile any changed helper scripts;
- regenerate the local report and run sanitizer `--strict`;
- assert the 10 repo headings, expected reader-facing GitHub URLs, no raw comments/tags, and stable body length;
- read the canonical Artifact Hub version and compare its body exactly to local;
- fetch the rendered raw endpoint with a cache-busting query and assert distinctive H1/body markers, no literal `**`, and no raw comments;
- print `PASS` plus hash/length/version, then delete the temporary script and probe files.

Report this as **ad-hoc verification**, not as a green project test suite. Keep the detail-page URL as the user-facing fallback when raw delivery is not independently verified.
