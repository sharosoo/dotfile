---
name: deepwiki-extraction
description: Use when extracting DeepWiki pages in full for translation.
---

# DeepWiki extraction, translation, and re-publication

DeepWiki (deepwiki.com) renders AI-generated wiki pages for GitHub repos. This skill covers pulling the COMPLETE wiki (all pages + all mermaid diagrams) out of the raw HTML and producing translated/re-published artifacts. User expectation (정혁, verified 2026-08-09): **every page and every diagram of the original must be present** — partial coverage gets rejected ("내용이 잘렸다", "원본이랑 다르게 내용이 덜 들어갔다").

## Step 1 — Enumerate ALL page URLs (critical)

The sidebar lists ~30 items but they are NOT all separate pages. Two URL shapes exist:

- Top-level: `/centrifugal/centrifugo/4-server-apis`
- Sub-pages: `/centrifugal/centrifugo/4.1-http-rest-api`, `4.2-grpc-api`, `4.3-api-protocol-and-command-execution`, ...

**Pitfall:** a regex like `href*="/centrifugal/centrifugo/\d+-"` matches only top-level pages and silently drops every `N.M-` sub-page. Filter with `/\d+\.\d+-|\d+-/` or just collect all `a[href*="centrifugo"]` hrefs via browser_console and dedupe. Count expected pages (29 for centrifugal/centrifugo: 9 top-level + 20 sub-pages) before starting.

## Step 2 — Pull the full wiki markdown out of the HTML

Each page's HTML embeds the ENTIRE wiki as Next.js RSC stream chunks. Do NOT rely on web_extract (it returns text but loses all diagram content).

```python
import re, json
html = open("/tmp/page.html", encoding="utf-8").read()  # curl -sS the page
chunks = re.findall(r'self\.__next_f\.push\(\[1,"(.*?)"\]\)</script>', html, re.DOTALL)
def unescape(s):
    try:
        return json.loads('"' + s + '"')
    except Exception:
        return s.replace("\\n", "\n").replace("\\t", "\t").replace('\\"', '"')
# Page markdown lives in alternating text chunks starting at index 9:
# chunk[9]="# Overview", [11]="# Architecture Overview", [13]="# Core Concepts and CLI", ...
# Each page markdown starts with "# <Title>\n\n<details>\n<summary>Relevant source files..."
# Strip the "N:Txxxx," prefix: md = re.sub(r'^\d+:T[0-9a-f]+,', '', unescape(chunks[idx]))
```

The full raw markdown of every page (with ` ```mermaid ` fences inline) is one curl + parse away. Save each page to `/tmp/dw_pages/NN_<slug>.md`.

## Step 3 — Rebuild the original mermaid diagrams

- Diagram source is inline in the markdown fences: ` ```mermaid\ngraph TB\n...\n``` `. Web extraction cannot see them because DeepWiki renders diagrams as graphics, not text.
- To embed an original mermaid block in an HTML artifact, HTML-escape the source (`<` → `&lt;`, `>` → `&gt;`, `&` → `&amp;`) and wrap in `<pre class="mermaid">`. The browser decodes entities back via textContent, so mermaid parses the true source.
- Rendering check: after load, `document.querySelectorAll('.mermaid svg').length` should equal the number of diagrams. It is NORMAL for `<pre class="mermaid">` elements to remain in the DOM with the SVG inside them (mermaid appends rather than replaces in this setup) — that is a rendered diagram, not a failure. Do not "fix" it.
- For content of diagrams that are graphics-only in the a11y tree, read the `graphics-document` nodes' inner text from a full browser snapshot to verify what a diagram shows.

## Step 4 — Translate (parallel batch)

For a 20+ page translation job:
- `delegate_task` batches of 3 (max_concurrent_children=3). Give each subagent: the source `.md` path, the exact output file path, an explicit HTML template (lang=ko, mermaid CDN `https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js`, `mermaid.initialize({startOnLoad:true})`, the CSS block, a `.note` footer with the source link), and these rules:
  - translate ALL sections including the `Relevant source files` `<details>` block
  - keep code identifiers / file paths / English proper nouns as-is
  - mermaid → `<pre class="mermaid">` + escaped source; heading above each diagram (Korean + English)
  - markdown tables → HTML `<table>`, code fences → `<pre><code>`, lists → `<ul>/<ol>`
  - "Sources:" → "출처:"
- Files land on disk; the orchestrator publishes them (children cannot publish reliably).

## Step 5 — Publish to Artifact Hub

- `project` per user convention (e.g. `centrifugo` for the Centrifugo series; `default` for ad-hoc research). **Always pass `project` on publish AND update** (see artifact-hub-publishing skill: omitting it on update silently creates a duplicate under `project=default`).
- Naming convention used for the Centrifugo series: title `Centrifugo 아키텍처 노트 — N. 제목 (English Title)`, slug `centrifugo-deepwiki-NN-<slug>-ko`, format `html`, visibility `link`.
- After publishing, `list_artifacts(project=...)` and check every expected doc is present; re-check at the end (a batch can silently skip an item — 19/20/21 were missed once).

## Step 6 — Verify

- `curl -sS -L` each raw URL: HTTP 200 + `mermaid.min.js` + `class="mermaid"` + Korean markers.
- Browser-open one representative doc: `.mermaid svg` count > 0.
- Compare against the page inventory from Step 1 — count == expected.

## Reference

`references/centrifugo-wiki-map.md` holds the page-to-chunk mapping for the centrifugal/centrifugo wiki (29 pages, 125 diagrams) used to validate extraction.
