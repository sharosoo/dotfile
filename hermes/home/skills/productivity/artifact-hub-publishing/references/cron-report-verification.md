# Cron report publication verification

Use this after publishing a generated Markdown report, especially when the body is larger than 30KB or the public page may be CDN-cached.

## Required checks

1. Compare the local source with canonical `read_artifact` content by character length and distinctive tail/section markers. A successful publish acknowledgment is not enough; a truncated body can still produce `Updated vN`.
2. Re-list the artifact and confirm the same `(project, slug, id)`, current version, format, tags, and visibility.
3. Open the detail page with a cache-busting query such as `?v=3`. Confirm the page shows `Open v3` (or the actual version), current title, tags, and visibility. A plain URL can continue showing an older version through CDN caching.
4. Open the rendered document from the content origin. Check the H1, one representative section near the end, and `<strong>`/bold rendering. Search visible leaf text for literal `**`; zero is the target.
5. For raw HTTP verification, check HTTP 200, distinctive phrases, and rendered HTML—not byte equality with the Markdown source. The raw endpoint is an HTML wrapper.
6. For a focused cron probe, create an OS-safe temporary script with prefix `hermes-verify-`, run local structure/Discord limits/syntax checks plus raw/detail checks, and delete it in `finally`. Report this as ad-hoc verification; do not call it a green project test suite.

## Large-body invocation

For a body over roughly 30KB, read the body from a local file inside the in-process registry handler instead of placing it in a deferred MCP `tool_call` argument. The deferred path can silently truncate large JSON arguments. Use the exact existing `(project, slug)` so the result must be `Updated vN`; `Created v1` is a duplicate alarm.

The live deferred boundary may reject a flat tags array while the in-process handler accepts it. Always verify tags with `list_artifacts` after publication rather than assuming the request shape or silently omitting them.
