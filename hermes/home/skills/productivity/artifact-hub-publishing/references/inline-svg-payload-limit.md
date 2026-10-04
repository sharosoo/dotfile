# Inline SVG / large data-URL payload limit

Observed 2026-08-13 on arXiv `2608.09867v1` (same `(project, slug)` as the easy Korean rewrite).

## Failure

Embedding 16 original SVGs as `data:image/svg+xml;base64` produced a ~17MB Markdown body. `publish_artifact` returned success; `read_artifact` of v4 was ~1.95MB with SVGs missing. No hard error. Markdown renderers also cannot consume gzip+base64 SVG data URLs.

This is a **server-side body cut**, distinct from the ~32KB deferred `tool_call` argument cap.

## Working path

1. Inventory unique figure files from the source HTML (`<img>` + `<object data="*.svg">`), not converter-reported image counts.
2. Rasterize each unique SVG: `convert -background white -density 120 in.svg out.png` (ImageMagick; rsvg/inkscape not required).
3. Re-encode PNG → WebP with PIL.
4. Embed `data:image/webp;base64,…`.
5. Publish via the in-process registry handler (body read from disk).

That paper: 19 unique / 31 display instances; ~1.4MB WebP-inline body published with `warnings: []`.

Do not retry the same slug with the 17MB SVG body — truncated versions stay in history.

Full paper-rewrite pipeline (placeholders, `figmap.json`, linter, korean-review chain): `writing/technical-document-localization` → `references/arxiv-paper-korean-rewrite.md`.
