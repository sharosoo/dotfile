# Korean place APIs — what actually answers what

Routing rule: **Kakao for addresses and POI lists, Naver for opening hours, Google as a cross-check.** None of them gives everything.

## Kakao — address + POI enumeration (no key, plain GET)

```
https://search.map.kakao.com/mapsearch/map.daum?q=<urlencoded>&msFlag=A&sort=0&page=1
```

Headers: browser User-Agent + `Referer: https://map.kakao.com/`. JSON response:

- `address[]` — jibun lookup result: `addr`, `lat`, `lon`, `zone_no`, `related_address` (road name + `^lon,lat`). This is the reliable geocoder for `역삼동 720-22` style input.
- `place[]` — `confirmid` (dedupe key), `name`, `address` (jibun), `new_address` (road), `tel`, `lon`, `lat`, `last_cate_name` (e.g. `코인노래방`), `cate_name_depth3` (`노래방`), `distance` (from region center — do not use).
- `guide_info_list[]` / `guide_message[]` — show how Kakao resolved the query: `located_query` with `search_center` + `search_center_radius=2000` when a 동/역 is in the phrase, otherwise `user_location`. Region phrases are what scope the result set.
- `page_count` is a constant-ish 25; just page until `place[]` comes back empty.

Miscategorisation is common: a keyword `노래방` query returns 주점/미용실 too, and coin karaoke are split between the `코인노래방` and plain `노래방` categories. Query both and filter yourself.

### Kakao place detail — cannot answer hours

- `https://place.map.kakao.com/<confirmid>` is an SPA shell; `https://place.map.kakao.com/main/v/<id>` 404s.
- `https://place-api.map.kakao.com/places/panel3/<id>?appVersion=6.0.0&pf=web` returns JSON when you also send the `pf: web` header (without it: 406/400). Fields: `summary` (name, category, address, phone_numbers, point), `menu`, `kakao_map_review`, tags.
- **There is no `openHour`-style field** in the panel payload, and the rendered place page has no 영업시간 section. Don't spend calls here for hours questions — go to Naver.

## Naver — opening hours (the only reliable source)

Direct JSON routes are not worth it: `map.naver.com/p/api/search/allSearch` answers with a captcha placeholder (`CE_EMPTY_TOKEN`), and `pcmap-api.place.naver.com/place/list` is a GraphQL endpoint behind an Apollo CSRF check. Read the **rendered search page** in the browser instead:

```python
goto_url("https://search.naver.com/search.naver?query=" + urllib.parse.quote("역삼동 코인노래방"))
wait_for_load(); time.sleep(4)
text = js("document.body.innerText")
segment = text[text.find("플레이스"):]   # the place-card block
```

The 플레이스 block renders one card per shop with, in order: `상호` + `노래방`, then either `24시간 영업연중무휴` or `영업 중02:00에 영업 종료`, then `현재 위치에서` + `N km`, then `시/구/동`, then a one-line blurb. Card text is dense; slice and split on newlines, then match on `24시간`, `영업`, `종료`, `시작`, `층`, `동`.

- Adding `24시간` to the query biases results toward shops that carry the attribute: `코인노래방 24시간 <동/역>` surfaces the real 24h set.
- `현재 위치에서 N km` is IP-geolocation based. It may coincidentally match the user's neighbourhood — still recompute from your own geocode before quoting it.
- `map.naver.com/p/search/<query>` renders the list into `#searchIframe` and the place detail into `#entryIframe`, both same-origin, so `contentDocument.body.innerText` works. They appear only after the panel renders; a loop that clicks list item N on a freshly-reloaded page will fail on the first item.

## Google Maps — cross-check only

```
https://www.google.com/maps/search/<상호>?hl=ko&gl=kr
```

Read `document.body.innerText`. Lines look like `노래방 · 테헤란로20길 25 지하 1층`, `영업 중 · 오전 1:30에 영업 종료`, `24시간 영업 · 02-558-7436`. A generic category query (`maps/search/코인노래방/@lat,lon,16z`) shows only ~5 results in the limited view, so per-shop name queries are how you get hours. Korean SME metadata is thinner than Naver's: when they disagree, Naver wins and you flag the conflict.

## Distance / walking time

Haversine from the geocoded origin. Walking time ≈ `distance_m / 75` minutes for flat urban Seoul. State that distances are straight-line — OSRM/`maps` walking routes are a separate, heavier call and their Asia coverage is uneven.
