---
name: oss-pr-daily-digest-depth-mode
description: Generate a depth-mode daily PR/issue digest for a curated list of OSS repositories (PR + issue, 24h lookback, per-repo megafics + reject hypothesis + cross-signal patterns). Produces a full Korean+English markdown note AND a Discord-ready ≤ 2000-char summary. Trigger when user asks for a "일일 PR 리포트", "PR/issue digest", "daily report", or runs a cron job summarizing GitHub activity for a fixed repo list with depth-mode enrichment and Discord delivery.
---

# OSS PR/Issue Daily Digest (Depth Mode)

## Trigger
- User/cron asks to summarize GitHub PR + issue activity for a fixed repo list over the last 24h with technical background, reject hypotheses, and cross-repo signal patterns.
- Korean+English output, Discord ≤ 2000 chars + full markdown note.

## Inputs
- Curated repo list (name, short label, focus keywords per repo).
- `LOOKBACK_HOURS` (default 24).
- Output paths:
  - Note: `~/workspaces/<workspace>/notes/daily_pr/YYYY-MM-DD.md`
  - Discord: `~/workspaces/<workspace>/notes/daily_pr/YYYY-MM-DD_discord.md`
- (Optional) Fetcher script that hits the GitHub API and prints a raw per-repo PR/issue listing.

## Workflow

### 0. Pre-flight: density check + GH auth (BEFORE writing the fetcher)
Before any work, measure what the day is going to look like. This decides your starting compression level and fetcher mode.

```bash
# Density probe (one quick call to count today's events)
gh search issues --owner vllm-project --updated ">$(date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%S)" --limit 5 --json number 2>/dev/null | jq length
```

Then check auth:
```bash
gh auth status 2>&1 | head -3
```

If `gh` is not authenticated, fall back to the urllib fetcher in step 1 (anonymous 60 req/h). If authenticated, **prefer the `gh` batched parallel fetch in step 1.0 below** — ~10× faster than urllib and gives stable JSON.

### 1. Fetch raw data (urllib — fallback)
Run the fetcher (e.g. `python3 scripts/daily_pr_report.py`). It calls the GitHub REST API (`/repos/{full}/pulls?state=closed|open`, `/repos/{full}/issues`) with `urllib`, prints merged/rejected/open per repo with `{num, title, author, labels, body_excerpt, url}`. **The script is a fetcher only — depth-mode enrichment is manual.**

### 1.0 Fetch raw data (gh CLI batched parallel — preferred when authenticated)
**`gh` CLI is ~10× faster than urllib** for a 10-repo fetch. The 30 sequential urllib calls (10 repos × closed PR + open PR + issues, with 15s timeout each) routinely burn 3–5 min and hit rate limits. The `gh` parallel approach finishes in 15–30s and is authenticated (5000/h limit), so you also have headroom for deep-dive.

There are two `gh` patterns. **Prefer 1.0b (`gh api search/issues`) over 1.0a (`gh pr list`)** — 1.0b gives exact 24h + state + label filtering in one server-side query, and 1.0a's `--limit 25 closed` over-fetches yesterday's events that you then discard in Python.

#### 1.0a. `gh pr list` pattern (older, over-fetches)
```bash
# Auth check first
gh auth status 2>&1 | head -3   # MUST show "Logged in to github.com account <user>"

# Build a fetch script that hits all 10 repos in one go
cat > /tmp/fetch_prs.sh <<'EOF'
#!/bin/bash
REPOS=(
  "vllm-project/vllm" "sgl-project/sglang" "NVIDIA/TensorRT-LLM"
  "llm-d/llm-d" "ai-dynamo/dynamo" "triton-inference-server/server"
  "LMCache/LMCache" "kvcache-ai/Mooncake" "triton-lang/triton"
  "flashinfer-ai/flashinfer"
)
for r in "${REPOS[@]}"; do
  short=$(echo "$r" | tr '/' '_')
  gh pr list -R "$r" --state closed --limit 25 \
    --json number,title,author,labels,updatedAt,mergedAt,body,url \
    > "closed_${short}.json" 2>/dev/null
  gh pr list -R "$r" --state open --limit 15 \
    --json number,title,author,labels,createdAt,body,url \
    > "open_${short}.json" 2>/dev/null
  gh issue list -R "$r" --state open --limit 15 \
    --json number,title,author,labels,createdAt,body,url \
    > "issues_${short}.json" 2>/dev/null
  echo "done: $r"
done
EOF
chmod +x /tmp/fetch_prs.sh && /tmp/fetch_prs.sh   # ~30s
ls -la /tmp/*.json | wc -l                         # should print 30
```

**Critical pitfalls with 1.0a**:
- **Verify the JSON files exist with non-zero size after running.** The first time, a bash script that has redirects can silently fail (heredoc + `for` loop + `> file 2>/dev/null` patterns sometimes drop the redirect). Run `ls -la /tmp/closed_*.json | head` and confirm. If files are missing, run `bash -x /tmp/fetch_prs.sh` to see which command dropped the redirect.
- **Field name differences vs urllib API**: `gh` uses `updatedAt` / `createdAt` / `mergedAt` (camelCase, no `_at_` separator) — the urllib version uses `updated_at` etc. If you mix sources, normalize in the summarize step.
- **`author` is a nested object** in `gh` output (`{login: "x"}`), not a string. Use `author.login` in your processing.
- **Filter for 24h window in Python, not in the API call.** GitHub's `--since` flag applies to commits, not PRs. The `gh` JSON has `updatedAt`/`createdAt` for filtering. **This is the main weakness of 1.0a** — you fetch N=25 most-recently-updated closed PRs and then filter 24h in Python, which discards ~half on dense days and forces you to over-fetch on sparse days.

#### 1.0b. `gh api search/issues` pattern (preferred — exact 24h + state in one call)
**The right way for windowed 24h digests** is the GitHub Search API. `gh pr list` doesn't accept a date filter, but `search/issues` does. Filters compose: `is:pr` + `is:merged` + `merged:DATE..DATE` gives the exact set of merged PRs in a window. Same for `is:open` + `created:DATE..DATE` for new opens, and `is:unmerged` + `closed:DATE..DATE` for rejects.

