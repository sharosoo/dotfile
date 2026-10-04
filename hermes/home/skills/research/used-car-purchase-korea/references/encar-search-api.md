# 엔카 실매물 직접 조회 (search API)

웹 UI 스크래핑보다 정확한 1차 데이터 소스. 커뮤니티 정설로 방향을 잡은 뒤, 옵션 조건과 가격 밴드는 이 API 실측으로 확정한다. 문법은 시점 불변, 카운트 수치는 조사 시점 값이다.

## 기본 호출 (서버 측 curl / python urllib)

```
GET https://api.encar.com/search/car/list/general?count=true&q=<q>&sr=<sr>
헤더: User-Agent (아무 값이든), Referer: https://www.encar.com/
```

- `sr`은 pipe 3개 구분 `|SortKey|offset|limit` — URL에서 pipe는 반드시 `%7C` 인코딩.
- q에 한글이 들어가면 **q 전체를** percent-encoding해서 URL에 넣는다 — 원문 한글을 그대로 붙이면 `http.client`에서 `UnicodeEncodeError: 'ascii' codec can't encode`로 죽는다. `urllib.parse.quote(q, safe='()_.')`로 괄호·언더스코어와 필터 구분자 `_.`를 보존한다(`safe`에서 `.`을 빼면 구분자가 깨진다). 옵션 토큰처럼 부분 인용은 한글 없는 쿼리를 조립할 때만 쓴다.
- 브라우저 탭에서 직접 호출(탑레벨 네비게이션·fetch)은 CORS/400으로 실패 — curl·urllib 서버 측 호출만 동작한다.

```python
import json, urllib.request
from urllib.parse import quote

def api(q, sr="|MobileModifiedDate|0|100"):
    url = ("https://api.encar.com/search/car/list/general?count=true&q="
           + quote(q, safe='()_.')            # q 전체를 인코딩 — 한글은 반드시 여기서
           + "&sr=" + quote(sr, safe=''))
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0', 'Referer': 'https://www.encar.com/'})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode('utf-8'))

# ACC 국산 전체, 가격 오름차순 300건
CC = quote("크루즈 컨트롤(어댑티브)", safe='()_')
j = api(f"(And.Hidden.N._.CarType.A._.Options.{CC}.)", "|PriceAsc|0|300")
```

- 응답: `{"Count": N, "SearchResults": [...]}`. 아이템 필드: Id, Manufacturer, Model, Badge, BadgeDetail, Year(YYYYMM), FormYear, Mileage, Price(만원), OfficeCityState, Condition, Photo(s), SellType(일반=매매, 렌트·리스=장기렌트·리스 승계매물 — 추천 후보에서 제외), FuelType(가솔린/디젤/`LPG(일반인 구입)`).
- 아이템에는 **승차정원·신차 기준가가 없다** — `GET /v1/readside/vehicle/{id}`(같은 헤더)로 `spec.seatCount`(2=화물밴), `spec.fuelName`·`mileage`, `category.originPrice`(신차가, 만원 — 잔존율의 분모), `contact.userType`, `manage.viewCount`·`reRegistered`를 붙인다. 저가 띠 해석과 잔존율 계산에 먼저 붙이는 필드다.
- 리스트 API 아이템에는 옵션 상세가 없다 — 트림 판정은 디테일 페이지 `fem.encar.com/cars/detail/<Id>` 본문의 '옵션 정보 있음/없음' 목록으로 확인한다.

## q 문법

- 형태: `(And.Hidden.N._.필드.값._.필드.값.)` — 필터 토큰 구분자는 `_.`, 값 안 공백·괄호는 그대로 둔다.
- 검증된 필드: `Hidden`(N), `CarType`(A=국산), `Manufacturer`, `ModelGroup`(아반떼/K3/쏘나타/그랜저/스포티지/QM6…), `Model`(세부: 아반떼 AD, 더 뉴 QM6…), `FuelType`(값 예: `LPG(일반인 구입)` — `LPG` 단독은 200/Count 0), `Options`(<옵션명>(<서브값>)).
- `Manufacturer` 값은 제조사 개명을 따라간다(르노삼성 → `르노코리아(삼성)`). 없는 값을 넣어도 404가 아니라 **200/Count 0**이 나오므로, 제조사명이 불확실하면 `ModelGroup`(+`FuelType`)으로 좁히는 편이 안전하다.
- **필터 '값'도 추측하지 않는다** — 키가 맞고 값 문자열만 틀리면 위 `Manufacturer` 사례처럼 200/Count 0으로 와서 실제 0건과 구분되지 않는다(`LPG` → 0, `LPG(일반인 구입)` → 670. `Model.QM6` → 0, `Model.더 뉴 QM6` → 정상). 절차: `ModelGroup.<그룹>.` 같은 넗은 조건으로 200건을 받아 `collections.Counter`로 Manufacturer/Model/FuelType/Badge의 실제 값을 세고, 그 문자열을 그대로 q에 넣어 Count를 재확인한다. 이 절차 없이 200/Count 0을 '매물 없음'으로 단정하지 않는다.
- HTTP 코드가 프로브 신호다:
  - **404 = 존재하지 않는 필드 키** (키 오타)
  - **400 = 파서 오류** — 괄호 불균형, 미지원 연산자, 잘못된 정렬 토큰
  - **200 + Count:0 = 문법·키 정상, 매물 0건** — "필터가 틀렸다"와 "매물이 없다"를 구분하는 유일한 신호
