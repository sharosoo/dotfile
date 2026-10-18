# Rich Markdown, OpenUI, live HTML blocks, and Charts.css

## Preferred shape for content-dense technical artifacts

Use Markdown as the source of truth. Keep headings, prose, code, tables, citations, and fallback explanations in Markdown. Use richer blocks only where they add information rather than decoration:

- ` ```chart ` for data visualization
- ` ```openui ` for structured UI: cards, stat tiles, grids, comparisons, steps, timelines, key–value lists, progress, simple bar charts, badges, callouts
- ` ```html render ` only for what OpenUI cannot express (genuine interaction, bespoke SVG/canvas)
- ordinary Markdown tables for exact source values

When the user asks for a “Markdown file with separate HTML blocks,” do not replace the document with standalone HTML. Publish as `format: md`, retain the local `.md`, and optionally attach it to the response.

## OpenUI fences (default for structured UI)

An ` ```openui ` fence holds an OpenUI Lang v0.5 program. The server renders the initial state inline (theme, print, search and no-JS all work), then `/_theme/openui.js` (React + `@openuidev/react-lang`) hydrates it in the reader's browser, so the full language works: `$variables` bound to inputs, built-in `@` functions (`@Filter`, `@Count`, …), actions (`@Set`, `@Reset`, `@Run`, `@OpenUrl`, `@Custom`), `Query` and `Mutation`.

````markdown
```openui
root = Stack([overview, steps])
overview = Grid([latency, cost], 2)
latency = Stat("p50 latency", "0.2 ms", "-40%", "positive")
cost = Stat("Monthly cost", "$49", null, "neutral")
steps = Steps([{title: "Build", body: "Compile the worker"}, {title: "Publish", body: "Share the link"}])
```
````

Interactive example (filter + persisted list):

````markdown
```openui
$filter = ""
root = Stack([search, count, tbl])
search = Input("filter", "Filter", "part of a name", "search", $filter)
rows = [{name: "Alpha"}, {name: "Beta"}]
shown = @Filter(rows, "name", "contains", $filter)
count = Text("Count: " + @Count(shown))
tbl = Table(["name"], shown)
```
````

Components (positional arguments; `null` skips an optional one):
- Display: `Stack(children, direction?, gap?)`, `Grid(children, columns?)`, `Card(title?, children?)`, `Text(content, tone?)`, `Stat(label, value, delta?, tone?)`, `Callout(tone, title?, body)`, `Badge(label, tone?)`, `KeyValue(items)`, `Steps(items)`, `Timeline(items)`, `Progress(label, value, max?)`, `Compare(columns)`, `BarChart(labels, values, unit?)`, `Table(columns, rows)`, `Tabs(items)`, `Accordion(items)`, `Details(label, children, open?)`, `Link(label, url)`.
- Interactive: `Button(label, action?, variant?, icon?)` (default secondary), `Buttons(children)`, `Form(children, submit?)`, `Input(name, label?, placeholder?, type?, value?)`, `TextArea(name, label?, placeholder?, value?)`, `Select(name, options, value?, label?)`, `Checkbox(name, label, value?)`, `Switch(name, label, value?)`, `Slider(name, min, max, step?, value?, label?)`.
- Icons: `Icon(name, size?, tone?)` with 64 curated Lucide names (weather, status, data/dev); `Card`, `Stat`, `Callout`, `Badge`, `Button` take an optional trailing `icon`.
- **The full official OpenUI library (`@openuidev/react-ui`, 82 components) is also available**, with the same signatures as the official OpenUI prompt: charts `BarChart`/`LineChart`/`AreaChart` + `Series`, `PieChart(labels, values)`, `RadarChart`, `RadialChart`, `ScatterChart` + `ScatterSeries`/`Point`, `HorizontalBarChart`, `SingleStackedBarChart`; column tables `Table([Col(...)])`, `EditableTable`; forms `FormControl`, `Select` + `SelectItem`, `RadioGroup`/`RadioItem`, `CheckBoxGroup`, `SwitchGroup`, `DatePicker`; `CardHeader`, `Tag`, `TagBlock`, `Alert`/`TextCallout`, `TextContent`, `MarkDownRenderer`, `CodeBlock`, `Image`, `ImageGallery`, `Carousel`, `Modal`, `Steps`, `Tabs`/`TabItem`, `ListBlock`, `Separator`, and more. Overlapping names are resolved by argument shape; use `OfficialName(...)` (e.g. `OfficialCallout`) when ambiguous. A three-argument `Callout("warning", …)` uses the official style; add a fourth `null`/icon argument for the document tone. Prefer official charts for data visualization.
- Only the components a document uses are loaded; everything is server-rendered first (no-JS readers see the content), and Query-backed parts show skeletons while loading.

