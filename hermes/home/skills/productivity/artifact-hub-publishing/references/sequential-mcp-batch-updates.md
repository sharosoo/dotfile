# Sequential MCP batch updates

Use this only when the native `mcp__arthub__update_artifact` tool is available but submitting many large exact Markdown bodies through the chat tool surface is impractical.

## Safe sequence

1. Read every local source file first; exclude read-only evidence ledgers and indexes unless explicitly requested.
2. Resolve each canonical document ID, exact `(project, slug)`, and current `base_version`. Check `get_draft` for every target before the first mutation.
3. Use the configured Artifact Hub MCP HTTP endpoint with the existing bearer credential. Initialize one JSON-RPC session (`initialize`, then `notifications/initialized`).
4. For each item, in stable numeric order, call `tools/call` with `name: update_artifact` and arguments `{project, slug, content, base_version}`.
5. Parse the returned `Updated vN`; immediately call `tools/call` with `name: read_artifact` and `{id, version: N}`. Confirm version, slug, project, and a non-empty body before continuing.
6. Stop on a conflict or draft warning. Read the latest version and report it; never retry with a guessed base version or `force`.
7. Record the resulting version and raw link as each item completes. Do not update the index as part of the document batch unless separately requested.

## Verification boundary

Authenticated MCP `read_artifact` is the authoritative read-back path. A public raw URL may be useful as a share link, but an unauthenticated probe can be blocked by access policy (for example HTTP 403) and should not be treated as proof that the update failed. Do not claim a full test-suite result from this workflow; report it as focused remote verification.
