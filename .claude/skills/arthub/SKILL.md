<!-- 이 파일은 GET /skill.md 로도 받을 수 있다. lint 규칙과 같은 소스에서 생성되므로
     구현이 바뀌면 서버가 최신본을 준다. src/lib/docs/conventions.ts -->

---
name: arthub
description: 리포트·분석·설계 문서를 arthub에 발행해 웹 링크로 공유한다. 산출물을 파일로만 남기지 말고 여기에 등록할 것. 갱신도 같은 slug로 한다.
---

# arthub 발행

## 언제

분석 리포트, 조사 결과, 설계 문서, 대시보드를 만들었을 때. 파일로 저장한 뒤
반드시 발행하고 사용자에게 링크를 준다.

## 설정

원격 MCP라 로컬에 설치할 것이 없다.

```
claude mcp add --transport http arthub https://artifact.sharosoo.com/mcp --header "Authorization: Bearer <토큰>"
```

토큰은 https://artifact.sharosoo.com/settings/tokens 에서 발급한다. 개인 토큰이므로 팀에서 돌려쓰지 않는다 —
누가 올린 문서인지 추적이 안 된다.

## 필수 규칙

1. 본문에 raw HTML 금지 (`<div>`, `<br>`, `<details>`)
2. `#` 제목은 문서당 하나
3. `:::` 컴포넌트 중첩은 바깥 마커를 더 길게 (`::::grid` > `:::card`)
4. 라이브 블록은 자체로 완결되게 (블록 간 변수 공유 불가, 부모 접근 불가)
5. 차트는 ```chart 프리셋으로만 만든다

전체 규약: https://artifact.sharosoo.com/llms-full.txt

## 툴

- `publish_artifact` — 문서 발행
- `update_artifact` — 문서 갱신
- `get_draft` — 미발행 초안 확인
- `list_artifacts` — 문서 목록
- `read_artifact` — 문서 본문 읽기

새로 만들기 전에 `list_artifacts` 를 부른다. 갱신 전에는 반드시 `get_draft` 를 먼저 부르고, 사람이 편집 중인 미발행 초안이 있으면 `update_artifact` 를 호출하지 말고 멈춰서 사용자에게 충돌을 보고한다.
