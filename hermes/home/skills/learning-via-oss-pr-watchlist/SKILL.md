---
name: learning-via-oss-pr-watchlist
description: "Learn a new technical domain by following real PRs in the relevant open-source ecosystem daily, instead of reading tutorials in order. Use when a user wants to ramp up on a fast-moving OSS project (LLM serving, compilers, K8s operators, ML frameworks, etc.) and explicitly rejects textbook/roadmap-style learning in favor of seeing real code and real production problems. Triggers: '로드맵 따라 공부하는 건 내 스타일이 아니야', '실제 돌아가는 코드를 보면서 역으로 이론을', 'PR 흐름 보고 배우고 싶어', '그냥 PR 좀 볼 수 있게 해줘', '어떤 오픈소스 보면서 공부할까'."
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [open-source, learning, github, pr-review, code-reading, ramp-up, daily-routine, llm-serving, k8s, compilers]
    related_skills: [github-pr-workflow, github-code-review, serving-llms-vllm]
---

# Learning by reading open-source PRs

A class-level pattern for engineers who want to ramp up on a fast-moving OSS ecosystem (LLM serving, ML frameworks, compilers, K8s operators, databases) by following real PRs daily instead of reading tutorials in order.

## When to use

The user says something like:
- "로드맵 따라 공부하는 건 내 스타일이 아니야"
- "실제 돌아가는 코드를 보면서 역으로 이론을 공부하고 싶어"
- "PR 흐름 보고 어떤 기술이 기반했는지 정리해줘"
- "이 생태계에서 어떤 레포를 봐야 하지?"
- "타겟 오픈소스 정하고 매일 PR 볼 수 있게 해줘"

In other words: **"don't give me a study plan, give me a watchlist and a scraping routine"**.

## Why this works

A textbook teaches you the *current best understanding* of a domain. A PR teaches you:
- The actual current design (not the 12-month-old blog post version)
- A real production problem someone hit
- The maintainers' review patterns (what gets rejected, what sails through)
- Naming conventions, code structure, and testing culture
- Domain vocabulary that becomes interview-ready in weeks

After sustained daily reading, use maintainer review patterns to choose a narrow first contribution. Do not imply that reading guarantees a merge: scope, competing fixes, maintainer priorities, and reproducibility all matter.

## Workflow

### 1. Identify the watchlist (5-10 repos)

Pick a core target, then add adjacent ones at decreasing depth:

- 1 primary repo (the one they want to contribute to)
- 2-3 ecosystem peers (alternatives / competitors / collaborators)
- 1-2 substrate projects (compiler / runtime / framework underneath)
- 1-2 adopter-facing projects (K8s operator / dashboard / framework integration)

For LLM serving: `vllm-project/vllm`, `sgl-project/sglang`, `flashinfer-ai/flashinfer`, `triton-lang/triton`, `Dao-AILab/flash-attention`, `LMCache/LMCache`, `llm-d/llm-d`.

### 2. Set daily PR quota (60-90 min/day total)

| Time | Activity | Quota |
|---|---|---|
| Morning 30 min (coffee) | Skim 5 merged + 5 rejected from primary | pattern recognition |
| Lunch 20 min | 5 PRs from 2nd-tier ecosystem | vocabulary |
| Evening 30 min | Read 1 merged PR in full diff | depth |
| Weekend 1 hr | Weekly theme note | synthesis |

### 3. Daily deliverable: a 1-page note