Tools for `Query`/`Mutation` (documents have no backend): `http_get({url, query?})` (any HTTPS JSON API or same-origin; the content origin has no cookies), and per-document browser storage `store_get({key})`, `store_set({key, value})`, `store_append({key, item})`, `store_remove({key, index?})` (localStorage, namespaced by document id — each reader keeps their own data).

The authoritative generated reference (signatures, tools, examples) is `skills/arthub/references/openui.md` in the artifact-hub repo and the server's conventions resource. The fastest live copy is the showcase document exposed by `mcp__arthub__list_resources` (title `OpenUI 컴포넌트 모음`, `qa/openui-showcase`): `mcp__arthub__read_resource` with its `artifact://<id>` URI returns working code for every component — read it before writing a block with an unfamiliar component.

Composition rules confirmed by clean publishes (0 warnings):
- Item objects may be named statements referenced from a list (`root = Timeline([t1, t2])`, `t1 = {date: ..., title: ..., body: ...}`), and long data such as table `rows` can live in its own statement referenced by `@Filter` or `Table`.
- `Tabs`/`Accordion` items take `children` as a LIST of components or a string (`{label: "비전", children: [visKv]}`); a bare component is not a list.
- `Table` columns are `{key, label}` objects; `Select` options are `{label, value}` objects. An option with `value: ""` plus `@Filter(rows, "field", "contains", $var)` gives an "all" choice for a category filter.
- Expressions inside `Text(...)` publish clean with `$var` interpolation by string `+` and with a ternary on a comparison (`Text("점수 " + $known + "점")`, `Text($known > 6.5 ? "바꿀 만합니다" : "유지합니다", "muted")`), so a slider-driven judgment card needs no `html render`. `Compare` takes `[{title, items: [strings]}]`; `Steps` takes `[{title, body}]`; a 14-row `Table` with `rows` in its own statement is fine.
- Keep an OpenUI `Table` to about 7 columns. At the article's content width (~1100px window) a 10-column benchmark table wrapped Korean text one syllable per line; fold deltas into the neighbouring cell (`74.2 (+2.8)`), keep a category column used only by `@Filter` in `rows` but out of `columns`, and mention omitted columns in a footnote sentence. Screenshot-check every wide table.
- Keep strings free of unescaped double quotes (use 「」 or single quotes inside text); every statement must be reachable from `root`.
- Use OpenUI `BarChart` for a small unit-labelled bar; use the native `chart` fence when you want a caption and long category labels (OpenUI/Charts.css may ellipsize labels over ~16 characters).

Rules enforced at publish (`openui-syntax` error): only the listed components/functions/tools; props must match the schema; every statement reachable from `root`; no unresolved references or invalid action targets; `@ToAssistant`/continue-conversation is rejected (no assistant on a document). Use Markdown headings outside the fence — OpenUI titles do not enter the TOC.

## HTML block rules (last resort)

Raw HTML in the Markdown body is rejected. When OpenUI genuinely cannot express a component, fence it:

````markdown
```html render
<section>...</section>
```
````

The server emits a warning for every md body that uses `html render`, as a reminder to try OpenUI first. Each live block executes as a separate document. It cannot share variables with another block or access its parent. Make each block self-contained. Use Artifact Hub theme tokens (`var(--ah-...)`) rather than hardcoded colors when available.

Do not use live HTML blocks for charts or for card/timeline/stat layouts. They render through an iframe and sacrifice the static-search/print/accessibility benefits of the native chart preset and OpenUI.

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
   - Live blocks now load eagerly with the page (they used to lazy-load near the viewport); a frame that is still tiny after the page `load` event is a real problem, not lazy loading.
   - If a frame stays collapsed at ~48px showing a redirect fallback, reset `fr.src = base + '?r=' + Date.now()` — healthy content jumps to its natural height (several hundred px).
   - Full-page stitched screenshots may omit or blank cross-origin iframe pixels even when the block is healthy.
   - Before diagnosing clipping or an empty block, inspect the iframe `src` and dimensions, scroll it into view, and open the content-origin block URL directly for a focused visual check.
   - Confirm browser console errors are zero after focused checks. Do not use iframe height alone as proof of failure.

