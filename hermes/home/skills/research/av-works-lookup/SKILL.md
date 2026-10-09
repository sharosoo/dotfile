---
name: av-works-lookup
description: Use when looking up an AV work code or actress filmography.
---

# AV 작품 코드 / 배우 조회

## When to Use

- 사용자가 품번(예: MNGS-072)을 던지며 내용을 물을 때
- 배우 이름으로 프로필·전체 작품 목록·커버 이미지를 요청할 때
- 특정 배우의 특정 기간(연도) 작품 전체를 요청할 때

작품 코드(품번)나 배우 이름으로 메타데이터·필모그래피·커버 이미지를 찾는 클래스. 사용자는 이걸 일반 제품 조회처럼 취급해줄 것을 기대한다 — 주제에 대한 서론·경고 없이 한국어 반말로 컴팩트하게 답한다.

## Procedure

1. **코드 식별**: `web_search`에 코드를 원형 그대로 ("mngs072", "MNGS-072"). at-mania / productfeed 계열 스니펫이 메이커·출연자·감독·발매일·러닝타임을 돌려준다 — "이 코드가 뭐냐" 질문은 보통 이걸로 끝.
2. **배우 필모그래피**: ja.wikipedia 배우 문서를 `curl -A "Mozilla/5.0"`으로 통째로 받는다. 인기 배우의 사실상 유일한 완전 목록이다(제목·날짜·메이커, AV/VR/그라비아/사진집/연도별 섹션 분리). 애그리게이터(avbase, DUGA)는 누락·지연이 있어 교차 확인용으로만. 출품작 리스트는 collapse 섹션 안에 있다 — `data-mw` JSON의 `\n*` 항목을 파싱하거나 렌더된 `<li>`에서 추출 후 위키 마크업 제거(`[[a|b]]`→`b`, `{{...}}`→공백).
3. **제목→품번 역lookup**: `web_search`를 `"<배우명>" "<제목 특이 조각>" 品番` 형태로 날리고 결과(제목+설명+URL)에서 `\b[A-Z]{2,6}-\d{2,4}\b`를 정규식 추출. productfeed.org / at-mania / sxx.co.jp는 URL 경로에 코드가 온다. 알고 있는 코드의 prefix로 검색하면(`배우명 MNGS-06x`) 같은 시리즈 형제작이 나온다.
4. **커버 이미지**: DMM 이미지 CDN은 코드에서 결정론적으로 유도된다(전 메이커 공통):
   `https://pics.dmm.co.jp/digital/video/<알파벳><숫자 5자리 zero-pad>/<같은 문자열>pl.jpg`
   예: `MNGS-072` → `mngs00072`. curl + 브라우저 UA. HTTP 200과 크기 >10KB를 둘 다 확인(실패 시에도 응답이 오므로 상태코드만 믿지 말 것). `pl.jpg`는 랩어라운드 전체 자켓. 또는 `scripts/fetch_covers.py` 실행.
5. **전달**: 단일 커버 → 로컬 다운로드 후 `MEDIA:` 첨부. 다수(5장 초과) → 30개 개별 첨부 대신 라벨 붙은 contact sheet 한 장으로.
6. **정직한 목록**: 검색 히트 + 이미지 HTTP 200 확인이 둘 다 된 코드만 포함. 확정 못한 작품은 코드를 지어내지 말고 "미확정 N편 제외"라고 명시한다.

## Montage (라벨 contact sheet)

- 파일마다:
  `magick in.jpg[500x] -gravity southeast -stroke '#000' -strokewidth 4 -pointsize 24 -annotate +12+14 "CODE" -stroke none -fill white -annotate +12+14 "CODE" -resize 400x out.jpg`
- 격자: `montage labeled/*.jpg -tile 4x8 -geometry +5+5 -background black sheet.jpg`
- 실패 모드는 판독성이다: 320px 타일 + 기본 포인트는 라벨이 못 읽힌다. 400px + pointsize 24 + strokewidth 4(검정 stroke 위 흰 글씨)는 vision_analyze에서 판독됨.
- 보내기 전 `vision_analyze`로 라벨 하나가 실제로 읽히는지 확인.

## Pitfalls

- missav.ws, javdb.com은 curl을 거부한다(connection code 000). 스크래핑 시도에 시간 쓰지 말 것 — DMM CDN + ja.wikipedia + web_search 조합으로 전부 커버된다.
- URL 패턴은 메이커 무관: MOODYZ/Fitch/本中/ダスッ!/ワンズ/痴女ヘブン/kawaii*/アタッカーズ/マドンナ/無垢/ROYAL/Hsoda/エムズ/OPPAI 전부 `pics.dmm.co.jp/digital/video/`에서 해결됨.
- 숫자 부분은 4자리가 아니라 5자리 zero-pad (`mngs00072`, `dass00977`).
- ja-wiki에서 첫 "2026年" 히트 근처의 `<li>` 추출은 인포박스를 잡는다 — `data-mw` 안 `hidden begin` 템플릿의 `title: 2026年`을 기준으로 잡을 것.
