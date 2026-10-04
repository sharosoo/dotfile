---
name: korea-local-place-lookup
description: "Use when finding Korean places, addresses, hours."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [korea, places, poi, address, geocoding, opening-hours, distance, kakao, naver, local-search]
    category: productivity
    requires_toolsets: [terminal, browser]
    related_skills: [maps, korea-shopping-price-stock]
---

# Korea Local Place Lookup

한국 주소를 기준으로 "근처에 X 있나", "몇 시까지 하나", "얼마나 걸려"를 **출처 있는 근거로** 답하는 절차. OSM/Nominatim 기반 `maps` 스킬은 글로벌 좌표·라우팅용이고, 한국 지번 주소와 소상공인 영업시간에는 이 스킬을 쓴다.

## When to Use

- '내 집 근처(역삼동 …)에 24시간 코인노래방 좀', '~동 맛집·약국·편의점', '~ 근처에 뭐 있어'
- 특정 업체가 아직 영업 중인지, 전화번호·도로명/지번 주소 확인
- 영업시간·거리·도보 시간을 근거와 함께 답해야 할 때
- Nominatim이 좌표를 못 주는 한국 지번 주소로 거리 계산이 필요할 때

## 순서

1. **주소 → 좌표: Kakao 검색 API.** `scripts/kakao_poi.py geocode "역삼동 720-22"`. 지역명+번지 형태를 그대로 넘긴다. Nominatim은 한국 지번(`역삼동 720-22`)에 빈 배열을 돌려주므로 시도하지 않는다.
2. **근처 POI 열거: 좌표가 아니라 지역 키워드로.** `<동> <업종>` 형태(`역삼동 코인노래방`)를 여러 표현으로 돌리고(`<역> <업종>`, `<업종> <동>`), `confirmid`로 dedupe한다. Kakao가 지역을 해석해 `search_center`/`search_center_radius`를 스스로 잡아준다. `page=1..N`으로 페이지네이션.
3. **`place[]`는 키워드 카테고리로 필터되지 않는다.** `last_cate_name`/`cate_name_depth3`를 직접 보고 걸러라 — 한 번의 응답에 노래방·주점·미용실이 섞여 나온다.
4. **거리는 직접 계산(haversine).** Kakao의 `distance` 필드는 **지역 중심**에서의 거리지 사용자 주소에서의 거리가 아니다. 도보 시간은 대략 `거리 / 75` m·min.
5. **영업시간: 네이버 통합검색을 브라우저로 렌더**해서 읽는다(`references/korean-place-apis.md`의 레시피). Google Maps는 교차확인용.
6. **답변 조립** — 아래 형식.

## 영업시간 규칙 (가장 중요)

- **출처 없는 '24시간' 금지.** 매장별 제공 여부가 달라서, 영업시간이 없으면 없다고 말한다.
- **네이버와 구글이 자주 다르다**(한쪽 `24시간`, 다른 쪽 `05:00 영업 종료`). 다르면 '엇갈림'으로 분리하고 전화번호를 같이 준다.
- **구글 리스트 뷰는 카테고리 검색 시 5개 안팎만 노출**한다. 영업시간 라인은 상호로 개별 검색했을 때 나온다.
- **네이버 '현재 위치에서 N km'는 IP 위치 기반**이다. 인용하지 말고 직접 계산한 거리를 쓴다.
- 소스마다 갱신이 들쭉날쭉하므로, 새벽 방문 목적이면 마지막에 "전화 확인" 한 줄을 붙인다.

## 답변 형식 (이 사용자)

한국어 반말, 인사·서론 없음, 불릿, 라벨식(Discord는 표 미지원).

- 그룹 순서: **확실한 24시간 → 새벽까지(가까운 순) → 정보 엇갈림**
- 항목당: 이름 — 도로명 주소(지번), 직선거리·도보 N분, 영업 종료 시각, 전화
- 마지막에 거리 기준(직선거리)과 데이터 캐비오트 한 줄, 매장별 지도 링크

## Pitfalls

- `terminal`은 URL에 `&`가 들어간 인라인 heredoc을 backgrounding으로 오인해 거부한다. 스크립트를 `write_file`로 저장한 뒤 `python3 /tmp/x.py`로 실행한다.
- '코인노래방'은 실제 POI 카테고리지만 상당수 매장이 평범한 '노래방'으로 등록돼 있다. 둘 다 검색하지 않으면 가장 가까운 후보를 놓친다.
- OSM/Overpass의 한국 소상공인 커버리지는 얇다. 보조로만 쓰고 여기서 나온 결론을 1차 근거로 삼지 않는다.
- 네이버 지도의 검색 결과/상세는 `#searchIframe`/`#entryIframe` 안에 있고 패널이 렌더된 뒤에만 존재한다(같은 오리진이라 `contentDocument` 읽기는 가능). 첫 로드에 iframe이 있으리라 가정하는 반복 루프는 첫 항목에서 깨진다.
- 지번 주소의 `related_address` 필드가 도로명 주소다. 지번만으로는 지도 검색이 안 되는 매장이 많아 도로명을 함께 출력한다.

## Files

- `scripts/kakao_poi.py` — 주소 geocode + 반경 내 POI 열거 + haversine 거리 출력 (키 불필요).
- `references/korean-place-apis.md` — Kakao/Naver/Google 엔드포인트, 응답 필드, 영업시간 읽는 레시피.
