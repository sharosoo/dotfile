# arXiv paper → 쉬운 한국어 해설 + inline figures (정혁 workflow)

Validated 2026-08 on arXiv `2608.09867v1` ("Stealing Reasoning Traces from Proprietary LLM APIs").

## When this applies

User gives an `arxiv.org/html/<id>` URL and asks for a Korean version with figures preserved, then (usually after a first markup-preserving attempt) says to make it easy to read and drop the paper structure. Deliverable = reader-first Markdown + standalone HTML, both with every figure inline, published to Artifact Hub (md first, then html, same `(project, slug)`).

## Figure inventory — don't trust conversion counts

A mechanical HTML→Markdown conversion reported "images 12", then "images 1", while the real answer was 31 `<img>` instances / 19 unique figure files. Always map against the source `/tmp/paper.html`:

- `<img src="<id>/<name>.png">` = raster figures.
- `<object data="<name>.svg">` = vector figures (the majority on modern arXiv HTML).
- Some `<figure>` blocks are **text diagrams** (e.g. an injection-scheme diagram rendered as text/HTML, not an image) — they have a caption but no image file. Don't count them as images.

Count **unique figure files**, not `<img>` tags and not whatever the converter reports. The figure→file mapping is the source of truth for "그래프 그대로 추가".

## SVG → webp rasterization (payload reduction)

Raw arXiv SVGs as `data:image/svg+xml;base64,...` are 100–300 KB each; embedding them all blew the Artifact Hub publish (a ~17 MB body got truncated server-side mid-image). Fix:

1. Decode each SVG, write to a temp `.svg`.
2. `convert -background white -density 120 in.svg out.png` (ImageMagick `convert` handles most arXiv SVGs; no rsvg/inkscape needed).
3. Re-encode PNG → webp with PIL (`Image.open(...).save(buf, "WEBP", quality=...)`) for the big size cut (or convert straight to webp).

Result: 19 figures ≈ 1.4 MB markdown/HTML, publish succeeds with `warnings: []`. SVG stays visually faithful; the vector→raster trade is forced by the payload ceiling, not a preference.

## Placeholder-based assembly (avoid the 8K write_file stream limit)

Never put base64 into a `write_file`. Pipeline:

1. Write the Korean narrative in 3–4 small chunk files (`chunks/c1.md`…), each < ~7 KB, using `[[IMG:filename]]` placeholders where a figure goes.
2. Extract the filename→base64 map once and cache it as `figmap.json`. **Do not re-extract the map from the very file the assembler is about to overwrite** — after the first assemble the alt-text changes and the next run fails with `MISSING FIGURE`. `figmap.json` must be a stable side file.
3. `assemble.py`: load `figmap.json`, concat chunks, `re.sub(r'\[\[IMG:([^\]]+)\]\]', ...)` → `![name](data:image/webp;base64,...)`.
4. Deterministic and idempotent as long as `figmap.json` is stable. Verify: `missing placeholders == []` and `set(figmap) - set(used) == set()`.

## Linter cleanup (Artifact Hub md publish)

- Colon in any H2/H3 heading → em dash (`배경: ...` → `배경 — ...`), else `prefer-table`.
- `- **label**: text` bullets → `- **label** — text`. One regex also handles the blockquote-bullet `> - **label**:` and the paren variant `- **label** (paren):`:
  ```python
  re.sub(r'(?m)^(\s*(?:>\s*)?-\s*)\*\*([^*]+?)\*\*((?:\s*\([^)]*\))?)\s*:\s*', r'\1**\2**\3 — ', s)
  ```
- `empty-section`: an H2 followed immediately by its first H3 with no prose → add one intro sentence under the H2 before the first H3.
- Bold spans must not contain parens or quotes (renderer breaks): `**증류(distillation)**` → `**증류** (distillation)`, `**불투명한(읽을 수 없는) X**` → `**불투명한** (읽을 수 없는) X`, `**X "quote"**` → `**X** "quote"`. Regex `\*\*([^*]+?)\s*\(([^()]*)\)\*\*` handles the trailing-paren case.
- Republish and iterate until `warnings: []` on BOTH the md and html publish.

## Korean-review pass — the user chains this after the rewrite

The easy-rewrite draft is NOT the final artifact. 정혁 follows up with "korean-review 스킬 돌려서 자연스럽게". Run the audit from `korean-technical-blog-rewriting`: inventory awkward phrases as a table (location · phrase · why · direction) and deliver it in the reply, fix families in one pass, grep the ban list (`갈래|줄기|줄거리|구조 축|핵심 축|포인트는|취지다`), then republish md+html. Translationese that surfaced on this paper: `네 갈래` → `네 가지`, `~쪽으로 이동했다` → `~따라가게 됐다`, `~에 있어서` → `~있으니`, `몇 안 되는 실용적 인터페이스 중 하나` → `몇 안 되는 실용적 수단`, `새로운 줄다리기` → `함께 잡는 게 더 복잡해졌다`, `정보에 입각한 결정` → `제대로 판단한 결정`, `구조적 불투명성` → `내용이 보이지 않기 때문에`.

## Verify

- `read_artifact` for the md version: confirm the new H1 + reader-first structure, and zero leaked paper headings ("Setting Up Coordinates", "Introduction", "Decoding Reasoning at Scale").
- Raw HTML: `curl -sS -o /tmp/vN.html "https://artifact-content.sharosoo.com/raw/<id>?v=N"`, then `grep -c 'data:image/webp;base64'` == figure count. Confirm 0 `<script>` and 0 external image/CSS deps **from your content** — the wrapper injects an empty `<script>` and its own toolbar hrefs; only legitimate external text links (the arXiv source URL, an example attack domain quoted in the body) should remain. A base64 data URL can contain `//`, so external-asset regexes that match `//` false-positive on data URLs — test with `src/href=...` extraction, not a bare `//` grep.
- Publish md first, then html, same `(project, slug)`; both append versions. Report the two `?v=N` raw links + the detail page.
