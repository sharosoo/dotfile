#!/usr/bin/env python3
"""Em-normalised Latin style metrics: x-height, cap height, stem, o thickness, hairline/stem.
Usage: measure_latin.py font.ttf
Needs: pip install fonttools brotli pillow numpy (use a venv). For variable fonts call
measure(name, path, {'wght': 450, 'opsz': 9}) from Python.
"""
import io
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import ImageFont, Image, ImageDraw

S = 1000
BASE = int(S * 1.3)  # baseline well below top, or ascenders clip


def load(path, loc=None):
    f = TTFont(path)
    if loc and 'fvar' in f:
        f = instancer.instantiateVariableFont(f, loc)
    b = io.BytesIO(); f.save(b); b.seek(0)
    return f, b


def runs(arr):
    a = np.concatenate([[0], arr.astype(int), [0]]); d = np.diff(a)
    return np.where(d == -1)[0] - np.where(d == 1)[0]


def measure(name, path, loc=None):
    f, b = load(path, loc)
    upm = f['head'].unitsPerEm
    font = ImageFont.truetype(b, S)
    cm = f.getBestCmap(); hm = f['hmtx']

    def img(ch):
        im = Image.new('L', (S * 2, S * 2), 0)
        ImageDraw.Draw(im).text((S // 2, BASE), ch, font=font, fill=255, anchor='ls')
        return np.array(im) > 128

    def height(ch):
        ys, _ = np.where(img(ch)); return (BASE - ys.min()) / S

    xh, cap = height('x'), height('H')
    stem = runs(img('l')[BASE - int(0.3 * S)]).mean() / S
    a = img('o'); ys, xs = np.where(a)
    cy = (ys.min() + ys.max()) // 2; cx = (xs.min() + xs.max()) // 2
    side = runs(a[cy])[0] / S          # vertical stroke thickness of o
    top = runs(a[:, cx])[0] / S        # hairline thickness of o
    lw = np.mean([hm[cm[ord(c)]][0] for c in 'abcdefghijklmnopqrstuvwxyz']) / upm
    print(f"{name:24s} upm={upm} xh={xh:.3f} cap={cap:.3f} stem={stem:.3f} "
          f"o_side={side:.3f} o_top={top:.3f} hairline/stem={top / side:.2f} avgLCwidth={lw:.3f}")


if __name__ == '__main__':
    import sys
    measure(sys.argv[1], sys.argv[1])
