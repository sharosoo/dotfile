# PDF figure crop and public host

Use when an Artifact Hub article must embed figures/tables from a tech report PDF (or paper walkthrough video notes).

## Do not

- `pdftoppm` whole pages and call them figures
- Embed `![](/tmp/...)` local paths
- Dump every figure in a bottom gallery with no narrative anchor

## Crop recipe (pymupdf)

```python
import pymupdf as fitz
from PIL import Image
import io, re, numpy as np

doc = fitz.open("report.pdf")

def render(page, clip, zoom=3.0):
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), clip=clip, alpha=False)
    return Image.open(io.BytesIO(pix.tobytes("png")))

def trim_white(img, thr=248, pad=14):
    a = np.array(img.convert("L"))
    mask = a < thr
    if not mask.any():
        return img
    ys, xs = np.where(mask)
    return img.crop((max(0, xs.min()-pad), max(0, ys.min()-pad),
                     min(img.width, xs.max()+pad+1), min(img.height, ys.max()+pad+1)))

# 1) Find first "Figure N:" / "Table N:" text block bbox per number
# 2) Collect page.get_images rects + page.get_drawings rects ABOVE (or immediately around) the caption
# 3) Union nearby label text blocks that sit on the figure
# 4) clip = union padded; include caption line (y1 >= caption.y1)
# 5) render → trim_white → save figNN.png
# 6) Sanity: clip.height / page.rect.height should usually be << 1.0
#    (architecture diagrams may be ~0.5–0.6; reject ~0.9+ full-page accidents)
```

Dependencies: `pymupdf`, `pillow`, `numpy` in a throwaway venv is fine.

## Headless verification (no display needed)

After cropping, confirm the crop actually contains the intended figure without opening a viewer:

```bash
python3 - <<'PY'   # or execute_code
from PIL import Image
import numpy as np
a = np.array(Image.open("fig02.png").convert("L"))
print("nonwhite=%.3f" % ((a < 240).mean()))   # expect > ~0.1 for a real diagram
PY
tesseract fig02.png - | head -12   # OCR should echo the figure's own label text
```

- OCR echoing figure text (e.g. "Challenges", "Offline Video Pre-training", "Codebook of Latent Actions") is strong evidence the crop holds the right figure, not whitespace or a neighboring page element. Verified 2026-08-08 on crops from arXiv PDFs (2606.06556, HuMI, Progressor, LAPA).
- nonwhite ratio ~0.1–0.3 is typical for line diagrams; near-0 means a blank crop.
- Combine with the `clip.height / page.rect.height ≪ 1.0` sanity check.
- Some headless boxes have no window surface (`display` + cua-driver `list_windows` returns nothing) — OCR + nonwhite stats are the reliable path there; do not block on visual inspection.

## Host (정혁)

1. Upload with the `sharosoo-cdn` skill/CLI under a topic dir: `sharosoo-cdn put fig02.png --prefix kimi-k3-sudoremove/crops`.
2. Embed the printed URL, e.g. `https://cdn.sharosoo.com/kimi-k3-sudoremove/crops/fig02.png`.
3. `sharosoo-cdn put` already HEAD-checks 200 + size. After publish, raw HTML should contain `<img` and the filename.
4. Never commit to `github.com/sharosoo/image` or embed jsDelivr/raw.githubusercontent URLs for it; that repo is a frozen archive.

## Placement

Put each cropped figure **immediately under the paragraph that uses it**, with:

```markdown
![Fig.2. Kimi K3 architecture](URL)

*Technical Report Figure 2. …*
```

Spoken number/term mismatches stay in a small “영상 구두 vs 리포트 정본” table — do not silently rewrite the paper figure caption.
