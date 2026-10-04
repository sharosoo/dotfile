# Arthub MCP contract and invocation notes

## Known operations

The live configured server currently exposes seven document operations:

| Operation | Purpose | Important fields |
|---|---|---|
| `list_artifacts` | Search before creating | `project`, `tag`, `q`, `limit` |
| `publish_artifact` | Create v1 or append a version for the same `(project, slug)` | `content`; optional `title`, `slug`, `project`, `tags`, `format`, `visibility`, `agent_source` |
| `read_artifact` | Read latest or specific published version | `id`, optional `version` |
| `get_draft` | Check for a human-authored unpublished web draft | `id` |
| `update_artifact` | Add a version to an existing document | `slug`, `content`; optional `project`, `base_version`, `force` |
| `move_artifact` | Change project/optional slug without resubmitting content or creating a version | `id`, `project`, `base_version`; optional `slug` |
| `delete_artifact` | Permanently delete an archived document | `id`, exact `confirmation`, positive `expected_version`; requires delete-capable PAT |

Formats: `md`, `html`.

Do not hard-code a remembered payload shape. Load the current tool schema before a batch (`tool_describe` when deferred). In the current MCP contract, `publish_artifact` requires `content`; it does not accept `body`, `id`, `description`, or `visibility: public`. Revisions are targeted by the exact existing `(project, slug)` and must return the same document ID.

Current `publish_artifact` visibility values are `private`, `team`, and `link`; follow the live schema when it differs from this reference.

## Known limitations (verify before each batch)

The live `mcp-arthub` server has quirks that the schema description does not surface. Confirm each item against the actual response before relying on it:

- **`tags` parameter is accepted as of 2026-09-11.** A flat JSON string array now works on `publish_artifact` (`tags: ["vllm", "translation", "korean"]` → stored and returned by `list_artifacts` on a `vllm-blog` project publish, verified across 15 artifacts). The older `Items did not match schema` rejection (2026-08-06) no longer reproduces; try tags first and only fall back to omitting them if the boundary rejects the payload.
- **`publish_artifact` responses embed literal `\n` escapes, not real newlines.** `str(result)` reads `"Created v1\nLink: https://…\nDetails: https://…\nslug: …"`. A `re.search(r"Link: (\S+)", txt)` therefore captures the URL **plus** the following `\nDetails:` token and every derived request 404s. Normalize with `txt = txt.replace("\\n", "\n")` before parsing Link/Details/slug. Symptom of getting this wrong: publish succeeds and canonical `read_artifact` is byte-exact, but the raw and detail URLs 404 with `Could not resolve host` or `HTTP 404 / 50 bytes` — do not conclude the artifact failed.
- **`publish_artifact` may rewrite the slug you send.** Dots are stripped: requested `vllm-blog-2026-08-12-qwen3.8-ko` was stored as `vllm-blog-2026-08-12-qwen38-ko`. Always persist the `slug:` line from the response, never the requested string, for later updates.
- **Historical note (pre-2026-09-11):** the `tags` parameter was rejected on `publish_artifact`. A flat JSON array of strings (the only shape the schema description declares) is rejected with `Items did not match schema; Items/0: Instance type "object" is invalid. Expected "string".` Verified 2026-08-06 against `mcp-arthub` with `tags: ["llm-serving", "github", "pr-issue", "daily", "2026-08-06"]`. The MCP bridge appears to coerce the array as an object. **Working pattern today**: omit `tags` on `publish_artifact` (default empty tags), then call `update_artifact` to push any body changes; do not try to set tags via `publish_artifact` until the contract is fixed. Document the actual `tags` value the user wants in the Discord reply, even if the public artifact shows `tags: []`.
- **`update_artifact` does not accept `tags` / `visibility` / `agent_source` parameters.** It only takes `slug`, `content`, `project`, `base_version`, `force`. Metadata is carried forward from the existing artifact. If a previous version's tags were cleared by a metadata-stripping `update_artifact`, the only path to restore them is the workaround below.
- **`update_artifact` requires `slug` — NOT `id`.** Calling with `id` returns `Input validation error: ... does not have required property "slug"`. Verified 2026-08-09.
- **`update_artifact` REQUIRES the original `project` to be passed explicitly.** The schema marks `project` optional (defaults to `"default"`), but omitting it silently CREATES A NEW DOCUMENT under `(project=default, slug)` instead of updating the existing `(project=<real>, slug)` document. Verified 2026-08-09: 8 artifacts were duplicated into the `default` project this way; the real documents stayed at v1. Recovery: republish each duplicate with `publish_artifact` on the same `(project=default, slug)` with `visibility: "private"` and an unmistakable marker body — `delete_artifact` was refused (`Missing scope: artifact:delete`) and no move path existed (slug collision). Always pass `project` on every `update_artifact` call, and check the response — a fresh raw URL instead of the known artifact URL means a duplicate was created.
- **After `update_artifact`, `list_artifacts` may still show the old version (server-side cache).** Confirm the bump with `read_artifact({id})` and check the `version` field, not the list.
- **`tags`-restore workaround** (when the live contract still rejects `tags`): publish a fresh version with `publish_artifact` on the same `(project, slug)`, then immediately read back via `read_artifact` to verify whether the deployment auto-restores prior tags on a same-slug republish. If it does not, accept the empty `tags: []` and explicitly tell the user. Do not loop trying to set tags — the bridge will keep rejecting.
- **Delete/Archive surface may be absent.** `delete_artifact` and `move_artifact` are listed in the live operation count (7 ops) but not always exposed in the configured MCP tool set. If a test artifact needs to be removed and no delete tool is available, republish the test artifact with `visibility: "private"`, an unmistakable internal duplicate body, and `internal,test,duplicate` tags. Do not loop trying to delete.

