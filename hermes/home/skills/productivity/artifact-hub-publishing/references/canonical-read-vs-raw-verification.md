# Canonical Read vs Raw Endpoint Verification

Use this reference when a multi-document Artifact Hub publish reports success but an external raw/detail fetch disagrees.

## What happened

A batch publish returned a new artifact ID and `Created v1`. Artifact Hub MCP `read_artifact` and `list_artifacts` confirmed the expected title, slug, version, tags, and full body. An external request to the returned raw endpoint instead returned either stale cached content or an authentication/scope error such as:

```text
Sign-in failed. The following scopes are invalid: artifact:delete
```

This is an endpoint/authentication-layer discrepancy, not evidence that the publication itself failed.

## Verification order

1. Preserve the publish response: artifact ID, project, slug, version, raw link, and detail link.
2. Call `read_artifact` by exact artifact ID and verify:
   - title and slug;
   - expected version;
   - expected format/project;
   - distinctive headings or body phrases;
   - metadata such as tags and visibility when exposed.
3. Call `list_artifacts` with the exact title or distinctive body phrase and confirm the same ID/slug/version appears.
4. If a raw fetch is available, compare its title/version/body. Treat stale, inaccessible, or scope/auth failures as a verification-path problem and do not republish or create a duplicate.
5. Use the detail-page URL in indexes when raw delivery is not independently verified. Keep the raw URL in the publication manifest only as an unverified service-returned link, not as proof that the expected revision is publicly readable.
6. Report the distinction explicitly: canonical artifact publication verified; raw endpoint verification unresolved or failed.

## What the raw endpoint actually returns

`https://artifact-content.sharosoo.com/raw/<id>` is **not** the Markdown source. It is a fully rendered HTML page with `<!doctype html>`, `<head>`, `<title>`, and the Markdown converted to semantic HTML. A 5.9KB Markdown body produces ~9.1KB of HTML on the wire. Implications:

- The `truncated-v1` heuristic (compare `len(read["content"])` to the source file) **only applies to the canonical MCP `read_artifact` response**, never to the raw HTTP endpoint. Comparing raw bytes against the source Markdown is meaningless and will always mismatch.
- Verification via raw should use `curl -sS -o /tmp/check.html -w 'HTTP %{http_code}, bytes %{size_download}\n' "<raw-url>"` followed by `grep` for distinctive phrases from the body (`grep -o "Top Pick" /tmp/check.html`, `grep -o "WideEP" /tmp/check.html`). The completion test is "the distinctive phrases appear in the rendered HTML," not "byte count matches the source."
- The `<title>` element of the raw page reflects the **server-normalized title** (see `Skill pitfalls` → `update_artifact may rewrite the title field server-side`). Do not grep the raw page for the exact title you sent — the server may have folded an emoji or date range from the H1 into it.

## Multi-document index rule

Publish all individual documents first. Read each back before updating the index. If a broad source draft is decomposed into several articles, keep it as source material unless deletion was requested, omit it from the numbered reader-facing index, and count only the replacement articles. State that the source draft was superseded so the index does not imply two copies of the same story.

## Safety

Never print or store API keys while diagnosing raw endpoint behavior. Record only the sanitized error class/message, artifact IDs, versions, and URLs needed for verification.
