# Rich Markdown, live HTML blocks, and Charts.css

## Preferred shape for content-dense technical artifacts

Use Markdown as the source of truth. Keep headings, prose, code, tables, citations, and fallback explanations in Markdown. Use richer blocks only where they add information rather than decoration:

- ` ```chart ` for data visualization
- ` ```html render ` for self-contained visual components or interaction
- ordinary Markdown tables for exact source values

When the user asks for a “Markdown file with separate HTML blocks,” do not replace the document with standalone HTML. Publish as `format: md`, retain the local `.md`, and optionally attach it to the response.

## HTML block rules

Raw HTML in the Markdown body is rejected. Interactive or rich HTML must be fenced:

````markdown
```html render
<section>...</section>
```
````

Each live block executes as a separate document. It cannot share variables with another block or access its parent. Make each block self-contained. Use Artifact Hub theme tokens (`var(--ah-...)`) rather than hardcoded colors when available.

Do not use live HTML blocks for charts. They render through an iframe and sacrifice the static-search/print/accessibility benefits of the native chart preset.

## Native Charts.css preset

Artifact Hub converts a YAML `chart` fence into a semantic Charts.css `<table>` in the document body. It requires no JavaScript chart runtime and remains searchable, printable, copyable, and screen-reader friendly.

````markdown
```chart
type: bar
orientation: bar
valueLabels: outside
caption: Full npm install duration in seconds — lower is faster
x: [tmpfs, ext4, computerd FUSE]
series:
  - name: seconds
    data: [34.3, 63.9, 124.7]
```
````

Supported types: `column`, `bar`, `line`, `area`, `pie`, `radial`, `polar`, `radar`.

Practical rules:

1. Keep the exact source data in a Markdown table near the chart.
2. State units and whether high or low is desirable in the caption.
3. Never invent normalized scores for decorative comparison.
4. Use `bar` for long category labels; forcing `column` can clip long labels and outside values.
5. `valueLabels: outside` is useful when values differ greatly, but visually verify the maximum value is not clipped.
6. Separate ratios with very different scales into separate charts.

## Changing an existing artifact from HTML to Markdown

`update_artifact` updates content but does not expose a format field. To change format while preserving document identity and version history:

1. `read_artifact({id})`
2. `get_draft({id})`
3. Call `publish_artifact` with the same `(project, slug)` and `format: md`.
4. Confirm that the returned result is a new version of the existing artifact, not a new ID.

## Verification

Do not stop at the publish response.

1. Open the detail URL and confirm the new version and format.
2. Open the raw/rendered document URL.
3. For native charts, verify:
   - the expected number of `.ah-chart` and `.charts-css` elements,
   - zero `.ah-chart-error` elements,
   - labels, values, and captions are present,
   - actual bars/columns are visible with no clipping or overlap.
4. For `html render` blocks, verify each iframe reports ready and shows content rather than an empty/failure fallback.
5. Treat long-document iframe rendering carefully:
   - Live blocks may lazy-load only when they approach the viewport; a not-yet-loaded block can temporarily report a tiny/default height.
   - If a frame stays collapsed at ~48px showing a redirect fallback, reset `fr.src = base + '?r=' + Date.now()` — healthy content jumps to its natural height (several hundred px).
   - Full-page stitched screenshots may omit or blank cross-origin iframe pixels even when the block is healthy.
   - Before diagnosing clipping or an empty block, inspect the iframe `src` and dimensions, scroll it into view, and open the content-origin block URL directly for a focused visual check.
   - Confirm browser console errors are zero after focused checks. Do not use iframe height alone as proof of failure.

The public document body is served from the content origin. Resource block URLs are relative to that origin; do not diagnose a block as missing by probing the same relative path against the detail-page origin.

## Building interactive simulators in html render

A live block can carry a self-contained mini-app (board grid, cards, turn/state machine) for guide-type artifacts. Rules that keep it working:

- One fence, zero external requests — inline CSS and JS only. The block runs in a sandboxed iframe (`sandbox="allow-scripts allow-forms allow-popups"`) with no network and no access to the parent document.
- Smoke-test before publish: extract the fence's `<script>` body and run `node --check`, then load the fence as a local file and click through every phase via the real DOM handlers (select → act → resolve → round end). A thrown error mid-DOM-build leaves the block half-drawn — an empty token (`classList.add("")`) throws and silently aborts a `render()` pass, so never pass computed class strings that can be empty.
- Keep one global state object plus a single `render()`, and log the rule math per action (e.g. defense = shield + minion modifiers) so the walkthrough teaches the calculation, not just the outcome.
- Publish-time warnings `block-hardcoded-color` and `block-font-family` are style advisories, not errors. A self-contained themed block (dark game UI) legitimately hardcodes its palette — theme tokens do not exist inside the sandboxed iframe.

## Verifying a live block's DOM and interaction

The block body never appears in the main-frame DOM. It renders in a sandboxed cross-origin OOPIF iframe (`ah-live-frame`, `src="/resource/<id>/block/<hash>"`, `loading="lazy"`), so main-frame queries always report zero nodes and `contentDocument` access is refused even when the origin looks same-origin.

1. Scroll the frame near the viewport and wait — `loading="lazy"` means it never loads off-screen.
2. Attach via CDP in ONE tool call (the interpreter is fresh per call, so a session variable from a previous call is gone): `Target.getTargets` → pick the target whose URL contains `/block/` → `Target.attachToTarget(targetId, flatten=True)` → `Runtime.evaluate(expression, returnByValue=True, sessionId=<sid>)`. Then drive the real DOM handlers (`el.click()`) inside that session rather than poking global state, which bypasses UI guards.
3. Content check without the browser: `curl` the block URL with `Referer: <content-origin raw URL>` and `Sec-Fetch-Dest: iframe` + `Sec-Fetch-Site: same-origin` headers — it serves the block HTML (grep for a distinctive function/class name). Top-level navigation to it is refused ("This path is not available on the artifact origin"), and without the fetch headers it redirects to the raw document.
4. Finish with a screenshot + vision check of the rendered block: grid, pieces, cards, HUD visible and unbroken. Pixels and working interaction are the completion test, not DOM counts.
