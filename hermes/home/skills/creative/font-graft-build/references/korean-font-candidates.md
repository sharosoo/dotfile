# Korean font candidates (license + measured fit)

Metrics are em units from `sans_metrics.py`-style probes: render glyphs with PIL (anchor `ls`, tall canvas), V = vertical stem of `ㅣ`, H = horizontal stroke of `ㅡ`, ink = ink area / em^2 averaged over ~30 common syllables.

## Roles a service usually needs
UI/body sans, long-form serif, code monospace (Hangul at 2 cells), display/brand, then fallback stack. Icons: SVG (Nerd icons only matter in terminals). Numerals: sans `tnum`, not a separate font.

## Decisions made for this user (type system in the fonts monorepo, `docs/TYPE_SYSTEM.md`)
- Body serif **Jeongdok** (Libron Latin + RIDIBatang Hangul), headings/brand **Jeongdok Display** (Newsreader opsz 72 + Maru Buri), UI sans **IBM Plex Sans KR** (used as-is from Google Fonts, not repackaged), code **D2Koding** (D2Coding + Nerd, ligature).
- The user wants the whole set to feel coherent, with Maru Buri's soft warmth as the reference mood.

## Reference serif pair (Jeongdok): Latin x-height 0.532, Hangul face 0.866, V 0.075, H/V 0.83, ink 0.186
Sans companions measured against it:
- Pretendard: x 0.530, face 0.845, V 0.077, H/V 0.87, ink 0.192 (closest; official CDN exists, no need to repackage)
- IBM Plex Sans KR: x 0.515, face 0.868, V 0.077, ink 0.192 (chosen by the user; more technical)
- Wanted Sans: x 0.505, face 0.843, V 0.075, H/V 0.83, ink 0.192 (geometric with humanist touches)
- Noto Sans KR w400: ink 0.214, noticeably heavy
- Gowun Dodum: V 0.062, ink 0.155, light and warm, better for headings than body
- Nanum Gothic: face 0.902, ink 0.190
Not measured: SUIT, Spoqa Han Sans Neo, NanumSquare Neo (files were not fetched).

## Serif / Hangul donors
- Maru Buri (Naver, OFL, 5 weights, static; no GitHub release of its own, community archive `fonts-archive/MaruBuri` via jsDelivr — swap for Naver's download before publishing): V 0.069, H/V 0.72 at Regular; Latin x-height only 0.468.
- RIDIBatang (RIDI/Sandoll, OFL, e-book design, one weight): V 0.081, H 0.067, H/V 0.83. Trademarked name. Community `ridibatang-9` repo ships -5/-7/-9 % tracking variants without a LICENSE file.
- Noto Serif KR (variable, ~24 MB), Hahmlet (variable 100-900, bilingual design), Gowun Batang (soft, light), Nanum Myeongjo.
- KoPub Batang forbids modification.

## Pairing rule for a display cut
- The Hangul donor's stroke contrast should echo the Latin's. Newsreader at opsz 72 has hairline/stem ~0.22, so the flat, chubby RIDIBatang (H/V 0.83) looked too dense; Maru Buri Regular (H/V ~0.72) balanced best, Light/ExtraLight were too weak. Body size (opsz 9 style Latin, flatter contrast) pairs with RIDIBatang instead.
- Compare 3-4 donors in one sheet at ~76 px with identical text before choosing; keep the donor selectable per style in `font.toml`.

## Display / brand
- Best coherence with a Libron/Newsreader serif: Newsreader Display (opsz 72) Latin + a Hangul donor with matching contrast (built as Jeongdok Display).
- Ready-made: Hahmlet (quirky), Gowun Batang Bold (soft), Gmarket Sans / Paperlogy (geometric bold sans, OFL).
- Avoid Black Han Sans for brands: 2,580 Hangul syllables only, no Latin, Reserved Font Name.

## Fonts with sources/CDN
Google Fonts repo (`google/fonts/ofl/<name>`) serves raw TTFs; Pretendard dist is under `packages/pretendard/dist/...` in its repo; Wanted Sans under `packages/wanted-sans/fonts/ttf/`.
