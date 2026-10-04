# Design-Series Style & Frontend-Auth Conventions (GPAI 2.0, 정혁)

Session-proven rules from the GPAI 2.0 design-series authoring sessions (2026-08-24).
Companion to `design-series-maintenance.md` — this file adds the style blacklist,
series-wide terminology propagation, domain-anchored frontend-auth structure, and
the OIDC-necessity Q&A frame.

## 1. Natural-Korean audit — AI-ism blacklist

번역투 외에도 AI-ism 표현을 정혁이 즉시 거부한다. 수정 전 grep 대상:

| Rejected pattern | Why | Fix |
|---|---|---|
| "X는 전부다 / 딱 하나 / 이것이다" | AI 단정 어투 | "X는 세 가지다", "하나이고" — 평서문으로 |
| "알 필요는 없다" (도입부에서 재언급) | 같은 말을 다시 하는 것 자체가 거슬림 | 말할 것만 말하고 끝내기. 부정적 재언급 자체를 제거 |
| "세 줄이 전부다" 류 작업량 과장 | AI 냄새 | "호출 몇 줄 정도다" 또는 삭제 |
| em-dash(—) 남용 | 한국어에서 비자연스러움 | 쉼표/마침표로 분리. 제목의 em-dash도 "토큰은 하나, 검증은 각자" 식으로 제거 |
| "유출돼도" | 띄어쓰기 오류 | "유출되어도" |
| "못 쓴다 … 남으므로 피한다" | 부정적 어체 | "지원하지 않으므로 쓸 수 없다 … 남기 때문에 피한다" |
| "개념 자체가 없다" | 과격 단정 | "개념이 성립하지 않는다" |

Pre-publish grep: `전부다`, `딱 하나`, `알 필요는 없다`, `개념 자체가 없다`, `유출돼도`,
과도한 `— `. 스타일 교정은 선택이 아니라 deliverable의 일부다.

## 2. Terminology consistency across a series

용어가 바뀌면(BFF → 로그인 전용 Server Route) 시리즈 전체에 전파해야 한다:

1. 전체 문서셋에서 구용어 grep (`BFF`, `Route Handler`, `apiGateway` 등) — 제목, 표, mermaid 라벨, 코드 주석 포함.
2. 이름 바뀐 문서의 H1 → 그걸 참조하는 형제 문서(4편의 "BFF 응집" → "Server Route 응집") → 인덱스 TOC 행 → 인덱스 토폴로지 라벨 순서로 갱신.
3. 구용어 0건이 완료 기준. **"용어 정리" 노트로 옛 이름을 설명하지 말 것** — 정혁 규칙: "BFF라는 말을 하지마". 이름을 알려주는 노트 자체가 옛 용어를 노출하고 AI 냄새가 난다.

## 3. Frontend auth docs: domain-anchored structure (gpai.app)

프론트/인증 시리즈 문서는 추상 프로토콜 이름이 아니라 **구체적 도메인 배치**로 앵커한다:

1. **도메인 표**로 시작: `app.gpai.app`(Web + Server Route), `auth.gpai.app`(IdP), `api.gpai.app`(Hono), `worker.gpai.app`(Python), `rt.gpai.app`(relay), 모바일 — 각 도메인의 인증 역할.
2. **토큰/쿠키 발급·저장 지도**가 핵심 섹션: 토큰별(access_token, refresh_token, IdP 세션 쿠키) — 무엇인가/발급 방식/저장 위치/쓰이는 곳/제한 조건. Web과 Mobile(PKCE) 표를 나란히.
3. 로그인 시퀀스(Web Server Route + Mobile PKCE) → refresh 시퀀스(Web은 Server Route 경유, Mobile은 직접, SSO 폴백).
4. 명시해야 할 구분:
   - access_token은 **헤더**지 쿠키가 아님 → 도메인 무관, 어떤 API 서브도메인에도 전송 가능.
   - refresh_token 쿠키는 `Path=/api/auth/refresh`, 도메인 `app.gpai.app` → Server Route로만 흐른다.
   - IdP 세션 쿠키(`auth.gpai.app`)는 **별개** 쿠키로 refresh 만료 시 SSO 재로그인 담당 — 쿠키/토큰 3층 구조.
   - audience는 **클라이언트당 서버 설정값**이지 요청마다 고르는 값이 아님. refresh_token은 `offline_access` scope 요청 시 token 교환 응답에 함께 오며 사용할 때마다 rotation.
   - Mobile은 Server Route가 없어 앱이 auth.gpai.app에 직접 붙고, PKCE + Keychain이 client_secret을 대체.
5. 프론트엔드 프레이밍: "로그인 → access_token 부착 → 401 시 refresh" 세 가지만. "프론트엔드는 X를 알 필요가 없다"라고 **다시 말하지 말 것** — 재언급 자체가 거부된다. 바뀐 것 세 가지를 말하고 끝.

## 4. OIDC-necessity Q&A frame

반복 질문: "OIDC까지 필요한 이유를 모르겠다". 정혁에게 통하는 프레임:

1. 반문: "어느 부분이 추가 공수라고 느껴지세요?" — 또는 (a) OAuth2-only vs (b) 인증서버 자체를 안 쓰자는 건지 좁히기.
2. **JWKS ≠ OIDC**: JWKS는 JOSE(RFC 7517)의 일부. 하드코딩된 JWKS URL + 캐시만으로 OIDC 없이 로컬 RS256 검증이 성립한다(2편 검증 코드가 이미 그 모양). 라이브러리(jose, pyjwt)가 UX를 OIDC discovery 기본으로 잡은 것뿐.
3. OIDC가 실제로 주는 것/안 주는 것:
   - 주는 것: 표준 `/.well-known/openid-configuration` discovery(키 로테이션 전파 자동화, 새 소비자 self-service 온보딩), 표준 sub/claims 규약, 라이브러리 자동화.
   - 안 주는 것: ID Token — 우리는 프로필을 users 테이블에서 조회하므로 ID Token을 파싱하지 않는다.
4. 대안 분해: opaque+introspection(RFC 7662)은 로컬 검증 불가(매 요청마다 auth 서버 호출 — 샌드박스 다수일 때 병목); mTLS는 브라우저 로그인 불가; OIDC 없는 순수 OAuth2는 가능하나 키 로테이션/discovery 관리를 손으로 — 더 귀찮다.
5. 마무리 입장: "필요해서 도입이라기보다 필요한 기능을 표준으로 구현하면 따라오는 것. 비용 추가가 거의 없는 표준을 두고 다른 걸 고를 이유가 없다. 요구조건을 만족하는 가벼운 대안이 있으면 OK, 필요해지면 그때 확장."

## 5. 토큰/쿠키 3층 모델 (요약)

```
access_token (15분, JS 메모리/Keychain, Bearer 헤더로 아무 API에나)
  → refresh_token (2주, HttpOnly 쿠키 Path=/api/auth/refresh 또는 Keychain, Server Route 경유)
    → auth.gpai.app 세션 쿠키 (장기, SSO 재로그인 면제)
```

- 발급: 로그인 시 code→token 교환 1회. `offline_access` scope가 refresh_token 발급 조건.
- Web: client_secret은 Server Route 환경변수에 → refresh는 Server Route 경유.
- Mobile: public client → PKCE + Keychain, refresh는 앱이 auth.gpai.app에 직접.
- refresh 만료 시: refresh 401 → authorize 재시도 → IdP 세션 쿠키 유효하면 로그인 화면 스킵(SSO).
