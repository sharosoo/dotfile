---
name: multilingual-font-engineering
description: Use when researching or extending multilingual fonts.
---

# Multilingual font research and extension

Triggers: e-ink/e-reader fonts, "does font X support script Y", adding Hangul/CJK to a Latin font, merging fonts, judging cross-script harmony, picking an OFL base font. Answer with **measured evidence** (glyph coverage, stem/contrast/x-height numbers, licences), not impressions.

## Procedure

1. **Find the real source.** `web_search` the font, then `git clone --depth 1` its repo. Read README, `build.py`, `AGENTS.md`, CHANGELOG. Lineage (derived-from chain) and build pipeline are usually stated there.
2. **Verify coverage from the data, not the README.** For FontForge `.sfd` sources, regex `^Encoding: (\d+) (-?\d+)` and count codepoints per block (Hangul syllables AC00-D7A3, Jamo 1100-11FF, compat jamo 3130-318F, CJK 4E00-9FFF). For release TTFs use `fontTools` `getBestCmap()`.
3. **Check licence before proposing a base or merge.** OFL permits modify/merge/redistribute, but modified versions must not use a Reserved Font Name (RFN) without written permission. Fonts whose licence forbids modification (e.g. KoPub) are not usable as bases. Read each candidate's licence page, not memory.
4. **Measure style parameters** with `scripts/measure_latin.py` and `scripts/measure_hangul.py` (PIL/FreeType render, em-normalised; setup in Pitfalls). Compare against the reference font, and against its upstream instanced at the same weight/opsz to see what the derivative actually changed.
5. **Search for precedents** before inventing: community merges (a Latin e-book serif + Korean batang) and how foundries paired scripts. Cite source URLs.
6. **Report** in the user's style (Preferences): lineage, coverage verdict, candidates with numbers, recommendation, and what was NOT verified.

## Domain knowledge

- Cross-script harmony factors: perceived size (Latin x-height vs Hangul face/centroid), typographic colour (blurred ink density, not just stem width; Hangul is denser so its stems are usually thinner), contrast and terminal/serif shape, vertical alignment, spacing rhythm, construction (round vs square), shared punctuation/digits.
- Most are numeric and optimisable (scale, baseline shift, weight axis/outline offset, tracking against a render-and-compare loss using the target renderer). Serif/terminal character and overall personality are not; leave those to human judgement last. Generative Hangul from a Latin reference is research-grade; pick the closest existing OFL Hangul font and tune it.
- E-ink: CrossPoint `cpfont` is 2-bit greyscale (see Libron `scripts/build_cpfont.py`), so hairlines under ~1px vanish. Prefer thicker hairlines/low contrast, larger x-height, open apertures, relaxed spacing. Kobo `kobo-font-fix` (KF) strips TrueType hints and adds a legacy kern table; CrossPoint bundles are one TTF per style, so Hangul there needs a merged font.
- Derivative precedent: Readerly/Libron edit a base font (instanced weight/opsz, scale, condense, hand-edited serifs). The author's answer to missing scripts is to switch base fonts, not extend.
- Pairing precedents: Pretendard (Inter + Source Han Sans K + M PLUS), Sarasa (Iosevka + Source Han Sans), Source Han/Noto Serif (Latin from Source Serif), community RIDIBatang + Literata mods. Korean serif candidates with measured numbers: `references/korean-serif-candidates.md`.
- Vertical alignment of Hangul vs Latin is decided by the Hangul bottom edge against the baseline, not by ink centroid; pick `--dy` from a guide-line sheet (see pipeline reference). Web packaging (woff2, KS X 1001 subset, unicode-range slices), demo page and Tailscale serving: `references/web-font-packaging.md`, `scripts/build_web.py`, `templates/font_demo.html`.
- Nerd Font = a monospace font patched (`font-patcher`, FontForge) with icon glyphs in the Private Use Area (U+E000-F8FF, Material at U+F0000+). A proportional reading serif like Libron (isFixedPitch 0, i=650 vs m=1883 units) is useless in terminals; it would need redrawn fixed-width Latin and 2-cell Hangul. Recommend patching an existing monospace Hangul font (e.g. D2Coding) instead.
- Proven build chain (merge -> tune -> KF/cpfont): `references/hangul-merge-build-pipeline.md`, scripts `scripts/merge_hangul.py`, `scripts/render_mixed.py`.
- Merge steps for Latin+Hangul: instance variable fonts (`fontTools.varLib.instancer`), unify UPM, scale Hangul to Latin x-height, subset (modern 11,172 + compat jamo + Korean punctuation; hanja optional for size), upright Hangul for Italic styles (no Hangul italics), merge with `fontTools.merge` or FontForge, keep only Latin GPOS/kern, rename (RFN), retain both licences.