```bash
# Compute the 24h window in UTC (KST-9h). End is "now" (or the cron tick time).
START="2026-08-02T02:00:00"   # yesterday now-UTC
END="2026-08-03T02:00:00"     # today now-UTC

for repo in vllm-project/vllm sgl-project/sglang NVIDIA/TensorRT-LLM \
            llm-d/llm-d ai-dynamo/dynamo triton-inference-server/server \
            LMCache/LMCache kvcache-ai/Mooncake triton-lang/triton \
            flashinfer-ai/flashinfer; do
  echo "=== $repo ==="
  # 1) MERGED in window
  gh api -H "Accept: application/vnd.github+json" \
    "search/issues?q=repo:${repo}+is:pr+is:merged+merged:${START}..${END}&sort=updated&order=desc&per_page=10" \
    --jq '.items[]? | "  #\(.number) [\(.labels | map(.name) | join(","))] \(.title | .[0:75])"' 2>/dev/null

  # 2) REJECTED (closed-not-merged) in window
  gh api -H "Accept: application/vnd.github+json" \
    "search/issues?q=repo:${repo}+is:pr+is:unmerged+closed:${START}..${END}&sort=updated&order=desc&per_page=8" \
    --jq '.items[]? | "  #\(.number) [\(.labels | map(.name) | join(","))] \(.title | .[0:75])"' 2>/dev/null

  # 3) NEW OPEN PRs (created in window, still open)
  gh api -H "Accept: application/vnd.github+json" \
    "search/issues?q=repo:${repo}+is:pr+is:open+created:${START}..${END}&sort=created&order=desc&per_page=6" \
    --jq '.items[]? | "  #\(.number) [\(.labels | map(.name) | join(","))] \(.title | .[0:80])"' 2>/dev/null

  # 4) NEW ISSUES (created in window, still open) — exclude PRs with is:issue
  gh api -H "Accept: application/vnd.github+json" \
    "search/issues?q=repo:${repo}+is:issue+is:open+created:${START}..${END}&sort=created&order=desc&per_page=4" \
    --jq '.items[]? | "  #\(.number) [\(.labels | map(.name) | join(","))] \(.title | .[0:80])"' 2>/dev/null
done
```

**Why 1.0b beats 1.0a for the daily report**:
- **Exact 24h window in one API call** — no Python post-filter, no over-fetch. Search returns the precise set of items that crossed the date boundary in the window.
- **State filter is server-side** — `is:merged`, `is:unmerged`, `is:open` partition cleanly. With 1.0a you'd inspect `mergedAt` field for every PR and re-bucket.
- **Label filtering available** — `label:bug,performance` etc. for section routing.
- **One search query = 4 buckets per repo (merged, rejected, new open, new issues)**. Total: 40 API calls for a 10-repo digest. Stays well under 5000/h rate limit on a single token.

**Critical pitfalls with 1.0b** (observed 2026-08-03):
- **Search API is rate-limited separately from REST** — 30 search requests/minute per user token. **If you run the 40-call loop back-to-back you WILL hit it.** Observed: 9 repos × 4 calls each = 36 in a tight loop → `403 API rate limit exceeded` after the 28th call (REST limit for the user was 5000/h but the **search sub-limit** is 30/min, and search shares the 5000/h). The recovery: `sleep 60` then resume from the failed repo. **Mitigation**: insert `sleep 1` between every 5th call, OR batch by state across all repos before moving to the next state (10 merged → sleep 2 → 10 rejected → sleep 2 → 10 new open → ...). The by-state batching is faster wall-clock AND avoids the burst.
- **`is:unmerged` keyword** (NOT `is:closed`!) is the one that finds closed-not-merged PRs. `is:closed` includes merged ones. This is a footgun — `is:closed + closed:DATE..DATE` returns both merged AND rejected in the same query, which you then have to disambiguate.
- **The `updated` field on search results ≠ `merged_at` for merged PRs.** Search's `updated_at` is the *last activity* timestamp, not the merge time — a PR merged 36h ago and commented on yesterday will show as "in window" by `closed:DATE..DATE` and not by `merged:DATE..DATE`. **For accurate "merged in last 24h" use `merged:` qualifier, not `closed:`.**
- **Some repos have NO activity in 24h.** That's normal — NVIDIA/Triton-Inference-Server are sometimes 0-merged / 0-issue on any given day. The QUIET pattern handles this: footer shows `merged=0`, section omitted. Don't retry or panic. **Widen the window to 48h just for that specific repo if and only if yesterday's report mentioned it having activity close to the boundary** — never widen blindly, that creates double-counting across runs.
- **`gh auth status` MUST show logged-in.** Anonymous search is 10 req/min — unusable for 40 calls. If `gh` is logged in, search gets the user's 30 req/min per-token budget and 40 calls with `sleep 1` between batches fits in ~90s.
- **Search results truncate `body` to ~280 chars.** For each candidate megafic, follow up with `gh api repos/{owner}/{repo}/pulls/{number}` (REST, not search) to get the full body for the 2–3 sentence rationale. The REST endpoint returns the full `body` field.
- **The 24h window is in UTC**, not KST. The cron is 11:00 KST = 02:00 UTC. `START=02:00:00` of yesterday UTC, `END=02:00:00` of today UTC. Don't use KST timestamps here or you'll be off by 9 hours.

### 1.5. Inline deep-dive helper (for megafic + reject candidates)
The body excerpts in the fetcher output are truncated to 280 chars, which is not enough to write a 2–3 sentence megafic with real WHY or a label/comment-driven reject hypothesis. Before writing, drop a small ephemeral helper at `/tmp/gh_helpers.py` (NOT in the workspace — keep it transient) and fetch the **full body** of your 3–5 megafic candidates plus the **comments** of 2–3 reject candidates.

```python
# /tmp/gh_helpers.py — write once per session, discard after
import urllib.request, json, os
TOKEN = os.environ.get("GH_TOKEN", "")
def gh(url):
    req = urllib.request.Request(url, headers={"User-Agent": "...", "Accept": "application/vnd.github+json"})
    if TOKEN: req.add_header("Authorization", f"Bearer {TOKEN}")
    with urllib.request.urlopen(req, timeout=15) as r: return json.loads(r.read())
# CLI: python3 gh_helpers.py pr owner/repo num  |  issue owner/repo num  |  comments owner/repo num
```

Anonymous rate limit is 60 req/h. **The fetcher itself typically burns 250–350 calls** (10 repos × closed + open PRs + issues × pagination), so by the time you want to deep-dive you are often at or past 60. The "you're well under" claim is wrong for a 10-repo run — assume deep-dive is rate-blocked unless `GH_TOKEN` is set. **Set `GH_TOKEN` whenever this skill runs as a cron**, and verify with `curl -sI -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/rate_limit | head -1` that you're not in a 403 state before attempting deep-dive. With `GH_TOKEN` the limit is 5000/h and you have headroom for both fetcher and deep-dive.

