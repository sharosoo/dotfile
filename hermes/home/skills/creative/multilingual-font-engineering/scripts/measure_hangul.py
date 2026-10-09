#!/usr/bin/env python3
"""Em-normalised Hangul metrics: vertical stem (ㅣ), horizontal stroke (ㅡ), face size,
vertical centre and ink density over sample syllables.
Usage: measure_hangul.py font.ttf [wght]   (wght instantiates a variable font)
Approximation: uses compat jamo for strokes; judge final fit on real syllables/text.
"""
import io, sys
import numpy as np
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
from PIL import ImageFont, Image, ImageDraw

SAMPLE = '가나다라마바사아자차카타파하한글서울물밥꿈책읽는시간고요함빛나무숲'


def font_bytes(path, wght=None):
    f = TTFont(path)
    if wght is not None and 'fvar' in f:
        f = instancer.instantiateVariableFont(f, {'wght': wght})
    b = io.BytesIO(); f.save(b); return f, b.getvalue()


def runs(arr):
    a = np.concatenate([[0], arr.astype(int), [0]]); d = np.diff(a)
    return np.where(d == -1)[0] - np.where(d == 1)[0]


def measure(path, wght=None):
    f, data = font_bytes(path, wght)
    upm = f['head'].unitsPerEm

    def render(ch, size):
        font = ImageFont.truetype(io.BytesIO(data), size)
        im = Image.new('L', (size * 2, size * 2), 0)
        ImageDraw.Draw(im).text((size // 2, int(size * 1.3)), ch, font=font, fill=255, anchor='ls')
        return np.array(im) > 128

    S = 1000
    a = render('ㅣ', S); ys, _ = np.where(a)
    v = np.median(runs(a[(ys.min() + ys.max()) // 2])) / S
    a = render('ㅡ', S); _, xs = np.where(a)
    h = np.median(runs(a[:, (xs.min() + xs.max()) // 2])) / S
    s2 = 200; ws, hs, dens, cys = [], [], [], []
    for ch in SAMPLE:
        a = render(ch, s2); ys, xs = np.where(a)
        if not len(ys): continue
        ws.append((xs.max() - xs.min()) / s2); hs.append((ys.max() - ys.min()) / s2)
        dens.append(a.sum() / s2 / s2); cys.append((int(s2 * 1.3) - (ys.min() + ys.max()) / 2) / s2)
    print(f"{path} wght={wght} upm={upm} V={v:.3f} H={h:.3f} H/V={h / v:.2f} "
          f"faceW={np.mean(ws):.3f} faceH={np.mean(hs):.3f} centerY={np.mean(cys):.3f} ink={np.mean(dens):.3f}")


if __name__ == '__main__':
    measure(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else None)
