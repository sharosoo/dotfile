# 2026-08-10 direct API + Artifact Hub validation

Validated on the LLM-serving daily cron for 2026-08-10.

## arXiv fetch

- The exact combined API query from the cron contract succeeded against `https://export.arxiv.org/api/query` with `max_results=20`, `sortBy=submittedDate`, and `sortOrder=descending`.
- Response: HTTP 200, 20 Atom entries, top submission date `2026-08-07` (the expected weekend/announce-cycle lag for a 03:00 UTC / 12:00 KST run).
- For this narrow daily query, the direct combined request was sufficient; it yielded five selected system-level papers plus one borderline candidate. Keep the 5–7 query fan-out as the rate-limit fallback rather than making it mandatory when the exact contract query succeeds.
- Deduplicate using base IDs (`re.sub(r'v\\d+$', '', id)`) before comparing to state. Normalize legacy version-suffixed entries when writing state.

## Candidate selection

Use the abstract mechanism and the system-level rubric, not keyword hits alone. The validated top-level signals were hierarchical KV residency, SLO-aware scheduler/KV coordination, global KV-budget allocation, query-aware prefill cache reuse, and latency/energy execution modeling. Model-architecture-only, vision/video, training, and application-analysis papers were excluded.

## Artifact Hub verification

- Search the exact dated title in `project=llm-serving` before publishing.
- Publish Markdown at `llm-serving-arxiv-YYYY-MM-DD` with `visibility=link`, `agent_source=cron:500be816d6df`, and tags.
- On this deployment, a flat string tag array was accepted and persisted; the detail page rendered the tags as `#arxiv`, `#llm-serving`, `#kv-cache`, `#scheduling`, `#daily`, and the date tag. Treat the older MCP tag-schema warning as a conditional fallback: try explicit tags once, and only omit them if the live call rejects the shape.
- Verification must include canonical `read_artifact`, `list_artifacts` metadata, `get_draft` before updates, the detail page, and the opened rendered document. The rendered DOM should have the expected H1, five paper sections, working arXiv links, and zero literal `**` markers.
- For a short cron digest, the detail URL is the user-facing link; raw HTML was also independently confirmed HTTP 200 for this run.

## Same-date artifact/state reconciliation

A retry or overlapping scheduled worker can publish today's slug before the current run reaches the publish step. In that case, the existing version may contain a valid but different candidate set from the current query window, while `state.json` may contain IDs added by the other attempt.

Use this reconciliation sequence:

1. Search by the exact dated title/slug, then read the latest artifact and call `get_draft` before any mutation.
2. Extract the paper IDs from the latest body and compare them with the current live API candidates and normalized `seen_ids`. A mismatch is not automatically a duplicate or a reason to discard the previous body.
3. Preserve previously published system-level papers in the replacement body unless the current rubric explicitly disqualifies them. Add genuinely new papers only when the final digest remains within the cap; do not shrink a prior digest solely because the new API window is narrower.
4. Update the exact slug with `base_version`, immediately read it back, and re-list metadata. The final `last_yield` must equal the number of paper blocks in the final published body.
5. Merge state additions atomically and normalize every ID with `re.sub(r'v\\d+$', '', id)`. Add only papers that were actually delivered in the final body (or in a prior published version being preserved); leave search hits excluded by the rubric out of `seen_ids`.
6. Verify the opened rendered version has the final paper count, all arXiv links, and no literal Markdown markers before emitting the Discord notification.

This keeps the durable artifact, the dedup state, and the short notification consistent even when two cron attempts overlap.
