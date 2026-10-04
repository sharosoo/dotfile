# Artifact Hub deletion and archive behavior

## Route behavior observed on the live service

Artifact Hub exposes deletion in the web application and the current MCP discovery surface also includes `delete_artifact`.

- MCP `delete_artifact({id, confirmation, expected_version})` permanently deletes an archived document and requires a delete-capable PAT; browser OAuth tokens are intentionally insufficient.
- `POST /api/artifacts/:id/archive` → archive/hide the document; returns `{ "id": "...", "archived": true }`.
- `DELETE /api/artifacts/:id/archive` → restore/unarchive the document; returns `{ "id": "...", "archived": false }`. This is **not** permanent deletion.
- `DELETE /api/artifacts/:id` → permanently delete, but only after the document is archived. Send JSON:

```json
{
  "confirmation": "<exact document slug>",
  "expected_version": 2
}
```

A successful permanent deletion returns the document ID, `deletedVersions`, and `storageCleanupComplete`.

Use the native MCP delete tool when it is present. Use the REST route only as a fallback when the current client does not expose `delete_artifact`.

## Safe batch recipe

1. Run `list_artifacts` with a distinctive title/tag/query and build an explicit ID + slug + current-version manifest.
2. Exclude similarly named production artifacts; include only the user-authorized test/duplicate/preflight set.
3. For each target, `POST /api/artifacts/:id/archive`.
4. For each target, `DELETE /api/artifacts/:id` with exact slug confirmation and current version.
5. Re-run `list_artifacts` for every title/tag/slug family. Treat any remaining matching ID as incomplete and investigate before reporting success.
6. Keep the normal production documents and daily reports untouched.

If a mistaken `DELETE /archive` was issued, verify the document is still listed, then archive it again before permanent deletion.
