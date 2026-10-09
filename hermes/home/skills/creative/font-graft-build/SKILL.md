---
name: font-graft-build
description: "Use when building, patching or packaging Korean OFL fonts."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [fonts, hangul, ofl, nerd-fonts, kobo, crosspoint, webfont, uv]
    category: creative
    related_skills: [typography-setup]
---

# Font graft + packaging

## When to Use
Grafting Hangul onto a Latin font, Nerd-patching a coding font, producing Kobo/CrossPoint/web builds, choosing Korean font pairings, or adding a package to the fonts monorepo.

Reference implementation: `~/workspaces/sharosoo/fonts` (monorepo; packages `jeongdok` = graft, `d2koding` = Nerd patch). Read `scripts/lib/graft.py`, `scripts/lib/targets.py`, `scripts/lib/nerd.py`, `packages/*/font.toml` before re-deriving anything. New fonts go in as another `packages/<name>/` (the user wants one monorepo for all their fonts); `font.toml` has `kind = "graft" | "nerd-patch"` and `scripts/build.py` dispatches on it.

Deeper notes: `references/nerd-patch.md` (Nerd Font patching, web icon splitting), `references/korean-font-candidates.md` (license/metric comparison of Korean serif, sans, mono, display fonts).

## Repo conventions the user asked for
- Monorepo like Pretendard (`packages/<name>/`), build/release flow like Libron. E-reader/desktop fonts ship as GitHub Release assets (never committed, `dist/eink` gitignored); web fonts (`dist/web`, gitignored) are built in CI and uploaded to `https://cdn.sharosoo.com/fonts/<pkg>/v<ver>/` when tag `<pkg>-v<ver>` is pushed (immutable, one-year cache). Upstream sources are pinned by URL + sha256 and recorded in `upstream/UPSTREAM.md`.
- Demo page per package, served from the repo root on the Tailscale IP (`python3 -m http.server <port> --bind <tailscale-ip>`); verify it in the browser tool by reading `document.fonts` and the loaded woff2 list before reporting the URL.
- Prepare commits locally; ask before creating the remote, pushing, tagging or publishing.
## Licensing first
- OFL Reserved Font Names (Libron, Newsreader, Readerly) and trademarks in name table ID 7 (RIDIBatang) must not appear in the new family name. Credit them in OFL.txt / CREDITS.md.
- Do not base on fonts whose licence forbids modification (e.g. KoPub Batang). Maru Buri, RIDIBatang, Noto Serif KR, Hahmlet, Gowun Batang allow it.
- Check name tables for leaked upstream names with `scripts/qa.py` after every build.
- When the user asks to keep an original name that is a Reserved Font Name (e.g. D2Coding), say that patched/subset/woff2 files must be renamed (OFL counts format conversion as modification), keep the name configurable in `font.toml`, and mention that written permission from the rights holder is the only way to keep it.
- Community re-uploads of a font may lack a LICENSE; record the gap in `UPSTREAM.md` and prefer the original distribution before a public release.

## Build environment
- The monorepo is a uv project (`pyproject.toml`, `uv.lock`, `.python-version`): `uv sync`, then `uv run scripts/build.py <pkg>` / `qa.py <pkg>` / `release.py <pkg>`. No hand-made venvs or requirements.txt. Keep code compatible with the declared minimum Python (no nested same-type quotes inside f-strings).
- `scripts/build.py` sets `SOURCE_DATE_EPOCH` so fontTools writes a fixed `head.modified`; two builds then produce byte-identical woff2, which keeps committed `dist/web` diffs clean. Verify by hashing `dist/web` after two builds.
- `font.toml` knobs: `targets` (limit builds, e.g. a heading face skips kf/cpfont), `[family] slug` (CSS/file names without spaces), `[qa] banned` (upstream names that must not survive in the name table), `[[fetch]]` (url, sha256, dest for big donors), `[hangul.files]` (donor per style), `[latin.variable]` + `[latin.axes]` (variable Latin master instantiated per style). Release zips are named with `ps_name` (no spaces).

## Graft pipeline
1. Instantiate variable sources first (`fontTools.varLib.instancer`), then `fontTools.ttLib.removeOverlaps` (variable masters keep overlapping contours) and delete `STAT/fvar/avar/gvar/HVAR/MVAR`. Do not trust the donor's name/style fields: pass the requested style explicitly and set `OS/2.fsSelection` (italic bit0, bold bit5, regular bit6), `head.macStyle`, `usWeightClass` and the display style ("Bold Italic", PS name without space) yourself. Drop name ID 25 (variations PS prefix) along with ID 7 — `qa.py` with `[qa] banned` catches leaks like this.
2. Draw Hangul via glyphSet -> `TransformPen` -> `Cu2QuPen(reverse_direction=is_cff)` -> `TTGlyphPen`. Centre each glyph in its advance after scaling.
3. Weight: if the donor has fewer weights, offset outlines with skia-pathops (`stroke` + `convertConicsToQuads` + `op UNION`, then draw with `reverse_direction=False`). Tune the offset so Hangul/Latin ink ratio matches Regular.
4. Drop fpgm/prep/cvt, zero maxp instruction fields, set OS/2 Hangul unicode/codepage bits, rewrite name IDs 0-6,13,14,16-18 (PS name has no spaces).

