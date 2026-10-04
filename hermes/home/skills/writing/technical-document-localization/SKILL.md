---
name: technical-document-localization
description: "Use when localizing technical docs while preserving markup."
version: 1.2.0
metadata:
  hermes:
    tags: [translation, editing, technical-writing, html, preservation, korean]
    category: writing
---

# Technical document localization

Use this skill for full-document translation, localization, or prose correction when the target must retain the source's technical facts, document structure, equations, citations, links, and identifiers. It applies to HTML, Markdown, LaTeX-derived fragments, and similar structured technical reports.

## Core rule

Treat prose and structure as separate layers:

- Rewrite prose for the target language and register.
- Preserve technical claims, measurements, mathematical meaning, citations, identifiers, and markup.
- Do not “improve” the argument by adding facts, deleting qualifications, or changing scope.
- A successful edit is not complete until structure and factual anchors have been compared mechanically.

## Workflow

### 1. Establish the comparison baseline

1. Locate the target and its designated pre-edit or source copy.
2. Read the entire editable file before changing it.
3. Identify frozen regions such as references, contributor tables, generated equations, code blocks, and legal text.
4. Record the requested reporting fields before editing: absolute path, approximate sentence count, structural comparison, and any requested residual-term audit.

If no baseline exists, create a temporary copy before the first write. Do not silently use a nearby file whose provenance is uncertain.

### 2. Separate content classes

Classify each block as one of:

- Narrative prose: rewrite fully.
- Captions and headings: polish, but preserve numbering and referents.
- Equations and code: preserve byte-for-byte unless explicitly asked to edit them.
- Bibliography and names: normally freeze.
- Attributes and identifiers (`id`, `href`, `src`, anchors): preserve exactly.
- Technical terms: retain established English terms when Korean translation would reduce precision or conflict with the rest of the report. After changing a term, proofread Korean particles and replace half-translated compounds with the canonical English term as a unit.
- Reader UI: for this user's long-form technical HTML, do not add utility/demo controls such as `목차`, `명암`, or `인쇄` buttons unless explicitly requested. Prefer quiet content-first navigation.

### 3. Edit in natural Korean technical prose

For Korean localization:

- Prefer explicit subjects and direct predicates over literal English nominalizations.
- Split overloaded English-style sentences, but preserve all clauses and qualifications.
- Replace translationese such as repetitive “~을 통해”, “~에 있어서”, “제공한다”, “보여 준다”, and abstract “~축” framing when a concrete relation is available.
- For this user's Korean deliverables, treat standalone `축` as forbidden even when it is a technically defensible translation of *axis*. Rewrite it contextually as `차원`, `방향`, `기준`, `관점`, `항목`, `좌표`, `가로 방향`, or `세로 방향`; never apply a blind substring replacement. Compound words such as `구축`, `압축`, `단축`, and `축소` are unrelated and remain valid.
- Keep mathematically meaningful forms such as “x에 대해” and established technical terms when they are precise; do not remove them mechanically.
- Use consistent terminology within a section. Do not cycle synonyms merely to avoid repetition.
- Preserve technical tokens, symbols, model names, units, percentages, section references, and citation markers.
- Avoid promotional inflation unless the source itself makes that claim.

Perform a second pass asking whether the Korean reads like a technical report written in Korean rather than a sentence-by-sentence translation.

### Korean prose quality gate

A mechanical preservation audit cannot establish prose quality. Before delivery, run a separate proofreading pass over the visible narrative text and captions. Check especially for:

- duplicated subjects or predicates introduced by rewriting (for example, `judge는 에이전트 judge는`),
- particles that no longer agree after a sentence was split,
- repeated English clause order even when individual words look natural,
- clusters of `~에 대해`, `~을 통해`, `제공한다`, `수행한다`, `활용한다`, and `할 수 있다`,
- terminology drift caused by synonym cycling.

Use frequency counts only to find candidates; inspect each occurrence in context. Mathematical `x에 대해`, an actual feature that “provides” an interface, and standard technical wording may be correct. Do not chase a zero count mechanically.

When the document is long or the first pass was model-generated, prefer an independent second editor or reviewer. Use `references/independent-second-pass-ko.md` for a source-aligned Korean second-pass checklist. After that pass, rerun every structural invariant against the original pre-edit baseline, not merely against the first-pass copy.

### Translation-specific block strategy for large HTML papers

For full-paper HTML translation, do **not** send every inline text node independently to a translation service. Inline nodes split sentences around `<span>`, citations, math, and line breaks; translating them independently produces duplicated fragments, English leftovers, broken punctuation, and captions such as `Top:`/`Bottom:` that no longer agree with the surrounding prose. Instead:

1. Freeze and hash the original HTML before editing.
2. Identify block-level prose units (`p`, headings, captions, list items, table cells), while treating inline markup as placeholders.
3. Translate one complete block at a time, restoring the original inline tags, citation links, math, code tokens, and identifiers byte-for-byte.
4. Keep bibliography entries and mathematical annotations frozen unless the user explicitly asks for their localization.
5. Run a residual-language audit over visible prose; a high-level Korean-character count is not enough. Inspect remaining English headings, labels, captions, and mixed-language sentences.
6. If using a machine-translation endpoint, treat it as a first pass only and perform a second Korean proofreading pass on terminology, particles, sentence boundaries, and figure/table captions.

