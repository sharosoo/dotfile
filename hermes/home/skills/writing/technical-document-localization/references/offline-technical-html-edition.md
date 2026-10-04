# Offline technical HTML edition: math, references, and reader UI

Use this reference when a translated technical report is delivered as a standalone HTML reader rather than plain Markdown/PDF.

## Reader UI preference

For this user's long-form technical HTML, content comes first. Do **not** add decorative utility controls such as `목차`, `명암`, or `인쇄` buttons unless explicitly requested. If navigation is useful, a quiet desktop table-of-contents list is acceptable; avoid making the document feel like a demo application. On narrow screens, hiding nonessential navigation is preferable to adding a toggle button by default.

When removing controls, remove dependent event handlers, saved-theme initialization, selectors, and mobile-open states together. Validate that there are zero `<button>` elements and no console errors from missing nodes.

## Keep canonical English technical terms

Do not coin literal Korean calques merely because the surrounding prose is Korean. Keep an established English term when it is clearer to practitioners, then make the surrounding Korean grammar natural.

Examples from LLM systems writing:

- `test-time scaling`, `test-time compute`, `test-time reasoning`
- `reasoning effort` / `reasoning effort level`
- `scaling law`, `scaling efficiency`
- `thinking token`, `adaptive thinking budget`

After replacement, proofread particles and collocations (`compute가`, `compute를`) and replace half-translated compounds such as `scaling 법칙` with the canonical unit `scaling law`. This is a context-sensitive terminology pass, not a blind Englishization rule.

## Offline mathematical typesetting

### Preserve source; transform at build time

1. Keep the source fragments' equation transcription unchanged for provenance and structural audits.
2. Maintain an explicit ordered mapping from each source equation block to reviewed LaTeX plus its stable ID (`eq-1`, …). Include `None` for deliberately unnumbered formulas.
3. During the build, count source equation blocks and abort if the count differs from the mapping.
4. Render LaTeX server-side with KaTeX using `displayMode`, `throwOnError`, and `htmlAndMathml` output.
5. Replace only generated-output equation containers. Do not rewrite code blocks that happen to contain mathematical symbols.

### Make standalone really standalone

Do not rely on a CDN or client-side renderer for a single-file deliverable. Embed KaTeX CSS and WOFF2 font files as data URLs. The final HTML then opens offline, has no rendering race, and retains accessibility MathML.

### Math verification

Check all of the following after the final build:

- rendered equation count equals the source mapping count;
- one MathML `<math>` block per rendered equation;
- numbered equation IDs are complete and unique;
- raw equation `<pre>` blocks are zero in the generated deliverable;
- KaTeX fonts report loaded in the browser;
- every equation has nonzero width and height;
- long formulas are contained by an `overflow:auto` equation wrapper;
- visually inspect representative hard cases: multi-line aligned equations, cases, fractions, underbraces, Korean `\text{}`, and the longest formula;
- no console errors.

## Internal cross-reference mapping

### Stable target IDs

Assign or preserve stable targets for:

- chapters and sections;
- figures (`fig-N`);
- numbered tables (`table-N`);
- numbered equations (`eq-N`);
- algorithms (`algorithm-N`);
- footnotes;
- references (`ref-N`).

Build the section-number mapping from the actual document IDs. Do not assume all chapters share one naming convention: merged fragments may use `section-*`, `sec-*`, and semantic appendix IDs.

### Link only prose text nodes

Create links only in ordinary prose. Skip these regions:

- existing `<a>` elements;
- `code`, `pre`, scripts, styles, MathML/SVG;
- equation containers;
- figure/table captions, where the number labels the current object;
- the bibliography itself.

A lightweight `HTMLParser(convert_charrefs=False)` reconstruction is safer than whole-document DOM reserialization when exact attributes and whitespace are audited. Use one combined matcher for citations, sections, figures, tables, equations, and algorithms so newly inserted anchor markup is never processed again.

For grouped citations such as `[140, 63]`, link each number while preserving brackets, commas, and spaces.

### Exact-source backlinks are part of the link contract

A forward link is not complete when it drops the reader dozens of pages away without a way back. For this user's long-form technical HTML, every body-originated internal link must support an exact return path for sections, figures, tables, equations, algorithms, footnotes, and bibliography entries.

Use a compact text link such as `↩ 이전 위치`, not a new utility button. The backlink must return to the precise inline anchor that was clicked—not merely the top of the referring section and not just the first citation of that target.

For targets referenced from multiple places, use this runtime pattern:

1. On each body internal-link click, assign the source anchor a collision-free ID if it lacks one.
2. Create one backlink at the target on first use.
3. Update that backlink's `href` on every subsequent click so it points to the most recently clicked source.
4. Exclude the backlink itself from the forward-link handler so returning does not create another backlink.
5. Put table backlinks inside the `caption` (or an external wrapper), because an `<a>` cannot be a direct child of `<table>`.
6. Keep the backlink visually quiet and verify it does not overlap equations or captions.

Do not use `history.back()` as the only implementation: it is sensitive to unrelated browser history and does not encode a stable source target. See `templates/exact-source-backlinks.js` for a reusable event-delegation implementation.

### Link verification

Static audit:

1. Collect every ID and every `href="#…"`.
2. Require duplicate IDs = 0.
3. Require every internal target to exist exactly once.
4. Count generated links by kind and save a link report.
5. Confirm captions and references were not self-linked.

Runtime audit:

- Load the actual standalone file, not only the split HTML.
- Click one representative forward link of each kind (section, figure, table, equation, algorithm, footnote, bibliography).
- At each target, click `↩ 이전 위치` and require the hash to equal the exact source-anchor ID.
- For a multiply referenced target, click two different source links in sequence; require the target backlink to update and return to the second source rather than the first.
- Visually inspect backlinks on a long equation, figure, and table to catch overlap or invalid placement.
- Confirm the URL hash, target ID, and target text agree.
- Include JavaScript-generated TOC links in the runtime broken-link audit.

## Derived-artifact completion gate

Any change to prose, equations, IDs, links, styles, or controls invalidates earlier build results. Regenerate and recheck, in order:

1. combined HTML;
2. structural and link validation reports;
3. standalone HTML with embedded figures/fonts;
4. language/preservation audit against the original fragment baseline;
5. coverage report;
6. package ZIP;
7. ZIP CRC (`unzip -t` or `ZipFile.testzip()`);
8. final browser runtime and console checks.

Do not report old file sizes, hashes, or PASS results after a later build.
