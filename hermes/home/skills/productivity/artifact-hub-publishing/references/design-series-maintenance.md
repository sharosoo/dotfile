# Design-Series Maintenance (GPAI 2.0 blueprint style)

Session-proven patterns for authoring and maintaining a multi-part design/blueprint
series in a shared Artifact Hub project (e.g. `gpai-2.0`).

## 1. Mermaid-first diagrams

Convert legacy ASCII-art topology/flow diagrams to fenced ```mermaid``` blocks —
Artifact Hub renders them inline.

**Pre-publish render verification via kroki:**

```python
import zlib, base64, urllib.request

def verify(mm: str) -> bool:
    encoded = base64.urlsafe_b64encode(zlib.compress(mm.encode(), 9)).decode().rstrip('=')
    url = f"https://kroki.io/mermaid/svg/{encoded}"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as resp:
        body = resp.read()
        return b'<svg' in body and len(body) > 500
```

- Bare requests (no UA) get HTTP 403.
- Transient 502 / read-timeouts are retryable; consistent failure = bad syntax.
- Verify ALL blocks in a doc, not just the new one; run blocks in parallel threads
  to avoid the 300s execute_code cap on large batches.
- `sequenceDiagram` for auth/login/token flows, `flowchart TB/LR` for topologies
  and state machines.

## 2. Confirmed vs candidate discipline (정혁 hard rule)

Only technologies explicitly confirmed by the user may be stated as decided.
Current sole confirmation: **Ory Hydra as IdP**.

Everything else is written as **requirement + candidate comparison + labeled
reference example**:

| Area | Candidates | Framing |
|---|---|---|
| CRDT library | Loro, Yjs, Automerge | "(라이브러리 미확정: Loro/Yjs/Automerge 후보)" |
| Durable execution engine | DBOS, Hatchet, Temporal | "durable 실행 엔진(미확정)", DBOS code labeled "레퍼런스로 사용한 예시" |
| SSE/WS relay | Centrifugo 등 | "실시간 릴레이 (미확정)" |
| Sandbox isolation | Kata, gVisor, E2B, Modal, Cloud Run Jobs | "(격리 런타임 미확정)" |

- Always keep the alternatives comparison table even when leaning toward one option.
- Idea-source OSS projects get GitHub links plus "아이디어 출처이며 코드 의존성은 아님":
  - QM (scope·audience filter): https://github.com/yc-software/qm
  - Cumora (multi-agent coordination 4-layer): https://github.com/yetone/cumora
  - GenOffice (byte-preserving patch): https://github.com/genspark-ai/genoffice
- Keep a 기술 선택 현황 status table in the series index.
- Pre-publish grep: any Loro/Kata/DBOS/Centrifugo mention lacking a 후보/미확정/
  레퍼런스 marker is a violation. Note that code-fence identifiers (`from dbos`,
  `@DBOS.workflow()`, `runtimeClassName: kata`) are acceptable inside examples
  when the surrounding prose labels them as reference.

## 3. No internal codenames or languages in public design docs

Do not leak internal repo/runtime names (agent-go, agent-py) or implementation
languages. Write "별도의 에이전트 런타임" and keep interface contracts language-
neutral ("런타임 교체 가능성" requirements table instead of Go/Python split tables).
Grep the whole doc set before publish.

## 4. Series numbering continuity

When one sub-series occupies numbers 1–N, the next sub-series continues at N+1
(auth 1-1…4 → core systems 5…8). Renumber H1 titles, index tables, and the
recommended-reading section together in one pass.

## 5. Natural-Korean audit for index/design prose

번역투 phrasing gets rejected. Observed corrections:

| Rejected | Accepted |
|---|---|
| "~을 관통하는 목표" | "설계 문서 전체의 목표와 방향을 한 장으로 정리하고" |
| "검증된 자산 위에 네 가지를 얹은" | "검증한 자산을 그대로 받아 쓰되 네 가지 능력을 더해 확장한다" |
| "에이전트의 Roster화" | "에이전트를 팀원으로" |
| "확정이 아니다" | "최종 확정은 아니다" |
| "...app다" | "...app이다" |

## 6. update_artifact argument handling

- Live schema takes `content` (inline string), NOT `content_file`. Read the body
  from disk and pass it inline.
- Bodies of ~10–15KB passed inline via `tool_call` completed without truncation;
  the >30KB in-process-handler rule from cron mode still stands.
- A transient MCP error ("SSE stream ended without a response") resolves by
  retrying the identical call once.
- Diagram nodes are safe places for candidate markers, e.g.
  `SB["Sandbox Agent Pod<br/>(격리 런타임 미확정)<br/>..."]`.
