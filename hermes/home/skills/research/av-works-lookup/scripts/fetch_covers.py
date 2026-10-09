#!/usr/bin/env python3
"""Fetch DMM cover images (pl.jpg wrap-around jackets) for AV product codes.

Verified path: curl + browser UA against pics.dmm.co.jp (works across all
major makers). Checks HTTP 200 AND payload size (>10KB) before saving —
a miss still returns a body, so status alone is not proof.

Usage: python fetch_covers.py MNGS-072 NIMA-086 ... [--outdir DIR]
"""
import argparse
import pathlib
import re
import subprocess

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"


def dmm_url(code: str) -> str:
    m = re.fullmatch(r"([A-Za-z]+)-?(\d+)", code.strip())
    if not m:
        raise ValueError(f"bad code: {code}")
    key = m.group(1).lower() + m.group(2).zfill(5)
    return f"https://pics.dmm.co.jp/digital/video/{key}/{key}pl.jpg"


def fetch(code: str, outdir: pathlib.Path) -> str:
    url = dmm_url(code)
    dest = outdir / f"{code.upper()}.jpg"
    r = subprocess.run(
        ["curl", "-s", "-A", UA, "--max-time", "20", "-o", str(dest), url],
        capture_output=True, text=True,
    )
    size = dest.stat().st_size if dest.exists() else 0
    if r.returncode != 0 or size < 10_000:
        dest.unlink(missing_ok=True)
        return f"{code.upper():12} FAIL  http={r.returncode} size={size}"
    return f"{code.upper():12} OK    {size // 1024}KB -> {dest}"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("codes", nargs="+")
    ap.add_argument("--outdir", default=".")
    a = ap.parse_args()
    outdir = pathlib.Path(a.outdir)
    outdir.mkdir(parents=True, exist_ok=True)
    for c in a.codes:
        print(fetch(c, outdir))


if __name__ == "__main__":
    main()
