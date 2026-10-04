# Batch external-blog → Korean translation: hardening notes

Companion to the **Batch mode** section of `external-article-ko-translation.md` (feed enumeration, BRIEFS bundle, shared TRANSLATION_SPEC, one-subagent-per-article, figure harvest from the live DOM). Read that first; this file only records what that procedure misses in practice. Validated 2026-09-11 on the full vLLM blog window (14 posts at once, `project=vllm-blog`, all 14 read-back byte-exact, raw + detail 200, 72 figures verified as rendered pixels).

## 1. Check every extracted body for truncation before translating

The extractor returns a head+tail window once a page is large, with a `[... middle omitted — see footer ...]` marker and a footer pointing at the full cached text under `~/.hermes/cache/web/<host>-<hash>.md`. One of 14 posts (110KB) was cut this way with ~1,075 middle lines missing — including whole sections (`Training a speculator…`, `Summary`, `Future work`, `References`, an 84-table appendix).

- Detect with `grep -l "middle omitted" <src_dir>/*.md` over the whole batch, not per article while translating.
- The cached file is the complete text. Prove it by comparing the overlapping head and tail byte-for-byte against the windowed extract before switching.
- Put the instruction in every child's brief: “this file may be truncated — if you see a marker, recover from the cache and report it.” One child caught it; a batch without that line would have published a silently partial appendix.

## 2. Inline math is dropped, not just images

`web_extract` also strips MathJax, which leaves sentences like “assumed policy , therefore” with the symbol gone. Count `<mjx-container` in the raw page HTML per URL; only the pages that contain math need this:

```python
blocks = re.split(r"<mjx-container", raw)
for b in blocks[1:]:
    seg = b.split("</mjx-container>")[0]
    codes = re.findall(r'data-c="([0-9A-Fa-f]+)"', seg)
    print("".join(chr(int(c, 16)) for c in codes))   # 1D70B -> 𝜋, 37 -> 7
```

Read the surrounding text before/after each container to know which value belongs to which sentence. In this batch only 2 of 14 pages had math; do not run it everywhere. **A translator that hits a missing value must never invent one** — mark `…` and disclose, then the parent fills the real value from this decode before publishing.

## 3. Two small scripts beat ad-hoc fixes

The spec keeps translators from writing bad Markdown, but chunk-joining and hand-written sections still leave two systematic defects. Fix them mechanically on the composed bodies:

- **Intro insertion + blank lines.** Any `## ` heading immediately followed by a list/table/fence gets one plain intro sentence (fixes `empty-section`); any missing blank line before `## ` or `---` is restored (fixes the setext trap). Heading-aware, so it does not touch code fences.
- **Preflight.** Run the skill's `scripts/preflight_ko_markdown.py` over the whole directory in one pass and iterate until `errors 0 / warnings 0`. All 14 bodies reached zero without a single corrective republish.

Also run `scripts/sanitize_github_markdown.py` — but it passes **angle-bracket placeholders inside inline code** (`` `"num_speculative_tokens": <N>` ``), which `no-raw-html` still rejects. Replace them with bare words (`N`, `matching-draft-checkpoint`) outside fences; leave the copies inside fenced code blocks alone, they are legitimate there.

## 4. Publish through a manifest, not a loop of one-off calls

One script, in-process MCP handler, body read from disk (largest body 94KB — `tool_call` would have truncated it). Key a `published.json` by filename with `id`, the **returned** slug, version, raw URL, detail URL, and the three verification booleans; skip entries already `verified` so a rerun is idempotent and resumable.

Verify each artifact three ways in the same script:

- canonical `read_artifact` byte-compare after stripping the two generated header lines (`# <title> (vN, md)`, `slug=… project=…`);
- raw URL `HTTP 200` **and** `rawbody.count("<img") >= source.count("![")` **and** literal `**` count `0`;
- detail page `HTTP 200` containing the returned slug.

Then close with a browser pass over 2–3 artifacts: every `img` must report `complete === true` and `naturalWidth > 0`, and the rendered text must contain zero literal `**`. A count of `<img>` tags is not proof that images render.

## 5. Publisher-side defects that look like publish failures

Before concluding a publish failed, rule these two out — both leave `read_artifact` byte-exact while every HTTP check 404s:

- **Literal `\n` in the MCP response.** `str(result)` reads `"Created v1\nLink: …\nDetails: …\nslug: …"`; a `Link: (\S+)` regex then swallows the URL *plus* `\nDetails:`, and every derived URL is garbage. Normalize with `txt.replace("\\n", "\n")` before parsing.
- **Slug rewriting.** Dots are stripped: requested `…-qwen3.8-ko` became `…-qwen38-ko`. Never persist the slug you sent; persist the `slug:` line from the response.

Both bugs reproduce as `HTTP 404 / 50 bytes` on raw and `HTTP 404 / ~9.8KB` on detail, i.e. exactly like a document that does not exist.
