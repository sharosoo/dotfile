# Nerd Font patching + web icon handling

## Patch environment
- `font-patcher` needs FontForge's python module. If FontForge is not installed and sudo is unavailable, run it in podman with `ghcr.io/nicoverbruggen/fntbld-oci:latest` (has FontForge + fonttools). Mount the unzipped `FontPatcher.zip` (pin version + sha256) read-only and an output dir:
  `podman run --rm -v PATCHER:/patcher:ro -v IN:/in:ro -v OUT:/out IMAGE python3 /patcher/font-patcher --complete --quiet --no-progressbars [flags] -out /out /in/font.ttf`
- One font takes ~15 s; run the 4-8 jobs from a thread pool.
- The patcher renames Reserved-Font-Name families itself (D2Coding -> D2Koding) and builds names like `D2KodingLigature Nerd Font Mono`.

## `--mono` breaks CJK monospace fonts
- `--mono` forces every glyph, including existing ones, to one cell. For a font whose Hangul advance is 2 cells (D2Coding: Latin 500, Hangul 1000) the Hangul advance drops to 500 while outlines stay 1000 wide, so Korean text overlaps.
- Use `--single-width-glyphs` for the terminal variant (only added icons are squeezed to one cell). Then restore `post.isFixedPitch = 1` and `OS/2.panose.bProportion = 9` if upstream had them.
- QA after every patch: advance of `A`, `i`, a Hangul syllable, icon bbox width (<= 500 in the mono variant), required PUA blocks present (Powerline E0B0, Seti E5FA, Devicons E700, Codicons EA60, Font Awesome F000, Material F0001, Octicons F400), ligature features (`calt`/`liga`) present only in the ligature build. Non-mono variants are expected to be non-fixed-pitch.

## Upstream facts worth knowing
- D2Coding ships plain and `ligature` builds (Regular+Bold, TTF+TTC); the ligature build only adds `aalt/calt/liga`. It already contains ~1,000 PUA glyphs (partial Powerline) but none of Seti/Devicons/Codicons/FA/Material/Octicons.
- Nerd Fonts states patched fonts are OFL; each icon set keeps its own license (see its license-audit). Ship `LICENSE-nerd-fonts.txt` and point to the audit in CREDITS.

## Web fonts for a coding font
- Ship the ligature build only; plain text via CSS `font-variant-ligatures: none`.
- Main woff2s exclude the PUA. Take icons from the patched Mono Regular and split into a BMP file (U+E000-F8FF, ~540 KB) and a Material file (U+F0000-FFFFD, ~380 KB), each declared with `unicode-range`, for weights 400 and 700 (same file). A page without icons never downloads them.
- Rename the family in the name table before subsetting (`graft.set_names`) so web files respect the Reserved Font Name.
- Browser check: `canvas.measureText` widths at 16px should be A=8, i=8, Hangul=16, icon=8.
