#!/usr/bin/env python3
"""Build Pretendard-style web packages from out/final/<PS>-<Style>.ttf.

Run from the project root. Needs fonttools + brotli.
dist/web/static/woff2/                 full fonts
                woff2-subset/          Latin + KS X 1001 Hangul (2,350)
                woff2-dynamic-subset/  unicode-range slices (Google Noto Serif KR slice map)
                libridi.css libridi-subset.css libridi-dynamic-subset.css
Slice map: tools/notoserifkr_slices.css (see references/web-font-packaging.md).
"""
import io, os, re
from concurrent.futures import ProcessPoolExecutor
from fontTools.ttLib import TTFont
from fontTools import subset

FAMILY = "LibRidi Proto"
PS = "LibRidiProto"
STYLES = {"Regular": (400, "normal"), "Italic": (400, "italic"), "Bold": (700, "normal"), "BoldItalic": (700, "italic")}
SRC = "out/final"
OUT = "dist/web/static"
SLICE_CSS = "tools/notoserifkr_slices.css"


def parse_slices():
    css = open(SLICE_CSS).read()
    out = []
    for blk in re.findall(r"@font-face\s*{[^}]*}", css):
        m = re.search(r"unicode-range:\s*([^;]+);", blk)
        cps = set()
        for part in m.group(1).split(","):
            part = part.strip()[2:]
            if "-" in part:
                a, b = part.split("-"); cps.update(range(int(a, 16), int(b, 16) + 1))
            else:
                cps.add(int(part, 16))
        out.append(cps)
    return out


def ranges_css(cps):
    cps = sorted(cps); parts = []; s = p = cps[0]
    for c in cps[1:]:
        if c == p + 1: p = c; continue
        parts.append((s, p)); s = p = c
    parts.append((s, p))
    return ", ".join(f"U+{a:X}" if a == b else f"U+{a:X}-{b:X}" for a, b in parts)


def ks_hangul():
    ks = set()
    for hi in range(0xB0, 0xC9):
        for lo in range(0xA1, 0xFF):
            try: ch = bytes([hi, lo]).decode("euc-kr")
            except Exception: continue
            if 0xAC00 <= ord(ch) <= 0xD7A3: ks.add(ord(ch))
    return ks


_cache = {}
def do_subset(style, unicodes, out_path):
    if style not in _cache:
        _cache[style] = open(f"{SRC}/{PS}-{style}.ttf", "rb").read()
    f = TTFont(io.BytesIO(_cache[style]))
    opts = subset.Options()
    opts.layout_features = ["*"]; opts.notdef_outline = True; opts.hinting = False
    opts.name_IDs = ["*"]; opts.name_languages = ["*"]; opts.glyph_names = False
    s = subset.Subsetter(opts); s.populate(unicodes=unicodes); s.subset(f)
    f.flavor = "woff2"; f.save(out_path)
    return out_path


def job(a):
    return do_subset(*a)


def face(style, url, rng=None):
    w, st = STYLES[style]
    r = f"\n  unicode-range: {rng};" if rng else ""
    return (f"@font-face {{\n  font-family: '{FAMILY}';\n  font-style: {st};\n  font-weight: {w};\n  font-display: swap;\n"
            f"  src: url('{url}') format('woff2');{r}\n}}\n")


def main():
    for d in ("woff2", "woff2-subset", "woff2-dynamic-subset"):
        os.makedirs(f"{OUT}/{d}", exist_ok=True)
    allcps = set(TTFont(f"{SRC}/{PS}-Regular.ttf").getBestCmap())
    hangul = {c for c in allcps if 0xAC00 <= c <= 0xD7A3}
    sub_cps = (allcps - hangul) | (hangul & ks_hangul())
    slices = parse_slices()
    covered = set().union(*slices)
    jobs = []
    for st in STYLES:
        jobs.append((st, allcps, f"{OUT}/woff2/{PS}-{st}.woff2"))
        jobs.append((st, sub_cps, f"{OUT}/woff2-subset/{PS}-{st}.subset.woff2"))
    dyn = [sl & allcps for sl in slices if sl & allcps]
    left = allcps - covered
    if left: dyn.append(left)  # catch-all so the union equals the cmap
    print("slices in font:", len(dyn), "leftover chars:", len(left))
    for st in STYLES:
        for i, cps in enumerate(dyn):
            jobs.append((st, cps, f"{OUT}/woff2-dynamic-subset/{PS}-{st}.subset.{i}.woff2"))
    with ProcessPoolExecutor(max_workers=min(16, os.cpu_count() or 4)) as ex:
        for k, _ in enumerate(ex.map(job, jobs, chunksize=4)):
            if k % 50 == 0: print("done", k, "/", len(jobs), flush=True)
    full = "".join(face(st, f"./woff2/{PS}-{st}.woff2") for st in STYLES)
    sub = "".join(face(st, f"./woff2-subset/{PS}-{st}.subset.woff2") for st in STYLES)
    dcss = "".join(face(st, f"./woff2-dynamic-subset/{PS}-{st}.subset.{i}.woff2", ranges_css(cps))
                   for st in STYLES for i, cps in enumerate(dyn))
    open(f"{OUT}/libridi.css", "w").write(full)
    open(f"{OUT}/libridi-subset.css", "w").write(sub)
    open(f"{OUT}/libridi-dynamic-subset.css", "w").write(dcss)
    print("css written")


if __name__ == "__main__":
    main()
