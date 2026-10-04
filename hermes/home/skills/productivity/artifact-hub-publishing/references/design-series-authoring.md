# Design-doc series conventions learned on gpai-2.0 (2026-08-22)

Session-specific detail backing the SKILL.md "Design-series authoring" section. All patterns verified live against Artifact Hub project `gpai-2.0`.

## 1. ASCII diagrams → mermaid conversion

정혁 repeatedly asked to convert every remaining ASCII-art (`​```text` box-drawing) diagram into fenced `​```mermaid` blocks. Artifact Hub renders mermaid fences natively. Treat any surviving `​```text` diagram in a published design doc as unfinished work once the convention is established for that project.

### Conversion rules
- Flowcharts of components/data flow → `flowchart TB` (or `LR` for short linear chains).
- Numbered login/exchange protocols → `sequenceDiagram` with participants; fold multi-step self-actions into one message line (`LP->>LP: 3. 로그인 화면`).
- State machines → `flowchart TB` with labeled edges.
- Node labels support `<br/>`; avoid literal quotes inside labels (use `:` or drop inner quotes).
- Keep the step numbers from the original ASCII inside labels so prose references stay valid.

### kroki verification recipe (do this BEFORE updating AH)
```python
import zlib, base64, urllib.request
mm = open('/tmp/diagram.mmd').read()
enc = base64.urlsafe_b64encode(zlib.compress(mm.encode(), 9)).decode().rstrip('=')
url = f"https://kroki.io/mermaid/svg/{enc}"
req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
body = urllib.request.urlopen(req, timeout=60).read()
ok = b'<svg' in body and len(body) > 500   # tiny SVG = parse fallback, treat as fail
```
- A `502 Bad Gateway` from kroki is usually transient — retry once before rewriting syntax.
- Batch-verify every mermaid block extracted with `re.findall(r'```mermaid\n(.*?)```', body, re.DOTALL)` before publishing.
- Optionally render the PNG and inspect with vision_analyze to confirm Korean labels are not garbled/overlapping.

## 2. Public naming hygiene (hard gate from 정혁)

> "agent-go는 이야기를 꺼내지 않는다… agent in sandbox나 별도의 agent runtime이라고 하자… 언어는 안 드러나도록 작성해야해"

Public design docs must NOT reveal:
- internal repository names (`agent-go`, `agent-py`, `gpai-monorepo` internals beyond already-public facts);
- implementation language choices for components whose language is undecided/internal (say "별도의 에이전트 런타임", never "Go 런타임 / Python 구현");
- runtime-specific SDK rows in comparison tables ("Go SDK / Python MCP SDK" columns were rewritten away).

Pre-publish grep gate: `re.search(r'agent-go|agent-py|\bGo\b.*런타임|Go SDK', body)` over the full body including mermaid blocks and table cells. Zero hits required. Interface contracts stay concrete (Python pseudocode for the contract itself was accepted); only the *runtime implementation* identity stays abstract, with an explicit "런타임 교체 가능성 / 구현 세부는 별도 내부 문서에서 다룬다" section.

Related rule — terminology must be staged with decisions:
- A doc written BEFORE a technology decision uses the generic term: "독립 Identity Provider (IdP)" not "Ory Hydra".
- Only the doc that makes the decision (2편 "Ory Hydra 도입") may name it.
- Watch for leftovers when converting later docs back to generic wording (section headings, participant names in sequenceDiagram).

## 3. Series numbering continuity

When one sub-series consumes ordinal numbers (auth: 1-1, 1-2, 2, 3, 4), the next series starts AFTER it, not at its own old numbers:
- 02-runtime → 5, 03-durable-stream → 6, 04-drive-system → 7, 05-large-files → 8.
- Update H1 title, AH `title`, the index table, AND the reading-order block together. Partial updates leave mismatched ordinals the user will catch ("빨리 서수 통일해 제발").
- Renumbering = content update (full body through `update_artifact`); there is no title-only endpoint.

## 4. Topology-diagram semantics (correction received)

A chain diagram `Web → Hono → Worker → auth` wrongly implied every request transits auth. Correct shape:
- Put the shared service (auth.gpai.app) at top as a subgraph listing its endpoints;
- Draw each client's independent relationship edge with its own label (Web↔auth: Code+PKCE login/refresh; Hono↔auth: JWKS cache + Login Provider; Worker↔auth: JWKS cache; Sandbox↔auth: Machine Token);
- Draw direct service-to-service calls separately;
- Follow with a 관계 정리 table (컴포넌트 / auth와의 관계 / 비고, incl. "요청마다 호출하지 않음").

Also reconcile term collisions across docs: 3편 BFF (Next.js Route Handler session layer) vs 4편 aggregation BFF were merged into one component's two stages (단계 A 인증 세션 / 단계 B 응답 집계 확장) with a 용어 정리 blockquote.

## 5. Index lifecycle

- When the user deletes a legacy series (초기 청사진 01–08), remove its whole index section and fix the reading-order list in the same index update.
- Index links must point at live raw IDs; dead links (superseded artifacts) get replaced during the same pass.
- Confirmed/superseded component status belongs in the index topology note: "확정된 컴포넌트는 …다. …는 향후 계획이다." Never present future plans (Agent Worker, Document Server, 롱러닝 워커) as confirmed services — 정혁 hard rule carried from earlier sessions.

## 6. Tool-call mechanics observed this session

- `update_artifact` requires `content` (full body string). There is no `content_file` parameter — read the local file and inline it. Parallel calls with a nonexistent parameter fail schema validation without invoking.
- Title follows the H1 server-side (existing pitfall) — retitling a doc means changing the H1 in the body, which also fixes `read_artifact.title`.
- `read_artifact` prepends a metadata line (`# Title (vN, md)` + `slug=…`) — strip before comparing bodies.