- `Or` 하위식과 `$gte`/`$lte` 범위 연산자는 400 — 범위 조건은 받아서 클라이언트에서 거른다.
- 정렬 토큰: `ModifiedDate`, `MobileModifiedDate`, `PriceAsc`, `Mileage`, `Year` = 정상. `Price`, `FormYear` = 400. 가격 오름차순은 `PriceAsc`다.
- `Price.800` 같은 값 필터는 200이지만 Count가 사실상 전체 — 가격 조건을 쿼리에 넣지 말고 코드에서 필터링한다.

## 옵션 토큰 확인 절차 (모르는 옵션을 쓸 때)

API 문서가 없으므로 UI가 만드는 토큰을 캡처한다:

1. `https://m.encar.com/ca/search.do#!{"type":"car","action":"(And.Hidden.N._.CarType.A.)","toggle":{},"layer":"","title":"","sort":"MobileModifiedDate"}` 열기
2. '옵션' 링크 클릭 → 해시가 `layer:optOption`으로 변함
3. 카테고리(안전/편의·멀티미디어 등) 탭에서 대상 라벨의 checkbox를 찾아 클릭 (id는 `gOptOption_<코드>`지만 라벨 텍스트로 찾는다)
4. '확인' 클릭 → `location.hash`의 action에 `Options.<옵션명>(<서브값>)` 형태로 토큰 노출
5. 캡처한 토큰으로 API를 돌려 Count가 기대와 맞는지 확인

서브값 의미는 단일 카운트로 판단하지 않는다 — 옵션 전량 장착이 확실한 모델(그랜저 등)로 두 서브값의 샘플 100건씩 뽑아 교집합을 확인하면 배타/포함 관계가 드러난다.

## 크루즈/ACC 토큰 (검증 완료)

- `Options.크루즈 컨트롤(일반)` = 일반 크루즈 전용. ACC 차량 미포함.
- `Options.크루즈 컨트롤(어댑티브)` = ACC(스마트 크루즈) 전용. 일반과 상호배타(교집합 0).
- `크루즈 컨트롤` 단독, `스마트크루즈`, `어댑티브 크루즈`, `ACC` 변형 토큰은 모두 없다(Count 0).
- ACC 토큰은 등록 매물에만 붙는다 — 후장착·등록 누락 차는 토큰이 없으므로 최종 후보는 디테일 문구와 시운전(SET 후 차간거리 버튼 동작)으로 재확인한다.

## 검색 공유 링크 생성 (사용자 전달용)

```
https://car.encar.com/list/car?page=1&search=<URL-encode된 JSON>
JSON: {"type":"car","action":"<q 문자열>","title":"","toggle":{},"layer":"","sort":"MobileModifiedDate"}
```

- 위 q 문법을 그대로 action에 넣고 JSON 전체를 URL-encode한다. 실제로 렌더되는지 한 번 열어 매물 수를 확인 후 전달한다.

## 함정

1. `PriceAsc` 상위권에 1~50만원 낚시가격 허위매물이 깔려 있다 — 현실가 하한(≥200만) 클라이언트 필터 후 집계한다.
2. 동일 차량이 ID만 다르게 2개 등록돼 있다(가격·연식·주행거리 동일) — 집계 전 (가격, 연식, 주행거리) 중복 제거.
3. 최저가 단일 건을 대표값으로 말하지 않는다 — 허위가·중복·개인/딜러가 섞여 있으므로 밴드(최저 2~5건)로 제시한다.
4. 옵션 필터 토큰을 웹검색이나 추측으로 만들지 않는다 — 반드시 UI 캡처 → API Count 검증을 거친다.
5. 저가 띠를 배지 문자열로 해석한다 — 같은 배지가 2인승 화물밴(`seatCount` 2)이거나 렌트 전용 트림일 수 있다. 집계 전에 `readside/vehicle`을 붙여 승차정원으로 거른다.