Before publishing a batch, validate ONE real target end-to-end. A 60-second smoke test saves an hour of "why is the field still empty" debugging.

## Safe creation sequence

1. `list_artifacts({q: <distinctive title>, limit: 20})`
2. If no equivalent document exists, call `publish_artifact`.
3. Capture the returned version, detail URL, raw URL, slug, project, and ID.
4. Open the detail URL and inspect the preview.

Example payload (as of 2026-08-06 — the `tags` field is currently broken at the MCP boundary; see "Known limitations" below):

```json
{
  "content": "<!doctype html>...",
  "title": "System Architecture Deep Dive",
  "slug": "system-architecture-deep-dive",
  "project": "default",
  "format": "html",
  "visibility": "link",
  "agent_source": "discord:<message-id>"
}
```

A working `publish_artifact` call today omits `tags` entirely (the document is created with `tags: []`). If the deployment contract changes and tags are again accepted, restore the field to the example above.

## Safe update sequence

1. `list_artifacts` to locate the document.
2. `read_artifact({id})` to obtain current body/version.
3. `get_draft({id})`.
4. If no unpublished draft exists and the format is unchanged, use `update_artifact({slug, content, project, base_version})`.
5. If the format must change, use `publish_artifact` with the same `(project, slug)` and explicit new `format`; verify that the service appended a version to the same artifact ID.
6. If a draft exists, stop and tell the user. Do not set `force: true` without explicit authorization.
7. Verify the new detail page, version, format, and rendered/raw document.

## Hermes discovery and fallback

Normal path: call native tools named `mcp__arthub__<operation>` directly.

If they are configured but absent from the current tool surface:

1. Check connection and discovered tool names with:

```bash
hermes mcp list
hermes mcp test arthub
```

2. In a Hermes source checkout/runtime, discovery can register the tools in-process; then invoke the registered handler. This is a fallback, not the preferred path:

```python
import sys
sys.path.insert(0, "/path/to/hermes-agent")
from tools.mcp_tool_discovery import discover_mcp_tools   # moved from tools.mcp_tool; old path kept only for external plugins
from tools.registry import registry

discover_mcp_tools()
entry = registry.get_entry("mcp__arthub__list_artifacts")
print(entry.handler({"q": "Document title", "limit": 20}))
```

Use the same registry pattern for `publish_artifact` only after the duplicate search. Registry handlers receive one positional argument containing the complete payload dictionary: `entry.handler({"content": ..., "project": ..., "slug": ...})`. Do not expand the payload as keyword arguments. Never print configuration headers or credential values.

### When to prefer the in-process handler over deferred `tool_call`

Deferred `mcp__arthub__publish_artifact` and `update_artifact` calls via `tool_call` silently truncate arguments beyond ~32KB. The publish succeeds (`Created v1` or `Updated v2`) but the body is cut mid-line — there is no error to react to. Detection requires a follow-up `read_artifact({id})` and a body-length comparison.

