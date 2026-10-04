# Reference-check workflow for talk/lecture artifacts (정혁 "레퍼런스체크")

Trigger: user asks for a Korean summary of a YouTube talk **plus** "레퍼런스 체크" / "레퍼런스체크" — i.e. verify the speaker's claims against primary sources before publishing. Deliverable is one artifact whose body contains both the refined summary AND a claim-by-claim verification table.

## Workflow (proven 2026-08-19, Hugging Face "Agent Memory EXPLAINED" / Mem0)

1. **Fetch transcript** as usual (`youtube-content` helper, spoken language first; record ACTUAL caption language in the meta table).
2. **Identify claims to verify** while reading the transcript: numbers (top-K pools, score ranges, token/model sizes), store names, algorithm names (BM25, ANN), default models, and "Mem0 does not do X by default" style negatives.
3. **Verify against primary sources, in two tiers:**
   - Official docs (e.g. docs.mem0.ai "How it works") — confirms the 3-store architecture, extraction phases, retrieval signals. Use `web_search site:...` then `web_extract` on the doc page.
   - **GitHub raw source of the actual constants/functions** — the decisive tier. Fetch `raw.githubusercontent.com/<org>/<repo>/main/<path>` via `web_extract` and grep for the exact constants: e.g. `internal_limit = max(limit * 4, 60)`, `ENTITY_BOOST_WEIGHT = 0.5`, `combined = (semantic + bm25 + entity_boost) / max_possible`, `get_last_messages(limit=10)` eviction, `DEFAULT_LLM_MODEL = "gpt-5-mini"`. Reading `main.py`/`storage.py`/`scoring.py` beats trusting docs prose.
4. **Extract video upload date** cheaply: `curl -s "https://www.youtube.com/watch?v=<ID>" -H "Accept-Language: en-US,en;q=0.9" | grep -oE '"uploadDate":"[^"]*"'` (also `publishDate`). oembed gives title/channel but not upload date.
5. **Build the verification table**: | 영상 주장 | 레퍼런스 검증 결과 | 상태 | with ✅ 일치 / ✅ 대체로 일치 (세부는 화면 근거) rows. For every claim not directly confirmable in code, mark it honestly (e.g. "정확한 밀도 수식은 코드에서 직접 확인되지 않음 — 발표자 화면 공식 참조").
6. **Include a claim-boundaries section** (주의할 점): speaker opinion vs fact (e.g. "procedural memory 잘 안 쓰인다" = opinion; code still has `_create_procedural_memory`), version drift (ADD-only v3, score fusion changes), and caption-language caveat.
7. **Close with `## 참고자료 (Sources)`** numbered list: video + official docs + raw GitHub file links.

## Notes

- Speaker hedging ("If I'm not mistaken") is itself worth verifying — it usually resolves to a definite code constant.
- Verify-then-write: do the grep-level checks BEFORE drafting the body so the verification table quotes real constants, not paraphrase.
- The same two-tier shape applies to any OSS-tool talk: docs for flow, raw source for numbers.