## Preferences (this user)

- Korean 반말, short and technical. Lead with the verdict, then evidence. Discord: no markdown tables; use bullets.
- Separate verified facts (opened/measured) from background knowledge; say what is unverified.
- End with one concrete next step as a single question (e.g. "render a mixed sample?").
- Conceptual follow-ups ("what makes X look the same") get a structured factor list plus what can be automated, not a tutorial.
- When the user is choosing between candidates, deliver several labelled variants as stacked sample sheets (gray + 2-bit) with one number per variant, not a single "best" pick. Adjust from their one-line verdict (e.g. "Hangul looks big" -> shrink `--k`); once they pick a letter, build the full 4-style set plus KF/cpfont without asking again.
- Once the user says a parameter fits (size, alignment, a variant letter), freeze it: do not re-tune it, kill or discard in-flight experiments on it, and rebuild the final set (4 styles + KF + cpfont) with it. Re-run measurements if a measurement bug is found and say plainly which earlier numbers were wrong.
- Tell them the files' location (`~/workspaces/<project>/out/` or `dist/eink`, `dist/web`) and what remains unverified (no real-device test). When asked for a demo, serve it on the Tailscale address and give both IP and MagicDNS URLs.
- Do not use `pkill -f <script>` from the same command line (the pattern matches the shell itself and kills it); check with `ps` and let finished jobs be.

## Pitfalls

- **PIL canvas clipping / anchor**: draw with `anchor='ls'` (baseline at y), baseline ~1.3-1.6x font size from the top, canvas >= 3x font size tall. PIL's default anchor `la` puts the *ascender* at y, so a baseline-style y pushes glyphs off the canvas: heights read 0.5em and ink ratios skew (ink even changed when Hangul was merely shifted up, which exposed the bug). Before trusting numbers check that x-height differs from cap-height and that ink is unchanged when the same glyphs are shifted vertically. Re-derive any ratio chosen from an unchecked measurement.
- **fontTools/PIL/numpy are not preinstalled**: make a venv in the scratch dir and `pip install fonttools brotli pillow numpy`.
- **Variable fonts**: instantiate before measuring (opsz and wght both matter; Newsreader opsz9 vs opsz72 hairline/stem is 0.65 vs 0.22).
- **GitHub downloads**: `curl -L -A Mozilla`; list a dir via `api.github.com/repos/<o>/<r>/contents/<path>` for exact file names (google/fonts: `ofl/<family>/`); jsDelivr can fail for tags, raw.githubusercontent.com is the fallback. Search-engine snippets of build scripts are garbled, so read the cloned file.
- **Jamo-based stem measurement is approximate** (compat jamo ㅣ/ㅡ may differ from in-syllable strokes); say so, and measure real syllables for decisions.
- A single-weight measurement does not rank fonts with a weight axis; compare at matched stem width.
- Never claim a font "has Korean" from marketing text; verify the cmap or source file.
- **Vision models are unreliable for typographic colour**: use `render_mixed.py` ink ratio for weight/size decisions and vision only to check for tofu/missing glyphs.
- **Python edit scripts chained after a rejected command never ran**: after patching a build script, grep the file to confirm the edit landed before rebuilding (a style-name bug survived one rebuild this way).
- **`pathops.op` rejects conics**: call `convertConicsToQuads()` on the stroked path before the union, and request `fix_winding=True` so TrueType gets correct direction.
