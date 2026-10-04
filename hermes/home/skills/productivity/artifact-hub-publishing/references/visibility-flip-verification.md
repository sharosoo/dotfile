# Visibility flips and metadata-only changes

`update_artifact` carries only content + base_version — it does NOT change visibility, tags, or title. To flip an artifact from private to `link` (or any metadata-only change), republish with the same `(project, slug)` plus the explicit field; this appends a version to the same artifact ID. Verified 2026-08-23: v2→v3 visibility flip, id/slug/raw URL all unchanged.

## Post-flip openness verification

After a visibility flip, verify with an unauthenticated raw fetch:

```sh
curl -sSL "<raw-url>?v=<version>" -o /tmp/check.html -w 'HTTP %{http_code}, bytes %{size_download}\n'
```

- A login-redirect page (`sharosoo · 로그인` in `<title>`, ~1KB) means the artifact is STILL gated.
- A full rendered page (tens of KB for a long article) means open.

The raw endpoint may serve the auth redirect at HTTP 200 — check the page title/size, not just the status code. Follow redirects (`-L`): the raw host 302s to the login page when gated.
