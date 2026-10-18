# Design doc skeleton that has worked

One private Markdown artifact, formal 합니다체, one H1, one natural intro sentence under every H2/H3 before a table or list (the server lints `empty-section`).

1. Intro paragraph (who uses it, what it connects) and a `> **한눈에 보는 결론**` blockquote with the verdict first.
2. **확정된 전제** table: scope, users, hard constraints, runtime choices, excluded vendors. Add a row whenever the user fixes something.
3. **핵심 흐름**: one mermaid flow of the main loop plus a feature-to-section map. Quote every mermaid label with plain `"` (no backslashes).
4. **풀어야 할 문제**: pain to feature table. When the user wants intent over implementation, replace this with a scenario-first section placed right after the conclusion (before 확정된 전제): 의도와 하지 않을 것, 불편→바라는 모습 table, 등장하는 사람들 table, 10+ narrative scenarios (today's pain, the moment in the product, the felt success), 원칙, 확인할 점 (your assumptions). From 전체 구조 onward label the doc 구현 참고.
5. **조사**: practitioner pipeline, advice/lectures, existing products (columns: confirmed facts / what to take / difference), and a final "조사 결론 → 설계 반영" table.
6. **전체 구조** diagram with ownership and serverless exceptions marked, then the project breakdown if work is split into sibling projects.
7. **핵심 설계** numbered subsections; each ends with what was not verified.
8. **Sibling project sections**, each with research facts, proposed pipeline, risks, and what is unknown.
9. **단계별 계획** with a completion criterion per phase; sibling tracks listed separately.
10. **결정이 필요한 질문** table (question / why it matters) including the user's blank placeholders.
11. **출처** numbered table of pages actually opened; state scope of what was read.

## Records contract for platform + sibling tools

When separate tools must leave their work history on one platform: an event row (client-generated UUID for dedupe, work item/stage/version, actor kind human|agent|tool plus tool name/version, action, input and output asset refs, parent version, generation info needed to reproduce, tool and server timestamps); three platform calls (append record, register asset, link version); tools expose CLI/MCP so the platform agent can drive them; offline tools queue and replay; scoped per-tool tokens that can only append records and register assets.