For each day, capture:
- 5-10 one-liners per repo ("why merged or rejected, what technique")
- 1 deep-dive (5-line note on the chosen PR's design)
- Total page count: 1 page, low ceremony

### 4. First contribution target

Once the user recognizes a repository's test and review conventions, select a narrow issue rather than a calendar milestone. Prefer an issue matching their existing engineering expertise. Before ranking it, read the current contribution policy, issue body and full timeline; check assignees, commenters offering local fixes, and linked open/draft/closed PRs plus title/keyword duplicates. Categorize each candidate as **ready for PR / needs maintainer alignment / independent reproduction or measurement / watch only / exclude**. An open unassigned issue is not necessarily available, and an internal design request is not a first-PR slot. If no candidate passes the gate, report zero rather than filling the ranking. For uncertain bugs, reproduce on current main using a scripted/mock model before proposing a patch; separate environment-specific and replay-only failures from the ordinary path. Then post the minimal reproduction and expected invariant, obtain direction where required, and only then submit a failing regression test plus focused fix. `good-first-issue`, abandoned fixes, and docs changes are options, not mandatory starting points. Recheck ownership immediately before commenting or coding, because another contributor may have opened a fix since the report was generated.

When the user worries that outsiders cannot merge PRs, verify with a bounded GitHub sample instead of empty reassurance: query merged PRs by repo and window, inspect `author_association`, and distinguish `MEMBER`/`COLLABORATOR` from `CONTRIBUTOR`. **Never present the share of merged PRs from `CONTRIBUTOR` accounts as a first-time contributor success rate** — it excludes rejected submissions and can include repeat external contributors, bots, or affiliated regulars. Explain that review or closure is not a judgment of the person's ability; scope, duplication, and project priorities matter. Give one small, reproducible first step rather than a generic pep talk.

## Drop-in GitHub API scraper (no auth needed)

```python
import urllib.request, json
from datetime import datetime, timedelta, timezone

REPOS = [
    ("vllm-project/vllm", 10),
    ("sgl-project/sglang", 8),
    ("flashinfer-ai/flashinfer", 5),
    ("triton-lang/triton", 5),
    ("Dao-AILab/flash-attention", 3),
    ("LMCache/LMCache", 5),
    ("llm-d/llm-d", 5),
]

def fetch(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "study/1.0",
        "Accept": "application/vnd.github+json",
    })
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

cutoff = datetime.now(timezone.utc) - timedelta(days=7)

for repo, _ in REPOS:
    name = repo.split("/")[-1]
    print(f"\n{'='*100}\n  {name} ({repo})\n{'='*100}")
    cnt_m = cnt_r = 0
    closed = fetch(f"https://api.github.com/repos/{repo}/pulls?state=closed&per_page=20&sort=updated&direction=desc")
    for pr in closed:
        updated = datetime.fromisoformat(pr["updated_at"].replace("Z", "+00:00"))
        if updated < cutoff: continue
        merged = pr.get("merged_at") is not None
        title = pr["title"][:65] + ("..." if len(pr["title"]) > 65 else "")
        print(f"  {'✓' if merged else '✗'} #{pr['number']:<6} {title}")
        if merged: cnt_m += 1
        else:     cnt_r += 1
    opens = fetch(f"https://api.github.com/repos/{repo}/pulls?state=open&per_page=5&sort=created&direction=desc")
    for pr in opens:
        created = datetime.fromisoformat(pr["created_at"].replace("Z", "+00:00"))
        age = (datetime.now(timezone.utc) - created).days
        title = pr["title"][:65] + ("..." if len(pr["title"]) > 65 else "")
        print(f"  ◌ NEW   #{pr['number']:<6} {title}  ({age}d)")
    print(f"  >> 7d: merged={cnt_m} rejected={cnt_r}")
```

**Rate limit**: 60 req/hr unauthenticated. The 7-repo script uses 14 calls — fine for daily. For higher frequency, set `GITHUB_TOKEN` and add `Authorization: token ${GITHUB_TOKEN}` (5000 req/hr).

**Pitfall**: `execute_code` runs in a fresh interpreter each call. Re-import `urllib`, `json`, `datetime` at the top of every script. A `NameError` on the second call usually means you forgot to re-import.

## Evaluating whether your own engineering work is paper-worthy

When a user asks "is this paper-worthy?" about their own engineering work (optimization, deployment case study, benchmark, framework), apply a **four-axis honest assessment** rather than enthusiastic endorsement. The user is often doing this evaluation themselves and is testing whether the agent is a hype machine or a real advisor.

### The four axes

1. **Novelty** — Is there at least one technique that didn't exist before? Or is this a known-technique combination? Combination work is publishable at workshops/industry tracks; pure novelty is needed for SOSP/OSDI/MLSys research track. If the answer is "all of these exist in vLLM/TensorRT/FlashAttention already", be honest about it.
2. **Scale** — Single GPU on one model is a case study. Multi-GPU, multi-node, or multi-model (e.g., Aegaeon-style concurrent serving) is what reviewers notice. Be explicit about what scale was tested.
3. **Citation audience** — Will the readers of the target venue *cite* this in their next paper? LLM serving is a large audience; niche domains (KT, education) have small citing populations. The acceptance bar and the impact bar are different.
4. **Forced-relearning penalty** — If the work required "no retraining" and "bit-exact output preserved", that's a strength (immediate deployability) but a weakness for novelty ("why didn't training-time optimization solve this?"). Acknowledge both.

### Output pattern

- Lead with a 1-line honest verdict ("technically possible, low ROI for time invested")
- Give per-axis assessment with rough scores (e.g., "novelty: 2/5, scale: 2/5")
- Provide a venue fit table with rough acceptance probabilities, not enthusiasm
- Always offer the **non-paper alternatives** (Triton/vLLM blog, arXiv preprint, OSS contribution) — for ML infra interview prep, those often have higher ROI than a paper
- If the user is mid-transition (e.g., to ML infra), the time cost of a 3-month paper vs. 1 PR is real — say so

User signal phrases that mean they want this honest assessment, not cheerleading: "이게 맞아?", "솔직하게", "가능한 주제가 맞아?", "ROI 어때?". Match the register.

## Conference knowledge bank (LLM serving / MLSys)

For the actual 2025–2026 accept lists of MLSys, SOSP, and OSDI with relevance to LLM serving / inference / KV cache / disaggregation, see `references/llm-serving-conferences-2025-2026.md`. Includes the cycle-interpretation note: "latest conference" means **current calendar year** (e.g., 2026 → MLSys 2026; SOSP/OSDI are biennial and inactive in 2026).

## Output variant: "deep mode" daily PR report (cron, recurring)

The default daily note in step 3 above is a 1-pager (5–10 one-liners per repo, low ceremony). A specific and recurring variant — typically used by **career-changers treating the daily report as interview prep + actual learning, not just code-read tracking** — wants a much deeper artifact per PR: 3–4 merged + 2–3 rejected + 2–3 new open per repo, with **2–3 sentence technical rationale per PR**, **reject-cause hypothesis** (label + comment-driven), and **issues-as-signals framing**.

Triggers: "깊이 모드", "왜 이 PR이 의미 있는지", "기술 배경 2-3문장", "reject 사유 추정", "면접 단골". This is a known recurring request shape, not a one-off. Distinguishing features vs the 1-pager:

- **Per-PR technical context is required**, not optional. The agent must justify *why* the PR was merged / what production problem it solves, not just summarize the title. Application framing ("X 모델에 적용") is explicitly rejected — system-level changes only.
- **Reject PRs need a cause hypothesis** (stale / needs-rebase / duplicate / scope / architecture-mismatch / vendor-internal-management / format-trap).
- **New open issues are interpreted as company-direction signals**, not just items to track.
- Output language is the user's (e.g. Korean) with technical terms (PagedAttention, RadixAttention, MLA, disagg, prefix caching) kept in English.
- File is saved daily to `~/workspaces/<project>/notes/daily_pr/YYYY-MM-DD.md`; the Discord message references the file for the full version (Discord 2000-char hard limit forces the message to be condensed; the file holds the deep version).

**Technique that works (capture rate, ~3x):** For the top 5–8 hot PRs in the 24h window, do a `web_extract` (or `gh pr view --json`) per PR to pull the actual PR body + first 3 review comments. The PR body almost always has the technical rationale, the linked issue has the original problem statement, and the review comments surface maintainer pushback that explains the "why" the title alone never does. Time cost is ~1s/PR with `web_extract` in parallel batches of 4. **Without this step, the deep-mode output degrades to a title-and-labels summary that fails the user's stated bar** — they explicitly want "왜 이게 production에 들어갔지" reasoning, not just metadata.

For the full prompt template the user calibrated (the one behind the LLM-serving daily cron at KST 11:00) and the converged 10-repo watchlist, see `references/deep-mode-daily-pr-report.md`. For cron-specific runtime quirks (execute_code blocking, GitHub API rate limit, two-step Discord delivery via `hermes send --file`), see `references/cron-runtime-quirks.md`. For the **actual output template** — the `🎯` marker convention, `(N) *(raw M, {theme})*` section header, the `**reject 추정** ① ② ③ / **근본**` phrasing, the `> 핵심 시그널` top-5 block, the `## 🔍 한 줄 흐름` footer with 공통 키워드 / paired 흐름 / 읽을 거리 — see `references/deep-mode-discord-output-conventions.md` (load this BEFORE writing the curated `_discord.md` file). For a ready-to-run shell template that does the per-PR deep-digging via `gh` CLI (inherits user auth, no env var needed) instead of `urllib` (hits 60 req/hr unauth), see `templates/daily_pr_deep_dig_gh.sh`.

## Multi-repo first-contribution handoffs

When asked for a handoff or cron revision covering a watchlist, keep **every tracked repo** in the durable full note rather than narrowing it to the top pick. Give each repo its URL, candidate issue URLs (or explicitly none), current ownership/competing PRs, intake gate, and next investigation step. Rank *next actions*, not PR ownership; distinguish actionable, maintainer-alignment, reproduction/measurement, watch-only, and excluded. The chat summary may be selective, but the file must preserve the whole comparison. A 24-hour issue window is insufficient for ongoing candidates: carry forward older tracked issues and allow new ones to supersede them, with fetch failures distinct from an empty window.

## First-PR intake gates (verify live before recommending)

- For pydantic-ai, non-trivial changes need issue-level maintainer agreement and assignment before PR; trivial docs/one-line fixes are exceptions. An open, unassigned issue alone is not a green light.
- For modelcontextprotocol/python-sdk, external PRs require a linked open issue assigned to the author or labeled `help wanted`; `good first issue` or `ready for work` alone is not enough. Disclose AI assistance and personally understand the change.
- For openai/openai-agents-python, non-collaborator PRs are not accepted (even docs); contribute via issue reproduction/root-cause analysis instead.
- LiteLLM requires CLA and at least one backend test. Recheck assignee, comments, linked PRs, and title/keyword matches immediately before recommending: open issues can attract multiple competing PRs within minutes.
- A stale `good first issue` may have multiple closed implementation PRs and prior claimants: inspect the full issue timeline, not just open/assignee/labels. In recurring watch jobs, fetch issue assignees/labels/URLs with new-issue listings, carry a small set of older candidates separately (a 24-hour creation window will never surface them again), and emit explicit fetch-error markers instead of treating failed queries as no activity. Deep-check only top candidates against live issue/PR evidence; if rate-limited, mark them unverified rather than recommending a ready PR.

## Pitfalls (LESSONS LEARNED)

1. **Don't recommend a 50-item roadmap** when the user explicitly says "not my style." The whole point is: small, daily, real-code-first. Honor that.
2. **Don't default to tutorials or MOOCs** as the answer. The user is asking for a different shape. The signal is "PR 흐름 보고", "역으로 이론", "실제 돌아가는 코드" — match it.
3. **Don't make the watchlist too long.** 5-8 repos is the sweet spot. Beyond 10, the user abandons the routine in a week. If they ask for more, push back.
4. **Don't conflate "PR" with "documentation."** Reading PRs is not the same as reading docs. PRs are problems + design rationale; docs are reference. Both have value but the watchlist is the former.
5. **Don't make the daily note heavyweight.** 1 page. If the user is writing 5 pages per day, they'll stop in 2 weeks. The note is a forcing function, not a deliverable.
6. **Don't assume a "right" repo to start with.** The user often has domain knowledge from a previous role. Probe what they already know before recommending the watchlist.
6a. **The target repo may have already been reorg'd since the docs you remember.** vLLM as a worked example: `vllm/attention/backends/` was moved to `vllm/v1/attention/backends/` (and `vllm/attention/` itself disappeared) during the V1 engine refactor. When scanning a repo, run `gh api repos/{owner}/{repo}/git/trees/main` (top level) and then dive one level at a time — `?recursive=1` hits the 1000-entry cap and silently truncates. The "I know where this lives" assumption is one of the most common ways code reading sessions waste 20 minutes. If you can't see a directory you expected, list the top-level tree first; don't assume a 404 means the file moved within the same tree.
6b. **For LLM-serving ecosystem, "remaining migration items" are hire-readiness gold.** When a major refactor (e.g. vLLM's attention backend KV-cache update extraction, #32335) is *almost* done, the last 1-2 unmigrated items (e.g. hpc_attn, Tencent-maintained) signal: (1) what architecture is still in flux, (2) what the next system-level paper could address, (3) where the next research direction is. Use a `grep` of `forward_includes_kv_cache_update: bool =` across the impl files to spot what's still `True` (legacy) vs `False` (migrated). That is a richer signal than any blog post.
7. **Do not use an arbitrary waiting period or a `good-first-issue` label as the readiness test.** Read the repo's review and test conventions, verify the issue is genuinely unclaimed and accepted in scope, then proceed when the user can explain the failure and test; otherwise contribute reproduction or measurement first.
8. **When a `web_extract` returns 30K+ chars, do not stop the tool chain early to "summarize from memory"** — finish the extraction, then deliver one final synthesized answer in a single response. Stopping mid-extraction and saying "interrupted, here is what I remember" is the worst of both worlds: data was paid for but not used, and the user gets a degraded answer. Symptom: user fires back with "왜 인터럽트야 대체" or similar — they're not complaining about missing content, they're complaining about the *cadence* of tool use. The fix is: keep extracting/reading until you have what you need, then synthesize once.
8a. **`execute_code` is blocked in cron-mode runs** with the message "Cron jobs run without a user present to approve it. Use normal tools instead." This is intentional security gating, not a bug to fight. The fix is to do the same work via the `terminal` tool with a `python3 -c "..."` one-liner. The trade-off: you lose the multi-call loop of execute_code and have to inline the logic, but cron runs typically have well-shaped scripts anyway (e.g. `scripts/daily_pr_report.py` for the LLM-serving watchlist) so the inline version is one terminal call instead of a 50-call execute_code. Do NOT retry `execute_code` after the first block — it will not unblock mid-session. If you really need 5+ tool calls with branching, fall back to the `terminal` tool with a heredoc-style script written to a temp file first.
8b. **GitHub unauthenticated API rate limit (60 req/hr) bites the deep-mode report fast.** The 10-repo script itself is 20 calls (closed+open+issues per repo), and you have ~40 calls left for the per-PR detail-digging that gives the report its depth. Observed failure mode (2026-07-12): after the script + 2 batches of per-PR detail (~16 calls), a 3rd batch hits `HTTP Error 403: rate limit exceeded` and you have to stop digging. Two mitigations, in preference order: (a) **call `gh` CLI from the cron** — `subprocess.run(["gh", "api", "repos/.../pulls/N"])` / `["gh", "pr", "view", str(N), "-R", full, "--json", "title,body,additions,..."]` / `["gh", "issue", "view", str(N), "-R", full, "--json", "..."]` — the user's `gh auth status` already gives 5000 req/hr (verified in 2026-07-21 cron: `sharosoo` account, `5000/5000` remaining), no env var or script edit required; (b) set `GITHUB_TOKEN` in the cron environment and add `Authorization: token ${GITHUB_TOKEN}` to the script's `urllib.request` headers — same 5000/hr, but requires editing `scripts/daily_pr_report.py`. If neither is possible, prioritize the 5-8 hot PRs and accept title-only for the rest. The cron should fail-soft, not block delivery. **Why `gh` is the default over `urllib`+token in this cron context:** the script is already a cron artifact owned by the same user, the user has `gh` authenticated, and `gh pr view --json` returns more fields than `urllib`-based scraping in a single call (title + body + labels + state + additions + deletions + changedFiles + files list + timeline events). The `gh` route eliminates the token-handling concern and the field-by-field dict assembly.
8c. **Author comment + label = 90% of reject cause.** Read the *first author comment after the closing event* before the bot's auto-message. The five patterns observed in real cron runs (2026-07-08 → 2026-07-12): (1) "Closing as duplicate of #X" (already-fixed PR wins); (2) "Replacement PR is now #X from a proper fork" (first-time-contributor pre-run gate friction — keep the original closed, take the replacement); (3) "Covered in #X" (a maintainer's umbrella fix subsumes this); (4) "X is deprecated, not necessary to port" (deprecation roadmap conflict); (5) `Stale` label (60+ days no activity, batch-closed). Of these, only #1 and #5 are clear-cut; #2 and #3 require the agent to verify the referenced PR actually landed the fix before claiming the cause. Don't invent a cause if the comments don't support one — just label it "comment-driven hypothesis".
8d. **Discord deep-report delivery is a two-step send — and a cron-mode override.** Discord 2000-char hard limit kills the full deep version (30–45KB). The cron does: (a) write the full deep version to `~/workspaces/<project>/notes/daily_pr/YYYY-MM-DD.md`; (b) write a condensed Discord-friendly version (≤8KB) to `YYYY-MM-DD_discord.md`; (c) send the discord version as `hermes send --to discord:#channel --file <path>` — `hermes send` with `--file` sends it as a Discord file attachment, which bypasses the 2000-char body limit. The skill-level fact: `--file` is the workaround for Discord's char cap and works for any markdown report. Don't try to inline 30KB of markdown into a `--message` argument. **Cron-mode override (2026-07-16):** when the cron job's auto-deliver target is the same channel as the `hermes send` target, `hermes send` returns `Skipped send_message to discord:<id>. This cron job will already auto-deliver its final response to that same target. Put the intended user-facing content in your final response instead, or use a different target if you want an additional message.` (exit 0). The deep report goes via the **cron's final response**, not via `hermes send`. The full final response *is* the Discord message. So for this LLM-serving cron: write the two files (`YYYY-MM-DD.md` raw + `YYYY-MM-DD_discord.md` deep), then produce the condensed/structured version directly in the final response — no `hermes send` call needed. Don't waste a tool call trying it; the skip message tells you exactly why.
8e. **The script's `body_short` is shallow; deep mode needs a second curation pass.** `daily_pr_report.py` and similar scrapers extract `body_short = " | ".join(first 3 non-heading lines)` — fine for raw output but it fails the deep-mode bar ("왜 이게 production에 들어갔지?"). The cron workflow that actually produces deep mode: (1) run the script → raw `YYYY-MM-DD.md` (all PRs + titles + labels + body excerpts, no per-PR rationale); (2) read the script output as the agent; (3) write a second curated file `YYYY-MM-DD_discord.md` that adds per-PR 2-3 sentence rationale, reject-cause hypothesis, and the paired-cluster top-signal box. **The script alone is necessary but not sufficient.** Budget the second pass: ~5-8 min wall-clock for 10 repos. Trying to make the script itself output deep mode defeats the purpose of the scraper (raw enumeration is its job) and breaks single-shot rerunnability.
8f. **Paired-cluster framing is the user-preferred structure (consecutive-day signal).** Two consecutive days of cron output have led with a "5대 시그널 (paired-cluster로 묶임)" top box and closed with a "Paired-cluster 시그널" footer section. This is not a one-off — encode it. Pattern: identify 4-6 cross-repo clusters where 2+ repos push related work in the same 24h window. Example clusters from 2026-07-16: "warp specialization stability" (vLLM #48797 Helion B200 + Triton #10901 warp-spec repro); "HiCache × Mooncake consistency" (SGLang #31315 + Mooncake #2920/#2929 + LMCache #3520/#3696/#4120); "consumer Blackwell SM120/121 attention/MoE" (FlashInfer #3655/#3983 + SGLang #31342 + vLLM #48451); "Mooncake TENT receiver-credit / flow control" (Mooncake #2860/#2925/#2845/#2523/#2921). Each cluster gets a 1-paragraph synthesis explaining why the simultaneity is signal, not coincidence. **This is the most interview-useful part of the report** — it converts "I read 76 PRs" into "I learned that the industry is converging on X." When writing deep mode, build the cluster list first, then attribute PRs to clusters; the cluster axis is the primary structure, the per-PR entries are evidence.
8h. **The 2026-07-21 cron proved: skip the script, do everything via `gh` CLI subprocess.** The `daily_pr_report.py` script's `urllib.request`-based fetcher hits the 60 req/hr unauthenticated cap because it doesn't inherit the user's `gh` credentials. The actual cron workflow that worked end-to-end in 2026-07-21: (1) run the script for the raw enumeration (it's fine to leave that 60-req budget there — 20 calls for 10 repos is exactly the budget); (2) **bypass the script for the deep-digging pass entirely** — call `gh api`, `gh pr view --json`, `gh issue view --json` from the agent loop in `terminal` tool invocations; the `gh` CLI inherits the user's existing auth (5000 req/hr). Three concrete shapes used in 2026-07-21:
- `subprocess.run(["gh", "api", f"repos/{full}/pulls/{num}", "--jq", "..."])` — for the PR body and metadata
- `subprocess.run(["gh", "pr", "view", str(num), "-R", full, "--json", "title,body,additions,deletions,changedFiles,files,labels,createdAt,isDraft,author", "--jq", "."])` — single call returns everything for a deep-dive
- `subprocess.run(["gh", "issue", "view", str(num), "-R", full, "--json", "title,body,labels,state,createdAt", "--jq", "."])` — same pattern for issues (the issues endpoint behaves differently from PRs in the REST API; `gh issue view` is the clean path)

**File path caveat:** the per-PR `gh api repos/.../pulls/{n}/files` endpoint returns a `path` field per file but the `gh` JSON wrapper often shows it as `None` when piped through `--jq` (the field is present in the JSON, the filter chain is the problem). Reliable workaround: `subprocess.run(["gh", "api", f"repos/{full}/pulls/{num}/files?per_page=20", "--jq", ".[] | .path"])` returns paths cleanly. Use `?per_page=20` not `?per_page=100` to stay under response-size limits.

**Stdin heredoc pattern for multi-call loops:** when the deep-digging needs 5-15 calls per hot PR (body + files + timeline + linked issues), the `terminal` tool is the right host. Inline python3 with `subprocess.run` inside a `for` loop is more compact than 5 separate `gh` invocations from the shell, and stdout stays parseable. Example that produced the 2026-07-21 deep file: `python3 << 'PYEOF' ... PYEOF` with `import subprocess, json` at the top and a list of `(repo, num, kind)` tuples to iterate over. Print per-PR headers and key body excerpts; the agent reads the terminal output and writes the curated `_discord.md` file in a subsequent step.

8i. **The deep-mode `web_extract`/`gh` layer is necessary but not sufficient — add a `web_search` layer for external technical context.** `gh pr view --json body` answers *what changed*. It usually does **not** answer *why the change is technically correct* — that's the user's actual bar ("왜 이 PR이 의미 있는지"). For the top 5-8 hot PRs, run **parallel `web_search` queries** for the underlying technology: the GPU ISA (e.g. "tcgen05_mma_scaled tutorial NVFP4 VEC_SIZE"), the arxiv paper (e.g. "DSpark arxiv 2607.05147 confidence scheduler"), the library internals (e.g. "DeepGEMM kernel_runtime 98 'cudaErrorInvalidDeviceFunction'"). The 2026-07-19 run produced 4 메가픽s and all 4 needed `web_search` to land the rationale. **Frequency rule:** don't search every PR; skip refactors / lint fixes / chores / doc updates. Search the ones that touch internals — CUDA intrinsics, vendor library internals, paper references, GPU-arch-specific behavior.

## Related

- `personal-watchlist` — for the stateful-diff cron pattern. Has a worked reference at `references/daily-pr-deep-report.md` that documents the **windowed 24h** variant of the diff-cron (different shape from the canonical seen-set dedup; the daily PR report is a *window* over `updated_at`, not a *dedup* over `seen`).
- `serving-llms-vllm` — vLLM-specific. The prior cross-reference to `references/daily-pr-watchlist.md` was removed in 2026-07 because the file did not exist under that skill. Daily-PR recipes now live in this skill's `references/deep-mode-daily-pr-report.md` and in `personal-watchlist/references/daily-pr-deep-report.md`.
- `github-pr-workflow` — for the PR lifecycle once the user is ready to contribute.
- `github-code-review` — for the review side once they get their first PR.
- `research` category skills — for the alternative "read papers in order" path (which this skill is the reaction against).