6. Full-page visual check of a long md article: `chromium --headless=new --no-sandbox --disable-gpu --hide-scrollbars --window-size=1100,21000 --virtual-time-budget=20000 --screenshot=full.png <raw-url>` (a 14000px window cuts off the end of a ~40KB article, so size the window to the page and confirm the last section appears). Split the PNG into ~2300px-tall crops with PIL inside `execute_code` (the terminal's system `python3` has no PIL), then run `vision_analyze` on a crop per section group: stat/card grids, timeline, filter table, charts, mermaid, code blocks, callouts. Also count `class="mermaid"` and `ah-chart` in the `curl --compressed` raw HTML against the fences in the body, and require 0 literal `**`.

The public document body is served from the content origin. Resource block URLs are relative to that origin; do not diagnose a block as missing by probing the same relative path against the detail-page origin.

## Building interactive simulators in html render

A live block can carry a self-contained mini-app (board grid, cards, turn/state machine) for guide-type artifacts. Rules that keep it working:

- Each block is capped at 64KB (publish returns a `block-size` ERROR above that), so a framework bundle never fits inline. Keep app code inline and load libraries from an allow-listed CDN only (`cdn.jsdelivr.net`, `unpkg.com`, `cdnjs.cloudflare.com`; any other host, including `cdn.sharosoo.com`, is rejected as `cdn-allowlist`). For a React-based demo: bundle only your own code with esbuild as ESM, mark `react`, `react-dom/client`, and the library packages external via an `onResolve` plugin that maps them to `https://cdn.jsdelivr.net/npm/<pkg>@<exact-version>/+esm`, and embed the result in `<script type="module">`. Pin the exact versions that the library's own `+esm` file imports (`curl` its `+esm` output and read the `from"/npm/..."` URLs) — a different URL for the same package loads a second module instance, which breaks React hooks and zod schema identity. Without that need, prefer zero external requests: inline CSS and JS only. The block runs in a sandboxed iframe (`sandbox="allow-scripts allow-forms allow-popups"`) with no access to the parent document.
- Smoke-test before publish: extract the fence's `<script>` body and run `node --check`, then load the fence as a local file and click through every phase via the real DOM handlers (select → act → resolve → round end). A thrown error mid-DOM-build leaves the block half-drawn — an empty token (`classList.add("")`) throws and silently aborts a `render()` pass, so never pass computed class strings that can be empty.
- Keep one global state object plus a single `render()`, and log the rule math per action (e.g. defense = shield + minion modifiers) so the walkthrough teaches the calculation, not just the outcome.
- Style the block with the injected theme tokens so it follows light/dark: the block document links `/_theme/tokens.css` (served from the content origin), which defines `--ah-bg`, `--ah-surface`, `--ah-fg`, `--ah-fg-muted`, `--ah-border`, `--ah-accent`, `--ah-accent-fg`, `--ah-bg-sunken`, `--ah-radius`/`-sm`/`-lg`, `--ah-font-ui`/`-mono`. Map your own variables onto them (`--card: var(--ah-surface)`) and derive any alternate "skin" by recombining tokens (invert `--accent`/`--accent-text`, radius 0, thicker border) instead of new hex colors. Do not set `font-family` (the base style already applies `--ah-font-body`; `pre`/`code` get `--ah-font-mono`). Publish warnings `block-hardcoded-color` / `block-font-family` appear at the first line of the style tag and disappear once these are gone. A deliberately fixed palette (dark game UI) may still hardcode colors; treat the warnings as advisories there.
- Test locally under real tokens: `curl -sS --compressed -A 'Mozilla/5.0' https://artifact-content.sharosoo.com/_theme/tokens.css -o tokens.css`, wrap the fence in a page that links it, and append a `<script>setTimeout(()=>{...click/dispatch input events...}, N)</script>` that drives the real handlers. Run `chromium --headless=new --no-sandbox --disable-gpu --window-size=W,H --virtual-time-budget=15000 --screenshot=out.png page.html` (headless defaults to `prefers-color-scheme: dark`, so you see the dark theme) and `--dump-dom` to read counters/log text; then vision-check the screenshot.

## Verifying a live block's DOM and interaction

The block body never appears in the main-frame DOM. It renders in a sandboxed cross-origin OOPIF iframe (`ah-live-frame`, `src="/resource/<id>/block/<hash>"`, `loading="lazy"`), so main-frame queries always report zero nodes and `contentDocument` access is refused even when the origin looks same-origin.

1. Scroll the frame near the viewport and wait — `loading="lazy"` means it never loads off-screen.
2. Attach via CDP in ONE tool call (the interpreter is fresh per call, so a session variable from a previous call is gone): `Target.getTargets` → pick the target whose URL contains `/block/` → `Target.attachToTarget(targetId, flatten=True)` → `Runtime.evaluate(expression, returnByValue=True, sessionId=<sid>)`. Then drive the real DOM handlers (`el.click()`) inside that session rather than poking global state, which bypasses UI guards.
3. Content check without the browser: `curl` the block URL with `Referer: <content-origin raw URL>` and `Sec-Fetch-Dest: iframe` + `Sec-Fetch-Site: same-origin` headers — it serves the block HTML (grep for a distinctive function/class name). If a plain request is refused ("This path is not available on the artifact origin") or redirects to the raw document, add those headers; on a recent check a plain headless-Chromium navigation to the block URL returned the block directly, which is the easiest way to screenshot a block in isolation (take the `/resource/<id>/block/<hash>` path from the raw page's `iframe.ah-live-frame` src via `--dump-dom`).
4. Finish with a screenshot + vision check of the rendered block: grid, pieces, cards, HUD visible and unbroken. Pixels and working interaction are the completion test, not DOM counts.
