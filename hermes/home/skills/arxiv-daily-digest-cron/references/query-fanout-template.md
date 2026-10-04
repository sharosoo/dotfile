# Query Fan-out Template

The arXiv API rate-limits aggressively. A single `search_query` with 10+ OR clauses and `max_results=60` will 503 or hang. The working pattern is to **fan out** into 5–7 small per-keyword queries, run serially with 5–8s sleeps, parse and merge in Python.

## Why fan out

arXiv's API is unauthenticated and best-effort. From observation:

| Pattern | Result |
|---|---|
| 1 big query, 10 OR clauses, max_results=60 | 503 after 45s, or silent hang |
| 3-4 medium queries back-to-back | 2nd query onward returns 429 |
| 5-7 small queries, 5-8s sleeps between | All return 200, 200–500ms each |
| Single big query after a 60s backoff | Sometimes works, sometimes not |
| API 429'd; switched to HTML search/listing | Worked when API was completely unavailable |

The fan-out also gives you a richer signal: if a particular keyword returns 0 papers, that's diagnostic (the subfield is quiet on that topic). If a particular keyword returns 20, you might have a topic that's getting a lot of attention.

## Alternative: submittedDate range query — 2 calls, no fan-out (validated 2026-07-29)

For a daily cron the cleanest pattern is **one query per day** with a `submittedDate` range filter. arXiv's API supports `[YYYYMMDDHHMM TO YYYYMMDDHHMM]` syntax in the query string, so you can ask for "papers submitted between yesterday 00:00 and today 23:59 UTC" in a single call. This eliminates the empty-day probe, the 5-7 fan-out, and the rate-limit sleep pattern — you make **2 calls total** (yesterday + today) instead of 7, and the per-day call rarely returns more than 50-80 system papers, well under the 60-result threshold that triggers 503 on a multi-day `search_query`.

```bash
# Yesterday's batch (UTC date)
curl -sS --max-time 60 \
  "https://export.arxiv.org/api/query?search_query=(
    abs%3A%22LLM+inference%22+OR+abs%3A%22KV+cache%22+OR+
    abs%3A%22speculative+decoding%22+OR+abs%3A%22disaggregated%22+OR+
    abs%3A%22MoE+serving%22+OR+abs%3A%22prefill+decode%22+OR+
    abs%3A%22attention+backend%22+OR+abs%3A%22MoE%22+OR+
    abs%3A%22mixture+of+experts%22+OR+abs%3A%22attention%22
  )+AND+(cat%3ACs.DC+OR+cat%3ACs.LG+OR+cat%3ACs.PF+OR+
  cat%3ACs.AR+OR+cat%3ACs.CL)+AND+
  submittedDate%3A%5B202607280000+TO+202607282359%5D&
  start=0&max_results=100&sortBy=submittedDate&sortOrder=descending" \
  -o /tmp/arxiv_20260728.xml
```

Key details:

- **`max_results=100`** is fine for a single-day query. arXiv's API 503s on large `max_results` for *broad, multi-day* queries; a single-day window with `max_results=100` reliably returns 200. If the response is 503 anyway (rare), retry once after 30s.
- **Category set includes `cs.CL`.** The original skill listed only `cs.DC / cs.LG / cs.PF`. Most "speculative decoding for LLM" and "sparse attention for LLM" papers primary-category as `cs.CL`, not `cs.LG`. Without `cs.CL`, you'll miss 30-50% of system-relevant papers (validated 2026-07-29: 5 of 7 system-relevant papers on 2026-07-28 were `cs.CL` or `cs.AR`).
- **The submittedDate range is `YYYYMMDDHHMM` with no separators**, not `YYYY-MM-DD`. arXiv's parser is strict; the `YYYY-MM-DD` form silently returns 0 results.
- **Brackets `[ ]` need URL-encoding** as `%5B` and `%5D`. `+` is the literal space character.
- **Mix strict + broad terms** because the strict terms miss papers that don't use the exact jargon. DOPS (2607.25498) doesn't say "prefill decode" or "KV cache" in its abstract — it says "heterogeneous platforms" and "operator scheduling". A pure-strict query would skip it. The broad terms (`"MoE"`, `"attention"`) return noise, but the per-paper rubric filters it back down.

**When the previous run was 429-broken, fetch 2 days, not 1.** If `state.json`'s `last_run_note` contains "429", "API rate-limited", "HTML fallback", or "fallback", the previous cron likely shipped an empty digest and missed 1-2 days. On the recovery run, extend the `submittedDate` range to cover both missed days:

