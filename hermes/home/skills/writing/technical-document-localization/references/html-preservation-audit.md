# HTML preservation audit for technical localization

Use this checklist after rewriting prose in a structured HTML fragment.

## Baseline invariants

Compare the edited file against the designated pre-edit copy:

- Count every opening tag by tag name.
- Compare ordered values of `id`, `href`, and `src` attributes.
- Compare every `<pre>` block byte-for-byte; compare `<code>` blocks too when their content was frozen.
- Compare numeric anchors and citation markers as multisets.
- Compare frozen sections such as references and contributor tables byte-for-byte.

Tag-count equality alone is insufficient: a link target, figure source, equation, or identifier can change while tag counts remain identical.

## Safe bulk replacement pattern

For reports where each paragraph occupies one line, use an exact mapping of old block to new block. Before replacing, require `count(old) == 1`. Abort rather than guessing if a source block is absent or duplicated. This preserves surrounding markup more reliably than parsing and reserializing HTML.

## Sentence-change estimate

Strip frozen sections and markup, split visible prose into sentence-like units, then use sequence alignment to estimate how many source sentences changed. Report the source-side number as the primary approximation. If long sentences were split, optionally report the larger resulting sentence count as context.

Do not infer sentence changes from HTML line counts: a single line may contain an entire multi-sentence paragraph.

## Residual-term audit

Run a literal substring search and report:

1. Line number.
2. Full lexical item containing the substring.
3. Whether it is the targeted standalone term or merely part of a compound.
4. Why it remains.

Example: searching for `축` may return `단축` and `구축`. These are valid compounds and do not constitute an abstract “axis” metaphor. Report them rather than claiming zero raw occurrences.

## Numeric-token caution

A simplistic word-boundary regex can report a false numeric mismatch when a Korean particle is attached to a number or section reference, such as `0.95를`, `38%에`, or `§4.1.1과`. Conversely, extracting every digit will count model-name digits (`Kimi K3`, `GPT-5.6`) as factual measurements and can flag harmless subject elision as a number loss.

For a practical audit:

- allow Korean particles after numeric tokens;
- exclude digits immediately embedded in ASCII identifiers/model names;
- retain units such as `%`, `K`, `M`, `B`, and `T` with the number;
- investigate any mismatch in context rather than weakening the invariant blindly.

## Prose-only style scanning

Style scanners should examine narrative paragraphs, headings, and captions, while excluding frozen references, contributor lists, equations, code, and tabular/chart values. Otherwise original bibliography page ranges or `model — score` separators can be mistaken for AI-style punctuation.

Keep established technical compounds such as `key–value`, `Newton–Schulz`, `KDA–MLA`, `prefill–decode`, and `I–Love–Q`. Distinguish these from an em dash used to splice Korean prose. Report the two classes separately.

A zero-count requirement is appropriate for user-specified standalone banned terms and clear errors. For broad translationese candidates, compare before/after counts and manually review the remaining contexts.

## Final report template

- Target: absolute path
- Scope: sections rewritten and frozen regions
- Changed sentences: approximate source-side count
- Structure: tag counts, ordered attributes, frozen blocks, numbers, citations
- Residual term: each line and reason
- Blockers or unresolved mismatches: none, or an explicit list
