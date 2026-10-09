# Packaging a CJK-capable font for the web (Pretendard-style) and demoing it

Why Korean fonts are heavy: 11,172 composed syllables, each an outline. A Latin e-book serif is
~150 KB; the merged font is 7-9 MB TTF per style. Fixes, in order of effect:

1. **woff2** (brotli + glyf transform): 7.3 MB TTF -> ~0.5 MB.
2. **Subset**: Latin + punctuation + KS X 1001 Hangul (2,350 syllables, from `euc-kr` rows B0-C8):
   ~0.2 MB woff2. Anything outside it falls back to the next font (e.g. 똘 뷁 쀼 읊).
3. **Dynamic subset**: many woff2 slices + `unicode-range` @font-face rules so the browser downloads
   only the slices a page uses. Slice map: Google Fonts' Noto Serif KR CSS (124 faces; fetch
   `https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400&display=swap` with a Chrome
   User-Agent and parse `unicode-range`). Pretendard's dynamic subset uses the same Google map.
   Intersect each slice with the font's cmap, drop empty slices, and add one catch-all slice for
   cmap codepoints no slice covers (26 in this build). Verify the union of slices equals the cmap.

Reference sizes (Regular): Pretendard OTF 1.5 MB, woff2 747 KB, subset 260 KB, dynamic subset
92 slices / 1.1 MB total (avg 12 KB); merged Libron+RIDIBatang woff2 516 KB, subset 212 KB, dynamic
94 slices / 1.5 MB (avg 16 KB, max 24 KB). Slices total more than the single woff2 because
brotli loses shared context; that is expected.

## Build

`scripts/build_web.py` (run from the project root; needs `fonttools brotli`): reads
`out/final/<Prefix>-<Style>.ttf` for 4 styles + `tools/notoserifkr_slices.css`, writes
`dist/web/static/{woff2,woff2-subset,woff2-dynamic-subset}/` and `libridi.css`,
`libridi-subset.css`, `libridi-dynamic-subset.css` (rename `FAMILY`/`PS` at the top). Uses a
`ProcessPoolExecutor`; 384 subset jobs take ~30 s on 32 cores. Subsetter options:
`layout_features=['*']`, `hinting=False`, `notdef_outline=True`, `name_IDs=['*']`.

Keep the e-ink deliverables (TTF, Kobo KF, CrossPoint cpfont) in `dist/eink/` and the web files in
`dist/web/` as separate packages.

## Demo page + Tailscale

`templates/font_demo.html` (copy to `dist/web/index.html`): reading paragraphs for all 4 styles,
size/line-height sliders, dark and greyscale toggles, a guide-line row for Latin/Hangul vertical
alignment, and a list of the woff2 files actually fetched (Resource Timing). `?css=dynamic|subset|full`
switches the stylesheet. Confirmed behaviour: dynamic mode fetched 34 of 376 faces (~530 KB).

Serve it only on the tailnet: `tailscale ip -4` for the address, `tailscale status --self --json`
for the MagicDNS name, then `python3 -m http.server <port> --bind <tailscale-ip> --directory dist/web`
as a `terminal(background=true)` process (check the port is free with `ss -ltn` first; a local
service may already hold the usual ones). It dies with the session/gateway; use a systemd user unit
if it must persist. Verify through the browser tool by reading the page's file list, and give the
user both the IP and MagicDNS URLs.
