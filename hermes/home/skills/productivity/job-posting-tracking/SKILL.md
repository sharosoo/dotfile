---
name: job-posting-tracking
description: Re-track Korean LLM-serving job postings on request.
---

# Job posting tracking (LLM-serving career)

Recurring re-check of Korean tech job postings matched to the user's profile. Each run is a *re-tracking*: prior sessions already ranked companies, so the job is to refresh states and catch new postings, not to research from scratch.

## Procedure

1. **Recover the prior tracking set.** `session_search` with the domain keywords (직무 키워드: 채용, 공고, 회사명, serving/LLM). FTS5 ANDs terms — a long query returns zero; retry with fewer/adjacent terms. Read the top prior session in full (`session_search(session_id=...)`) to recover which postings were tracked, their deadlines, and the fit reasoning. Link prior sessions inline with their `@session:` value.
2. **Refresh each tracked posting live.** `web_extract` the posting URL directly — incruit, greenhouse, ashby, company career pages all extract cleanly. For deadlines/접수기간 use the text in the page, not the page's D-N badge (badges go stale while the posted 접수기간 may have been extended — when the two disagree, flag it and point the user to the official recruit site).
3. **Search for NEW postings.** Per tracked company plus generic queries (직무 + 채용 + 연도, 회사명 + serving/inference + 채용). Dedupe against the recovered set by posting URL.
4. **Classify and rank.**
   - **마감 임박** — compute remaining days with `date`/Python against today, never by mental arithmetic; state 접수기간 and D-day explicitly.
   - **진행 중 (상시/마감 미정)** — rank by fit: serving/inference optimization > serving platform/K8s > agent runtime > adjacent MLOps. Map each posting's requirements to the user's actual evidence (production runtime/caching/billing experience, local GPU serving experiments, OSS activity) and name the match honestly, including shortfalls (compute 경력 요건 vs actual tenure and say the gap).
   - **마감 지난 것** — one line, reference only.
5. **Deliver.** Korean 반말, Discord-safe markdown (bold/bullets/links, NO tables), every posting with its URL and 마감일. Keep official posting names in Korean as published. Then offer the standing choice: on-demand in this thread vs a 1–2 day cron that posts only new postings here. If the user wants the cron, create it with delivery to this chat.

## Pitfalls

- **Compute every D-day with a tool.** Mental date math across months is the recurring error source in this task.
- **A stale D-N badge is not evidence of an extension** — it's evidence the aggregator hasn't refreshed. Only the company recruit site's 접수기간 is authoritative; say which one you're reporting.
- **Aggregator summaries (incruit/catch) paraphrase the posting** — extract the full page and quote requirements from it; a paraphrase can drop the 우대 line that decides fit.
- **Don't re-rank from scratch.** The prior session's fit reasoning is the baseline; this run updates states and adds new candidates on top of it.

## Non-English output
The final reply is Korean prose: per the project AGENTS.md contract, run it through the naturalizer subagent (with target_language/text_type/register/glossary context) before sending, and verify meaning (URLs, dates, numbers, posting names unchanged) before surfacing it.
