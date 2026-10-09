---
name: typography-setup
description: "Use when setting up web or document typography."
version: 1.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [typography, fonts, korean, webfont, e-ink, css, specimen]
    category: creative
    related_skills: [font-graft-build]
---

# 타이포그래피 설정 (한글 및 영문)

## When to Use

- 한글과 영문이 혼용된 프로젝트의 웹, 문서, 전자책 타이포그래피를 설정할 때 사용합니다.
- 용도별 폰트(본문, 제목, UI, 코드)를 배치하거나 폰트 CSS 토큰을 작성할 때 참조합니다.
- 폰트 적용 상태를 보여주는 표본집(specimen)이나 예시 문서(PDF)를 제작할 때 활용합니다.
- 사용자 폰트 시스템은 `~/workspaces/sharosoo/fonts` 모노레포에 있습니다. 작업 전에 해당 경로의 `docs/TYPOGRAPHY_SETUP.md`를 먼저 확인합니다.

## Roles

각 역할마다 폰트를 하나씩 배정하며, 한 화면에 최대 4개까지만 사용합니다.

- 본문 serif: **Jeongdok** (영문 Libron, 한글 리디바탕 조합).
- 제목 및 브랜드: **Jeongdok Display** (Newsreader opsz 72 및 마루 부리 조합). 28px 이상 크기에만 적용합니다.
- UI 및 정보 안내용 sans: **IBM Plex Sans KR** (Google Fonts 제공본을 수정 없이 사용). 실측 메트릭이 Jeongdok과 가장 가까워 선정했습니다.
- 코드: **D2Koding** (D2Coding 및 Nerd Fonts 조합, 리가처 빌드). 터미널에는 로컬 Nerd Font Mono 변형을 사용합니다.

## Defaults

- 줄간격: 본문 1.7~1.8, UI 1.4~1.5, 제목 1.15~1.25, 코드 1.5. 한글 본문은 한 줄당 28~38자를 유지합니다.
- 한글 줄글에는 `word-break: keep-all; overflow-wrap: break-word; text-wrap: pretty`를 적용합니다.
- 한글 폰트는 `font-display: swap`을 지정해 다이내믹 subset(unicode-range) 방식으로 불러오며, 본문 폰트만 프리로드합니다.
- UI 내 숫자는 tabular figures를 적용합니다. 아이콘 폰트 대신 SVG 아이콘을 사용합니다.
- E Ink 기기의 본문 텍스트에는 Jeongdok만 씁니다. Display의 hairline은 작은 크기나 2비트 그레이 환경에서 획이 깨집니다.
- 제시된 수치는 경험적 기준치이며 실측 최적값이 아닙니다. 육안으로 확인하고, E Ink 화면은 실제 기기에서 점검합니다.

## Specimen and example documents

1. 패키지를 빌드(`uv run scripts/build.py <package>`)한 뒤, `docs/specimen/index.template.html` 및 원고 파일 `docs/specimen/copy.ko.json`을 수정합니다.
2. 헤드리스 Chromium(`uv run scripts/specimen.py`) 또는 브라우저 도구의 `Page.printToPDF`로 렌더링합니다. PyMuPDF(`uv run --with pymupdf`)를 실행하여 모든 폰트 패밀리가 포함되었는지, 페이지 넘침이 없는지 검사합니다.
3. 표본집에 임의의 수치를 넣지 않습니다. 글자 크기와 글자 수는 빌드된 파일에서 확인해 기재합니다.
4. 문서와 표본집에 들어갈 한글 문안은 영문 기획을 바탕으로 Gemini가 작성합니다. `briefs/`에 기획을 작성한 뒤 `uv run scripts/ko_write.py <brief> -o <output>`를 실행하면 스크립트가 숫자, URL, 코드, 마커 누락 여부를 검증합니다.

## Pitfalls

- 문서의 CDN 링크는 저장소 푸시를 완료하고 `<package>-v<version>` 태그가 생성된 뒤에만 작동합니다.
- 수정한 OFL 폰트에는 기존의 Reserved Font Name을 유지할 수 없습니다. 원본 출처는 `OFL.txt` 및 `CREDITS.md`에 명시합니다.
- 시각 모델(Vision model)은 글꼴의 시각적 굵기를 판별하지 못합니다. 계측값과 함께 사용자의 육안 검수를 병행합니다.

## Files

- `docs/TYPOGRAPHY_SETUP.md`: 전체 설정 안내서.
- `docs/TYPE_SYSTEM.md`: 역할별 폰트 명세, CSS 변수 및 CDN 링크.
- `docs/specimen/`: 표본집 자료(HTML 템플릿, 한글 원고, PDF).
- 관련 스킬: `font-graft-build` (폰트 자체 빌드 및 패키징).
