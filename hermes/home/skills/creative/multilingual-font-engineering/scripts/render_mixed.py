"""Render a mixed Latin/Hangul page and report Hangul-vs-Latin ink ratio.

usage: render_mixed.py <outdir> <px> <font.ttf> [<font2.ttf> ...]
Writes <name>_<px>_gray.png and <name>_<px>_2bit.png (4-level grey, imitates CrossPoint
cpfont) and prints latin_ink / hangul_ink / ratio per font.

ink_ratio = ink pixels / (text advance x font size) on one line, so it is the
'typographic colour' of the script. Target ratio ~0.9-1.0 (0.89 felt right for
RIDIBatang k=0.94 + Libron). Hangul shrinks ~k^2 in ink when scaled by k with the advance
kept at 1em. Needs pillow + numpy.
"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont

TEXT = [
 "The harbor was quiet that morning. 항구는 그날 아침 조용했고, 안개 속에서 배 한 척이 천천히 들어오고 있었다.",
 "“Reading is a slow craft,” she said. “읽기는 느린 기술이야”라고 그녀는 말했다. 「서울」에서 2026년 10월 9일에 만났다.",
 "Typography matters: 글자의 굵기와 간격, 그리고 획의 대비가 한 쪽의 회색도를 결정한다. 물, 밥, 꿈, 책, 읽는 시간.",
]
W, H = 1000, 1000
LAT = "the quick brown fox jumps over a lazy dog reading is slow"
HAN = "다람쥐 헌 쳇바퀴에 타고파 읽는 시간의 고요함 물밥꿈책"

def wrap(draw, text, font, maxw):
    lines, cur = [], ""
    for word in text.split(" "):
        t = (cur + " " + word).strip()
        if draw.textlength(t, font=font) <= maxw: cur = t
        else: lines.append(cur); cur = word
    lines.append(cur); return lines

def quant2(img):
    a = np.array(img.convert("L")).astype(float)
    return Image.fromarray((np.round(a / 85.0) * 85).astype("uint8"))

def page(fontpath, px, lh=1.55):
    font = ImageFont.truetype(fontpath, px)
    im = Image.new("L", (W, H), 255); d = ImageDraw.Draw(im); y = 50
    for para in TEXT:
        for ln in wrap(d, para, font, W - 100):
            d.text((50, y), ln, font=font, fill=0); y += int(px * lh)
        y += int(px * 0.5)
    return im

def ink_ratio(fontpath, text, px=100):
    font = ImageFont.truetype(fontpath, px)
    d0 = ImageDraw.Draw(Image.new("L", (10, 10)))
    tl = d0.textlength(text, font=font)
    # anchor='ls' puts the BASELINE at y; PIL's default 'la' puts the ascender there and
    # silently pushes the glyphs off a short canvas (ink then depends on vertical shift).
    im = Image.new("L", (int(tl) + 40, px * 3), 255)
    ImageDraw.Draw(im).text((20, int(px * 1.6)), text, font=font, fill=0, anchor="ls")
    a = (255 - np.array(im).astype(float)) / 255
    return a.sum() / (tl * px)

if __name__ == "__main__":
    out = sys.argv[1]; px = int(sys.argv[2])
    for p in sys.argv[3:]:
        name = p.split("/")[-1].rsplit(".", 1)[0]
        im = page(p, px)
        im.save(f"{out}/{name}_{px}_gray.png"); quant2(im).save(f"{out}/{name}_{px}_2bit.png")
        lat, han = ink_ratio(p, LAT), ink_ratio(p, HAN)
        print(f"{name:24s} latin_ink={lat:.3f} hangul_ink={han:.3f} ratio(h/l)={han/lat:.2f}")
