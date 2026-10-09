# Latin + Hangul merge -> Kobo KF / CrossPoint cpfont build pipeline

Proven end to end on Libron (Latin) + RIDIBatang (Hangul) with `scripts/merge_hangul.py` and
`scripts/render_mixed.py`. Output of the whole chain for 4 styles: ~12k glyphs, 7.5-8.8 MB TTF each.

## Loop that converged

1. Build candidates with `merge_hangul.py` (Regular only first), render with `render_mixed.py`,
   read the `ratio(h/l)` column. Pick by number first, then show the user a stacked sheet
   (gray + 2-bit PNG, one labelled row per variant, same text crop) and let them choose by eye.
2. Scale (`--k`) fixes "Hangul looks big": ink drops ~k^2 and the face height approaches the Latin
   cap height. For RIDIBatang k=1.0 -> 0.94 moved the ratio 1.00 -> 0.89 (k=0.90 -> 0.81) and the
   user picked 0.94 by eye. Add `--track 0.95` only if Hangul feels loose after shrinking.
   A ratio is a guide, not the target: the eye decides, and a confirmed k must not be touched again.
3. Weight between a family's static weights, or a Bold for a single-weight Hangul font: use
   `--embolden` (em per side). Tune it by building 3-4 values in parallel (python
   `ThreadPoolExecutor` + subprocess; shell `&` is rejected by the terminal tool) and choosing the
   value whose ratio equals the Regular's. RIDIBatang k=0.94 Bold vs Libron Bold needed ~0.0105
   (Regular 0.89, Bold 0.90); Maru Buri Regular +0.005 gave ~0.90 vs 0.76 unemboldened.
4. Build all four styles from the same settings: Italic = Latin Italic + the *Regular* Hangul;
   Bold/BoldItalic = emboldened Hangul. Verify nameIDs 1/2/4/6 per style afterwards.

## Vertical alignment (`--dy`)

A source Hangul font's face can sit low relative to the Latin. Measure the Hangul face centre (ink
bbox centre above baseline): Source Han / Noto Serif KR ~0.375em, RIDIBatang ~0.306em (x0.94 =
0.288), Maru Buri ~0.30; Libron cap-centre 0.349, x-height centre ~0.27. Ink centroids of Latin
and Hangul lines can match while the user still sees a mismatch, because the visible cue is the
Hangul bottom edge vs the baseline.
Do not guess: build 3-4 `--dy` values (0, +0.03, +0.06, +0.09 em), render one sheet with a large
mixed string and coloured guide lines (baseline red, x-height blue, cap-height green; Libron
0.531/0.698em), and let the user say which bottom edge sits right. The user picked +0.09em
(= the Source Han convention). `--dy` changes position only; it must not change ink. If it does,
the measurement is broken. If a size change is later requested, pin the bottom edge:
`dy' = dy_bottom_target + |bottom_at_k=1| * k` so the baseline fit survives the resize.

## Kobo (KF)

`kobofix.py` (pinned tag from nicoverbruggen/kobo-font-fix, run with `--preset kf <ttfs>`) writes
`KF_<Family>-<Style>.ttf` next to the inputs. It requires `ots-sanitize` on PATH: `pip install
opentype-sanitizer` ships the binary at `site-packages/ots/ots-sanitize` but not on PATH, so symlink it into
the venv `bin`. Run it on a copy of the TTFs (originals untouched).

## CrossPoint (cpfont)

- Converter: `lib/EpdFont/scripts/fontconvert_sdcard.py` + `cpfont_version.py` from the
  crosspoint-reader repo (Libron pins a commit in `scripts/build_cpfont.py`). Needs `freetype-py`;
  `font-line` for the line-gap step.
- It has interval presets including `hangul` (AC00-D7AF, 1100-11FF, 3130-318F); use
  `--intervals reading,hangul` for full Hangul. It also supports per-style `--fallback-*` fonts, a
  possible alternative to a merged font (not tried).
- Libron recipe to copy: `font-line percent 35` then set OS/2 typo asc/desc/gap = hhea values, then
  `--regular/--bold/--italic/--bolditalic` with `--sizes 12,14,16,18`.
- Full Hangul costs ~6.5 MB (12) / 8.4 (14) / 10.5 (16) / 13.1 (18) per size, 4 styles in one file;
  conversion takes ~10 s per size. Device memory/speed with these sizes is unverified; consider
  restricting to KS X 1001 2,350 syllables if the device struggles.

## Web fonts / size

The full-Hangul TrueType output is 7-9 MB per style (quadratic outlines, uncompressed) but ~0.5 MB as
woff2. See `references/web-font-packaging.md` for the Pretendard-style woff2 / subset /
dynamic-subset packaging, the demo page and serving it over Tailscale.

## Caveats

- Vision models misjudge typographic colour (one called a Regular Latin "bold" and contradicted the
  ink ratio). Use the numeric ratio plus the user's eyes; use vision only to catch missing glyphs/tofu.
- Never verified on a physical Kobo/Xteink; say so in the report.
- Hangul has no GPOS kerning after the merge; only Latin pairs keep kerning.
- Name the prototype to avoid the Latin font's RFN and the Hangul font's reserved names; carry both
  OFL texts and copyright notices before any release.