For arXiv HTML figures with paths such as `2608.09867v1/figure.png`, resolve the path against `https://arxiv.org/html/`, not `https://arxiv.org/html/2608.09867v1/`; the latter duplicates the version directory and returns 404. For a standalone artifact, embed fetched image bytes as data URLs and verify image signatures, counts, and rendered dimensions. arXiv papers also ship vector `<object data="...svg">` figures — rasterize those to webp before embedding (raw SVG data URLs blow the publish payload), and reconcile the figure count against the source's `<img>`+`<object>` list, never a converter's reported count; see `references/arxiv-paper-korean-rewrite.md`.

### Reader-first rewrite mode (정혁 — paper → 쉬운 해설)

When the user asks to localize a paper but explicitly says to **drop the paper's structure** ("논문 스타일 유지하지 말고", "이해하기 쉽게", "쉽게 읽는 해설"), do NOT run the markup-preserving block translation above. Switch to a reader-first rewrite:

- Rebuild the document around reader questions instead of the paper's numbered sections: 한 줄 요약 → 배경(왜 문제인가) → 핵심 아이디어/약점 → 저자가 실제로 한 실험·공격 → 결과 숫자 → 대응책 → 한계·윤리 → 결론, then a closing "부록 — 원본 그래프 모음" for the remaining appendix figures.
- Keep every original figure inline (data URL), placed next to the prose that uses it; appendix figures go in the closing gallery with a short plain-Korean caption each.
- Plain 합니다체, short sentences, concrete numbers. Keep canonical English technical terms (reasoning trace, distillation, prefill, jailbreak, AEAD) where a Korean gloss would lose precision; gloss once in parentheses on first use.
- The reader must never see the paper's section hierarchy or citation markers, and must never see leaked sub-headings from decoded content (e.g. "Setting Up Coordinates").
- Large vector figures must be rasterized before embedding (arXiv SVG data URLs blow the publish payload). See `references/arxiv-paper-korean-rewrite.md` for the figure-inventory, SVG→webp payload-reduction, placeholder-assembly, linter-cleanup, and verify pipeline.
- The first easy-rewrite draft still carries translationese (`네 갈래`, `~쪽으로 이동`, `~에 있어서`, `정보에 입각한 결정`, `몇 안 되는 인터페이스 중 하나`, `새로운 줄다리기`) — the user will typically follow up with "korean-review 스킬 돌려서 자연스럽게". Chain the translationese audit + family fixes from `korean-technical-blog-rewriting` (deliver the location·phrase·why·direction table in the reply), then republish both md and html.

### 4. Apply edits safely

- Prefer targeted patches for a few sections.
- For a long file with many small corrections, group deterministic exact replacements into bounded batches and verify each batch. Do not consume the entire tool budget on one replacement call per phrase; reserve capacity for final diff review and a full preservation audit.
- For many one-line HTML paragraphs, exact old→new block replacement is safer than reparsing and reserializing the document, because serializers may reorder attributes or normalize whitespace.
- Require each replacement source to match exactly once. Abort on zero or multiple matches.
- Never rewrite frozen sections as collateral damage.

### 5. Verify mechanically

Compare the edited file with the baseline. At minimum verify:

1. Tag counts by tag name.
2. Ordered `id`, `href`, and `src` values.
3. Equation/code block contents (`pre`, and `code` where required).
4. Numeric token and citation-marker multisets.
5. Exact equality of frozen sections.
6. Presence and line location of any specifically requested residual word or pattern.

A mismatch must be investigated, not waived. Beware audit regexes that mistake a Korean particle appended to a number or section reference for a changed numeric value; compare tokenization carefully or restore spacing/conjunctions that preserve the original anchor visibly.

See `references/html-preservation-audit.md` for a compact source-vs-target audit design and reporting checklist.

For interactive HTML, static parsing is not enough: JavaScript may generate duplicate IDs, broken table-of-contents targets, or runtime-only layout defects even when the source file passes. After the final build, open the actual deliverable in a browser and apply `references/browser-runtime-delivery-audit.md`. If that check changes the build script or output, regenerate every derived artifact, coverage report, archive, size, and hash before delivery.

For a single-file technical HTML reader with mathematical notation and cross-references, also apply `references/offline-technical-html-edition.md`. It covers server-side KaTeX+MathML with embedded fonts, stable equation/table/reference IDs, safe text-node linkification, exact-source `↩ 이전 위치` backlinks for multiply referenced targets, removal of unwanted UI controls and dependent JavaScript, representative round-trip click tests, and the derived-artifact rebuild order. Reuse `templates/exact-source-backlinks.js` rather than hand-writing the backlink event logic each time.

### 6. Report completion

Report only verified facts:

- Absolute target path.
- Approximate number of source sentences changed. If sentence splitting changed the count, state both the source-side estimate and resulting count when useful.
- Structural comparison result, including the invariants checked.
- Every remaining occurrence of a requested word, with line number, containing lexical item, and reason it remains.
- Any frozen regions intentionally left unchanged.

For substring audits, distinguish a standalone term from a syllable inside an unrelated word. For example, a search for `축` may find `단축` or `구축`; report these as substring matches and explain why they are legitimate rather than claiming the file contains no matches.

## Pitfalls

- Do not claim “structure preserved” from visual inspection alone.
- Do not count changed lines as changed sentences when each paragraph occupies one HTML line.
- Do not edit references or contributor names merely to make the whole file look uniformly localized.
- Do not delete a requested residual term blindly; technical uses may be correct.
- Do not report zero occurrences when a raw substring search still finds compound words.
- Do not leave temporary editing or audit scripts beside the deliverable.

## Completion gate

Finish only when the prose pass and the mechanical audit both succeed. If a structural invariant fails, repair the file and rerun the full audit before reporting completion.
