# GitHub Search API Pattern for Windowed PR/Issue Digests

The `gh api search/issues` endpoint is the right tool for 24h-windowed daily digests. `gh pr list` does NOT support date filters, so the choice between the two patterns comes down to whether you need exact windowing or are OK with over-fetching and Python-side filtering.

## When to use this pattern

- You need exact "merged in last N hours" / "closed-not-merged in last N hours" / "opened in last N hours" — server-side filter
- You have ≥ 4 repos to scan (over-fetch with `gh pr list --limit 25` becomes wasteful)
- Your cron fires at a fixed time (KST 11:00 = UTC 02:00) and you want a deterministic 24h window
- You can tolerate one rate-limit hiccup per cron (the 30 req/min search sub-limit is recoverable with `sleep 60` + slow re-run, but the re-run must also pace — see "Recovery from 403" below)

## When NOT to use

- Anonymous / unauthenticated — search is 10 req/min, will not work
- Single repo with low traffic — `gh pr list --limit 10 --state all` is simpler
- You need full PR body excerpts (search truncates to ~280 chars; REST returns the full body)

## The four canonical queries

| Goal | Qualifier block |
|---|---|
| Merged PRs in window | `is:pr+is:merged+merged:START..END` |
| Closed-not-merged (rejects) | `is:pr+is:unmerged+closed:START..END` |
| New open PRs | `is:pr+is:open+created:START..END` |
| New open issues (not PRs) | `is:issue+is:open+created:START..END` |

**Critical footgun**: `is:closed` includes merged. The correct reject-only qualifier is `is:unmerged`. If you use `is:closed`, you have to re-disambiguate by checking `pull_request.merged_at`.

**Critical footgun #2**: `closed:DATE..DATE` does NOT mean "merged in window" — it means "PR was closed (in any state) with last activity in window". A PR merged 3 days ago and commented on yesterday will show as in-window by `closed:` but not by `merged:`. For accurate "merged in last 24h", use `merged:DATE..DATE`.

## Time window format

GitHub search uses ISO 8601 with `T` separator and no timezone suffix (interpreted as UTC):
- `2026-08-02T02:00:00..2026-08-03T02:00:00` — 24h window from yesterday 02:00 UTC to today 02:00 UTC
- For an 11:00 KST cron, this is exactly "the last 24h before the cron tick"
- Don't use KST timestamps here; the search engine interprets them as UTC and you'll be off by 9 hours

## The optimal batching pattern

The search API has a 30 req/min per-user-token sub-limit. The naive "for each repo, do 4 calls" pattern produces 36 calls in a tight loop and WILL hit 403 around call 28-30. Two mitigation patterns:

### Pattern A: by-state batching (recommended)
```bash
# Run all 10 merged queries first, then 10 rejected, then 10 new_open, then 10 new_issue
for repo in $REPOS; do
  gh api "search/issues?q=repo:${repo}+is:pr+is:merged+merged:${START}..${END}&per_page=10" --jq '...' 
done
sleep 2
for repo in $REPOS; do
  gh api "search/issues?q=repo:${repo}+is:pr+is:unmerged+closed:${START}..${END}&per_page=8" --jq '...'
done
sleep 2
# ... etc
```

This spreads the 40 calls over 4 batches of 10 with 2s gaps, well under 30 req/min.

### Pattern B: per-call sleep
```bash
for repo in $REPOS; do
  gh api "search/issues?q=repo:${repo}+is:pr+is:merged+merged:${START}..${END}&per_page=10" --jq '...'
  gh api "search/issues?q=repo:${repo}+is:pr+is:unmerged+closed:${START}..${END}&per_page=8" --jq '...'
  gh api "search/issues?q=repo:${repo}+is:pr+is:open+created:${START}..${END}&per_page=6" --jq '...'
  gh api "search/issues?q=repo:${repo}+is:issue+is:open+created:${START}..${END}&per_page=4" --jq '...'
  sleep 1   # 10 repos × 4 calls + 10 × 1s = ~50s total
done
```

Easier to script, slightly slower. Same 40-call total.

## Field mapping (search → your report)

| Search result field | What it is |
|---|---|
| `number` | PR/issue number — same as `gh pr list` |
| `title` | Title — same |
| `user.login` | Author — nested in search vs string in `gh pr list` |
| `labels[].name` | Labels — same shape |
| `html_url` | Web URL — same as `url` in `gh pr list` |
| `body` | Truncated to ~280 chars in search; full body via `repos/{owner}/{repo}/pulls/{n}` REST call |
| `state` | "open" or "closed" — search returns this; PR list uses `state` field directly |
| `pull_request` | Present iff the issue is actually a PR — use this to filter `is:issue` results (some PR-like items show up if the search keyword was loose) |
| `merged_at` | Only on PRs; null if not merged — use this for the rare "appears in both merged and closed" case |
| `updated_at` | Last activity — same caveat as `closed:` qualifier; use `merged_at` for true "merged at" |