```bash
# Recovery run: 2.5-day window
submittedDate%3A%5B202607270000+TO+202607292359%5D
```

`seen_ids` in state.json still dedups — the wider window is a *coverage* adjustment, not a duplication risk. This is what recovered the 07-27 batch on the 2026-07-29 run after the 07-28 cron hit a 429 fallback and shipped 0.

**`id_list` batch fetch for detail lookups (validated 2026-07-29).** The submittedDate query gives you N candidate ids. Often 5-15 of them are "borderline" — they match a broad keyword but you need the full abstract to apply the system-vs-application rubric. Don't fetch N abstract pages individually — arXiv's `id_list=A,B,C,D,...` parameter does them in one round-trip:

```bash
curl -sS --max-time 30 \
  "http://export.arxiv.org/api/query?id_list=2607.24555,2607.24434,2607.24331,2607.24260,2607.25357" \
  -o /tmp/arxiv_details.xml
```

Returns one `<entry>` per id with title / authors / abstract / categories. One call for 10-20 ids. **`id_list` has its own rate-limit counter, separate from `search_query`** — 50 ids in one call routinely works when 3 separate `search_query` calls would 429. Useful as a "second pass" after the submittedDate query narrowed the candidate set.

**End-to-end 2-call recipe** (replaces the 5-7 fan-out flow for daily runs):

1. **Call 1**: submittedDate-range query for the target day. Save to `/tmp/arxiv_day.xml`.
2. **Call 2** (if borderline candidates need full abstracts): `id_list` batch for those ids. Save to `/tmp/arxiv_details.xml`.
3. **Parse + filter + rank** in one Python step.
4. **Update state** atomically with `scripts/digest_state.py`.

This is roughly **3-5x faster** than the fan-out (~5s total vs ~30s + sleeps) and handles prior-429 recovery gracefully.

## The keyword set for LLM serving (validated 2026-07-25)

```python
keywords = [
    'abs:"LLM inference"',
    'abs:"disaggregated"',          # catches disaggregated serving / prefill-decode
    'abs:"KV cache"',
    'abs:"prefill decode"',
    'abs:"MoE serving"',
    'abs:"speculative decoding"',
    'abs:"attention backend"',       # catches FlashAttention-family
]
# categories: cs.DC, cs.LG, cs.PF, cs.AR, cs.CL
```

Why these:
- `"LLM inference"` is the broadest. Catches almost everything. Worth a `max_results=20` (vs. 10 for the others).
- `"disaggregated"` is the trend term for prefill-decode disaggregation. Single word matches both "disaggregated serving" and "disaggregated inference".
- `"KV cache"` matches cache management papers but also cs.CR attacks — the system-vs-application rubric decides inclusion.
- `"prefill decode"` is the specific technical term for the disaggregation axis.
- `"MoE serving"` matches serving-side MoE work. Excludes training-side MoE (which uses "MoE training" / "expert routing").
- `"speculative decoding"` matches all draft-model work, including diffusion drafters.
- `"attention backend"` matches kernel papers (FlashAttention, FlashInfer, FlexAttention).

## Excluded keywords (do not add)

These looked promising but are too noisy or off-target:

| Keyword | Why excluded |
|---|---|
| `"paged attention"` | Too narrow — only catches vLLM-style work. Folded into "attention backend". |
| `"continuous batching"` | Mostly now folded into "LLM inference". Rare as a sole signal. |
| `"vLLM"` | Paper mentions vLLM as the system they evaluate on, not as the contribution. |
| `"SGLang"` | Same. |
| `"tensor parallel"` / `"expert parallel"` | Too generic — matches training papers. |
| `"FlashAttention"` | Mentioned in many papers as a comparison, not the contribution. |
| `"prefix caching"` | Folded into "KV cache". |

## Query URL template

```bash
curl -sS --max-time 60 \
  "https://export.arxiv.org/api/query?search_query=abs%3A%22KEYWORD%22+AND+(cat%3ACs.DC+OR+cat%3ACs.LG+OR+cat%3ACs.PF+OR+cat%3ACs.AR+OR+cat%3ACs.CL)&start=0&max_results=N&sortBy=submittedDate&sortOrder=descending" \
  -o /tmp/arxiv_XX.xml
```

- Use https directly (avoids 301 redirect).
- `--max-time 60` — anything past 60s on a single small query is broken; abort and retry.
- `max_results=20` for the broad keyword (`LLM inference`); `10` for the rest.
- `sortBy=submittedDate&sortOrder=descending` — newest first.

## Sleep between queries

