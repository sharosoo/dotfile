#!/usr/bin/env python3
"""Korean POI lookup via Kakao's public map search (no API key).

Geocode a jibun/road address, then enumerate nearby businesses and print
straight-line distances from that address.

Usage:
  python3 kakao_poi.py geocode "역삼동 720-22"
  python3 kakao_poi.py near --at "역삼동 720-22" --q "코인노래방" --radius 1500
  python3 kakao_poi.py near --at "역삼동 720-22" --q "코인노래방" --q "노래방" --radius 1500

Caveats this script encodes:
  * `place[].distance` is measured from the REGION center Kakao picked, not
    from your address -> distances are recomputed with haversine here.
  * `place[]` is not filtered by the keyword's category -> filter the printed
    rows on `category` yourself (small shops are often miscategorised).
"""
import argparse
import json
import math
import time
import urllib.parse
import urllib.request

UA = (
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
API = "https://search.map.kakao.com/mapsearch/map.daum?q={q}&msFlag=A&sort=0&page={page}"


def _get(url):
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": UA,
            "Referer": "https://map.kakao.com/",
            "Accept-Language": "ko-KR,ko;q=0.9",
        },
    )
    return urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")


def search(query, page=1):
    return json.loads(_get(API.format(q=urllib.parse.quote(query), page=page)))


def geocode(address):
    """Return (lat, lon, jibun_or_display, road_address)."""
    data = search(address)
    if data.get("address"):
        a = data["address"][0]
        road = (a.get("related_address") or "").split("^")[0]
        return a["lat"], a["lon"], a["addr"], road
    if data.get("place"):
        p = data["place"][0]
        return p["lat"], p["lon"], p.get("new_address") or p["address"], ""
    raise SystemExit("no Kakao result for %r" % address)


def haversine(lat1, lon1, lat2, lon2):
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


KEEP = (
    "name",
    "address",
    "new_address",
    "tel",
    "lon",
    "lat",
    "last_cate_name",
    "cate_name_depth3",
)


def collect(queries, pages=3):
    seen = {}
    for q in queries:
        for page in range(1, pages + 1):
            try:
                places = search(q, page).get("place") or []
            except Exception as exc:  # keep going; one phrasing may be empty
                print("# query failed: %s p%d: %s" % (q, page, exc))
                break
            if not places:
                break
            for p in places:
                cid = p.get("confirmid")
                if cid and cid not in seen:
                    seen[cid] = {k: p.get(k) for k in KEEP}
            time.sleep(0.3)
    return seen


def cmd_geocode(args):
    lat, lon, jibun, road = geocode(args.at)
    print("jibun=%s\nroad=%s\nlat=%.6f lon=%.6f" % (jibun, road, lat, lon))


def cmd_near(args):
    lat, lon, jibun, road = geocode(args.at)
    print("# origin: %s / %s (%.6f, %.6f)" % (jibun, road, lat, lon))
    rows = []
    for p in collect(args.q, args.pages).values():
        if p.get("lat") is None:
            continue
        d = haversine(lat, lon, p["lat"], p["lon"])
        if d <= args.radius:
            rows.append((d, p))
    rows.sort(key=lambda r: r[0])
    for d, p in rows:
        print(
            "%6.0fm (%2.0f분) | %s | %s | tel=%s | %s"
            % (
                d,
                d / 75.0,
                p["name"],
                p.get("new_address") or p.get("address") or "",
                p.get("tel") or "-",
                p.get("last_cate_name") or p.get("cate_name_depth3") or "",
            )
        )
    print("# %d rows within %dm (distances are straight-line)" % (len(rows), args.radius))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    g = sub.add_parser("geocode")
    g.add_argument("at")
    g.set_defaults(func=cmd_geocode)
    n = sub.add_parser("near")
    n.add_argument("--at", required=True, help="기준 지번/도로명 주소")
    n.add_argument("--q", action="append", required=True, help="검색어, 반복 가능")
    n.add_argument("--radius", type=int, default=1500)
    n.add_argument("--pages", type=int, default=3)
    n.set_defaults(func=cmd_near)
    args = ap.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