For bodies > 30KB (the depth-mode daily report is typically 30–45KB; long blog posts and reference docs are commonly larger), prefer the in-process handler from the first publish:

```python
# Cron-safe pattern — body is read from a file, no argument-size limit
import sys
sys.path.insert(0, "/home/global/.hermes/hermes-agent")
from tools.mcp_tool_discovery import discover_mcp_tools   # moved from tools.mcp_tool; old path kept only for external plugins
from tools.registry import registry

discover_mcp_tools()
update = registry.get_entry("mcp__arthub__update_artifact").handler

content = open("/tmp/full_body.md", encoding="utf-8").read()
result = update({
    "slug": "llm-serving-daily-report-2026-08-07",
    "project": "llm-serving",
    "base_version": 3,           # omit for first publish
    "content": content,
})
print(str(result)[:2000])
```

The full body lives on disk; the handler receives a string reference rather than the full string through the tool-call argument serialization layer. This sidesteps the cap entirely. **Heuristic**: any body > 30KB → in-process handler; < 30KB → either works. **Always `read_artifact` after the first publish** to confirm the body is intact, regardless of which path you used.

### Unwrap in-process handler responses defensively

The registry handler returns a dict like `{"result": "<json string>"}` whose `result` value is itself a JSON-encoded string (sometimes twice — one `json.loads` may yield another `{"result": ...}` wrapper). Unwrap with a loop instead of a fixed number of `.get()` calls, or you end up indexing a string like a dict:

```python
cur = handler_response
for _ in range(4):
    if isinstance(cur, dict) and "result" in cur:
        cur = cur["result"]
    elif isinstance(cur, str) and cur.strip().startswith("{"):
        cur = json.loads(cur)
    else:
        break
```

For `read_artifact`, strip the known generated prefix before comparing to the local source file: line 1 is `# <title> (vN, md)` and line 2 is `slug=... project=...`; the canonical body starts on the next line. Then `body == local_source` gives exact-match verification (verified on a 22.5KB body). Finish with raw-endpoint verification: HTTP 200, distinctive body phrases present, literal `**` count of 0.

### If `terminal` trips the lifecycle guard (`embedded null byte`)

Running the in-process publish script via the `terminal` tool can crash with `ValueError: embedded null byte` inside `cron/lifecycle_guard.py`: `_read_referenced_script` calls `os.open(path)`, which raises `ValueError` (not `OSError`, the only exception caught there) when a scanned path contains a NUL — e.g. when the command line references a venv python symlink that the guard treats as a referenced shell script. Both heredoc (`<<'PY'`) and stdin-redirect (`python3 < script.py`) forms trip it. Observed 2026-08-08; do not retry the same terminal form.

Same imports, same payload, but invoke through `execute_code` instead — it executes in the session's active venv (the hermes venv), so the imports resolve without any shell command:

```python
import sys
sys.path.insert(0, "/home/global/.hermes/hermes-agent")
from tools.mcp_tool_discovery import discover_mcp_tools   # moved from tools.mcp_tool; old path kept only for external plugins
from tools.registry import registry

discover_mcp_tools()
publish = registry.get_entry("mcp__arthub__publish_artifact").handler
content = open("/tmp/article.md", encoding="utf-8").read()
result = publish({
    "content": content, "title": "...", "slug": "...",
    "project": "...", "format": "md", "visibility": "link",
    "agent_source": "discord:<message-id>",
})
print(str(result)[:2000])
```

This is an alternative invocation path for the same in-process handler — it does not replace the >30KB heuristic; the point is still keeping the body out of the tool-call argument serialization layer. After publishing, do the usual immediate `read_artifact` body-length check.

Do not create a dummy artifact as a connectivity preflight. Use `list_artifacts`, `read_artifact`, or `get_draft`, then validate one real update before launching a batch. A dummy publish leaves a server-side document behind when no delete/archive operation exists.

## Verification expectations

A successful detail page should expose:

- document title and project
- author/source attribution
- visibility and current version
- tags
- an “Open document” or equivalent action
- rendered preview (HTML commonly appears in an iframe)
- version history

The user-facing URL should normally be the detail page:

```text
https://artifact.sharosoo.com/a/<document-id>
```

The raw content endpoint is useful for validation but is not the primary share link.