```bash
sleep 6  # between queries
sleep 30-60  # before retrying a 503/429 (often not enough — see recovery below)
```

Less than 5s and you risk 429. More than 10s and the cron is slow for no benefit.

## Empty-day probe (run BEFORE the fanout)

arXiv batches Friday–Sunday submissions to Monday's announce (US time). A cron running Saturday or Sunday UTC will reliably find zero new papers since the Friday announce. Detect this fast:

```bash
curl -sS --max-time 30 \
  "https://export.arxiv.org/api/query?search_query=abs%3A%22LLM+inference%22+AND+(cat%3ACs.DC+OR+cat%3ACs.LG)&max_results=5&sortBy=submittedDate&sortOrder=descending" \
  -o /tmp/arxiv_probe.xml
```

Parse the top entry's `<published>` date. If it's ≥ 2 days before today, ship the empty case and stop. The probe is ~1s vs the 3-5 minute fanout. The same pattern applies to the arxiv year-end holiday window (late Dec / early Jan).

**Probe is useless when the API is 429** (validated 2026-07-27): the probe is a 14-byte "Rate exceeded." string when the API is throttled — it does not tell you anything about whether the subfield is empty (weekend hold) or whether the API is just down. If the API probe returns 429, do NOT interpret that as "empty day" — switch to an HTML probe instead and judge from the HTML response.

## Parsing the API responses

Save each to a separate file (`/tmp/arxiv_a.xml` through `/tmp/arxiv_g.xml`). Parse with a single Python step that opens all files, dedupes by base id, and produces the candidate list.

```python
import re, os
WS = re.compile(r'\s+')

def parse(path):
    if not os.path.exists(path): return []
    with open(path) as f: raw = f.read()
    out = []
    for e in re.findall(r'<entry>(.*?)</entry>', raw, re.DOTALL):
        idm = re.search(r'<id>https?://arxiv\.org/abs/([^<]+)</id>', e)
        pm = re.search(r'<published>(\d{4}-\d{2}-\d{2})T', e)
        if not idm or not pm: continue
        base = re.sub(r'v\d+$', '', idm.group(1))
        out.append({
            'id': base,
            'full_id': idm.group(1),
            'published': pm.group(1),
            # ... title, summary, authors, categories
        })
    return out

all_papers = {}
for f in ['/tmp/arxiv_a.xml', ..., '/tmp/arxiv_g.xml']:
    for p in parse(f):
        if p['id'] not in all_papers or p['published'] > all_papers[p['id']]['published']:
            all_papers[p['id']] = p
```

The dedup key is `base` (no version suffix). When two queries return the same base id, keep the one with the latest `published` date — this handles the rare case where the same paper was indexed twice (v1 + v2) and the most recent version is the authoritative one.

## Recovery from 503/429

If a query 503s or 429s:

1. **Wait 30–60s**, then retry once. About 50% of the time the retry succeeds.
2. **If the retry also fails, fall back to HTML** (see next section) — do not loop API retries. **Recovery time after a fresh 429 burst is ~5 minutes**, not the 30-60s the pattern above suggests (validated 2026-07-26: the API stayed 429 for the full 5 minutes I waited, even with the correct UA and serial sleeps). On 2026-07-27 a 90s wait still returned 429.
3. If you must continue with the API, **drop that keyword** and proceed. The overlap between keywords (most papers match 2-3 of them) means you usually still have coverage.
4. **Log the failure** but do not abort the whole cron. The user's daily digest should still ship, even if it's based on 4/5 queries instead of 5/5.

## API failure modes observed in production

Beyond 503 and 429, the API also returns these — all observed at 03:00–04:30 UTC peak:

- `HTTP 429: Unknown Error` — most common during US-east business hours. Recovery is ~5+ minutes, not the 30-60s the 503 pattern suggests.
- `HTTP 301` to a region redirect (observed on `http://export.arxiv.org/api/query`). Cure: use `https://` directly, or pass `-L` to curl.
- 14-byte body `"Rate exceeded."` with status 200 — looks like 429; treat as rate limit.

If the API is 429ing, do not loop retries. Skip straight to the HTML paths below.

## Listing HTML as the primary path (validated 2026-07-28; **NOT single-fetch — see pagination correction 2026-08-01**)