**Token resolution order in `scripts/gh_deepdive.py`**: (1) `$GH_TOKEN` env, (2) `gh auth token` (uses whatever keyring-backed credential `gh auth login` set), (3) anonymous. (2) is the path of least resistance for foreground sessions where `gh` is already logged in but the user didn't export `GH_TOKEN`.

**What to look for in full body**:
- Megafics: root cause / motivation paragraph, "this supersedes #X", "follow-up to #Y", validation/benchmark numbers, dependencies on companion PRs
- Rejects: "DO NOT MERGE", "DRAFT", `closes`/`fixes` links pointing to OTHER PRs, "replaced by", "depends on #Z (not yet merged)"
- Issues: motivation, proposal sections, related-issue links, the "open question" line

**What to look for in comments**:
- If the only comments are from `coderabbitai[bot]` (no human comments): strong "superseded by merged sibling" signal — same author or series
- A human comment like "thanks for the work but we're going a different direction in #X" → "held at design level"
- A maintainer comment "needs rebase" + `needs-rebase` label → process-level hold, not design

#### 1.5a. Direct `gh pr view` deep-dive (preferred when you already know the PR#)
For a 1-shot deep-dive on a PR you've already identified (megafic candidate, reject candidate), skip the helper script and use `gh` CLI directly. `gh` is ~10× faster than urllib for a single call and inherits the user's keyring-backed auth, so you don't have to set `GH_TOKEN` or worry about 60 req/h:

```bash
# Full body + state + mergedAt + author + labels in one call
gh pr view 33521 --repo sgl-project/sglang \
  --json title,body,state,closedAt,mergedAt,author,labels \
  --template '{{.title}} [{{.state}}{{ if .mergedAt }} M{{ end }}] @{{.author.login}} | labels: {{ range .labels }}{{.name}},{{ end }}
{{ .body }}
---'

# Human + bot comments for reject hypothesis
gh api repos/sgl-project/sglang/issues/33521/comments \
  --jq '.[] | select(.user.login != "github-actions" and .user.login != "gemini-code-assist" and .user.login != "coderabbitai") | "\(.user.login): \(.body[:300])"'
```

**When to use this vs 1.5 urllib helper**:
- 1.5a `gh pr view`: 1–3 specific PRs, body-only or comments-only, the PR# is already known from the 1.0 fetcher. **Use this first.** No env setup, no helper file, no rate-limit math.
- 1.5 urllib: bulk deep-dive (5+ PRs at once), or when `gh` is not authenticated, or when you want to keep the deep-dive reproducible as a script artifact.

