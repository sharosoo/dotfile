# In-process read_artifact return shape + verification recipe (2026-08-30)

Ready-to-merge notes for `references/arthub-mcp-contract.md` (write to that file was blocked by the curator read-before-write guard this session; merge these sections in a foreground turn).

## Add to "Known limitations"

- **In-process `read_artifact` returns a JSON string, not a dict (2026-08-30).** `registry.get_entry("mcp__arthub__read_artifact").handler({"id": ...})` returns a `str` containing `{"result": "<body>", "structuredContent": {...}}` — parse with `json.loads(res)` before any `.get()` access, or you get `AttributeError: 'str' object has no attribute 'get'`. Identity fields are asymmetric: `read_artifact` takes `id`, `update_artifact` takes `slug`. The `result` body is prefixed with a generated header (`# Title (vN, md)` line + `slug=... project=...` line + blank line); strip exactly that prefix (verify `startswith`) before byte-comparing against the local source file. Verified end-to-end on a 13,871-char publish: stripped canonical read-back == local file exactly.

## Add to the in-process handler section

- In-process publish of a ~14KB md body works fine below the cap (verified 2026-08-30: `publish_artifact` via registry handler, `Created v1`, `warnings: []`, read-back byte-identical after prefix strip) — the handler is safe at any size; only the deferred `tool_call` path has the ~32KB cap.
- `execute_code` note: a stray heredoc terminator (e.g. a copied `PY` line) left in the script raises a confusing `NameError` AFTER your prints have run — the earlier stdout is still valid; check it before reacting to the traceback.

## Verified publish+read-back recipe (model-notes, single-video talk)

```python
import json, sys
sys.path.insert(0, "/home/global/.hermes/hermes-agent")
from tools.mcp_tool import discover_mcp_tools
from tools.registry import registry

discover_mcp_tools()
publish = registry.get_entry("mcp__arthub__publish_artifact").handler
content = open("/tmp/specvideo/body.md", encoding="utf-8").read()
res = publish({
    "content": content, "title": "...", "slug": "...",
    "project": "model-notes", "format": "md", "visibility": "link",
    "agent_source": "discord:<message-id>",
})
# res is a dict here; capture id + link from structuredContent

read = registry.get_entry("mcp__arthub__read_artifact").handler
raw = read({"id": "<id>"})            # <- str, not dict
d = json.loads(raw)
body, meta = d["result"], d.get("structuredContent", {})
prefix = f"# {meta['title']} (v{meta['version']}, md)\nslug={meta['slug']} project={meta['project']}\n\n"
canonical = body[len(prefix):] if body.startswith(prefix) else body
assert canonical.strip() == content.strip()   # byte-identical verification
```

Raw/detail endpoint spot-check in the same run:

```bash
curl -sS -o /tmp/check.html -w 'RAW HTTP %{http_code}, bytes %{size_download}\n' "https://artifact-content.sharosoo.com/raw/<id>?v=1"
grep -c '<distinctive-phrase>' /tmp/check.html
curl -sS -o /tmp/detail.html -w 'DETAIL HTTP %{http_code}, bytes %{size_download}\n' "https://artifact.sharosoo.com/a/<id>?v=1"
grep -o 'Open v1' /tmp/detail.html | head -1
```

In-process registry handler payload for `publish_artifact` (worked 2026-08-30): `content`, `title`, `slug`, `project`, `format`, `visibility: "link"`, `agent_source` — no `tags` (known contract limitation).
