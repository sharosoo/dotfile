# HTML + mermaid 아티팩트 패턴 (deepwiki 번역 시리즈 등)

사용자가 "html, mermaid diagram"을 명시적으로 요청하면 `format: html` 아티팩트에 mermaid.js CDN을 포함시켜 만든다. 2026-08-09에 DeepWiki centrifugal/centrifugo 전체(9페이지)를 project=centrifugo로 퍼블리시하며 검증된 패턴.

## HTML 골격

```html
<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>…</title>
<script src="https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js"></script>
<script>mermaid.initialize({startOnLoad:true, theme:"default"});</script>
<style>body{font-family:system-ui,…;max-width:880px;margin:0 auto;padding:28px 20px} …</style>
</head>
<body>
<h1>…</h1>
<p>…</p>
<div class="mermaid">
flowchart LR
    A[클라이언트] --> B[Centrifugo]
    E[백엔드] -->|publish| B
</div>
</body>
</html>
```

## 규칙

- **mermaid 소스에 `<` 문자 금지** — HTML 파싱이 깨진다. 라벨에 `<` 대신 "이하", "미만" 등으로 표기.
- `<pre class="mermaid">`에 소스가 남으므로 CDN/iframe 샌드박스에서 스크립트가 안 돌아도 내용은 읽을 수 있는 fallback이 된다.
- semantic headings(h1/h2/h3), 테이블은 `<table>` 그대로, 한국어 문서면 `lang="ko"`.
- 외부 CDN 의존이므로 **렌더 검증은 반드시 브라우저**로: detail 페이지 → "Open"(raw URL로 이동) → 콘솔에서 `document.querySelectorAll('svg').length` 확인. mermaid가 SVG로 변환되면 `pre.mermaid`는 0, `svg`는 ≥1이 된다. curl로는 스크립트 태그 존재만 확인 가능. (콘솔 한 줄로: `(() => {const s=document.querySelectorAll('.mermaid svg').length,p=document.querySelectorAll('pre.mermaid').length; return JSON.stringify({svg:s,unresolved:p})})()`)

## deepwiki 시리즈 번역 패턴

정혁 요청 "deepwiki 글 하나씩에 대응되도록 … project를 파고 한국어로 번역해서 publish":

1. **실제 페이지 목록을 먼저 확보한다.** deepwiki는 SPA지만 `web_extract`로 본문 추출이 가능하다. 사이드바 메뉴에는 수십 개 하위 항목이 보이지만 실제 페이지는 `/org/repo/{n}-slug` 형태로 적다. href 추출은 `browser_console`로: `[...document.querySelectorAll('a[href*="/org/repo/"]')].map(a=>a.getAttribute('href')).filter(h=>h && /\/org\/repo\/\d+-/.test(h))` — 중복 제거 후 사용. web_extract/snapshot으로는 메뉴 링크가 안 나온다. centrifugal/centrifugo의 실제 페이지는 정확히 9개: `1-overview, 2-installation-and-deployment, 3-client-connection-system, 4-server-apis, 5-message-handling, 6-backend-integration, 7-security, 8-operations-and-monitoring, 9-glossary`.
2. **"글 하나씩 대응" = deepwiki 페이지 1개 = 아티팩트 1개, 해당 페이지의 모든 섹션을 통째로 번역.** 섹션 단위로 쪼개면 안 된다 — 정혁이 명시적으로 거부함 ("각 페이지의 섹션 하나씩만 한 것 같노 전체를 다 번역해야한다니까"). 첫 시도에서 1-overview만 7개 섹션 아티팩트로 만들어 지적받았고, 이후 나머지 8개 페이지를 각각 전체 번역 아티팩트로 추가해 15개 = 9페이지 커버로 완료. 예외: 첫 페이지(1-overview)를 이미 섹션 단위로 만들었다면 그대로 두고, 나머지 페이지는 페이지 단위로 추가한다.
3. 새 project로 분리 (예: `project=centrifugo`) — 기존 blog/blog-draft/default와 섞지 않는다.
4. slug 네이밍: `<topic>-deepwiki-{NN}-<page-name>-ko`, NN은 deepwiki 페이지 번호(08-installation-deployment, 09-client-connection-system, …)를 따른다.
5. 각 아티팩트 구성: 해당 페이지의 전체 섹션을 순서대로 한국어 번역(소스 코드 포인터/파일명 포함) + mermaid 다이어그램 1–2개(섹션 성격에 맞는 타입: 개요 flowchart, 아키텍처 계층도, 시퀀스, 선택도, 채널 모델) + 원문 출처 링크(deepwiki 페이지 URL) + 필요시 실용 가이드 절. deepwiki의 이미지 전용 섹션(다이어그램만 있는 항목)은 mermaid로 재현한다.
6. 전부 v1 퍼블리시 후 `list_artifacts(project=…)`로 일괄 확인 + 각 raw URL curl(200, mermaid.js 존재, mermaid 블록 존재, 한국어 타이틀 존재) + 대표 문서 1개는 브라우저로 SVG 렌더 확인.
7. HTML은 린터(no-raw-html 등)가 Markdown에만 적용되므로 경고가 거의 안 난다. 대신 위 브라우저 렌더 검증이 완료 기준.

## 시리즈 확장

deepwiki 페이지 목록이 9개라면 전부 커버했는지 사용자에게 보고한다 (예: "9/9 페이지, 15개 아티팩트"). 진행 상황 보고 시 페이지 수 기준으로 말하고, 이미 섹션 단위로 만든 첫 페이지가 있으면 그 사실도 함께 밝힌다.
