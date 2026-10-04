# Design-Series Corrections Log (GPAI 2.0, 2026-08-22 session)

Session-proven corrections from maintaining the gpai-2.0 design series on Artifact
Hub. Complements `architecture-document-publishing.md` and
`design-series-maintenance.md`.

## 1. Confirmation tiers are not binary (정혁 hard rule)

Only user-confirmed tech may be stated as decided — but use the tier the user gave:

| Tier | Wording | Assignment |
|---|---|---|
| 강한 긍정 | "강한 긍정: Ory Hydra — 사실상 확정 방향" | Ory Hydra (IdP). User explicitly corrected plain "확정" down to this tier; keep alternatives comparison even here. |
| 유력 후보 | "유력 후보: OpenFGA — 최종 확정 전" | OpenFGA (ReBAC) |
| 미정 | "미정 — 후보 비교 필요" + requirement-first framing | CRDT library (Loro/Yjs/Automerge), durable engine (DBOS/Hatchet/Temporal), SSE/WS relay (Centrifugo 등), sandbox isolation (Kata/gVisor/E2B/Modal/Cloud Run Jobs) |

Unconfirmed = **requirement + candidate comparison + labeled reference example**
("이런 요구사항을 가진 모듈이 필요하다"까지만 정의). Pre-publish grep: any
Loro/Kata/DBOS/Centrifugo mention without a 후보/미확정/레퍼런스 marker is a violation;
code-fence identifiers (`from dbos`, `runtimeClassName: kata`) are OK when prose labels
them as reference.

## 2. Index framing rules

- "청사진 Goal" → just **"Goal"**.
- The index must NOT imply development is underway. Add: "개발 착수 전 기술 논의 단계다.
  각 문서는 아직 구현이 아니라 설계 검토·기술 비교를 위한 기록이며, 코드 예시는 참조
  구현이다." Topology section titled "전체 토폴로지 (목표 안)".
- Status table named 기술 논의 현황 (not 기술 선택 현황) — discussion phase, not selection.
- Idea-source OSS get GitHub links + "아이디어 출처이며 코드 의존성은 아님": QM
  (scope·audience filter), Cumora (multi-agent coordination), GenOffice
  (byte-preserving patch).

## 3. Title polish expectations

정혁 periodically asks to improve registered titles without touching content. Titles are
problem-first and specific:

- "Ory Hydra 도입" → "Ory Hydra — 독립 인증 서버로의 전환"
- "확장성" → "확장 로드맵 — BFF 집계, Machine Token, OBO, Background Worker, OpenFGA"
- "대용량 파일 & 메모리 — 샌드박스 에이전트에 데이터 전달" → "샌드박스 데이터 전달 — 대용량 파일 접근과 메모리 주입"

Scrub placeholder artifacts while polishing: `Bearer *** JWT` → `Bearer RS256 JWT`;
truncated `machin...-Id:` → full machine-token + X-Actor-* headers.

## 4. Frontend auth doc shape (3편 lessons)

- **No unexplained "BFF"**: use "로그인 전용 Server Route". One reason to exist:
  client_secret cannot live in browser JS → code→token exchange server-side.
- **프론트엔드는 Hydra라는 컨텍스트를 몰라도 된다** — lead with "프론트엔드가 하는 일 (전부)"
  as a 4-line block (login redirect → receive token → attach header → refresh on 401)
  plus "실제 프론트 작업은 /api/auth/*를 부르는 세 줄이 전부다". Protocol internals are
  explanation-only below.
- **Token storage split**: access_token in JS memory (HttpOnly breaks direct Hono/
  python-worker calls); refresh_token in HttpOnly cookie scoped to /api/auth/refresh.
  XSS exposure of the 15-min token = accepted tradeoff now; future path = move all calls
  behind Next.js layer then hide access_token too.
- **One token, many verifiers** ("토큰은 하나 — 검증은 각자"): no per-API tokens;
  iss/key/aud shared across hono/worker/relay. Include JWT payload example +
  side-by-side verification code. Future splits: audience separation or Token Exchange
  (RFC 8693).
- **SSE one-time tickets from day one**: EventSource can't send custom headers and
  `?token=<JWT>` leaks into history/logs. POST /ticket (Bearer JWT) → JWKS verify once →
  30s single-use random ticket bound to user_id → EventSource with ticket → consumed on use.
- getAccessToken never calls auth.gpai.app directly: local exp check (30s slack), renewal
  via Server Route only.

## 5. Tooling notes for this workflow

- read_file on /tmp drafts can serve stale cached content after execute_code writes —
  verify with execute_code string checks before pushing to AH.
- Transient MCP "SSE stream ended without a response" resolves by retrying once.
- kroki mermaid verification needs User-Agent header (403 bare); transient timeouts retry;
  verify all blocks in parallel threads to dodge the 300s execute_code cap.