When the API is 429ing and you only care about specific categories (cs.LG / cs.DC / cs.PF / cs.AR), the **listing page** is more reliable than the search HTML and uses a simpler schema. The `arXiv:` regex is trivial. The trade-off: because it is month-bucketed, the same set of IDs comes back every day within the same month — **dedup MUST go through a `seen_ids` state file, not by assuming "later in the list = newer"`.

**CRITICAL — single-fetch is NOT enough for full coverage (validated 2026-08-01)**: a `?skip=0` fetch of `/list/cs.LG/{YYYY-MM}` returns the FIRST ~50 ids of the month only. On 2026-08-01, a `?skip=0` of `/list/cs.LG/2026-08` returned a 7239-byte boilerplate page with zero `arXiv:` matches (the month had just turned, listing not yet populated). Full coverage requires paginating with `?skip=0, 50, 100, ...` until the page returns empty or repeats. See the paginated loop below.

```python
# 1. ONE call per category — gets the FIRST ~50 ids submitted this month.
#    Smoke test only. For full coverage see the paginated loop below.
from datetime import datetime, timezone, timedelta
import urllib.request, re, json, os, html

CATS = ["cs.LG", "cs.DC", "cs.PF", "cs.AR", "cs.CL"]   # cs.AR/cs.CL for LLM sys work
month = datetime.now(timezone.utc).strftime("%Y-%m")  # MUST be zero-padded
ids = []
for cat in CATS:
    url = f"https://arxiv.org/list/{cat}/{month}"
    body = urllib.request.urlopen(
        urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"}),
        timeout=45).read().decode("utf-8", errors="replace")
    ids.extend(re.findall(r"arXiv:(\d{4}\.\d{4,6})", body))
ids = list(dict.fromkeys(ids))  # dedup, preserve order
```

### Paginated loop for full-month coverage (validated 2026-08-01)

```python
import urllib.request, re, time
UA = {"User-Agent": "Mozilla/5.0 hermes-cron"}
CATS = ["cs.LG", "cs.DC", "cs.PF", "cs.AR", "cs.CL"]
month = "2026-07"  # or current month if populated
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
        if skip > 3000: break  # safety cap; cs.LG rarely exceeds 60 pages in a month
```

**Month-boundary trap (validated 2026-08-01)**: on the 1st of any month, the current-month listing is unpopulated boilerplate — `arXiv:` regex returns 0. Try the current month first, and if it returns 0 ids, fall back to the previous month. Do NOT interpret an empty current-month listing as "no new papers today" — it may mean "new month, listing not yet populated". Pair this with the `seen_ids` state file: if yesterday's seen_ids are still in the state, the cron didn't actually miss anything; it just needs the previous-month listing.

### Per-abstract filter with the calibrated SYSTEM_SIGNALS set

After you have your id list (from the paginated loop), fetch each `/abs/{id}` page and filter. The `SYSTEM_SIGNALS` set below is the **wide** list — use it as a first pass to surface candidate papers, then apply the system-vs-application rubric at the per-abstract level. False positives on cs.PF and cs.AR are common (see pitfall below).

```python
# 2. Load state
STATE = "/home/global/.hermes/cron/arxiv/state.json"
state = json.load(open(STATE)) if os.path.exists(STATE) else {"seen_ids": []}
seen = set(state["seen_ids"])

# 3. For each id not seen, fetch the abstract page and filter
SYSTEM_SIGNALS = [
    "prefill", "pre-fill", "decode", "kv cache", "kv-cach", "kvcache",
    "paged attention", "vllm", "sglang", "speculative decoding",
    "continuous batching", "in-flight batching", "dynamic batching",
    "inference engine", "inference serving", "inference system",
    "inference schedul", "model serving", "model serving system",
    "moe serving", "moe inference", "moe routing", "expert schedul",
    "token generation", "token-level", "token schedul", "batch schedul",
    "tensor parallel", "pipeline parallel", "sequence parallel",
    "disaggregat", "prefill-decode", "prefill and decode",
    "attention kernel", "flash attention", "flashattention",
    "rotary", "kv compression", "kv eviction", "kv transfer", "kv offload",
    "transformer serving", "llm serving", "llm inference", "llm system",
    "long-context serving", "long context inference",
    "decoder-only", "decoder only",
]
NOISE = [
    "fine-tuning", "fine tuning", "instruction tuning", "rlhf", "dpo",
    "preference", "benchmark", "dataset", "evaluation of", "alignment",
    "safety", "hallucination", "prompt", "rag", "retrieval-augmented",
    "knowledge editing", "prompt-tuning", "distillation of",
    "quantization of",   # "quantization of a model" ≠ serving-system change
]

