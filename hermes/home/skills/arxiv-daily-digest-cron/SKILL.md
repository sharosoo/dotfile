---
name: arxiv-daily-digest-cron
description: Generate a daily arXiv digest of new papers in a narrow technical domain (e.g. LLM serving internals) for a specific user, in Korean, with strict system-level filtering (no application framing), publish the long body to Artifact Hub, and ship a short summary + detail link as the cron stdout for Discord delivery. Trigger when a cron job asks for "arxiv digest", "오늘 arxiv 새 논문", "LLM serving arXiv", or runs a daily paper-watch on a fixed topic + state file (`~/.hermes/cron/<topic>/state.json`).
version: 1.2.2
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [arxiv, papers, digest, cron, discord, llm-serving, korean]
    category: research
    related_skills: [arxiv, academic-paper-curation, oss-pr-daily-digest-depth-mode]
---

# arXiv Daily Digest (Cron → Discord)

The pattern: a daily cron that pulls new arXiv papers matching a fixed keyword set, dedupes against a persistent state file, filters to a hard "system-level only" rubric, formats the top 5 as a Korean Discord message, and ships via stdout (the system handles delivery).

Validated on the `arxiv-daily` cron for 정혁 (LLM serving internals, 2026-07-25; re-validated 2026-07-26 through 2026-08-02 across 7+ cron runs covering API rate-limit recovery, weekend holds, listing-HTML pagination, search-HTML primary path, and recovery-breadcrumb window-widening). The `oss-pr-daily-digest-depth-mode` skill is the parallel pattern for GitHub PR/issue digests — same shape, different source.

## Trigger

A cron job (or recurring task) that:
- Watches arXiv for new papers in a fixed narrow technical domain
- Has a per-user state file at `~/.hermes/cron/<topic>/state.json` with shape `{"seen_ids": [...], "last_run": ..., "last_yield": N}`
- Ships the result as a Korean Discord message (or similar chat channel)
- Must not re-report papers the user has already seen

## Inputs

- **Topic keywords**: a boolean `abs:` query covering the subfield (e.g. for LLM serving: `"LLM serving"`, `"LLM inference"`, `"disaggregated"`, `"KV cache"`, `"MoE serving"`, `"prefill decode"`, `"attention backend"`, `"speculative decoding"`, `"paged attention"`, `"continuous batching"`). Cross with `(cat:cs.DC OR cat:cs.LG OR cat:cs.PF OR cat:cs.AR)`.
- **State file path**: `~/.hermes/cron/<topic>/state.json`. Create on first run if missing.
- **Output**: stdout (cron job → Discord webhook/relay).
- **Cap**: max 5 papers per digest (truncate to top system-relevant N if more).

## Workflow

### 1. Build the query as a fan-out, not one big OR

**Do NOT** ship a single `search_query` with 10 OR clauses and `max_results=60`. arXiv's API rate-limits aggressively and will return 503/429 on big queries. Validated failure modes:
- HTTP 301 (http→https) if you forget `-L` on curl
- HTTP 429 "Rate exceeded" on back-to-back requests
- HTTP 503 with a 60s timeout on the first request of the day after a quiet period
- A single big query can stall 45s before 503-ing

**Working pattern**: split into 5–7 narrow per-keyword queries, each with `max_results=10–20`, run serially with 5–8s sleeps between, save each to `/tmp/arxiv_X.xml`, parse and merge in a single Python step. This rides under the rate limit and recovers gracefully from intermittent 503s (retry the failed file once after a 30–60s backoff).

**Fast empty-day check (30-second decision)**: before the fanout, do ONE probe query (`max_results=5`, any keyword, `sortBy=submittedDate&sortOrder=descending`) and look at the top result's `published` date. If it's ≥ 2 days before today, this is a weekend/holiday gap — skip the fanout entirely, update state with `last_yield: 0`, and ship "오늘 새 논문 없음". Saves 3-5 minutes of futile parsing.

**Validated fast path (2026-08-10)**: when the cron contract explicitly supplies the exact narrow combined query, try it once with `max_results=20`. If it returns HTTP 200 and enough complete Atom entries, parse and filter that response directly; do not fan out unnecessarily. Retain the 5–7 query fan-out as the fallback for 429/503, incomplete coverage, or a broadened recovery window. The direct query produced 20 entries and five selected system-level papers on 2026-08-10.

```bash
# Probe (use the broadest keyword; the LLM inference one returns the most)
curl -sS --max-time 30 "https://export.arxiv.org/api/query?search_query=abs%3A%22LLM+inference%22+AND+%28cat%3ACs.DC+OR+cat%3ACs.LG%29&max_results=5&sortBy=submittedDate&sortOrder=descending" -o /tmp/arxiv_probe.xml
```

```bash
# 5-7 small queries with sleeps
curl -sS --max-time 60 "https://export.arxiv.org/api/query?search_query=abs%3A%22LLM+inference%22+AND+%28cat%3Acs.DC+OR+cat%3Acs.LG%29&max_results=20&sortBy=submittedDate&sortOrder=descending" -o /tmp/arxiv_a.xml
sleep 6
curl -sS --max-time 60 "https://export.arxiv.org/api/query?search_query=abs%3A%22KV+cache%22+..." -o /tmp/arxiv_b.xml
# ... etc
```

### 2. Parse with regex over Atom XML, dedupe by base id

arXiv returns Atom XML. The bundled `arxiv` skill has `scripts/search_arxiv.py` for single-lookups, but for a multi-query merge, a regex parser is faster and avoids the script's per-result formatting overhead. The fields you actually need:

