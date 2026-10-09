#!/usr/bin/env python3
"""Graft Hangul (+ CJK punctuation, compat jamo) from a Korean font onto a Latin TTF.

usage: merge_hangul.py <latin.ttf> <hangul .ttf|.otf> <out.ttf> <family>
          [--k 0.94] [--dy 0] [--track 1.0] [--embolden 0.0105]

--k         visual scale of Hangul (advance stays 1em x track; glyph re-centred)
--track     advance multiplier for Hangul (0.95 tightens spacing)
--embolden  outline offset per side in Hangul em (skia-pathops stroke+union); makes
            weights between the source font's static weights
Run once per style (Regular/Italic/Bold/BoldItalic); use the SAME Regular Hangul for
Italic styles and an emboldened one for Bold styles. Style comes from the Latin
font's nameID 2. Hinting is dropped (fpgm/prep/cvt) -- Kobo KF does the same.
Local prototype: use a family name that avoids both fonts' Reserved Font Names.
Needs: fonttools, skia-pathops (pip). Plain build ~2 s; with --embolden ~1 min.
"""
import argparse
import pathops
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables import ttProgram
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.cu2quPen import Cu2QuPen

ap = argparse.ArgumentParser()
ap.add_argument("latin"); ap.add_argument("hangul"); ap.add_argument("out"); ap.add_argument("family")
ap.add_argument("--k", type=float, default=1.0)
ap.add_argument("--dy", type=float, default=0.0, help="baseline shift in em")
ap.add_argument("--track", type=float, default=1.0)
ap.add_argument("--embolden", type=float, default=0.0)
a = ap.parse_args()

lat = TTFont(a.latin)
han = TTFont(a.hangul)
UPM = lat["head"].unitsPerEm
hupm = han["head"].unitsPerEm
is_cff = "CFF " in han
hcmap = han.getBestCmap()
lcmap = lat.getBestCmap()
hgs = han.getGlyphSet()
hhmtx = han["hmtx"]

ranges = [(0xAC00, 0xD7A3), (0x3131, 0x318E), (0x3000, 0x303F), (0xFF01, 0xFF5E),
          (0x2025, 0x2025), (0x203B, 0x203B)]
cps = [cp for lo, hi in ranges for cp in range(lo, hi + 1) if cp in hcmap and cp not in lcmap]
print("graft codepoints:", len(cps))

s = UPM / hupm * a.k
glyf = lat["glyf"]
order = lat.getGlyphOrder()[:]
hmtx = lat["hmtx"]
new_names = []
for cp in cps:
    src = hcmap[cp]
    adv_src = hhmtx[src][0]
    adv = round(adv_src * UPM / hupm * a.track)
    xshift = (adv - adv_src * s) / 2
    tt = TTGlyphPen(None)
    if a.embolden > 0:
        p = pathops.Path()
        hgs[src].draw(p.getPen(glyphSet=hgs))
        st = pathops.Path(p)
        st.stroke(2 * a.embolden * hupm, pathops.LineCap.BUTT_CAP, pathops.LineJoin.MITER_JOIN, 4)
        st.convertConicsToQuads()  # op() raises UnsupportedVerbError on conics
        u = pathops.op(p, st, pathops.PathOp.UNION, fix_winding=True, keep_starting_points=False)
        u.convertConicsToQuads()
        q = Cu2QuPen(tt, max_err=1.0, reverse_direction=False)
        u.draw(TransformPen(q, (s, 0, 0, s, xshift, a.dy * UPM)))
    else:
        q = Cu2QuPen(tt, max_err=1.0, reverse_direction=is_cff) if is_cff else tt
        hgs[src].draw(TransformPen(q, (s, 0, 0, s, xshift, a.dy * UPM)))
    g = tt.glyph()
    name = f"uni{cp:04X}"
    if name in glyf.glyphs:
        continue
    glyf.glyphs[name] = g
    order.append(name)
    g.recalcBounds(glyf)
    hmtx.metrics[name] = (adv, g.xMin if g.numberOfContours else 0)
    new_names.append((cp, name))

lat.setGlyphOrder(order)
glyf.glyphOrder = order
for t in lat["cmap"].tables:
    if t.format == 4 and t.platformID in (0, 3):
        for cp, n in new_names:
            if cp <= 0xFFFF:
                t.cmap[cp] = n

for tag in ("fpgm", "prep", "cvt "):
    if tag in lat:
        del lat[tag]
for n in order:
    p = ttProgram.Program(); p.fromBytecode(b"")
    glyf.glyphs[n].program = p
mp = lat["maxp"]
mp.maxFunctionDefs = mp.maxInstructionDefs = mp.maxStorage = mp.maxStackElements = mp.maxTwilightPoints = 0
mp.maxSizeOfInstructions = 0

os2 = lat["OS/2"]
os2.ulUnicodeRange1 |= 1 << 28
os2.ulUnicodeRange2 |= (1 << (56 - 32)) | (1 << (52 - 32)) | (1 << (48 - 32))
os2.ulCodePageRange1 |= 1 << 19  # KS X 1001

fam = a.family
ps = fam.replace(" ", "")
sub = lat["name"].getDebugName(2) or "Regular"
for rec in lat["name"].names:
    if rec.nameID == 1: rec.string = fam
    elif rec.nameID == 4: rec.string = fam + " " + sub
    elif rec.nameID == 6: rec.string = ps + "-" + sub.replace(" ", "")
    elif rec.nameID == 3: rec.string = ps + "-" + sub.replace(" ", "") + "-proto"
    elif rec.nameID == 16: rec.string = fam
lat["name"].names = [r for r in lat["name"].names if r.nameID not in (17, 25)]
lat.save(a.out)
print("saved", a.out, "glyphs", len(order))
