# Artifact Hub Publish — Cron-Specific Recipe (added 2026-08-05)

The arXiv daily digest cron's role was upgraded 2026-08-05: the long Korean body (top-5 papers, full summaries, keywords, URLs) is **no longer** the Discord message. It goes to Artifact Hub via the `mcp__arthub__*` MCP tools. stdout is a short summary + the `artifact.sharosoo.com/a/<id>` detail link.

This reference captures the cron-specific flow: deterministic slug, safe-update sequence, sanitization checklist, metadata shape, empty-day behavior, and the stdout-vs-body split rule. The full Artifact Hub contract lives in the `artifact-hub-publishing` skill; load it for the operation details (`list_artifacts`, `read_artifact`, `get_draft`, `update_artifact`, `publish_artifact`).

## Why this exists

Discord messages with the full body (5 papers × 6 lines each + headers) were clipping or feeling noisy. The long body is the durable reference; the chat is a notification. The `artifact-hub-publishing` skill's "long body in Artifact Hub rather than chat" rule applies here directly.

## Deterministic slug

| Cron | Slug pattern | Example |
|---|---|---|
| This skill (arxiv daily) | `llm-serving-arxiv-YYYY-MM-DD` | `llm-serving-arxiv-2026-08-05` |
| The OSS PR cron (`oss-pr-daily-digest-depth-mode`) | `llm-serving-daily-report-YYYY-MM-DD` | `llm-serving-daily-report-2026-08-05` |

These MUST NOT collide. If you see a document titled "LLM Serving Daily Report — YYYY-MM-DD" in the `llm-serving` project, that's the OSS cron — leave it alone. If you see "LLM Serving arXiv — YYYY-MM-DD", that's this cron — read+update+verify.

If a previous run of this cron created the document under a different slug (e.g. the 2026-08-05 v1 was created by an earlier run with slug `llm-serving-daily-report-2026-08-05` before the convention was settled), use the *existing* slug for the update — never invent a new one. The identity is `(project, slug)`, not the title.

## Metadata shape

| Field | Value |
|---|---|
| `project` | `llm-serving` |
| `format` | `md` |
| `visibility` | `link` |
| `tags` | `arxiv, llm-serving, [3-5 topic-keywords-from-today], daily` |
| `agent_source` | `cron:<the-cron-job-id>` (e.g. `cron:500be816d6df`) |
| `title` | `LLM Serving arXiv — YYYY-MM-DD` (note: this is the reader-facing title; do not include the cron job id) |

The `agent_source` is how the artifact hub distinguishes cron-published docs from user-published ones. The `tags` should reflect the day's theme (e.g. if the top 5 are all about disaggregation, use `disaggregation, prefill-decode, ...`), not the full skill keyword set.

## Body sanitization (per `artifact-hub-publishing` pitfalls)

Run these checks before `publish_artifact` or `update_artifact`. The linter inside Artifact Hub will reject some, but pre-validating saves a round-trip.

### 1. Emphasis boundary fragility

- `**` around `《제목》` or `"문구"` or backticks or parens-then-Korean-particle renders literally as `**…**` in the document.
- **Fix**: put punctuation outside the delimiters: `《**제목**》`, `"**문구**"`. Do not wrap one emphasis span around backticks. Reword dense numeric emphasis like `**$20.6B(55%)**로` into separate clauses: `**$20.6B**, 전체의 55%로`.

For the arXiv digest body, the typical `**` usage is on the English paper title. The titles don't have Korean particles, parens-then-particle, or backticks, so they're safe. The risky constructions would be in the per-paper summary text — if you bold a quoted phrase in a Korean sentence, put the quote marks outside: `"**prefix cache**" 위에서`, not `**"prefix cache"** 위에서`.

### 2. Inline code inside task-list items

`html render` fences or backticks inside `- [ ]` / `- [x]` items can visually duplicate the text and expose literal backticks. The arXiv digest body has no task-list items today, but if you ever add a "next steps" checklist, keep the text plain and put code-formatted hashes/paths/slugs in neighboring normal bullets or tables.

### 3. Section warnings: empty-section

A level-2 heading (`## 오늘의 흐름`) followed immediately by a level-3 heading triggers `empty-section` even if the subsection has content. Add one natural sentence between them. The arXiv digest body has `## 오늘의 흐름` followed by paragraphs (not by a level-3), so this is already safe.

### 4. Cron metadata leakage

The document body is the reader-facing digest. Do NOT include in the body:
- `last_yield`, `last_run_note`, `state.json` paths
- "validated on" dates, version notes, "I checked X" breadcrumb narration
- The cron job id, the API endpoint used, the recovery pattern that fired
- Internal debugging output

All of that lives in `state.json` and in the stdout (1-line 비고 line). The Artifact Hub document is a finished article.

### 5. Raw HTML in Markdown body

Do NOT put `<div>`, `<table>`, `<tr>`, `<td>`, `<html>`, `<body>`, `<span>`, `<p>` directly in the Markdown body — Artifact Hub's `no-raw-html` lint rejects these. The arXiv digest body has no such tags; just confirm with:

```bash
grep -nE '<(div|table|tr|td|th|html|body|span|p )' /tmp/arxiv_content.md
```

Should return zero lines.

### 6. GitHub/PR excerpt angle-bracket placeholders

If a paper's abstract contains a literal `<issue number>` or similar placeholder (e.g. "we evaluate on the dataset at <link>"), the angle brackets trigger the same `no-raw-html` rejection. Replace with `[link]` or `&lt;link&gt;` before publishing. The arXiv abstracts in the daily digest rarely have this, but check the `/abs/<id>` page for any literal `<...>` before including in the summary.

## Safe-update sequence (the cron runs daily, so this is the common path)