**`gh pr view` is PR-only.** Passing an issue number returns `GraphQL: Could not resolve to a PullRequest with the number of N` (observed 2026-08-10 with vLLM #51593, SGLang #34155, #34192). For issue bodies (bug reports, feature requests, contribution requests) use the REST issues endpoint instead: `gh api repos/{owner}/{repo}/issues/{number} --jq '[.title, .user.login, .body] | join("\n")'`.

**Filter bots out of comment threads** — the GitHub Actions bot, `gemini-code-assist[bot]`, `coderabbitai[bot]`, and `copy-pr-bot[bot]` leave lots of automated noise. The `--jq` filter above excludes them; otherwise the only human content is buried.

**Recursive cross-reference**: when a megafic body mentions "follow-up to #X" or "superseded by #Y", call `gh pr view` on the *referenced* PR too — it often surfaces a chain (e.g. SGLang #33521 → #33623, Mooncake #3252 → #3285, Mooncake #3240 → #3206) that lets you compress 3–4 PRs into one cross-repo megafic.

### 1.5b. Reject hypothesis evidence hierarchy
When writing reject hypotheses, weight sources by reliability (most → least decisive):

1. **Author's own "Superseded by #X" / "Covered in #X" / "Reopened as #X" comment** — tier-1, almost always final. State as a direct quote. (Observed: Mooncake #3252 `Superseded by #3285`, Mooncake #3240 `Covered in #3206`, vLLM #50770 author pointing to new pipeline.)
2. **Maintainer/commenter "please rebase" + `needs-rebase` label** + `mergify[bot]` close reason quoting the same → process-level hold. State the label name explicitly. (Observed: vLLM #51090, SGLang #33521.)
3. **Auto-generated `copy-pr-bot[bot]` on NVIDIA-runner repos** — "This pull request requires additional validation before any workflows can run on NVIDIA's runners." Recurring pattern on Dynamo and TRT-LLM. Means: external-contributor + NVIDIA vetter process gate, NOT a code design reject. (Observed: Dynamo #12617, #12346.)
4. **"Stale" or "waiver removal" close** + HEAD commit already contains the fix → the PR's purpose is void. (Observed: TRT-LLM #17150 — waiver removal PR after the underlying bug fix landed.)
5. **Design-level rejection by a maintainer** — quote verbatim, name the reviewer. Rare. (Observed less than design-reject in 2026-08 runs.)
6. **Only bot comments, no human comments** — either (a) author abandoned, (b) low-priority fix that got closed during repo-wide cleanup. Don't fabricate a "design disagreement" reason. Say "low-signal close" or look for the `stale`/`wontfix` label.

If you have only labels but no comments, **say so explicitly** and stop there — don't invent a "design" or "scope" reason.

### 1.6. Resolve architecture codenames (sm_XXX → product)
When a PR references `sm_100` / `sm_120` / `sm_107` / "Blackwell" / "Rubin" without spelling out the GPU, resolve before writing the megafic. See `references/compute-capability-gpu-map.md` for the table. Common mistakes to avoid:
- "SM120" alone → don't default to datacenter Blackwell; it's consumer Blackwell / RTX PRO Blackwell Server
- "SM107" → Rubin (NOT Blackwell Ultra — that's SM103)
- "SM103" → GB300 / B300 (Blackwell Ultra), NOT Rubin
- "sm_100f family" → covers SM100/103/107 (the whole CC 10.x group)

Wrong codename mapping = wrong megafic.

### 2. Read raw output, pick the top 5 megafics across all repos
Across the full raw listing, select 3–5 **megafics** — the day's highest-signal events, regardless of state. Eligible sources:
- **Merged PRs** (most common) — production-critical (e.g. a perf land that was reverted, a correctness fix in a hot path), ecosystem-shaping (e.g. a new model family, a major API deprecation, a new first-class integration), unblocking a known series (e.g. "yesterday's #X follow-up finally lands"), or cross-repo boundary events (e.g. one repo's release cycle forces another repo's hotfix).
- **Closed-not-merged PRs** — when a substantive fix is rejected on design grounds (maintainer design-reject — see `references/depth-mode-enrichment-pattern.md` category 6), the rejection itself is interview-grade signal.
- **New open PRs** — when the PR has author-attached benchmarks + regression tests + fixes-#X link, it can be MORE important than the day's merges. Don't reflexively relegate to the new open list.
- **Open issues** — when the issue surfaces a previously-unknown production hazard with quantified measurements (e.g. silent collapse 97%→40%, no error), treat as megafic even with no fix yet.
- **Issue + Fix pair** — when the same day has both a hazard-reporting issue and a maintainer's fix PR, treat the pair as one megafic.

For each, write 2–3 sentences of **system-level technical background** (WHY it matters), NOT application framing. Connect to recent series ("어제 #48776의 follow-up"). Use the mid-paragraph `**시그널:**` bold pattern — see `references/depth-mode-enrichment-pattern.md` "Megafic prose pattern" for the template.

**Megafic heading shape (Artifact Hub rendering safety):** write `1. **Title** (#PR1 + #PR2, @author) — description` — PR# clusters, author handles, and parentheticals go OUTSIDE the bold span. The alternative `**Title (#PR1, @author)**` (parens inside bold) is the exact pattern the renderer breaks on, leaking literal `**`. Verified 2026-08-10: 5 megafic headings in the fixed shape → raw render had 0 stray `**` and 105 correct `<strong>`. Use short bold spans only; put the long explanation after the em dash.

**Detect sibling-PR patterns first.** Before picking 5 independent megafics, scan body excerpts for sibling signals ("sibling fix of", "follow-up to", "split #X", "supersedes #X", same-author same-day, cross-repo stack adoption). If found, **consolidate siblings into one megafic** — it saves Discord budget and gives a richer signal than N list items. See `references/sibling-pr-patterns.md` for the five patterns (transport family fix, red-precommit cleanup, series split, issue+fix pair, cross-repo stack adoption).

### 3. For each repo, write the depth-mode note
Per the user's style rules:
- ✅ System-level changes only (engine, KV cache, attention backend, EP/PD topology, comm primitives)
- ❌ Reject "X 모델에 적용" / "for serving this model" framing
- ✅ Why-it-matters perspective: "왜 이게 production에 들어갔지?" for merges, "왜 안 받았지?" for rejects
- ✅ Reject hypothesis is **label-driven + comment-driven**, not invented. Use labels (`needs-rebase`, `stale`, `superseded`, `wip`, `do-not-merge`) and any comment cues. If no clear reason, say "comment-driven hypothesis: ..."
- ✅ Cross-repo signal at the end (5–12 numbered items) connecting today's events to broader trends and to yesterday's report. Default 8 in the Discord summary, up to 12 if the budget allows; full note can go longer with full sentence per item.

### 4. Generate the Discord summary
This is the most error-prone step. **The fetcher output is NOT the Discord message — you must hand-build a compressed summary.** The cron auto-delivery path will accept messages well over 2000 chars, but the user has to *read* the result, so a 9000-char wall of text is poor UX. **Target ≤ 2000 chars for readability, not for delivery.** See the discord-2000-char pitfall in Pitfalls for the distinction.

Structural template (what works in practice):
```
📡 **LLM Serving Daily — YYYY-MM-DD (Day) HH:MM KST**
_24h · 10레포 · 깊이 · m<merged> r<rejected> n<new_open> i<issues>_

🔥 메가픽 5건
1. **<repo> #PR→#PR** <one-line description> — <system-level why>
...
5. ...

✅ 머지 <one-line bullet list with · separator, repo-grouped>
❌ reject <one-line bullet list, key rejects only>
🆕 new open <one-line bullet list, key signals only>
🐛 issue <one-line bullet list, key production issues only>

📌 (1) <cross-signal 1> (2) <cross-signal 2> ... (8) <cross-signal 8>

📁 `~/workspaces/.../notes/daily_pr/YYYY-MM-DD.md`
```

Compression playbook (apply in order until ≤ 2000):
1. Drop articles ("the", "a")
2. Abbreviate repo names only when space-critical: "FlashInfer" → "FI" only when over budget
3. Use `·` separator for in-line lists (not commas/newlines)
4. Drop redundant glue: "main 머지 1h 후" → "main 머지 후"
5. Megafic descriptions: cap at 1 short sentence each
6. Cross-signal: keep all 8 if possible; abbreviate in 2-3 word phrases each
7. Drop the bottom item from any list first (e.g. 5th reject → 4)

**⚠️ DENSE-DAY PROTOCOL (when fetcher reports m>60 or r>20 or n>50, OR total events > 80):** Start iteration 1 with **PR#-only lists** (no descriptions) for ✅/❌/🆕/🐛 sections — e.g. `✅ vLLM #39562 #48174 #47764 #50057 #50034 #47920 · SGLang #31543 #31629 #32498 #30260 · ...`. **Cap each megafic at 1 short sentence (one —, max two —, NEVER three + multiple sub-bullets) — the full sentence is the exception, not the rule.** Cross-signal 6 items only, each a 3-5 word phrase (e.g. `K3 4 backend 동시 fix`, NOT `K3 production 안정화 wave: 4 backend 동시 fix`). Iteration-1 target length ~1700–1800 chars; this avoids the 9+ compression rounds (observed on 2026-08-01 m=94/r=31/n=131 where starting megafic 1 with 4 sentences + bullet pair cost 9 rounds to hit 1994). The depth is in the full markdown note, not the Discord summary — preserve detail there and compress hard in Discord. **On normal days (m<40, r<10, n<30) you can afford one short description per list item.** Use the density at fetcher time to choose the starting compression level.

**Megafic sentence-count rule (DENSE day)**: even when the megafic covers a 4-PR chain like TRT-LLM #17129 + #17110 + #17105 + #17104, write the **PR# cluster as a comma-list, then ONE — separator sentence, then OPTIONALLY one `*takeaway*` italic**. Example that fits in ~180 chars: `**TRT-LLM #17129 + #17110 + #17105 + #17104** — K3 hot path 4모서리 잠금. #17110 capture batch frozen host value scatter, GSM8K 88.21→96.44. #17105 TEP16 71%→0% crash.` Do NOT split into multiple — sentences with semicolons. Do NOT add a `*시그널:*` style closing line; the comma-list IS the closing.

Verify with:
```bash
python3 -c "import sys; t=open(sys.argv[1]).read(); print('OK' if len(t)<=2000 else f'OVER {len(t)-2000}')" <file>
```

Iterate 2–5 times on a normal day, **5–8 times on a dense day** (m>60 or r>20 or n>50). Character budget is tight. Don't skip verification. **Always measure before/after each write** with the `python3 -c` one-liner.

### 5. Save both files
- Note: full depth-mode markdown (typically 30–45KB / 200–230 lines for 10 repos)
- Discord: ≤ 2000 chars for **readability** (the cron auto-delivery path will accept more, but the user has to read it)
- **Cron delivery is automatic — do NOT call `send_message` or try to deliver.** The system handles it.

### 5.0. Publish to Artifact Hub (if the cron prompt requests it)
Some cron prompts (e.g. the llm-serving daily) require posting the full depth-mode report to the user's `artifact.sharosoo.com` Artifact Hub. Long bodies are inconvenient in Discord; the Artifact Hub detail page is the right place for the full 30–45KB markdown, and Discord gets a short summary + detail link.

**Pre-publish checklist** (in order, do not skip):
1. **List existing artifacts with the same `project` + `q`** to check for duplicates from previous runs. The MCP `list_artifacts` tool supports `project` + `q` (full-text) and a `limit`. Search by exact date and the slug prefix to be sure.
2. **Use a deterministic slug**: `llm-serving-daily-report-YYYY-MM-DD` (no version, no suffix). The Artifact Hub identity is `(project, slug)`, NOT a v1/v2 number — calling `publish_artifact` with the same slug appends a new version, calling with a new slug creates a parallel document.
3. **Set what you can; use the correct invocation path.** Set `title`, `slug`, `project`, `format: "md"`, `visibility: "link"`, `agent_source: "cron:<cron-id>"`, and intended tags explicitly. For bodies above ~30KB, do not put the body in a deferred `tool_call` argument: use the in-process registry handler from the parent Artifact Hub skill with the body read from the local file. The deferred MCP boundary may reject a flat `tags` array even though the live handler accepts it; verify the resulting tags via `list_artifacts`. If tags still fail, report the actual empty-tag result rather than pretending they were applied.
4. **Sanitize the body for the `no-raw-html` lint**:
   - Strip `<!-- ... -->` template fragments (truncated PR descriptions leak these from GitHub).
   - Escape literal angle-bracket placeholders like `<issue number>`, `<PR number>`, `<123>` — Artifact Hub's `no-raw-html` rule rejects them. Pattern: `re.sub(r"<([a-z]+)\s+([a-z]+)>", r"`&lt;\1 \2&gt;`", s)`.
   - Wrap `<think>`, `</think>`, and similar thinking-tag tokens in backticks: `re.sub(r"(?<!`)<think>(?!`)", "`<think>`", s)`. Even inside a code block the renderer can flag them.
   - **Do NOT try to hand-author Charts.css tables inside `html render` blocks** for the daily report — the `chart` preset requires a fenced code block, and the daily has no chart content anyway.
5. **Publish, read the response**:
   - On `Created v1` you got a new document; record the `slug` and the returned detail URL.
   - On "rejected with convention violations", fix and retry. Typical round-trip: 3–5 seconds. Budget for 2–3 retry rounds (1.5–3 min total).
   - On "version appended" you successfully updated an existing document; verify tags were not cleared (some deployments clear tags when `update_artifact` carries no metadata).
6. **Verify from the served URL** — open the returned `https://artifact.sharosoo.com/a/<id>` with `web_extract` or the browser and confirm: title, current version (`Open vN`), tags, visibility, AND a representative section of the body render. In cron/CDN environments, add `?v=<version>` to bypass a stale detail-page cache. Verify the opened rendered document from the content origin too; raw link check alone is insufficient — the lint may have run but the body may have rendered as escaped or truncated text.
7. **Discord reply stays short** — 3–5 line summary + the detail URL. Do NOT paste the full body into the Discord reply; the user reads the body on Artifact Hub.

**Pitfalls specific to publishing a depth-mode report to Artifact Hub**:
- **Angle-bracket tokens in PR title escapes**: e.g. `TestQwen3NextInstruct::test_bf16_4gpu[dep4]` (a TRT-LLM test name with `[dep4]`) — the `[` and `]` are fine, but if a body or title contains `<...>`, escape. The `dep4` test name is a common false positive because of the surrounding `<...>` looking similar in regex.
- **Lines starting with `🏷`, `💡`, `📝`, `❓`, `🔗`** are inside bullet lists and render correctly — do not wrap them in fenced blocks thinking they look like table separators.
- **The `prefer-table` warning** for 3+ key:value bullets in a row is a benign false positive for the daily's per-PR bullet pattern (`🏷 label1, label2, label3`). It does not block publish (it's a `WARN`, not `ERROR`). However, the **same warning fires as a real signal on focus / category lines**: any `_포커스: Label: a, b, c` line (colon inside the focus text followed by 3+ comma-separated items) reads to the linter as a list of `key: value` bullets. Fix: drop the inner colon — `_포커스 — TIS 다중 모델 backend, dynamic batching, ensemble, BLS_` — or move the marker off the same line. Iterate one fix per publish, not all at once. Observed on 2026-08-06 daily report: v1 had 2 warnings, v2 fixed one focus line → 1 warning, v3 fixed the other → 0 warnings. See `references/artifact-hub-publish-playbook.md` "Linter warning iteration loop" for the full pattern.
- **The first publish round-trip is the slowest** (~3–5s). Subsequent retries are faster. Don't optimize for round-trip time on the first publish.
- **Do not bundle the local `📁 노트 위치: ~/workspaces/...` footer into the Artifact Hub body** — that's internal archive metadata, not reader-facing. Strip before publishing.
- **Do not include cron prompt / scheduler headers / tool-planning chatter** — only the polished reader-facing body. The cron script and the agent's intermediate scratch don't belong in the published artifact.

### 5.1 Post-write verification (mandatory on dense days)
Run `python3 scripts/verify_discord_summary.py <path>` (or use the auto-discovered path under `notes/daily_pr/`) to confirm the Discord summary has all 4 list sections, fits the 2000-char budget, and every PR# claimed under a repo actually exists in the raw fetcher JSONs. Use the verifier's canonical repo aliases in the summary (for example `TRT-LLM`, not bare `TRT`; `FlashInfer` rather than an unrecognized abbreviation) or it can attribute a PR to the previous repo and report a false mismatch. This catches hallucinations (PR# that didn't actually merge/close in the last 24h) before the user sees them. Use `--allow-crossday 50000` to whitelist legitimate references to yesterday's PRs (e.g. "어제 #50000 K3 MXFP4").

## 5.2 Canonical exact-window + Artifact Hub hardening (observed 2026-08-11)

### 5.2a. Cron-run reconciliation and verification hardening

When a cron run uses a custom `gh api` exact-window fetch instead of the repository's legacy fetcher, treat the raw JSON as the event-count source of truth and the curated Markdown as the content source of truth. Do not copy counts from a stale/generated local report header: compute `merged`, `rejected`, `new_open`, and `new_issue` from the raw buckets, then use those same totals in the Discord summary. The summary may list only selected hot items, but its header counts must describe the complete fetched window.

For exact-window queries, pin the end timestamp to the cron tick (for an 11:00 KST run, `02:00:00Z`) and use `gh api -X GET` with URL-encoded search parameters. Validate every response with `d.get("items") or []`; a non-empty error JSON is not a successful search result. Keep a separate candidate-enrichment artifact for full PR/issue bodies and reject comments so the report prose remains traceable to fetched evidence.

For post-publish probes, assert only durable inputs and outputs. Do not require a transient `/tmp/hermes-verify-*.py` helper created by an earlier probe to still exist; that helper should be created, run, and deleted in the same verification run. Compile only durable scripts that are actually present, and separately verify that temporary probe files are absent after cleanup. A failed manifest caused by expecting already-deleted helpers is a verification-script defect, not a publication failure.

When the cron prompt also requires Artifact Hub publication, treat the fetched JSON, local Markdown, and remote artifact as three separate contracts and verify each one explicitly:

1. **Make the GitHub Search request an actual GET.** When using `gh api search/issues` with `-f q=...`, include `-X GET`; omitting it can make `gh` submit the parameterized request incorrectly and return `404 Not Found`. Prefer a URL query or `gh api -X GET ... -f q=...`, then verify the JSON has `items` before aggregating.
2. **Resolve issue links from the correct field.** REST issue payloads expose `url` as an `api.github.com` URL and `html_url` as the reader-facing GitHub URL. Normalize links as `html_url or url`, and assert that published reader-facing issue links do not contain `api.github.com`.
3. **Do not publish raw GitHub body excerpts as prose.** Search/REST bodies contain headings, tables, code fences, environment dumps, and angle-bracket placeholders. Use full bodies only as research input; write a short curated system-level summary, or flatten/strip markdown structure before inserting a fallback excerpt. A generic `first sentence + title` fallback is not acceptable when it leaves `##`, `###`, fenced-code remnants, or truncated environment output in the rendered bullet.
4. **Freeze and compare the exact body.** After local structure checks and strict sanitization, keep one canonical source file. For bodies over ~30KB, publish/update through the in-process Artifact Hub registry with the body read from disk. Immediately `read_artifact` the returned version, strip only the known generated metadata prefix (`# Title (vN, md)` plus `slug=... project=...`), and require byte-for-byte equality with the local body. Re-list by exact title/project to verify version, tags, format, and visibility.
5. **Iterate linter warnings to zero.** Per-item metadata bullets should use em dashes (`labels —`, `URL —`, `코드 위치 —`) rather than colon key/value syntax. Normalize colon-bearing GitHub label tokens (`op: moe` → `op - moe` or `op-moe`) before publishing; otherwise `prefer-table` warnings can appear once the report is rendered.
6. **Verify both origins and report work mode honestly.** Open the detail page and current `Open vN`, then open the rendered content origin with `?v=N`. Probe distinctive H1/body/issue-link markers and absence of literal `**`, raw comments, and raw HTML. Use an OS-safe temporary `hermes-verify-` script, delete it after the probe, and report this as ad-hoc verification—not as a green project test suite.

## Consuming the archive: multi-week recap

The archive this skill writes also gets read back. When the user asks for a catch-up over a window they missed ("한동안 못 봤다", "한 달치 정리"), that is synthesis, not generation — do not re-run the fetcher, and do not forward the day files.

1. **Fix the window from `date`.** Never infer "recent" from impressions about the newest file in the directory.
2. **Scan the signal layer, not the depth layer.** `notes/daily_pr/YYYY-MM-DD_discord.md` (~20 lines: mega-picks, merged/reject/new-open counts, signal list) is the scan unit; `YYYY-MM-DD.md` (30–45 KB of per-PR detail) is the depth layer. Batch 12–15 days per terminal call:
   ```bash
   cd ~/workspaces/<workspace>/notes/daily_pr
   for f in 2026-08-13 2026-08-14 … 2026-08-25; do echo "##### $f"; sed -n '1,20p' "${f}_discord.md"; echo; done
   ```
   A month fits in two or three calls. Reading the full day files for a recap burns the context the synthesis needs; open one only to deepen a day the user then asks about. `ls` the directory first — some days exist only as a full report with no `_discord.md` sibling, and older windows have different filenames and schedules.
3. **Aggregate before writing.** A theme present on three or more days is the story of the window; a one-day spike is an anecdote. Four to six themes plus one repeated failure mode is the right size. Count from the collected text, not from memory.
4. **Verify the spine, not every item.** Two to four live lookups — release notes, vendor/research blog, benchmark post — for the items the recap actually rests on. Digest figures record what was reported on that date, and release notes get corrected after publication.
5. **Fill the archive's blind spot from outside it.** The archive records GitHub PR/issue activity and nothing else. Engine blog posts, release notes, vendor benchmark write-ups, and analyst measurements never appear in it, so a recap built only from the day files silently reports repository churn as the state of the field. Enumerate the engine blogs' own feeds (e.g. `https://vllm.ai/blog/rss.xml` returns title / link / date / one-line summary for every post, so a month's post list costs one request) and diff them against what the window's reports actually covered. Naming what the digest missed is usually the most valuable part of a catch-up: it separates what the repositories changed from where the serving stack moved, and it is the one thing the user cannot reconstruct from reports they already received.
6. **Deliver a synthesis, not a list.** One analogy in the opening paragraph that carries the window's shift, then numbered sections headed by the mechanism rather than the company, numbers with their comparison set attached (precision, concurrency, hardware), sources at the end, and one closing question offering the next depth step. Returning N daily summaries is the failure mode; the day files are raw material.

The sibling sources outside this workspace (the arXiv and weekly-industry crons, plus their run-output directories) are mapped in `references/digest-archive-window-recap.md`, together with the per-source verification targets.

## Pitfalls
- **`execute_code` is BLOCKED in cron mode.** Cron jobs run without a user to approve, so `execute_code` returns `BLOCKED: ... runs arbitrary local Python (including subprocess calls that bypass shell-string approval checks). Cron jobs run without a user present to approve it. Use normal tools instead...`. **You must use `write_file` + `terminal python3 /tmp/script.py` instead.** This bites every cron run that tries to be clever with inline Python + intermediate tool calls. If you find yourself reaching for `execute_code`, stop and use the file-based pattern. **For short inline processing** (regex-clean a file, compute a quick metric, transform JSON to a different shape, build a deterministic slug, post-process the fetcher output), the preferred cron-mode path is `terminal python3 - <<'PY' ... PY` (heredoc) — avoids the `write_file` + `read_file` + `terminal` triple round-trip. Reserve `write_file` + `terminal python3 /tmp/script.py` for multi-step scripts that need to be re-run with edits. Verified 2026-08-06: heredoc form ran a regex-clean + sort + slugify pipeline in one terminal call, no cron-mode block. Heredoc form is also safer than a script file because the script body is visible in the tool call (auditable, no `cat > /tmp/x.py` step).
- **`gh` CLI shell scripts can silently drop redirects.** A `for r in ...; gh ... > file 2>/dev/null; done` block can produce 0 JSON files if the redirect gets stripped. Always `ls -la /tmp/*.json` after the script runs and `bash -x` to debug. Adding `set -u` + explicit `|| true` after each command reduces flake.
- **Search API has a separate 30 req/min rate limit** (not the 5000/h REST limit). The 1.0b pattern makes 4 calls per repo × 10 repos = 40 calls. Back-to-back will hit the per-minute limit around call 28-30. **Mitigation**: batch by state (10 merged → 2s sleep → 10 rejected → 2s sleep → 10 new open → 2s sleep → 10 new issues) instead of by repo. If you do hit `403 API rate limit exceeded` on the search sub-limit, `sleep 60` and resume from the failed repo — REST and search share the 5000/h token-wide budget, but the search sub-limit is per-minute and recovers in 60s. **The recovery re-run also needs pacing**: a `sleep 4` between calls after the `sleep 60` re-tripped the sub-limit (observed 2026-08-09, 10/10 403s). Use `sleep 8` between calls in the recovery re-run; if a 2nd cycle is needed, `sleep 90` between cycles. See `references/gh-search-api-pattern.md` for the bash template and pre-strip recipe.
- **Even by-state batching with per-repo `sleep 0.3` + 2s between state batches trips the 4th batch.** Observed 2026-08-10: merged (10) + rejected (10) + newopen (10) succeeded, then the issues batch (calls 31–40) returned 10× 403. The failed `--jq` output files are NOT empty — each contains the 403 error object (~539 bytes, `{"message": "API rate limit exceeded"}`), so an aggregation script that indexes `items` crashes with `KeyError: 'items'` (the first aggregation attempt died on exactly this). Two lessons: (1) **validate fetch output before aggregating** — use `d.get("items") or []` and/or check file size > 1KB; never assume a non-empty file is a result; (2) if all four buckets are needed, **run the issues batch as its own slower pass (`sleep 8` between calls) from the start** instead of hoping the first pass fits the 30/min window. Recovery that worked 2026-08-10: `sleep 65`, re-run only the failed state with `sleep 8` between calls (10/10 succeeded).
- **The 24h UTC window is `START=02:00:00` of yesterday, `END=02:00:00` of today, for an 11:00 KST cron.** Don't accidentally use KST timestamps — that puts the window off by 9 hours and the 11:00 cron sees almost nothing.
- **Deep-dive Python output can be truncated mid-script by the tool harness.** Observed 2026-08-01: a `python3 /tmp/deepdive.py` call returned only the first ~520 lines, dropping the rest of the candidates silently. **Always redirect deep-dive output to a file (`python3 /tmp/deepdive.py > /tmp/deepdive.txt 2>&1`) and then `head` / `sed -n 'N,Mp'` the file.** Treat the harness's truncated stdout as a signal to re-run with file redirection, not as the full result.
- **Discord 2000-char is HARD for `hermes send` but NOT for cron auto-delivery.** The 2000-char limit is the Discord message limit per-message, but the cron auto-delivery path (final response → Discord gateway) appears to chunk or have a higher budget than the 2000 char. Observed 2026-08-03: `notes/daily_pr/2026-08-03_discord.md` was **8921 bytes** (~9000 chars, 4× the per-message limit) and the cron job delivered it without truncation or error. The historical `*_discord.md` files in `notes/daily_pr/` consistently range from 2000–9000 bytes, suggesting the auto-delivery path tolerates this. **Implication for the skill**: the DENSE-DAY PROTOCOL compression (PR#-only lists, 1-sentence megafics) is still good craft for **readability in a 2000-char window**, but is NOT a hard delivery constraint — the gateway will accept longer. The 2000-char limit becomes a hard constraint only if you choose to use `hermes send` directly (which is blocked from cron anyway, see pitfall #12). **Practical decision rule**: still compress to ~2000 chars for the `*_discord.md` file because it's how the user reads the daily report, and a 9000-char wall of text is hard to skim. But the compression is for UX, not for delivery. **The "iteration 2-5 on a normal day, 5-8 on a dense day" budget is real — just know the iteration target is 2000 for readability, not for technical delivery.**
- **Start compressed on dense days, expand on light days.** If the fetcher reports m>60, begin iteration 1 with PR#-only lists. Don't write full sentences per item and then try to compress them down — you will overshoot 2000 by 1000+ chars and spend 5+ rounds cutting. Match the starting compression to the day's density.
- **MANDATORY pre-write density check (one-liner, cannot skip).** Before writing the first iteration of the Discord summary, look at the fetcher's footer line (`merged=N · rejected=M · new_open=K · new_issue=I`). If **any** of these is true, you MUST use PR#-only lists for the ✅/❌/🆕 sections in iteration 1:
  - `N + M + K > 80` (today's total > 80)
  - any single section > 30 items
  - either r > 20 or n > 50 (already defined as DENSE-DAY threshold)

  Concrete decision rule: compute `total = N + M + K`. If `total > 80` OR `max(N, M, K) > 30`, the day is DENSE. Write the Discord summary with PR#-only lists. If `total <= 80` AND `max(N, M, K) <= 30`, you can afford one short description per list item. **This check is the single most-skipped rule** — observed 2026-07-31 (m=73, r=28, n=69, i=7, total=170) skipped it and produced a 5702-byte Discord summary, exactly the same 2026-07-29 mistake. The skill's threshold rule was correct; the agent did not apply it. The fix is to make the decision a 1-second mental check at the start of step 4, not a discovery at the end.

  The same rule can be expressed as: **if the fetcher footer itself has more than 3 metrics in double-digits, default to PR#-only** (light compression, no descriptions per item).
- **GH_TOKEN is mandatory for cron.** Anonymous 60 req/h is exhausted by the fetcher alone on a 10-repo run. Without `GH_TOKEN`, deep-dive is rate-blocked and you must write megafics from the body excerpt in the raw output only.
- **Megafics must connect across days.** If today's top PR is a follow-up to yesterday's series, link them explicitly. This is what makes the report a digest, not a listing.
- **Reject hypothesis is label-driven.** Inventing reasons (e.g. "design disagreements") without label/comment evidence weakens the report. Use the actual labels and PR-author comments.
- **Don't add application framing.** "X 모델에 적용" / "serving this specific model" is forbidden. System-level only — the user is interested in serving internals.
- **The script is fetcher only.** Never assume the script output is the deliverable. Always read it, select, and rewrite.
- **Save TWO files.** The full note (for archive) and the Discord summary (for delivery) are different artifacts with different lengths.
- **Don't call `send_message`.** This is a cron job; delivery is automatic. The system prints the EXACT error `Skipped send_message to discord:CHANNEL. This cron job will already auto-deliver its final response to that same target. Put the intended user-facing content in your final response instead, or use a different target if you want an additional message.` (observed 2026-08-03 11:10 KST on `hermes send --to discord:#일반`). **The cron prompt's final response IS the Discord message.** Do not try to format a "send-friendly" version of your reply separately. The `notes/daily_pr/YYYY-MM-DD_discord.md` file is saved for archival / future-reference only; it is NOT the delivery artifact. Save it for the record but put the actual user-facing content in the final response.
- **Run the script first, then enrich.** Doing depth-mode enrichment without raw data leads to hallucination. The script is the source of truth for what actually happened.

## Verification
- [ ] `notes/daily_pr/YYYY-MM-DD.md` exists, covers all 10 repos, has 3–5 megafics + per-repo sections + 5–8 cross-signals
- [ ] `notes/daily_pr/YYYY-MM-DD_discord.md` exists and is ≤ 2000 chars for **readability** (the cron auto-delivery path will accept longer; this is a UX target, not a delivery constraint)
- [ ] Korean prose + English technical terms mixed (PR#, function names, system terms stay in English)
- [ ] No application framing ("for X model" forbidden)
- [ ] Megafics explicitly link to recent series (yesterday's report or last week's pattern)
- [ ] Megafics are picked from across all states (merged / closed-not-merged / new open / open issue / issue+fix pair), not just merged
- [ ] Each megafic uses the mid-paragraph `**시그널:**` bold pattern (leading bold for PR identity, trailing bold for takeaway)
- [ ] Reject hypotheses are label/comment-driven, not invented. Design-reject on a substantive fix quotes the maintainer's specific concern verbatim
- [ ] Cron job left to system — no manual delivery attempted
- [ ] `python3 scripts/verify_discord_summary.py` reports 9/9 PASS before delivery (mandatory on dense days with total events > 80)
- [ ] If the cron prompt asks to publish to Artifact Hub: detail URL recorded, the served page was verified with `web_extract` (not just the raw link), and the Discord reply has the detail link, not a paste of the body

## Reference files (under `references/`)
- `repo-list-llm-serving-10.md` — the standard 10-repo LLM serving monitor list (Tier 1 + Tier 2) with focus keywords
- `discord-2000-compression.md` — the compression playbook with worked examples and a per-iteration timeline
- `depth-mode-enrichment-pattern.md` — how to write megafics, reject hypotheses, cross-signals (with worked good/bad examples)
- `compute-capability-gpu-map.md` — sm_XXX → GPU product lookup (Hopper / Blackwell / Blackwell Ultra / Rubin / RTX 50 etc.) with common confusions to avoid
- `sibling-pr-patterns.md` — when 2+ PRs on the same day form one megafic (transport family fix, red-precommit cleanup, series split, issue+fix pair, cross-repo stack adoption)
- `gh-search-api-pattern.md` — `gh api search/issues` 4-query pattern (merged / rejected / new open / new issues) for exact 24h windowing, with the by-state batching recipe to avoid the 30 req/min search sub-limit and 403 recovery (added 2026-08-03 after observing a rate-limit trip in production)
- `gh-pr-view-deepdive.md` — direct `gh pr view` / `gh api .../comments` deep-dive for PRs you already know, with the reject-hypothesis evidence hierarchy (author-supersede > needs-rebase > NVIDIA vetter > stale-waiver > maintainer-design > bot-only) and bot filter list (added 2026-08-05 after observing the pattern is the dominant reject signal in the daily reports)
- `artifact-hub-publish-playbook.md` — pre-publish search + slug discipline, body sanitization for `no-raw-html` lint (HTML comment strip, angle-bracket escape, `<think>` backtick-wrap, footer/scratch strip), publish-rejection retry loop, served-URL verification via `web_extract` (added 2026-08-05 after the cron started requesting Artifact Hub publication)
- `artifact-hub-daily-report-hardening.md` — exact `gh api -X GET` windowing, `html_url` normalization, large-body in-process publication, warning cleanup, canonical byte comparison, and OS-safe ad-hoc probe recipe (added 2026-08-11)
- `digest-archive-window-recap.md` — where every layer of the digest archive lives (per-run output dirs, per-day signal/depth files, weekly industry files, state files), the batched scan commands for a multi-week window, the engine blog feeds that sit outside the archive entirely and must be swept separately for a recap, and the verification targets to re-check before quoting a version or benchmark number

## Templates (under `templates/`)
- `daily_pr_fetcher.py` — fetcher script pattern (urllib + GitHub API, no LLM calls, no auth). Modify the REPOS list, run, then enrich manually.

## Scripts (under `scripts/`)
- `gh_deepdive.py` — inline deep-dive helper for fetching full body + comments of megafic/reject candidates. Run as `python3 gh_deepdive.py pr owner/repo num` (or `issue` / `comments`). Token resolution: `$GH_TOKEN` env → `gh auth token` → anonymous. Drop at `/tmp/` for ephemeral use.
- `verify_discord_summary.py` — post-write verification: confirms the Discord summary has the 4 list sections, fits the 2000-char budget, and every PR# claimed under a repo actually exists in the raw fetcher JSONs. Use after every Discord write, especially on dense days. Run as `python3 verify_discord_summary.py [path]` — auto-discovers today's files if no path given.

## Related skills

- `arxiv-daily-digest-cron` — the parallel cron pattern for **arXiv** paper digests (instead of GitHub PR/issue). Same Discord-shipped-from-stdout shape, same state-file dedup discipline, but with arXiv-specific rate-limit recovery (5–7 small queries, 5–8s sleeps, 503/429 retry), system-vs-application filtering rubric, and Korean 1–2 sentence per-paper summaries. Read this if the daily cron is paper-source not code-source.