- `<id>https://arxiv.org/abs/XXXX.YYYYY</id>` → strip version suffix (`v\d+$`) for the base id; keep the full versioned id separately for the URL
- `<published>YYYY-MM-DDTHH:MM:SSZ</published>` → take the date prefix
- `<title>...</title>`, `<summary>...</summary>` → collapse whitespace
- `<author><name>...</name></author>` → first 1–3 for the digest
- `<category term="..."/>` → first one is the primary category (the user's filter cares about this — cs.CR/cs.CV may need to be demoted even if keyword matches)

**Critical**: dedupe by base id, NOT full id. arXiv's `<id>` field returns the versioned URL (e.g. `2607.21475v1`), but the state file should track the base id (`2607.21475`) so a v2 update doesn't re-report. When two queries return the same base id, keep the one with the latest `published` date (handles the rare v2-after-original case).

### 3. Window: "new since last run" is wider than 24h

arXiv submission batches are small. On a quiet day, there may be zero papers in the strict 24h window. But state drift happens — the previous cron may have failed silently, or a paper that was first indexed as v1 may only show up under its v2 on a later day.

**Working window**: 2–4 days back from today (`>= 2026-07-22` if today is 2026-07-25). This catches:
- Yesterday's papers that the prior run missed
- Day-before-yesterday's papers in case the prior run was double-quiet
- Day-before-that if the user's spec says "system-level weekly digest"

Filter by `published >= cutoff` AND `id not in state.seen_ids`. The seen list is the source of truth — the date window is just a performance bound, not a correctness one.

### 4. Apply the system-level filter

The hard part. The user's spec is "system-level only — no application framing". For a subfield like LLM serving, this means:

| Include | Exclude |
|---|---|
| KV cache layout / paging / eviction schemes | Training-side optimizations (gradient comm, sharded data parallel) |
| Attention kernel design (FlashAttention-family, paged, sparse) | Benchmarks of specific models on specific hardware (without a system contribution) |
| Speculative decoding, draft models, draft scheduling | Pure accuracy/eval papers |
| Disaggregated prefill/decode, MoE EP/DP topology | Inference security *attacks* (cs.CR) UNLESS they reveal a structural weakness in a serving primitive |
| Continuous batching, scheduler design, SLO-aware admission | Pure theoretical proofs with no serving-system implication |
| KV cache reuse (prefix, position-independent, hierarchical) | Video/multimodal generation serving UNLESS the contribution is in the serving layer |
| GPU kernel micro-architecture (warp specialization, TMA, async copy) | Dataset/pretraining/finetuning recipes |

The test for a borderline paper: "would a backend engineer building a serving stack change anything in their stack because of this paper?" If yes, include. If the paper is purely about model quality, training, or a security attack on the *API surface* (not the system primitive), exclude.

**The cs.CR trap**: arXiv search matches a lot of cs.CR papers on "KV cache" because of adversarial attacks. Most of them are "leak X via timing" and are not system-relevant. The exception: papers that expose a structural flaw in a system primitive (e.g. position-independent KV cache reuse can be hijacked) are system-relevant because the fix is system-level. Apply per-paper judgment — the keyword match alone is not enough.

### 5. Compose the Korean message

Per-paper block format (validated for LLM serving):

```
📄 **[arxiv id]** [cs.XX]
**[English title]**
- 저자: [first 1-2 authors]
- [Korean 1-2 sentence summary, 12-year-old analogy tone, system-level only, why it's hot]
- 🏷 [keyword 1] · [keyword 2] · [keyword 3] · [keyword 4] · [keyword 5]
- https://arxiv.org/abs/[id]
```

**Korean summary style** (validated):
- 1-2 sentences, not 3. The reader is busy.
- Lead with the **mechanism**, not the result. "X가 Y를 한다 → 그래서 Z" is the shape.
- Use 12-year-old analogies when the system concept is the point (KV cache = "the model's notebook", speculative decoding = "fast student proposes, slow teacher grades").
- Drop the application framing completely. "TAKT에 적용", "LLaMA-3에 적용", "our 5090 build에 적용" — none of these.
- For the "why hot" line, the question is "what does this paper change about how serving systems are *built*?" — not "what can I do with this?".

**Header/footer** (fixed shape):
```
# 📚 [Topic] arXiv — YYYY-MM-DD

[...per-paper blocks...]

전체 N개. arxiv.org에서 직접 보기
```

**Empty case**: if no new system-level papers today, output exactly:
```
오늘 새 논문 없음
```
Nothing else. No apology, no explanation, no "근데 관련 트윗은...". The user is reading this every morning; silence is correct.

### 6. Update state and ship

After composing the message, atomically update state. Use `scripts/digest_state.py` (stdlib only, no dependencies, cron-safe):

```bash
python3 scripts/digest_state.py \
  --state ~/.hermes/cron/arxiv/state.json \
  --add 2607.21535,2607.19456,2607.19223,2607.19957 \
  --note "4 LLM-serving system-relevant papers on 2026-07-25 from cs.LG/cs.CR (Windowed-MTP speculative decoding KV, MoA GQA/MQA kernel derivation, AdaFlash diffusion drafter, HijackKV position-independent KV cache attack)."

# Verify before writing:
python3 scripts/digest_state.py --state ~/.hermes/cron/arxiv/state.json --dry-run \
  --add 2607.21535,2607.19456,2607.19223,2607.19957
```

The script handles version-suffix stripping (`v\d+$` removal), dedup against existing `seen_ids`, atomic write (`os.replace` on a `.tmp` sibling), and the metadata fields. The `last_run_note` is a 1-line description of what shipped — it shows up in `state.json` for future debugging.

### 7. Publish to Artifact Hub (added 2026-08-05) — the long body lives there, not in Discord

The cron spec was upgraded 2026-08-05: the long Korean body (top-5 papers, full summaries, keywords, URLs) is **not** the Discord message anymore. It goes to Artifact Hub as a server-side publication via the `mcp__arthub__*` MCP tools. stdout is a short summary + the `artifact.sharosoo.com/a/<id>` detail link.

**Why**: Discord messages with the full body (5 papers × 6 lines each + headers) were clipping or feeling noisy. The long body is the durable reference; the chat is a notification. This matches the `artifact-hub-publishing` skill's "long body in Artifact Hub rather than chat" rule.

**Step-by-step** (load the `artifact-hub-publishing` skill for full reference, but the cron-specific flow is):

1. **Search for today's slug** before creating. The convention is `llm-serving-arxiv-YYYY-MM-DD` (note: NOT `llm-serving-daily-report-...` — the `arxiv-daily-digest-cron` skill uses the cleaner `arxiv` slug; the `oss-pr-daily-digest-depth-mode` cron uses `daily-report`). If a document with that slug already exists for today, follow the update path (read → check for human draft → update or re-publish with explicit metadata).

2. **Choose format deliberately**. Default to `format: md`. The Korean digest is text-dense with tables/lists — Markdown is the right choice. Do NOT use `html render` fences unless the body has a true custom-UI component. Do NOT put raw HTML in the Markdown body (Artifact Hub's `no-raw-html` lint will reject it).

3. **Sanitize before publish** (per the `artifact-hub-publishing` skill pitfalls):
   - **Emphasis boundary fragility**: `**` around `《제목》` or `"문구"` or backticks or parens-then-Korean-particle renders literally as `**…**` in the document. Put punctuation outside the delimiters: `《**제목**》`, `"**문구**"`. Do not wrap one emphasis span around backticks. Reword dense numeric emphasis like `**$20.6B(55%)**로` into separate clauses.
   - **Inline code inside task-list items** (`- [ ]` or `- [x]` with backticks): Artifact Hub may visually duplicate the text and expose literal backticks. Keep task-list text plain; put code-formatted hashes/paths/slugs in neighboring normal bullets or tables.
   - **Section warnings**: a level-2 heading followed immediately by a level-3 heading triggers `empty-section`. Add one natural sentence between them.
   - **Cron metadata**: the document body should be the reader-facing digest, not the cron's execution envelope. Remove `last_yield`, `last_run_note`, source paths, "validated on" breadcrumbs, etc. The `state.json` already carries those.

4. **Publish with stable metadata**:
   - `project: llm-serving`
   - `visibility: link` (shared link, not private/team)
   - `format: md`
   - `tags: arxiv, llm-serving, [topic-keywords-from-today], daily`
   - `agent_source: cron:<the-cron-job-id>` (e.g. `cron:500be816d6df`)

5. **Update an existing document (the safe-update sequence — the cron runs daily, so this is the common path)**:
   1. `list_artifacts(query="LLM Serving arXiv YYYY-MM-DD", limit=5)` — find today's document by title.
   2. `read_artifact(id=<id>)` — confirm latest version + body.
   3. `get_draft(id=<id>)` — check for an unpublished web-edited draft. If a human has a draft open, STOP and tell the user; do not overwrite silently.
   4. `update_artifact(slug=<exact-slug>, base_version=<latest>, content=<new-body>)` — increments the version. **Some Artifact Hub deployments clear tags/visibility on update**; the response is unreliable on metadata, not on the body. Re-list after to verify.
   5. If tags were cleared, call `publish_artifact(slug=<same>, project=<same>, title=<same>, tags=<...>, format=md, visibility=link, agent_source=<...>, content=<same>)` — this appends a version to the same ID, not creating a duplicate, and re-applies the metadata.

5a. **Reconcile an existing same-date version before replacing it.** Scheduled retries or overlapping workers can leave a valid v1/v2 under today's slug while the current API window returns a different candidate set. Treat the latest Artifact version and `state.json` as separate signals: read the artifact, extract the paper IDs already published, re-check those papers when needed, and preserve already-delivered system-level papers unless the current rubric explicitly rejects them. Do not replace a larger prior digest with a smaller one merely because the query window shifted. Before the final atomic state write, normalize base IDs, merge concurrent state additions, and set `last_yield` to the number of papers in the final published body; do not mark an excluded candidate as seen just because it appeared in a search result. Update with the exact `(project, slug)` and `base_version`, then perform the normal canonical read-back and rendered verification. See `references/2026-08-10-direct-api-and-arthub-verification.md` for the concrete reconciliation pattern.

6. **Verify both metadata and rendered content**:
   - `list_artifacts` shows the new version with `format=md` and tags present
   - The `artifact.sharosoo.com/a/<id>` detail page loads and shows the title, owner, visibility, tags, and version list
   - Click "Open vN" → the rendered document shows H1, all 5 paper blocks, bolded titles, no literal `**` characters, working arxiv links

7. **The stdout message** (the Discord post the cron system delivers):
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

   **Do NOT** put the per-paper Korean summaries in the Discord message — that's why Artifact Hub exists. The Discord post is the notification; the link is the body. Long Korean paragraphs in chat will clip the message and bury the link.

8. **If today's run is empty ("오늘 새 논문 없음")**: do NOT create a blank Artifact Hub document. The "Empty result is the right answer some days" pitfall still applies — but it now applies to the stdout message only. Just output `오늘 새 논문 없음` and update `state.json` with `last_yield: 0`. No publication call.

**Pitfall: arthub MCP tag display quirk**. The `list_artifacts` endpoint can sometimes render tags as `[object Object]` in the response — this is a serializer quirk in the MCP wrapper, not necessarily a real metadata failure. On 2026-08-10, the live deployment accepted a flat string array and the detail page rendered all tags correctly. Try explicit tags once; if the live call rejects the array shape, omit tags only as a documented fallback. Verify the actual tag array through `list_artifacts` and the detail page. Do NOT loop on `[object Object]`; the document may be fine.

**Pitfall: deterministic slug collision with the `oss-pr-daily-digest-depth-mode` cron**. The two crons must not share slugs — they have different bodies (arxiv papers vs GitHub PR/issue lists). The convention is:
- This skill: `llm-serving-arxiv-YYYY-MM-DD`
- The OSS PR skill: `llm-serving-daily-report-YYYY-MM-DD`

If you ever see a document titled "LLM Serving Daily Report — YYYY-MM-DD" in the `llm-serving` project, that's the OSS cron — leave it alone. If you see "LLM Serving arXiv — YYYY-MM-DD", that's this cron — read+update+verify.

`stdout` (the Discord post) is the delivery channel for the short summary. The long body lives at the `artifact.sharosoo.com/a/<id>` link. **Do NOT call `send_message` or any other delivery tool** — the cron system handles the Discord post from stdout.

## Validated direct-query and rendered-verification pattern (2026-08-12)

For a daily run whose contract supplies one exact narrow combined API query, use a fast path before fan-out: read `state.json`, issue the combined query once with `max_results=20`, and accept it only when the response is HTTP 200 and the Atom entries are complete. Filter by normalized base ID (`vN` removed), the actual `published` date window, and the system-level rubric. A multi-day gap since the previous run is not a reason to mark every unseen result as delivered: publish only the selected top-N papers and add only those published IDs to `seen_ids`; leave excluded candidates eligible for a later run if the recovery window still includes them.

After publication, treat canonical MCP read-back as the source of truth for exact body verification. Strip only the generated `(vN, md)` and `slug=... project=...` prefix before comparing the returned body with the local canonical body. Then verify all three views: `list_artifacts` metadata, the detail page, and the opened rendered document. The rendered document's accessibility snapshot may omit text inside list items even when the text is present in the DOM; use `document.body.innerText`, heading/link counts, and a visual/screenshot check rather than concluding that summaries are missing from an AX snapshot. The raw content endpoint is an HTML wrapper, so verify it with distinctive rendered phrases and absence of literal `**`, not source-byte equality.

See `references/2026-08-12-direct-query-verification.md` for the concrete run shape and verification probes.

## Pitfalls

### arXiv rate limit is unforgiving

If you fire 3 queries back-to-back without sleep, the 2nd and 3rd will 429. If you fire 1 big query with `max_results=80`, the API will silently hang for 45s and 503 you. **Always**: split into 5–7 small queries + 5–8s sleeps. If a query 503s, retry once after a 30–60s backoff; if the retry also fails, drop that one keyword and proceed (the overlap between keywords means you usually still have coverage).

**Recovery time is longer than you'd expect** (validated 2026-07-26): after a 429 burst the API stayed 429 for ~5 minutes, not the 30-60s the recovery-pattern suggests. If the rate-limit is fresh, do not loop retries; either (a) wait 5+ minutes and retry once, or (b) fall back to the HTML endpoints (next pitfall). The daily cron has a deadline; don't burn it on retries.

### HTML endpoints are the rate-limit fallback (validated 2026-07-26; schema re-validated 2026-07-27; listing-page promoted to primary 2026-07-28; **NOT single-fetch — requires pagination, see "Listing page is NOT single-fetch" pitfall below for the 2026-08-01 correction**; **search HTML re-promoted to primary 2026-08-02 after `abs:` filter found broken in the search HTML endpoint — see "Search HTML `abs:` filter is silently broken" below**; **`/list/<cat>/current` and `/list/<cat>/<YYYY-MM>` added 2026-08-04 for the `export.arxiv.org`-unreachable case — see "export.arxiv.org is unreachable from this VM" below**)

The arxiv API is unauthenticated and aggressively throttled, but the HTML pages are not (or are throttled on a separate counter). When the API is 429, fall back to:

- **Search HTML (re-promoted to primary 2026-08-02)**: `https://arxiv.org/search/?searchtype=all&query=KEYWORD&start=0&order=-announced_date_first` — returns 50 results per page, sorted by announcement date desc. Each `<li class="arxiv-result">` block carries the title, authors, abstract, primary category, and `Submitted DD MONTH, YYYY` date. Parse with regex. **Use plain keyword strings (e.g. `query=LLM+inference`), NOT field-restricted `abs:"…"` syntax** — the `abs:` field-restricted form returns 0 results in the search HTML endpoint, even though it works in the API. Caveat: search results can lag the API by ~1 day on the trailing edge.
- **Listing HTML (use as secondary — only when search HTML is also blocked)**: `https://arxiv.org/list/{cs.LG|cs.DC|cs.PF|cs.AR}/{YYYY-MM}?skip=N` — month-bucketed, **but NOT a single fetch**. A `?skip=0` only returns the first ~50 ids per category. Full coverage requires paginating with `?skip=0,50,100,...` until the page returns empty or repeats. The `arXiv:` regex is trivial. **Dedup MUST be done via the `seen_ids` state file, not by list position** (same IDs come back every day within a month). See the full implementation in `references/query-fanout-template.md` under "Listing HTML as the primary path" — it has the working paginated code, the system-signals/noise filter, and the `seen_ids` capping.
- **Paginated listing**: `https://arxiv.org/list/cs.LG/2026-07?skip=N` (50 per page, ~60 pages for cs.LG in a busy month). The previous "skip is for older than the current month" claim is wrong — pagination is required for the current month too. See "Listing page is NOT single-fetch" pitfall below.
- **`/list/<cat>/current` and `/list/<cat>/<YYYY-MM>` (added 2026-08-04)**: when `export.arxiv.org` is not just 429-ing but **completely unreachable** (TLS timeout at the network layer — distinct from rate-limit), these two endpoints are the closest HTML equivalents of the API's `sortBy=submittedDate&sortOrder=descending`. `/list/<cat>/current` returns the *current arXiv announcement batch* (new submissions + holdovers that the announce window just opened). `/list/<cat>/<YYYY-MM>` is the month-bucketed fallback. See "export.arxiv.org is unreachable from this VM" below for the full recipe.

When the API fails AND the cron has a deadline, skip the API and go straight to **search HTML first**, then fall back to listing HTML only if search HTML is also blocked. The keyword set in `references/query-fanout-template.md` maps 1:1 to search HTML queries.

**HTML schema (validated 2026-07-27)** — the actual arXiv HTML uses Bulma-CSS classes; older docs describe a flatter structure that no longer matches. Use these regex patterns:

- **id**: `href="https?://arxiv\.org/abs/(\d{4}\.\d{4,6})(v\d+)?"`
- **title**: `<p class="title is-5 mathjax">…</p>`
- **authors**: `<p class="authors">…<a href="…">NAME</a>, …</p>` — extract via `re.findall(r'<a[^>]*>([^<]+)</a>', …)`
- **primary category** (first `is-link` tag, not `is-grey`): `<span class="tag is-small is-link tooltip…" data-tooltip="Full Name">SHORT</span>` — the SHORT inside the first `is-link` tag is the primary.
- **date**: `<p class="is-size-7"><span class="has-text-black-bis has-text-weight-semibold">Submitted</span> 24 July, 2026; <span class="has-text-black-bis has-text-weight-semibold">originally announced</span> July 2026.</p>` — extract `\s+(\d+)\s+(\w+),?\s+(\d{4})` after the `Submitted` span.
- **abstract** (prefer full over short): `<span class="abstract-full has-text-grey-dark mathjax" id="…-abstract-full" style="display: none;">…</span>` (or `abstract-short` for the truncated inline version).

**Do NOT use** the older `Primary Category: <span>…</span>` or `class="primary-subject"` selectors — those don't exist on the current page; the primary/secondary distinction is encoded entirely in the `is-link` vs `is-grey` CSS class on the tag spans.

If the HTML probe returns zero results within your 2-4 day window, the answer is still "오늘 새 논문 없음" — same as the API path.

### The arxiv announce cycle means weekends are empty (validated 2026-07-26)

arXiv batches submissions: Friday–Sunday submissions are held and announced Monday morning (US time). So a cron running Saturday or Sunday UTC will reliably find zero new papers since the Friday announce. The API and HTML both return 200; the search results will be sorted by submittedDate desc and the top entries will be 2-3 days old. **The right answer is "오늘 새 논문 없음", one line, no apology, no fallback to "but I found these older papers".**

How to recognize this fast, before burning time on a 5-query fanout that returns nothing:
1. Look at the top 3 `submittedDate` values in the first successful response. If they're 2+ days before today, it's a weekend/holiday gap — stop and ship the empty case.
2. arXiv's year-end holiday window (late Dec / early Jan) follows the same pattern: long stretches of no new papers. The cron will produce empty digests for those days. That's correct.

This is a class-level pattern: any sub-daily cron source with a known publish schedule can have days with zero new items. Don't invent filler; ship the empty case and let the seen-list + 2-4 day window handle drift.

### Cron time-of-day vs. arXiv's 20:00 UTC announce (validated 2026-08-03)

arXiv's daily new-submission batch is announced at **20:00 UTC** (= 14:00 EST, = 05:00 KST the next day). 정혁's cron is scheduled at 12:00 KST = **03:00 UTC**, which lands **17 hours before** that day's announce. Concretely:

- 2026-08-03 12:00 KST cron: arXiv's most recent submission was still 2026-07-31 17:56 UTC. The 2608 batch (Aug 2 submissions) would not be announced until 2026-08-04 05:00 KST. Shipped "오늘 새 논문 없음" — correct.
- 2026-08-02 12:00 KST cron: had found 5 papers from the 7/30 batch (announced ~Aug 1 05:00 KST) — the previous-day's submission window. That worked because the API has a built-in 1-day lag between `submittedDate` (author submission) and listing visibility (daily announce).

**If the cron is ever rescheduled to after 05:00 KST (= 20:00 UTC)**, the window shifts: it will see yesterday's papers instead of day-before-yesterday's. The `cutoff_utc` logic still works because the seen-list dedups, but the `last_run_note` will look different. Note this in any future run that seems to be "off by a day" — it may be a cron reschedule, not a bug.

**Implication for the 12:00 KST cron**: a "no new papers" message on a Monday/Tuesday morning is *expected*, not a bug — it just means the previous day's submissions haven't been announced yet. The seen-list dedup keeps this safe; do not widen the window to "compensate".

### 301 redirect from http → https

The first time you use `http://export.arxiv.org/...`, arXiv returns a 301 to the https equivalent. Use `curl -sSL` (follow redirects) or skip the http entirely and hit `https://` directly. The error code 0 with 14 bytes of body is a 429 ("Rate exceeded.") — that's NOT a 301, even though it looks similar; treat it as a rate limit.

### The state file version-trap

If you store `seen_ids` as the full versioned id (`2607.21475v1`), the next time arXiv releases a v2 you will re-report the same paper. Always strip the version with `re.sub(r'v\d+$', '', arxiv_id)` before adding to the seen list. The URL you post in the digest can still be the versioned URL (or the base URL, which auto-resolves to latest).

### "Today's papers" is wider than today

If the previous cron run was 18 hours ago and there are zero papers in the last 18 hours, that doesn't mean there are zero new papers — the prior run may have fetched 18 hours ago but covered a 2-day window, or may have crashed silently. Always re-check a 2-4 day window on every run, not just 24h. The seen list ensures you don't double-report, and a longer window catches drift.

### 12살 비유 is a system-level tool, not a decoration

The user is a backend engineer transitioning to LLM serving. The 12-year-old analogy is how they want complex system concepts to land. But the analogy must still be about the *system* (KV cache, scheduler, kernel, topology) — not about the model behavior, not about the user's project, not about real-world products. If the analogy is about "your 5090 card" or "the TAKT project", it's application framing and out.

### cs.CR papers need a per-paper yes/no

A keyword search on "KV cache" or "speculative decoding" will surface 1-3 cs.CR papers per day, almost all of which are "leak model X via timing" attacks. The default disposition is EXCLUDE — these are security papers, not system papers. Include only when the attack surfaces a structural weakness in a system primitive (cache reuse, position-independent matching, etc.) that a serving engineer would need to redesign around.

### If the previous run was 429-broken, widen the window on the recovery run (validated 2026-07-29; **re-validated 2026-08-02 — the 7/30 batch was recovered on the first 2026-08-02 run after the 8/1 cron shipped 0 with `last_run_note: "0 new system-relevant papers on 2026-08-01. arXiv API was 429-ing; fell back to listing HTML path."`**)

`state.json`'s `last_run_note` is a 1-line breadcrumb of what shipped. If it contains "429", "HTML fallback", "rate-limited", or "fallback", the prior cron likely shipped "오늘 새 논문 없음" even though papers existed. On the recovery run, **do not trust the standard 24h window** — extend the `submittedDate` range (in the API query) or the cutoff (in the HTML flow) to cover the missed days. The `seen_ids` set dedups, so widening the window is safe.

**The 2026-08-02 run's evidence**: the 2026-08-01 cron had `last_run_note: "0 new system-relevant papers on 2026-08-01. arXiv API was 429-ing; fell back to listing HTML path. Cross-checked cs.LG/cs.DC/cs.PF/cs.AR/cs.CL listings: 7/30-7/31 online dates yielded only 1 unseen id (2607.27976, cs.PF, queueing theory — off-topic). Empty digest shipped."` and `last_yield: 0`. But 21 system-relevant cs.LG/cs.DC/cs.CL papers were submitted on 2026-07-30 and never reached the seen list. The 2026-08-02 recovery run searched the **search HTML** (the API was still 429'ing — see "Search HTML `abs:` filter is silently broken" pitfall below) and recovered the 7/30 batch, shipping the top 5 system-relevant ones. The seen list correctly deduped against any 8/1 papers the broken run did manage to capture.

**Reading the recovery breadcrumbs correctly (validated 2026-08-02)**: distinguish two flavors of "prior run shipped 0":
- *last_yield=0 + last_run_note mentions "weekend hold" / "Friday's announce" / "expected" / "0 new, archive empty"*: **don't widen the window** — the previous run correctly identified a weekend/holiday gap. The state is honest.
- *last_yield=0 + last_run_note mentions "429" / "rate-limited" / "HTML fallback" / "API 503" / "0 new, but…"*: **widen the window** — the previous run was broken. The state is misleading.

The signal is in `last_run_note`'s content, not in `last_yield`'s value. Read the note before deciding the window.

**The signal to widen the window is in state.json, not in the current API response.** Check `last_run_note` and `last_yield` *before* deciding the query window for today's run.

### cs.CL is a system-relevant category, not just NLP (validated 2026-07-29)

The skill's category set was `cs.DC / cs.LG / cs.PF / cs.AR`. On 2026-07-28, 3 of the 5 system-relevant papers (AngelSpec speculative decoding, CoSA sparse attention, Memory for LLMs survey) were primary-categorized as `cs.CL`, not `cs.LG`. The reason: arXiv's "primary category" reflects the submitter's lab — NLP-fluent groups who do speculative-decoding work submit to `cs.CL`, not to the more "systemsy" `cs.LG`. **Default to including `cs.CL` in the category set** for LLM-serving digests; cs.NA and cs.OS can be added if the user shows interest in numerical methods or systems work respectively, but `cs.CL` is mandatory.

### Empty result is the right answer some days

If after dedup + filter there are zero new system-level papers, the right output is "오늘 새 논문 없음" — one line, nothing else. Do NOT pad with: "오늘은 조용한 하루였지만...", "관련 트윗이 있는데...", "이런 주제 어때?", etc. The user values the empty case as much as the full case. It's the signal that the daily cron is still running.

### Don't call execute_code from a cron job

`execute_code` is blocked for cron sessions ("BLOCKED: execute_code runs arbitrary local Python (including subprocess calls that bypass shell-string approval checks). Cron jobs run without a user present to approve it."). Use `terminal` for all Python work, and `write_file` for any state-file updates. This is a real blocker I hit mid-run — the work-around is `python3 - <<'PY' ... PY` heredocs in `terminal`, and `cat <<'EOF' ... EOF` heredocs for the final message output.

### The message is the deliverable, not the workflow

The user does not want a "I fetched 7 queries, here is the parsing log, here is the filter rationale, here is the message" essay. The user wants the Discord message and nothing else. Internal debugging output goes to stderr or to a log file; the final response is the formatted message body. If you have to choose between showing your work and shipping the message, ship the message.

### Search HTML `abs:` filter is silently broken — use plain keywords (validated 2026-08-02)

The arXiv API supports `abs:"LLM inference"` field-restricted search. **The search HTML endpoint does not** — at least not in a way that's URL-safe to compose. On 2026-08-02, the cron tried:

```
https://arxiv.org/search/?searchtype=all&query=abs%3A%22LLM+serving%22&...
```

…and got a **16,447-byte empty-results page** (the size of the "no results found" boilerplate). Same for `abs:"KV cache"`, `abs:"speculative decoding"`, `abs:"paged attention"`, `abs:"prefill decode"`, `abs:"disaggregated"`, `abs:"MoE serving"` — every one returned 0 hits. The plain keyword form (`query=LLM+inference`, no `abs:`) returned 50 real results per page.

**Working pattern for the search HTML** (validated 2026-08-02): strip the `abs:` prefix, use the keyword as a free-text query, and let the broad match + per-paper rubric do the filtering. The keyword set in `references/query-fanout-template.md` works as-is once you remove `abs:"…"` wrapping. The penalty is more false positives (e.g. "transformer+inference" matches EEG/timeseries papers that happen to use transformers), but the good-cats + per-abstract rubric in `scripts/html_search_scraper.py` filters those out.

**Why the `abs:` form fails**: arXiv's search HTML endpoint uses a different query parser than the API, and the field-restricted syntax is either rejected silently or interpreted as a literal string. This is a **search HTML bug** (or a deliberate restriction) — not a coding error in the cron. There's no recovery beyond the plain-keyword form.

**The historical confusion**: the skill's `references/query-fanout-template.md` and the workflow example in step 1 both use the API's `abs:"…"` form. When the API is 429ing, that pattern is correctly transposed to "use the search HTML endpoint" — but the *URL syntax* must be downgraded too. Code that mechanically swaps `export.arxiv.org/api/query` for `arxiv.org/search/` will silently return 0 results.

### Listing page is NOT single-fetch — pagination is required for full coverage (validated 2026-08-01)

**The previous claim** that "a single fetch returns every paper submitted to that category in the current month" is **empirically false**. A `?skip=0` fetch of `/list/cs.LG/2026-08` on 2026-08-01 returned a 7239-byte boilerplate page with zero `arXiv:` matches (the month had just turned, listing not yet populated), and a populated month like `2026-07` only returns the first ~50 ids per category. Full coverage requires paginating with `?skip=0, 50, 100, ...` until the page returns empty or repeats.

This was the failure mode that made the 2026-08-01 cron ship "오늘 새 논문 없음" even though the previous 5 days' papers were in fact available — the loop only fetched `?skip=0` per category (which in the new-month case returned 0) and stopped.

**Busy-batch pagination is cat-dependent (validated 2026-08-07)**: a single `?skip=0` of `/list/<cat>/current` or `/list/<cat>/<YYYY-MM>` returns the first 50 IDs, but the page count needed to drain the month varies wildly by cat. On the 2026-08-07 run, the busy 2608 batch required: cs.LG `?skip=0,50,…,800` (16 pages, 50 IDs each), cs.CL `?skip=0,50,…,500` (10 pages), cs.DC `?skip=0,50` (2 pages), cs.AR `?skip=0,50` (2 pages), cs.PF `?skip=0` (1 page) — total 1308 unique IDs across the 5 cats. The previous "Volume per batch" estimate (~9 cs.DC, ~26 cs.LG, ~2 cs.PF, ~3 cs.AR, ~26 cs.CL) was measured on a quiet announce window; a busy batch can hit the 50-per-page cap on every cat. Always loop until the page returns empty, not until a fixed skip count.

**Concurrent `/abs/<id>` v1-timestamp fetch for >100 candidates (validated 2026-08-07)**: the serial 0.4s/fetch pace (~100s for 242 candidates) risks the cron's 5-minute deadline when the busy batch is large. A 6-way `concurrent.futures.ThreadPoolExecutor` with the same polite sleep between batches brings wall time to ~40s. `max_workers=6` is the sweet spot for `arxiv.org` — higher values risk 503/timeout. The arxiv `/abs/<id>` host is on the same Fastly CDN as `/list/<cat>/...` and is unaffected by the `export.arxiv.org` API block, so the bulk fetch works. See `references/query-fanout-template.md` for the working pattern with the v1-timestamp regex, the `<meta name="citation_*">` extraction, and the `in_window` list assembly.

Working loop (use this for full coverage, not the one-liner):

```python
import urllib.request, re, time
UA = {"User-Agent": "Mozilla/5.0 hermes-cron"}
CATS = ["cs.LG", "cs.DC", "cs.PF", "cs.AR", "cs.CL"]
month = "2026-07"  # or current month if you're sure it's populated
ids = []
for cat in CATS:
    skip = 0
    while True:
        url = f"https://arxiv.org/list/{cat}/{month}?skip={skip}"
        body = urllib.request.urlopen(
            urllib.request.Request(url, headers=UA), timeout=45
        ).read().decode("utf-8", errors="replace")
        page_ids = re.findall(r"arXiv:(\d{4}\.\d{4,6})", body)
        if not page_ids: break  # empty page = past the end
        new = [i for i in page_ids if i not in ids]
        if not new: break  # no new ids = past the end (belt + suspenders)
        ids.extend(new)
        skip += 50
        time.sleep(1)  # rate limit courtesy
        if skip > 3000: break  # safety cap
```

**Month-boundary trap**: on the 1st of any month, the current-month listing is unpopulated boilerplate. Always try the current month first, and if it returns 0 ids, fall back to the previous month. Do NOT interpret an empty current-month listing as "no new papers today" — it may mean "new month, listing not yet populated". Pair this with the `seen_ids` state file: if yesterday's seen_ids are still in the state, the cron didn't actually miss anything; it just needs the previous-month listing.

### urllib gets HTTP 406 from arxiv.org HTML while curl gets 200 (validated 2026-09-15)

The same arxiv.org search/list/abs URLs that return 200 via `curl -A "Mozilla/5.0 ..."` return **HTTP 406 Not Acceptable through Python `urllib.request` with the identical UA string**. Every request, every endpoint, reproducibly. `curl`'s default `Accept: */*` header is the likely difference; arXiv's edge rejects urllib's `Accept` profile. Do not burn retries on urllib fetches — when the HTML fallback path is active, fetch with `curl` (bash loop writing per-URL files) and parse the saved files with Python. Keep the politeness sleeps in the bash loop (12s between search pages, 2-3s between listing pages, batches of 6 with 1.5s gaps for `/abs/<id>`).

Two secondary traps from the same run:
- **`/list/<cat>/current` page `<title>` says `<Category> <Month YYYY>`** and looks like the month listing, but it actually serves the **current announce batch** (247 entries for cs.DC on 2026-09-15; months-old v1 dates inside are holdovers). Treat it as the current batch and verify per-paper v1 dates via `/abs`.
- **`/abs/<id>` v1-date regex variant**: pages showing a v2 history emit `[v1]</a></strong>` (with `</a>`) instead of `[v1]</strong>`. Use `\[v1\](?:</a>)?</strong>\s*\n\s*(\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+\d+:\d+:\d+\s+UTC)` to cover both.

### `export.arxiv.org` is unreachable from this VM (validated 2026-08-04)

Distinct from 429/503 — TLS connect to `export.arxiv.org` (Fastly-hosted at 151.101.x.x) times out at the network layer. The HTTPS handshake never completes; `curl --max-time 15` returns exit 28. Other Fastly-hosted arxiv subdomains (`www.arxiv.org` / `arxiv.org` itself at the same IP) are unaffected, so the block is on the API host specifically, not on the whole Fastly arxiv presence.

Diagnostic sequence (run these in order — they take ~30s total):

```bash
# 1. The unreachable host (TLS timeout)
curl -sS --max-time 15 "https://export.arxiv.org/api/query?search_query=hi&max_results=1" -o /tmp/x -w "HTTP:%{http_code} time:%{time_total}\n"
# Expect: "HTTP:000 time:15.xxx" or "curl: (28) Operation timed out"

# 2. The reachable arxiv HTML host (sanity check)
curl -sS --max-time 15 "https://arxiv.org/" -o /tmp/x -w "HTTP:%{http_code} size:%{size_download}\n"
# Expect: "HTTP:200 size:38590" (homepage)
```

**If step 1 times out and step 2 returns 200**, the API is network-blocked. Skip the API path entirely and go straight to the listing-HTML fallback. Do NOT burn the cron's deadline on API retries — the timeout is not a rate limit; no amount of waiting will unblock it.

**Working recipe (validated 2026-08-04, recovered 3 system-relevant papers from the 2608 batch)**:

```bash
# 1. Get the current batch ids per category
for cat in cs.DC cs.LG cs.PF cs.AR cs.CL; do
  curl -sS --max-time 30 -A "Mozilla/5.0 hermes-cron" \
    "https://arxiv.org/list/$cat/current" -o "/tmp/arxiv_list_${cat}_current.html"
  sleep 1
done

# 2. Optionally also pull the current month's listing (catches papers
#    that were in the current batch but listed under a different category)
curl -sS --max-time 30 -A "Mozilla/5.0 hermes-cron" \
  "https://arxiv.org/list/cs.LG/2026-08" -o /tmp/arxiv_list_cs_lg_aug.html
```

Then parse with the same `re.findall(r"arXiv:(\d{4}\.\d{4,6})", body)` + per-`/abs/<id>`-fetch pattern as the listing-HTML path. The "current" page returns ~9 entries for cs.DC, ~26 for cs.LG, ~2 for cs.PF — far fewer than a month page, but every entry is from the *current* announce batch.

**Key behavioral differences from the API path**:
- `/list/<cat>/current` is the *current arXiv announcement batch* (the one most recently announced at 20:00 UTC the previous day), NOT today's submissions. Submissions made after the previous-day's announce appear in *tomorrow's* batch, not today's `current`. arXiv IDs encode the announcement month in the YYMM field, not the submission month — a 2608.xx id may have been submitted any time from late May to early Aug. **Get the actual submission date from the `/abs/<id>` page**.
- **Working v1-date regex (validated 2026-08-06)**: the actual HTML is `<strong>[v1]</strong>\n        Wed, 5 Aug 2026 17:57:16 UTC (2,616 KB)<br/>` — note the newline + indent between `</strong>` and the date. Naïve single-line patterns fail. Use:

  ```python
  m = re.search(
      r'\[v1\]</strong>\s*\n\s*'
      r'(\w+,\s+\d{1,2}\s+\w+\s+\d{4}\s+\d+:\d+:\d+\s+UTC)',
      html,
  )
  submitted = m.group(1) if m else ""
  # Parse: datetime.strptime(submitted, "%a, %d %b %Y %H:%M:%S UTC")
  ```

  Avoid the old pattern `\[v1\]</strong>\s*([A-Z][a-z]+,?\s+\d{1,2}\s+...)` — the `,?` is fragile and `\s*` between `</strong>` and the date often misses the multi-space indent. As a secondary source, `<meta name="citation_date" content="YYYY/MM/DD">` returns the same date as YYYY/MM/DD without time.
- `/list/<cat>/<YYYY-MM>` is month-bucketed; on the 1st of a new month the page is empty boilerplate, so check the month before the page. Do NOT request `/list/<cat>/<YYYY-MM-DD>` — that's HTTP 400 (day-level listing is not supported).
- `current` and `<YYYY-MM>` overlap but are not identical: `current` only shows the most recent batch; `<YYYY-MM>` shows all batches in the month. For the daily cron, `current` is sufficient because the seen-list dedup catches anything from earlier batches.

**Why the per-`/abs/<id>` fetch still works** (the abstract host is on the same Fastly CDN as the listing host, so why doesn't the block apply?): the block appears to be on the `export.arxiv.org` *host* (the API subdomain), not on `arxiv.org`. The `/abs/<id>` endpoint resolves to `arxiv.org` and is unaffected. The `/list/<cat>/...` endpoints also resolve to `arxiv.org` and are unaffected. Only `export.arxiv.org` (the API) is blocked. The 302 redirect from `arxiv.org/api/...` → `export.arxiv.org/api/...` is the giveaway — `arxiv.org` knows about the API but only as a redirect target.

**Recovery breadcrumb in `last_run_note`**: when this fallback fires, write something like `"3 new system-relevant papers from the 2608 batch. export.arxiv.org (the API host) was unreachable from this VM (TLS timeout) — used the public arxiv.org /list and /abs endpoints as fallback."` so the next run knows the previous run was a fallback, not a normal API run. This is critical for the recovery-window logic — the next run should NOT widen the window based on this note (the fallback did its job); it should also use the listing-HTML path until the API is reachable again.

### `/list/<cat>/current` v1 submission date is the only correct window filter (validated 2026-08-06)

The arXiv ID prefix (`2608.xxxxx`) tells you the **announcement month**, not the submission month. The 2608 announcement batch was assembled by arXiv at the 2026-08-05 20:00 UTC cut-off, but individual papers in that batch were submitted any time in the days leading up to the cut-off. On the 2026-08-06 cron run:

- 1094 unique IDs were harvested from `/list/cs.LG/current`, `/list/cs.DC/current`, `/list/cs.PF/current`
- Of those, 180 had IDs > the previous run's max (2608.04001)
- But after fetching `/abs/<id>` and extracting the actual v1 submission date, only 31 of those 180 fell in the target window `[2026-08-05 00:00 UTC, 2026-08-06 00:00 UTC)` — the other ~150 were submitted on 2026-07-31 / 2026-08-01 / 2026-08-02 / 2026-08-03 / 2026-08-04 and merely *announced* on 2026-08-05

**Implication**: filtering by `id > max_seen_id_in_state.json` is *not* the same as filtering by submission date. The id prefix tells you which batch a paper was announced in; the `/abs/<id>` v1 timestamp tells you when it was actually submitted. For the daily cron's "yesterday's submissions" question, only the v1 timestamp is correct.

**Two valid filter strategies**:

1. **Window by v1 date** (correct, slightly slower): fetch `/abs/<id>` for every candidate, parse the v1 timestamp, keep only those in the target window. This is what the 2026-08-06 run did — 44 `/abs/` fetches, 31 in-window, 13 out of window. ~30s total at 0.4s/fetch with `time.sleep(0.4)` politeness.
2. **Window by id** (faster, but pulls a few extra-day-back papers): accept the imprecision and dedup via `seen_ids` after a few days. The first day will report 1-3 extra papers whose v1 is outside the strict 24h window. Acceptable for daily, not acceptable for "exactly yesterday" reporting.

**Don't** do the inverse — filter by id only and treat the result as "yesterday's submissions". The ID-vs-date mismatch is the source of the confusion in last_run_note breadcrumbs when the user asks "why was 2608.04xxx in the 8/5 report when it was submitted 8/2?".

### First run with a new slug convention can collide with an existing same-date artifact under the old slug (validated 2026-08-06)

When a slug convention changes mid-stream, the new-convention first run may find an existing artifact for the same date under the old slug. The 2026-08-05 cron run shipped at slug `llm-serving-arxiv-2026-08-05` (the new convention), but the previous day's run had already created `llm-serving-daily-report-2026-08-05` under the OLD convention. The two artifacts have the same date and same project but different slugs — they are NOT the same document. Both remain accessible. Right disposition:

- Leave the old-slug document alone (prior cron's content; not for this cron to mutate).
- Create the new-slug document as v1 (the first run with the new convention is a fresh `Created v1`, not an `Updated vN+1`).
- Document the convention change in `last_run_note` so the next run can reconcile.

If a later cron sees both slugs, prefer the current-convention slug for update; the older one is migration debt and should NOT be deleted without explicit user authorization. Identity for migration purposes is `(project, slug, current-convention-is-X)`, not just `(project, slug)`.

The arXiv listing pages use **single-quoted** HTML class attributes in some blocks (e.g. `<div class='list-title mathjax'>`) but **double-quoted** ones in others (e.g. `<a href="/abs/...">`). A regex that hard-codes double quotes will silently return empty matches for the single-quoted blocks while still working on the rest of the page — `re.findall` returns 64 dt/dd blocks (so the cron "feels" like it's working), but the title field is empty for every entry, and the keyword filter returns 0 candidates.

**Symptom**: 576 IDs harvested successfully, but `candidates: 0` after filter. The diagnostic path is to print a sample paper and notice `title=""` even though the HTML contains the title text.

**Fix**: use a class-attribute regex that accepts either quote form:

```python
t = re.search(r"""<div class=['"]list-title[^>]*>(.*?)</div>""", dd, re.DOTALL)
# ... and similarly for list-authors, list-subjects
```

Apply the same fix to the `python3 -m` and inline heredoc versions. The `scripts/html_search_scraper.py` reference implementation does not have this bug because it uses the search HTML (Bulma CSS) endpoint, not the listing HTML (custom CSS) endpoint — the two endpoints use different HTML class names and quoting styles.

### Author regex on search HTML must be scoped to the `<p class="authors">` block (validated 2026-08-02)

The `<a>` tag appears in multiple places in each `<li class="arxiv-result">` block: the title link (`/abs/XXXX.YYYYY`), the action links at the bottom (`[pdf]`, `[ps]`, `[other]`), and inside the `<p class="authors">` block where the real author names live. A naïve `RE_AUTHOR = re.compile(r'<a[^>]*>([^<]+)</a>')` applied to the **whole block** will return `[..., 'pdf', 'ps', 'other', 'Xuchuan Luo', ...]` — not the author list you want.

**The `scripts/html_search_scraper.py` reference implementation already handles this** (it scopes the regex to the `<p class="authors">` match). If you ever write a quick inline parser for the search HTML (because the API is 429 and you want a one-shot recovery script), you must:

```python
am = re.search(r'<p class="authors">(.*?)</p>', block, re.DOTALL)
authors = [a.strip() for a in re.findall(r'<a[^>]*>([^<]+)</a>', am.group(1))] if am else []
```

Or fetch the per-paper `/abs/<id>` page and use `<meta name="citation_author" content="…">` (cleaner; what this run did for the top 5 abstracts).

**Why this matters for the digest**: the per-paper block is `[arxiv id] [cs.XX]` followed by `저자: [first 1-2 authors]`. If "first author" is `pdf` or `other`, the digest is unreadable. Worse, the parser might still pass — the IDs and titles are correct, so the rubric would say "5 valid candidates" when the author display is broken.

### SYSTEM_SIGNALS keyword list produces off-topic false positives for cs.PF and cs.AR (validated 2026-08-01)

The wide `SYSTEM_SIGNALS` list in the `references/query-fanout-template.md` listing-HTML code block (50+ terms including `tensor parallel`, `decode`, `scheduler`, `decoder-only`, ...) catches papers that are **not** LLM-serving. On 2026-08-01, a 7/30-7/31 online window of 5 unseen listing ids all matched SYSTEM_SIGNALS but were off-topic:

- **cs.PF** queueing theory paper (Erlang phase structure, "server imbalance", fluid approximation) — matched `decode`, `tensor parallel` generically
- **cs.PF** OpenMP 5.0 USM accelerator memory model — matched `memory management`, `inference engine` loosely
- **cs.AR** EDA design-space exploration (ReviewDSE) — matched `scheduling policy`, `memory management`
- **cs.AR** Tensor accelerator Wallace-tree multiplier power gating (Stochastic Activity Prediction) — matched `tensor`, `kv cache` loosely via context

The narrower `scripts/html_search_scraper.py` keyword set correctly returned 0 for the same window.

**Rule**: any paper whose primary category is `cs.PF` (Performance) or `cs.AR` (Hardware Architecture) that survives SYSTEM_SIGNALS needs an explicit per-paper abstract re-read to confirm system-relevance. Default disposition for cs.PF and cs.AR is **exclude unless the contribution is in the LLM serving layer** (kernel for LLM inference, scheduler for LLM serving, etc.). When in doubt, exclude — the user can always ask for an off-topic paper to be added later, but adding an off-topic paper to the digest damages the daily-cron trust signal.

### Atomic-write verification pattern (validated 2026-08-01)

When the cron ships an empty digest (or any non-trivial decision), run a one-shot verification script that asserts three independent invariants:

1. `state.json` parses, `seen_ids` count is what you expected, `last_yield` matches the decision (0 for empty digest), `last_run` is today's UTC date, `last_run_note` describes what shipped.
2. The candidate id set is consistent with the seen list — off-topic candidates are NOT in seen_ids (correctly excluded), and yesterday's seen ids ARE in seen_ids.
3. The filter logic is deterministic: re-run the filter against a state snapshot and confirm it returns the expected set (empty for the empty case, or the exact id list for the full case).

This catches the class of bug where the filter logic drifts (e.g. the 2026-08-01 `SYSTEM_SIGNALS` mismatch between the inline listing code-block and `scripts/html_search_scraper.py`). The script is throwaway (delete after use) — it does not belong in the skill's `scripts/` directory because it's specific to each run's expected outcome. The `references/query-fanout-template.md` has a working template under "Atomic-write verification pattern".

## Verification

- [ ] State file updated atomically (all new base ids appended, last_run = now, last_yield = N, last_run_note = 1-line summary)
- [ ] Top N (≤ 5) papers each have: arxiv id, primary cat, title, first 1-2 authors, Korean 1-2 sentence summary (system-level), 3-5 keywords, URL

### Top N < 5 is a valid outcome (validated 2026-08-07)

The cap is "**≤ 5**" not "**= 5**". When the system-level filter legitimately excludes 5+ candidates (e.g. only 4 of 160 in-window papers pass the architecture / scheduler / memory topology / fleet routing rubric and the rest are training / model-arch-only / agent / eval), ship top 4 with footer `전체 후보 N개 중 system-level 기준 top 4`. Do NOT pad with off-topic candidates to reach 5 — the user values the rubric's discipline over a fixed count. The Discord summary line should read `전체 후보 N편 중 top K` where K matches the actual count.
- [ ] Korean summary is mechanism-first, no application framing, 12살 tone where it serves the system concept
- [ ] cs.CR papers individually justified or excluded
- [ ] Artifact Hub document published (or updated) at deterministic slug `llm-serving-arxiv-YYYY-MM-DD`, format=md, visibility=link, tags applied
- [ ] Detail page (`artifact.sharosoo.com/a/<id>`) shows the title, owner, version list, and the rendered document has all 5 paper blocks with no literal `**` showing
- [ ] Header in the Artifact Hub body is `# 📚 LLM Serving arXiv — YYYY-MM-DD`
- [ ] Footer in the Artifact Hub body is `전체 N개. arxiv.org에서 직접 보기` (or no document at all if empty)
- [ ] Stdout (Discord post) is a 3-line summary + the 5 paper titles + the `artifact.sharosoo.com/a/<id>` detail link — NOT the per-paper Korean summaries
- [ ] No "I checked X" or "I found Y" meta-narration in the stdout
- [ ] No `send_message` / delivery tool called — stdout is the channel

### Empty-day verification

When the result is "오늘 새 논문 없음", confirm:
- [ ] The empty result was reached via the fast path (probe + `last_yield=0` + ship) or the full path (fanout + parse + zero candidates) — not by giving up partway
- [ ] The state file's `last_run_note` describes why (e.g. "0 papers; arxiv weekend hold — Friday's announce covered Mon-Thu submissions, Saturday cron had 0 new papers as expected")
- [ ] The `last_yield=0` is recorded so a future run can tell the difference between "I just didn't ship anything" and "the cron ran and there was nothing to ship"

The state file's `last_yield` is the daily-cron heartbeat. If it stays at 0 for 3+ days during a weekday, something is wrong with the fetch (the API or HTML path is broken). Use that signal in any future debugging session.

## Support files

- `references/query-fanout-template.md` — the 5–7 small-query layout with the exact arXiv URL pattern, the LLM-serving keyword set with worked reasoning on what's included and excluded, curl flags, the empty-day probe, the 503/429 recovery pattern, the HTML fallback (search HTML and listing HTML), the **2-call submittedDate-range + `id_list` batch pattern (added 2026-07-29) which is ~3-5x faster than the fan-out and handles prior-429 recovery via a widened date range**, the **`/list/<cat>/current` + `/list/<cat>/<YYYY-MM>` third-tier fallback (added 2026-08-04) for the `export.arxiv.org` unreachable case with the working code and YYMM-vs-submission-month caveat**, AND the **single-quote class-attribute regex fix (added 2026-08-05) for the listing-HTML `<dt>/<dd>` parser that silently returned empty titles** — see the `dt/dd` parser snippet under "Listing HTML as the primary path". Read before designing a new subfield's query.
- `references/artifact-hub-publish.md` — the cron-specific Artifact Hub publish recipe (added 2026-08-05): deterministic slug convention, safe-update sequence for the daily re-run, sanitization checklist (emphasis boundaries, task-list inline code, section warnings), metadata shape (`project`, `visibility`, `tags`, `agent_source`), empty-day behavior, and the stdout-vs-body split rule. Read before writing the publish call.
- `references/system-vs-application-rubric.md` — the detailed per-paper judgment rubric for "is this system-level?" with 6 worked examples from the 2026-07-25 run (HijackKV, LeakyLM, HeadCast, Windowed-MTP, MoA-Structured, AdaFlash) AND 12 worked examples from the 2026-07-29 run (DOPS, LOCKS, AngelSpec, CoSA, DraftExpert, CARE, MDTransformer, Bits and Memories, Memory for LLMs survey, UniMem, Linguistic Rules, Matryoshka Agent), each with the one-line judgment and the *why*. Read when a paper is borderline.
- `references/korean-message-templates.md` — 4 validated Korean 1–2 sentence templates (mechanism → problem, minimum memory shape, fixed → adaptive, new threat to primitive) plus the opening-words guide, the 3-sentence→2-sentence trimming rule, and the anti-patterns list (no "이 논문은", no "SOTA 달성", no application framing). Read when composing the digest and you're stuck on tone.
- `references/2026-08-10-direct-api-and-arthub-verification.md` — validated direct combined-query fast path, candidate-selection signals, normalized state IDs, and live Artifact Hub tag/render verification from the 2026-08-10 run.
- `scripts/digest_state.py` — atomic state-file update helper. Reads `state.json`, strips version suffixes via regex, dedupes against existing `seen_ids`, updates `last_run`/`last_yield`/`last_run_note`, writes back via `os.replace` for atomicity. Run with `--add id1,id2,id3 --note "..."` and `--dry-run` for a preview. Stdlib only, no dependencies, cron-safe.
- `scripts/html_search_scraper.py` — ready-to-run HTML search parser (validated 2026-07-27 against the current Bulma-CSS schema). Takes `--html-glob`, `--state`, `--cutoff`, `--good-cats`, emits JSON candidates. Use this when the arXiv API is 429ing instead of hand-rolling the regex each time.

## Related skills

- `arxiv` (bundled) — the API itself: query syntax, Atom XML format, helper script `scripts/search_arxiv.py`, version metadata, withdrawn-paper detection. Use for any single-paper lookup.
- `academic-paper-curation` — the manual multi-day workflow for curating N papers from a conference or list, with bulk PDF download + per-paper Korean summary. Use when the user wants a deep-dive on a fixed corpus (not the daily cron).
- `oss-pr-daily-digest-depth-mode` — the parallel cron pattern for GitHub PR/issue digests. Same Discord-shipped-from-stdout shape, same compression discipline, different source. Cross-reference for the per-section structure of a multi-source daily digest.
- `arxiv-daily-digest-cron` (self) — this skill. The class-level pattern for daily arXiv digests in a narrow subfield (LLM serving here, but the structure is reusable for any fixed topic + state file).