The first run creates the document; every subsequent run is an update. Never create a new `(project, slug)` pair for the same date — that creates a duplicate and forces a manual cleanup.

```python
# 1. Find today's document
import json
result = list_artifacts(query="LLM Serving arXiv YYYY-MM-DD", limit=5)
# Pick the entry whose title matches "LLM Serving arXiv — YYYY-MM-DD"
doc_id = ...  # the document id from the matching entry

# 2. Read latest version
latest = read_artifact(id=doc_id)
#   returns: title, body, version (e.g. v1, v2, ...), slug, project

# 3. Check for human-edited draft
draft = get_draft(id=doc_id)
#   if "No unpublished draft." → safe to update
#   if draft has content → STOP, tell the user, do not overwrite silently

# 4a. Update with optimistic concurrency
update_artifact(
    slug=latest["slug"],  # exact existing slug, do not invent a new one
    base_version=latest["version"],  # integer
    content=new_body_md,
)
# Response: "Updated vN+1"

# 4b. If tags/visibility were cleared on update (some Artifact Hub deployments do this):
#     re-publish with explicit metadata
publish_artifact(
    slug=latest["slug"],
    project=latest["project"],
    title=latest["title"],
    tags=[...],
    format="md",
    visibility="link",
    agent_source="cron:<job-id>",
    content=new_body_md,
)
# Response: "Updated vN+2" — appended to the same ID, not a duplicate
```

The order is: read → get_draft → update OR re-publish. Never skip the `get_draft` check — overwriting a user's web-edited draft is the worst kind of silent data loss.

## Verification (post-publish)

1. `list_artifacts` shows the new version with `format=md` and the version number incremented (not a new ID).
2. The `artifact.sharosoo.com/a/<id>` detail page loads and shows the title, owner, visibility (`Shared link`), tags (clickable), and the version list.
3. Click "Open vN" → the rendered document shows:
   - H1 with the date
   - All 5 paper blocks
   - Bolded English titles (`<strong>` in the DOM)
   - No literal `**` characters in the visible text
   - Working arxiv links
4. The table-of-contents sidebar lists all 5 paper sections.

A `tags=[object Object]` display in the MCP `list_artifacts` response is a wrapper serializer quirk, not a real metadata failure. Verify the actual tag array by opening the detail page; do not loop on the display.

## The stdout message (Discord post)

The cron system delivers stdout to Discord. The stdout message is:

```
# 📚 LLM Serving arXiv — YYYY-MM-DD

[3-line summary: topic theme, why hot, what changes in serving systems]
- [paper 1 title — 1 line]
- [paper 2 title — 1 line]
- ...
- [paper 5 title — 1 line]

전체 후보 N편 중 top 5.
상세 본문 + 한국어 요약 + 키워드: https://artifact.sharosoo.com/a/<id>

비고: [1-line on source path used + state.json update, e.g. "export.arxiv.org API가 장시간 rate-limit에 걸려서 arxiv.org /list/cs.{DC,LG,PF}/current HTML fallback으로 harvest. state.json에 2608.xxx 573개 ID를 seen으로 마킹."]
```

**Do NOT** put the per-paper Korean summaries in the Discord message. Long Korean paragraphs in chat will clip the message and bury the link. The Discord post is the notification; the link is the body.

**Do NOT** call `send_message` or any other delivery tool — the cron system handles the Discord post from stdout.

## Empty-day behavior

If today's run finds no new system-level papers, the right output is:

```
오늘 새 논문 없음
```

Nothing else. No apology, no "근데 관련 트윗은...", no "이런 주제 어때?". Do NOT create a blank Artifact Hub document. Just update `state.json` with `last_yield: 0` and the `last_run_note` describing why (weekend hold, holiday, fallback 0, etc.).

The `last_yield=0` is the daily-cron heartbeat. If it stays at 0 for 3+ weekdays, the fetch path is broken — debug from `state.json`'s `last_run_note` breadcrumb.

## Common failure modes

### `mcp__arthub__update_artifact` returns a version that doesn't increment

If `update_artifact` with `base_version=N` returns `Updated vN` (same as input) instead of `vN+1`, the slug+id pair is wrong — you're updating a different document. Re-list, re-confirm the slug, retry.

### `mcp__arthub__publish_artifact` returns `Created v1` instead of `Updated v2`

This is the duplicate-creation alarm. The MCP server did not find an existing document with the same `(project, slug)` and created a fresh one. The next run will pick up both documents and double-report. Stop, re-list, identify the canonical document (usually the one with the most versions), make the duplicate private with an unmistakable internal duplicate body, verify its public detail URL is inaccessible, and omit it from all indexes. See the `artifact-hub-publishing` skill's `references/canonical-slug-and-duplicate-recovery.md` for the full recovery flow.

### Tags cleared on update

Some Artifact Hub deployments clear `tags` / `visibility` when the `update_artifact` operation cannot carry metadata. The response body may still show success. Re-list and check — if `tags` is empty or shows `tags=[object Object]`, call `publish_artifact` with explicit `tags` and `visibility` to re-apply them. This is a `vN+1` then `vN+2` sequence, not a duplicate.

### `artifact.sharosoo.com` is unreachable

This is the same family of "outbound HTTPS blocked from this VM" issue that affects the arXiv API. Test with:

```bash
curl -sS --max-time 15 "https://artifact.sharosoo.com/a/hztt89zuract" -o /dev/null -w "HTTP:%{http_code} time:%{time_total}\n"
```

If HTTP 000 or timeout, the publish call will fail. Fallback: skip the publish call, output the full body to stdout (the legacy format), set `last_run_note` with the wording `"Artifact Hub unreachable from this VM — stdout is the full body today"`. The next run will retry the publish path.
