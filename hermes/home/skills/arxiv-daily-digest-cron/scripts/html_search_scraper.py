#!/usr/bin/env python3
"""
Parse arXiv search HTML pages and emit a JSON list of candidates.

Validated 2026-07-27 against the current arXiv HTML schema (Bulma-CSS based).
The schema is NOT the older "Primary Category: <span>" structure that older
docs and skills describe — the primary/secondary category distinction is now
encoded entirely in the `is-link` vs `is-grey` CSS class on tag spans.

Usage:
    python3 html_search_scraper.py \\
        --html-glob "/tmp/arxiv_html_*.html" \\
        --state ~/.hermes/cron/arxiv/state.json \\
        --cutoff 2026-07-23 \\
        --good-cats cs.DC cs.LG cs.PF cs.AR cs.OS cs.NA \\
        > candidates.json
"""
import argparse, json, re, html, sys
from datetime import datetime
from pathlib import Path

MONTHS = {m: i for i, m in enumerate(
    ["January","February","March","April","May","June","July","August","September","October","November","December"], 1)}

RE_ID = re.compile(r'href="https?://arxiv\.org/abs/(\d{4}\.\d{4,6})(v\d+)?"')
RE_TITLE = re.compile(r'<p class="title is-5 mathjax">\s*(.*?)\s*</p>', re.DOTALL)
RE_AUTHOR = re.compile(r'<a[^>]*>([^<]+)</a>')
RE_PRIMARY_CAT = re.compile(
    r'<span class="tag is-small is-link[^"]*"[^>]*data-tooltip="[^"]+"[^>]*>([^<]+)</span>'
)
RE_DATE = re.compile(
    r'<span class="has-text-black-bis has-text-weight-semibold">Submitted</span>\s+(\d+)\s+(\w+),?\s+(\d{4})'
)
RE_ABSTRACT = re.compile(r'<span class="abstract-full[^"]*"[^>]*>(.*?)</span>', re.DOTALL)


def base_id(s: str) -> str:
    m = re.match(r"(\d{4}\.\d{4,6})(v\d+)?", s)
    return m.group(1) if m else s


def parse_date(d: str, mo: str, y: str) -> str:
    return datetime(int(y), MONTHS[mo], int(d)).strftime("%Y-%m-%d")


def scrape_file(path: Path) -> list:
    text = path.read_text(errors="ignore")
    out = []
    for block in text.split('<li class="arxiv-result">')[1:]:
        idm = RE_ID.search(block)
        if not idm:
            continue
        aid = idm.group(1)
        # title
        title = ""
        tm = RE_TITLE.search(block)
        if tm:
            title = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', tm.group(1)))).strip()
        # authors
        authors = []
        am = re.search(r'<p class="authors">(.*?)</p>', block, re.DOTALL)
        if am:
            authors = [a.strip() for a in RE_AUTHOR.findall(am.group(1))]
        # primary category
        cm = RE_PRIMARY_CAT.search(block)
        cat = cm.group(1).strip() if cm else ""
        # date
        dm = RE_DATE.search(block)
        date_s = ""
        if dm:
            date_s = parse_date(*dm.groups())
        # abstract (prefer full)
        abstract = ""
        sm = RE_ABSTRACT.search(block)
        if sm:
            abstract = html.unescape(re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', sm.group(1)))).strip()
        out.append({
            "id": aid,
            "title": title,
            "authors": authors,
            "cat": cat,
            "submitted": date_s,
            "abstract": abstract[:1500],
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--html-glob", required=True)
    ap.add_argument("--state", required=True, help="Path to state.json with seen_ids")
    ap.add_argument("--cutoff", required=True, help="ISO date; only papers submitted on/after this date")
    ap.add_argument("--good-cats", nargs="+", default=["cs.DC", "cs.LG", "cs.PF", "cs.AR", "cs.OS", "cs.NA"])
    args = ap.parse_args()

    state = json.loads(Path(args.state).read_text())
    seen = {base_id(x) for x in state.get("seen_ids", [])}
    cutoff = datetime.strptime(args.cutoff, "%Y-%m-%d")

    files = sorted(Path().glob(args.html_glob)) if False else [Path(p) for p in sorted(__import__("glob").glob(args.html_glob))]
    all_results = []
    for f in files:
        for r in scrape_file(f):
            if r["id"] in seen:
                continue
            if not r["submitted"]:
                continue
            try:
                d = datetime.strptime(r["submitted"], "%Y-%m-%d")
            except ValueError:
                continue
            if d < cutoff:
                continue
            if r["cat"] not in args.good_cats:
                continue
            all_results.append(r)

    # dedupe by id
    by_id = {}
    for r in all_results:
        by_id[r["id"]] = r
    final = sorted(by_id.values(), key=lambda x: (x["submitted"], x["id"]), reverse=True)

    json.dump(final, sys.stdout, ensure_ascii=False, indent=2)
    print(file=sys.stderr)  # ensure newline
    print(f"# {len(final)} candidates after dedup + window + cat filter (cutoff={args.cutoff}, seen={len(seen)})", file=sys.stderr)


if __name__ == "__main__":
    main()