## Recovery from 403 (rate limit)

If the search sub-limit trips, you'll see:
```json
{"message": "API rate limit exceeded for user ID 42034323. ...", "documentation_url": "https://docs.github.com/.../rate-limiting", "status": "403"}
```

**Fix**: `sleep 60` and re-run from the failed repo. The 30 req/min window resets per minute, not per cron tick. A clean rerun of just the failed repos after a 60s pause is enough. Don't restart the whole loop — you've already burned 30 calls and don't want to waste them.

**Verify before next attempt**:
```bash
curl -sI -H "Authorization: Bearer $(gh auth token)" \
  "https://api.github.com/rate_limit" | grep -i "x-ratelimit-remaining-search"
```

### The re-run ALSO needs pacing — `sleep 60` alone is not enough

Observed 2026-08-09: after a 403 on the issue batch, `sleep 60` then a re-run with `sleep 4` between calls produced **10 more 403s** in a row (every call hit the sub-limit). The 60s wait clears the *first* recovery window, but the search sub-limit's per-minute budget does not re-credit fully mid-minute — the *next* call still sees the residual cap. Two fixes that actually work:

1. **Use `sleep 8` (or more) between calls in the recovery re-run**, not `sleep 4`. With `sleep 8` and one call at a time, 10 repos take ~90s and finish clean. Verified 2026-08-09: 0 rate-limit hits with `sleep 8`. (The by-state batching pattern is still the primary defense — the slow re-run is a recovery, not the default.)
2. **Pre-strip the rate-limited blocks from the fetcher file first** so the re-run starts with a known-clean state and you don't double-count. Use a small Python pass:

   ```python
   import re
   s = open("/tmp/today/all.txt").read()
   s = re.sub(r"### [^\n]+ \(NEW ISSUE\)\n\{[^}]*API rate limit[^}]*\}\n", "", s)
   open("/tmp/today/all.txt", "w").write(s)
   ```

**Bash re-run template that worked** (one call at a time, slow pacing, response captured then conditionally piped through jq so a single failure doesn't pollute the output file):

```bash
for r in "${REPOS[@]}"; do
  echo "" >> "$OUT/all.txt"
  echo "### $r (NEW ISSUE)" >> "$OUT/all.txt"
  resp=$(gh api -H "Accept: application/vnd.github+json" \
    "search/issues?q=repo:${r}+is:issue+is:open+created:${START}..${END}&sort=created&order=desc&per_page=3" 2>/dev/null)
  if echo "$resp" | grep -q "API rate limit"; then
    echo "  RATE-LIMITED" >> "$OUT/all.txt"   # marker so a later pass can find and strip
  else
    echo "$resp" | jq -r '.items[]? | "  #\(.number) [\(.user.login)] [\(.labels | map(.name) | join(","))] \(.title | .[0:90])"' >> "$OUT/all.txt"
  fi
  sleep 8
done
```

If a 2nd recovery cycle is needed (rare), `sleep 90` between cycles, not 60. The cap is a per-minute *sliding window* on the search sub-budget, not a fixed reset — a fresh `sleep 60` after a recent burst may not be enough.

## Worked example (2026-08-03 KST 11:00 cron)

Observed: 10 repos × 4 calls = 40 in a tight loop → 403 after 28th call (REST wide-budget was 4997/5000; search sub-budget was 0/30).

Recovery: `sleep 60`, then re-ran the 4 rejected + 2 unstarted state queries (4 × 10 = 40 fresh search calls) cleanly. Total: 1 retry cycle, ~90s added.

Better approach going forward: use by-state batching (Pattern A above) and the 403 disappears.

## When the data is sparse (some repos are QUIET)

If a repo shows 0 results in 24h, don't panic — NVIDIA/Triton-Inference-Server are sometimes 0-merged on any given day. The footer `m=0` / `r=0` / `n=0` / `i=0` is correct.

**Optional**: widen to 48h just for that specific repo if and only if you have a reason (e.g. yesterday's report mentioned it having activity close to the boundary, or you saw a notable PR land in the global GitHub timeline). Never widen blindly — that creates double-counting across runs.

```bash
# Widen to 48h just for the quiet repo
START_48H="2026-08-01T02:00:00"
gh api "search/issues?q=repo:NVIDIA/TensorRT-LLM+is:pr+is:merged+merged:${START_48H}..${END}&per_page=10" --jq '...'
```

If a 48h-widened PR was already covered in yesterday's report, drop it from the megafics to avoid duplicate. The `is:merged` qualifier in yesterday's run should have caught it — but if yesterday's cron used a different end time, it might not. Trust the merged_at field on the result, not your memory.