now_utc = datetime.now(timezone.utc)
cutoff = now_utc - timedelta(hours=36)
fresh = []
for pid in ids:
    if pid in seen: continue
    page = urllib.request.urlopen(
        urllib.request.Request(f"https://arxiv.org/abs/{pid}",
                               headers={"User-Agent": "Mozilla/5.0"}),
        timeout=30).read().decode("utf-8", errors="replace")
    txt = page.lower()
    if not any(s in txt for s in SYSTEM_SIGNALS): continue
    if any(n in txt for n in NOISE): continue
    # date filter (per-paper, NOT from list position)
    date_m = re.search(r'<meta name="citation_online_date" content="([^"]+)"', page)
    if date_m:
        pub = datetime.strptime(date_m.group(1), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if pub < cutoff: continue
    title = re.search(r'<meta name="citation_title" content="([^"]+)"', page).group(1)
    authors = re.findall(r'<meta name="citation_author" content="([^"]+)"', page)
    abs_m = re.search(r'<blockquote class="abstract[^"]*">\s*<span[^>]*>Abstract:</span>\s*(.+?)</blockquote>',
                      page, re.DOTALL)
    summary = html.unescape(re.sub(r"\s+", " ", abs_m.group(1)).strip()) if abs_m else ""
    fresh.append({"id": pid, "title": title, "authors": authors, "summary": summary})

# 4. Update state and write back (use scripts/digest_state.py in cron, not inline)
seen.update(p["id"] for p in fresh)
state["seen_ids"] = list(seen)[-500:]  # cap to prevent unbounded growth
state["last_run"] = now_utc.isoformat()
state["last_yield"] = len(fresh)
```

For ~50 papers in 3 categories this whole thing finishes in ~30s. Ship it as a single `python3 - <<'PY'…PY` heredoc in `terminal()` from the cron (do NOT use `execute_code` — blocked in cron sessions).

### SYSTEM_SIGNALS false-positive trap (validated 2026-08-01)

The wide `SYSTEM_SIGNALS` list above (50+ terms including `tensor parallel`, `decode`, `scheduler`, `decoder-only`, ...) catches papers that are **not** LLM-serving. On 2026-08-01, a 7/30-7/31 online window of 5 unseen listing ids all matched SYSTEM_SIGNALS but were off-topic:

- **cs.PF** queueing theory paper (Erlang phase structure, "server imbalance") — matched `decode`, `tensor parallel` generically
- **cs.PF** OpenMP 5.0 USM accelerator memory model — matched `memory management`, `inference engine` loosely
- **cs.AR** EDA design-space exploration (ReviewDSE) — matched `scheduling policy`, `memory management`
- **cs.AR** Tensor accelerator Wallace-tree multiplier power gating (Stochastic Activity Prediction) — matched `tensor`, `kv cache` loosely via context

The narrower `scripts/html_search_scraper.py` keyword set correctly returned 0 for the same window.

**Rule**: any paper whose primary category is `cs.PF` or `cs.AR` that survives SYSTEM_SIGNALS needs an explicit per-paper abstract re-read to confirm system-relevance. Default disposition is **exclude unless the contribution is in the LLM serving layer** (kernel for LLM inference, scheduler for LLM serving, etc.). When in doubt, exclude — the user can always ask for an off-topic paper to be added later, but adding an off-topic paper damages the daily-cron trust signal.

### Atomic-write verification pattern (validated 2026-08-01)

When the cron ships an empty digest (or any non-trivial decision), run a one-shot verification script that asserts three independent invariants:

1. `state.json` parses, `seen_ids` count is what you expected, `last_yield` matches the decision (0 for empty digest), `last_run` is today's UTC date, `last_run_note` describes what shipped.
2. The candidate id set is consistent with the seen list — off-topic candidates are NOT in seen_ids (correctly excluded), and yesterday's seen ids ARE in seen_ids.
3. The filter logic is deterministic: re-run the filter against a state snapshot and confirm it returns the expected set (empty for the empty case, or the exact id list for the full case).

```python
import json, os, subprocess
from pathlib import Path

STATE = "/home/global/.hermes/cron/arxiv/state.json"
FILTER_SCRIPT = "/tmp/arxiv_filter.py"  # or wherever the filter lives

def replay_src(snapshot):
    src = Path(FILTER_SCRIPT).read_text()
    # Patch hard-coded STATE path and stdout-output file
    src = src.replace('STATE = "/home/global/.hermes/cron/arxiv/state.json"',
                      'STATE = "/tmp/hermes-verify-state.json"')
    src = src.replace('with open("/tmp/arxiv_candidates.json", "w") as f:',
                      'with open("/tmp/hermes-verify-out.json", "w") as f:')
    src = src.replace("json.dump(fresh, f, indent=2, ensure_ascii=False)",
                      "json.dump(fresh, f, indent=2, ensure_ascii=False); "
                      "import sys; sys.stdout.write(open(\"/tmp/hermes-verify-out.json\").read())")
    return "import json; open('/tmp/hermes-verify-state.json','w').write(" \
        + repr(json.dumps(snapshot)) + ")\n" + src

# 1. State invariants
state = json.load(open(STATE))
assert state["last_yield"] == 0
assert state["last_run"].startswith("2026-08-01T")
assert "2026-08-01" in (state.get("last_run_note") or "")

# 2. Candidate id set
seen = set(state["seen_ids"])
for pid in off_topic_candidates:
    assert not any(pid in s for s in seen)
assert any("2607.27187" in s for s in seen)  # yesterday's paper

# 3. Filter replay (read file, not stdout, to avoid mixing with print() output)
result = subprocess.run(["python3", "-c", replay_src(state)],
                        capture_output=True, text=True, timeout=300)
replay = json.loads(Path("/tmp/hermes-verify-out.json").read_text()) if result.returncode == 0 else []
assert replay == []
```

The script is throwaway (delete after use) — it does not belong in the skill's `scripts/` directory because it's specific to each run's expected outcome. Cleanup the temp files (`/tmp/hermes-verify-*.json`) at the end.

**Why the `seen_ids` cap matters**: a 2-year run of the listing page produces ~25k IDs for cs.LG alone. Trimming to the last 500 is safe because the 36h cutoff means anything older than 500 IDs back has long since been processed.

**Why "list position = newer" is wrong**: the listing page sorts by arXiv id ascending, not by `citation_online_date`. A v2 re-announcement of a month-old paper appears between two genuinely-new papers, and the page has no field that distinguishes the cases. Hence the per-paper `citation_online_date` check.

**Self-test (when to use this path)**: if `https://export.arxiv.org/api/query?...` returns 429 or 301 on the FIRST call, switch to the listing page flow immediately. Do not waste 5+ minutes of sleep+retry cycles on the API.

## Search HTML

**Search HTML** (50 results per page, sorted by announcement date desc):

```bash
curl -sS --max-time 60 \
  "https://arxiv.org/search/?searchtype=all&query=KEYWORD&start=0&order=-announced_date_first" \
  -o /tmp/arxiv_search_KEYWORD.html
```

**Validated 2026-07-27 actual schema** (Bulma-CSS based). The patterns below are what the current arXiv HTML uses; older docs describe a flatter structure that no longer matches. **Do NOT use the older `Primary Category: <span>` or `class="primary-subject"` selectors, they don't exist on the current page.**

Each `<li class="arxiv-result">` block has:
- **id**: `<a href="https://arxiv.org/abs/XXXX.YYYYY">arXiv:XXXX.YYYYY</a>` inside `<p class="list-title is-inline-block">` — regex `href="https?://arxiv\.org/abs/(\d{4}\.\d{4,6})(v\d+)?"`
- **title**: `<p class="title is-5 mathjax">TITLE</p>` — regex `<p class="title is-5 mathjax">\s*(.*?)\s*</p>` then strip inner tags
- **authors**: `<p class="authors"><span class="has-text-black-bis has-text-weight-semibold">Authors:</span> <a href="...">NAME</a>, ...</p>` — extract via `re.findall(r'<a[^>]*>([^<]+)</a>', …)`. The literal `Authors:` label is in a non-link `<span>`, so all `<a>` matches in this block are real authors.
- **primary category** (first `is-link` tag — `is-grey` tags are secondary): `<span class="tag is-small is-link tooltip…" data-tooltip="Full Name">SHORT</span>` — regex `<span class="tag is-small is-link[^"]*"[^>]*data-tooltip="[^"]+"[^>]*>([^<]+)</span>`. Capture the SHORT inside the span; the data-tooltip is the human name.
- **date**: `<p class="is-size-7"><span class="has-text-black-bis has-text-weight-semibold">Submitted</span> 24 July, 2026; <span class="has-text-black-bis has-text-weight-semibold">originally announced</span> July 2026.</p>` — regex `<span class="has-text-black-bis has-text-weight-semibold">Submitted</span>\s+(\d+)\s+(\w+),?\s+(\d{4})`. Parse with a month-name lookup table.
- **abstract** (prefer full over short): `<span class="abstract-full has-text-grey-dark mathjax" id="…-abstract-full" style="display: none;">FULL ABSTRACT</span>` (or `abstract-short` for the truncated inline version) — regex `<span class="abstract-full[^"]*"[^>]*>(.*?)</span>` then strip inner tags.

**Do NOT use** the older `Primary Category: <span>…</span>` or `class="primary-subject"` selectors — those don't exist on the current page; the primary/secondary distinction is encoded entirely in the `is-link` vs `is-grey` CSS class on the tag spans. A scraper built from pre-2025 docs will silently return empty category for every result and ship 0 papers.

Use a single Python step across all keyword HTML files; dedupe by base arxiv id (strip the `v\d+` suffix).

**Listing HTML** (50 papers per page, paginated by id ascending):

```bash
# First page gives the total count
curl -sS --max-time 30 "https://arxiv.org/list/cs.LG/2026-07" -o /tmp/arxiv_list_lg.html
# Then paginate to the last page
for skip in 50 100 150 ... 2900 2950; do
  curl -sS --max-time 30 "https://arxiv.org/list/cs.LG/2026-07?skip=${skip}" -o /tmp/arxiv_list_lg_skip${skip}.html
  sleep 1
done
```

Each entry is structured as `<dt><a href="/abs/XXXX.YYYYY">...</a>...</dt>` followed by `<dd>...<div class='list-title mathjax'><span class='descriptor'>Title:</span> TITLE</div><div class='list-authors'>...</div>...<p class='mathjax'>ABSTRACT</p></dd>`. Use the last page to find the most recent ids.

Caveats:
- The trailing edge of the listing lags the API by ~1 day — the last page's newest id is typically the previous day's latest announce.
- The listing page has no `submittedDate` field. Use the id's first 4 chars (`2607` = year-month) and the relative position in the listing to bracket the date.

## When the subfield changes

The keyword set is tied to the subfield. If you fork this skill for a different topic (e.g. RLHF, video diffusion, RAG), the keyword set needs to be re-designed. The pattern is:

1. Start with the broadest 1-2 keyword in the subfield (e.g. `"RLHF"`, `"video diffusion"`).
2. Add 2-3 specific system-related terms (e.g. `"reward model serving"`, `"KV cache eviction"`, `"diffusion scheduler"`).
3. Avoid brand names (vLLM, SGLang, FlashAttention) — those are tools, not topics.
4. Cap at 7 queries. More is too slow.

## Search HTML as primary (validated 2026-08-02; re-promoted over listing HTML)

When the API is 429'ing, **search HTML is faster and simpler than listing HTML** for the daily cron. Listing HTML requires month-aware pagination and a per-paper `citation_online_date` check; search HTML returns 50 results sorted by `announced_date_first` and has all the per-paper fields already inline.

**CRITICAL — do not use `abs:"…"` in the search HTML URL** (validated 2026-08-02). The search HTML endpoint silently returns 0 results for the field-restricted form (even though the API accepts it). Use plain keyword strings:

```bash
# Good — returns 50 real results:
curl -sS --max-time 45 -A "Mozilla/5.0 hermes-cron" \
  "https://arxiv.org/search/?searchtype=all&query=LLM+inference&start=0&order=-announced_date_first" \
  -o /tmp/arxiv_search_llm_inference.html
sleep 5  # rate limit courtesy

# Bad — returns 0 results, no error:
# query=abs%3A%22LLM+inference%22
```

**Working fanout for the search HTML** (replaces the API fanout when the API is 429'ing; ~5s per query with sleep):

```bash
UA="Mozilla/5.0 hermes-cron"
mkdir -p /tmp/arxiv_search
for kw in "LLM+serving" "LLM+inference" "KV+cache" "speculative+decoding" \
          "paged+attention" "prefill+decode" "disaggregated" "MoE+serving"; do
  curl -sS --max-time 45 -A "$UA" \
    "https://arxiv.org/search/?searchtype=all&query=${kw}&start=0&order=-announced_date_first" \
    -o "/tmp/arxiv_search/${kw}.html"
  echo "  $kw -> $(wc -c < /tmp/arxiv_search/${kw}.html) bytes"
  sleep 5
done
```

A `~16447`-byte response means "0 results, empty boilerplate" — that keyword returned nothing. Move on. Real results return ~250-270KB per 50-paper page.

**Parsing the search HTML**: use `scripts/html_search_scraper.py` (already in this skill, validated 2026-07-27). The author regex is correctly scoped to the `<p class="authors">` block — do not roll your own unscoped `RE_AUTHOR` against the whole `<li class="arxiv-result">` block, or you'll get `pdf`/`ps`/`other` as "authors".

**Date field on search HTML is `Submitted`, not `Announced`**. The HTML exposes only the original submission date; the announce date (which is what the page is actually sorted by) is implicit. This is fine for the daily cron because the submission→announce lag is small (≤1 day), and we window against `seen_ids` anyway. Do not try to extract the "originally announced" date — it's wrapped in the same span and the regex would needlessly complicate the parser.

**Why search HTML beat listing HTML on 2026-08-02**: the listing-HTML path required paginating each of `cs.LG / cs.DC / cs.PF / cs.AR / cs.CL` for the current month, then per-abstract `citation_online_date` filtering, then a SYSTEM_SIGNALS pass. Search HTML does all of that in one pass per keyword (12 queries vs 5×paginated×~60 pages = ~300 fetches) and ships the same 21 candidates from the 7/30 batch. Use search HTML as primary; reserve listing HTML for "what got submitted this month" audits that need exact coverage.

## `/list/<cat>/current` and `/list/<cat>/<YYYY-MM>` (added 2026-08-04; the third-tier fallback when API is completely unreachable)

When `export.arxiv.org` is not just 429-ing but **completely unreachable** (TLS timeout at the network layer — distinct from rate-limit), `/list/<cat>/current` is the closest HTML equivalent of the API's `sortBy=submittedDate&sortOrder=descending`. The pattern:

```bash
for cat in cs.DC cs.LG cs.PF cs.AR cs.CL; do
  curl -sS --max-time 30 -A "Mozilla/5.0 hermes-cron" \
    "https://arxiv.org/list/$cat/current" -o "/tmp/arxiv_list_${cat}_current.html"
  sleep 1
done
```

Then parse:

```python
import re, html
ids = []
for cat in ["cs.DC", "cs.LG", "cs.PF", "cs.AR", "cs.CL"]:
    with open(f"/tmp/arxiv_list_{cat}_current.html") as f: raw = f.read()
    blocks = re.split(r"<dt>", raw)[1:]
    for b in blocks:
        m_id = re.search(r"/abs/(\d{4}\.\d{4,6})", b)
        m_title = re.search(
            r"class='list-title[^']*'>\s*<span class='descriptor'>Title:</span>\s*(.*?)\s*</div>",
            b, re.DOTALL,
        ) or re.search(
            r'class="list-title[^"]*">\s*<span class="descriptor">Title:</span>\s*(.*?)\s*</div>',
            b, re.DOTALL,
        )
        if m_id and m_title:
            title = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", m_title.group(1)))).strip()
            ids.append((m_id.group(1), title))
```

**Behavioral differences from the API**:
- `current` returns the *current arXiv announcement batch* (the one most recently announced at 20:00 UTC the previous day). Submissions made after that announce appear in *tomorrow's* `current`, not today's.
- arXiv IDs encode the *announcement month* in YYMM, not the submission month. A 2608.xx id may have been submitted any time from late May to early Aug. Get the actual submission date from the `/abs/<id>` page (regex `<strong>\[v1\]</strong>\s*([A-Z][a-z]+,?\s+\d{1,2}\s+[A-Z][a-z]+\s+\d{4}\s+\d{2}:\d{2}:\d{2}\s+UTC)`) or from `<meta name="citation_date" content="YYYY/MM/DD">`.
- Day-level listing `/list/<cat>/<YYYY-MM-DD>` returns HTTP 400 — not supported. Use month-bucketed (`<YYYY-MM>`) or `current`.
- `current` and `<YYYY-MM>` overlap but are not identical. For the daily cron, `current` is sufficient.

**Volume per batch** (validated 2026-08-04 on the 2608 batch):
- cs.DC: 9 entries
- cs.LG: 26 entries
- cs.PF: 2 entries
- cs.AR: 3 entries
- cs.CL: 26 entries

That's a total of ~66 candidate entries across the 5 categories — well under the per-abstract-fetch budget. The per-`/abs/<id>` fetch (still works because the abstract host is `arxiv.org`, not `export.arxiv.org`) takes ~10s for 30 abstracts.

**Breadcrumb**: when this fallback fires, write `last_run_note` with the wording suggested in the SKILL.md pitfall so the next run knows the previous run was a fallback and continues with the same path until the API is reachable again.

## Curl flags

- `-sS` — silent but show errors
- `--max-time 60` — abort hung requests
- `-A "hermes-cron-arxiv/1.0"` — user-agent, helps arXiv identify cron traffic
- Do **not** add `-L` if you use https directly; only needed if you go through http