## Alignment decisions are visual
- Scale and vertical shift (`dy`) must be chosen by eye: render guide-line sheets (baseline / x-height / cap-height) for several values and let the user pick. Statistics (ink centroid, face centre) only suggest candidates.
- RIDIBatang's Hangul centre sits ~0.09 em lower than Source Han convention, so it needs dy of about +0.09 em next to Libron.
- Values that worked for a reading serif: scale 0.94, dy +0.09 em. Once the user approves an alignment/size by eye, treat it as fixed: do not re-tune it for other reasons (e.g. a perceived "bigger" look after a shift) without being asked; offer variants instead.
- A "bigger-looking Hangul" complaint is fixed by `scale` (and `track`), not by weight; weight only changes colour.

## Measurement pitfalls
- PIL `ImageDraw.text` defaults to anchor `la`; ink measurement must use anchor `ls` and a tall canvas, or glyphs are clipped and ratios come out wrong (this once inflated results by ~12%).
- Vision models cannot judge typographic colour/weight; use numbers for loops and the user's eyes for the final call.

## Targets
- Kobo: `kobofix.py --preset kf` (v0.10) needs the `ots-sanitize` binary. `pip install opentype-sanitizer` ships it inside the package (`ots/ots-sanitize`); put it on PATH.
- CrossPoint: `fontconvert_sdcard.py --intervals reading,hangul --sizes 12,14,16,18` with `font-line percent 35` and OS/2 typo metrics copied from hhea. Full Hangul = 6-13 MB per size; unverified on device.
- Web: woff2 full, KS X 1001 subset (EUC-KR decode of 0xB0A1-0xC8FE), and dynamic subset using Google Fonts' Noto Serif KR `unicode-range` slice CSS (fetch with a Chrome UA, commit the CSS). Add a leftover slice for chars outside every range. 4 styles x ~95 slices builds in ~30 s with ProcessPoolExecutor.
- Distribution model: e-reader/desktop zips as GitHub Release assets; web fonts built in CI and uploaded to `cdn.sharosoo.com/fonts/<pkg>/v<ver>/`, not committed.

## Nerd Fonts patching (kind = nerd-patch)
- Run font-patcher in the FontForge container (`ghcr.io/nicoverbruggen/fntbld-oci`, podman); host has no FontForge.
- Never use `--mono` on CJK-width fonts: it forces every glyph to 1 cell and shrinks the Hangul advance 1000 -> 500 (overlapping text). Use `--single-width-glyphs` and restore `post.isFixedPitch=1`, PANOSE monospaced.
- D2Coding has Reserved Font Name -> patched/subset/woff2 files are renamed D2Koding. Web: split PUA into BMP and Material (U+F0000+) symbol fonts joined by unicode-range.

## Variable Latin sources
- Instantiate with `instancer` (e.g. Newsreader opsz=72), run `removeOverlaps`, drop STAT/fvar/gvar/etc, and set style flags (fsSelection, macStyle, usWeightClass) and name IDs from the requested style (nameID 25 can leak the upstream name).

## Repo conventions
- uv project (`pyproject.toml`, `uv.lock`); builds set `SOURCE_DATE_EPOCH` so two builds are byte-identical.
- Upstream binaries: small OFL files committed with sha256 in UPSTREAM.md; big ones fetched via `[[fetch]]` (zip member support). Prefer the foundry's official download (Maru Buri: hangeul.naver.com/font/maru zip).

## Process pitfalls
- Do not `pkill -f` a pattern that appears in your own command line (kills the shell). Kill by PID.
- Long foreground builds get promoted to background; poll or wait for the notification.
- Never publish (git push / gh release / npm publish) without the user's go-ahead.
- `terminal` rejects `cmd &` backgrounding; use `background=true`, or run parallel jobs from a Python `ThreadPoolExecutor`/`ProcessPoolExecutor` script.
- Scripts or files larger than 1 MiB passed on a `python3 - <<E` command line can be refused by the lifecycle scan; put the code in a small .py file and run that.
- Replacing a string in a copied HTML/script with `str.replace` silently does nothing when the quoting differs; grep for the old token afterwards to prove the edit landed.
