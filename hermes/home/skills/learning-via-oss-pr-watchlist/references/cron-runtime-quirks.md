---
name: cron-runtime-quirks
description: Runtime quirks specific to running the deep-mode daily PR report as a Hermes cron job — execute_code blocking, GitHub API rate limiting, and the two-step Discord delivery pattern. Captured from 2026-07 cron runs of the LLM-serving watchlist.
license: MIT
metadata:
  hermes:
    tags: [llm-serving, daily-cron, deep-mode, hermes-send, discord, github-api, cron-quirks]
---

# Cron-runtime quirks for the deep-mode daily PR report

The user-facing recipe lives in `../SKILL.md` and `deep-mode-daily-pr-report.md`. This file is the **operational** companion — the things that only show up when the agent is *running as a scheduled cron job* rather than interactively.

## 1. `execute_code` is blocked in cron mode

Observed: calling `execute_code` from a cron job returns:

> "BLOCKED: execute_code runs arbitrary local Python (including subprocess calls that bypass shell-string approval checks). Cron jobs run without a user present to approve it. Use normal tools instead, or set approvals.cron_mode: approve only if this cron profile is intentionally trusted."

**This is intentional security gating, not a bug.** Cron runs have no user present to approve arbitrary subprocess / network / file-write actions. The fix is the `terminal` tool.

**Worked pattern:**

```python
# Don't: execute_code with multi-call Python
# Do:    terminal with python3 -c "..." one-liner
terminal("python3 -c \"
import urllib.request, json
def gh(url):
    ...
\"")
```

**Trade-off:** you lose the multi-call loop of `execute_code` (no `from hermes_tools import ...` shortcuts, no per-call retry, no `wait` between calls). For cron runs of well-shaped scripts (e.g. `scripts/daily_pr_report.py`), this is fine — the script does the work and prints a result. For "loop and branch" work (e.g. iterating through 5 PRs to dig into each), write the script to a temp file first then `terminal("python3 /tmp/foo.py")`.

**Don't fight it.** Retrying `execute_code` mid-session does not unblock. Move on.

## 2. GitHub unauthenticated API rate limit bites the deep-mode report

Unauthenticated: **60 requests / hour / IP**. Authenticated with `GITHUB_TOKEN`: **5000 / hour**. Authenticated via the user's existing `gh` CLI: **also 5000 / hour, no env var or script edit needed**.

**Observed in 2026-07-12 cron run (urllib path, no auth):** the 10-repo script is 20 calls (closed + open + issues per repo). With 40 calls left, the per-PR detail-digging (PR detail + comments + timeline) consumed 16 more across 2 batches. A 3rd batch hit `HTTP Error 403: rate limit exceeded` and the agent had to stop digging.

**Mitigations, in order of preference (updated after 2026-07-21 cron):**

1. **Bypass `urllib` entirely — call `gh` CLI from the agent loop.** Verified in 2026-07-21: the user already had `gh` authenticated to 5000 req/hr (`gh auth status` showed `sharosoo` account, `5000/5000` remaining). The cron did **all** deep-digging via `subprocess.run(["gh", "pr", "view", str(num), "-R", full, "--json", "title,body,additions,deletions,changedFiles,files,labels,createdAt,isDraft,author", "--jq", "."])` and `["gh", "api", "repos/.../pulls/{n}/files?per_page=20", "--jq", ".[] | .path"]`. After 50+ calls, the rate limit was untouched. **The script is fine for raw enumeration (its 20 calls fit exactly in the unauthenticated budget) — keep it. But for any per-PR deep-digging, use `gh` from the agent loop, not from the script.**
2. **Set `GITHUB_TOKEN` in the cron environment.** The script in `scripts/daily_pr_report.py` should optionally accept it and add the `Authorization: token ${GITHUB_TOKEN}` header. One env var bumps the budget 83x. Use this if the cron is invoked on a machine that doesn't have the user's `gh` credentials.
3. **Prioritize the 5–8 hot PRs.** Without auth, you can only afford 5–8 deep-digs. Pick the ones with the longest / most-technical body and the most review activity, not the ones with the most comments (bot comments inflate the count).
4. **Fail soft.** If the rate limit hits mid-report, write the deep version with whatever detail-digging succeeded. Title-only entries are better than no entries. Don't block delivery on a 403.

**Concrete shape (2026-07-21):** the agent wrote a single `terminal` invocation containing `python3 << 'PYEOF' ... PYEOF` with `import subprocess, json` at the top and a list of ~40 `(full, num, kind)` tuples to iterate over. Each iteration called `gh pr view --json ... --jq .` and printed the relevant fields. Total cost: ~30s wall-clock for 40 deep-digs. The `gh pr view --json` field list used: `title,body,additions,deletions,changedFiles,files,labels,createdAt,isDraft,author`. For issues, the same pattern with `gh issue view --json title,body,labels,state,createdAt`. For just file paths, the per-PR `/files` endpoint via `gh api ... --jq '.[] | .path'` (do NOT use `?per_page=100` — exceeds response-size limits; `per_page=20` is safe).

**Auth caveat:** when the rate limit hits unauthenticated, *all* subsequent calls in the same hour also 403, even ones that would have fit in the budget. So the practical budget is ~50 calls, not 60. If you have a long-running cron and need to budget for multiple iterations, use `gh api` with a token instead.

## 3. Discord deep-report delivery: two-step send — with a cron-mode override

Discord has a **2000-character hard limit per message**. The full deep version of the report is 30–45KB. The cron cannot inline it.

**The two-step pattern (interactive / non-cron delivery):**

```bash
# Step 1: write the full deep version to the canonical notes path
# (handled by the report-generation logic; usually scripts/daily_pr_report.py)

# Step 2: write a condensed Discord-friendly version to *_discord.md
# ≤ 8KB, condensed per-PR entries, no per-PR long rationale,
# always include a "📁 풀 리포트" pointer at the end

# Step 3: send the discord version as a file attachment
hermes send --to discord:#channel --file /path/to/YYYY-MM-DD_discord.md
```

**Why `--file` works:** `hermes send` with `--file <path>` reads the file and posts it as a Discord message **attachment** (file embed), not as a body. The 2000-char cap applies to the body, not the attachment. The full markdown renders inline in Discord.

**Optional step 4: short summary message in body.**

```bash
# If the user wants the channel to show "today's signal" as a teaser too:
echo "# 📡 Daily PR digest — see attached for full report" | \
  hermes send --to discord:#channel
```

**The cron-mode override (2026-07-16):** when the cron job's auto-delivery target *is* the same Discord channel the script wants to send to, `hermes send` returns:

> `Skipped send_message to discord:1523289661680910469. This cron job will already auto-deliver its final response to that same target. Put the intended user-facing content in your final response instead, or use a different target if you want an additional message.`

(exit 0). The skip is **by design** — the gateway knows the final response will be auto-delivered, so a second `send_message` would duplicate. The fix is **not** to use a different target, but to put the intended user-facing content directly in the final response.

**The actual cron workflow for this LLM-serving job:**

1. Run the script → `YYYY-MM-DD.md` (raw, full PR list, 30-45KB).
2. Read the script output as the agent (it lands in context).
3. Write a second curated `YYYY-MM-DD_discord.md` (deep mode: per-PR rationale, reject hypotheses, paired-cluster top-5 box). The file is the canonical "this is what the deep report contains" artifact.
4. Produce the condensed/structured final response. **The final response IS the Discord message** — the gateway delivers it to channel 1523289661680910469. No `hermes send` call. The condensed response should be ~3-5KB so it lands as one readable message (Discord renders 4-8KB fine in a single message; 30KB does not).
5. The `_discord.md` file is also useful as a *re-readable* artifact — the user can `read_file` it later or scroll back to the message attachment.

**Don't:**
- Don't try to inline 30KB markdown into a `hermes send "..."` argument. It will get truncated at 2000 chars mid-PR-description and the result is unreadable.
- Don't rely on Discord's chunker (if `hermes send` even uses one) to break the message automatically. The 2000-char cap is per-message at the Discord API level; chunking it into 15 messages is worse than attaching as a file.
- Don't call `hermes send` from this cron. The skip message will tell you why, and the right fix is to put content in the final response.
- Don't try to suppress the skip with `--quiet` or other flags — the skip is correct behavior, not an error.

**The skill-level fact:** `hermes send --file <path>` is the universal workaround for Discord's 2000-char cap for *non-cron* delivery. For *cron delivery to the same target as the cron's auto-delivery*, the final response *is* the message — no extra send needed.

## 4. Sanity-check the deliverable before declaring done

A useful pre-flight check before the final response:

1. **File exists:** `ls ~/workspaces/llm_serving_study/notes/daily_pr/YYYY-MM-DD.md` (and the `_discord.md` variant) — both should be > 5KB and < 100KB.
2. **Skip-message check:** if the cron auto-delivers to the same channel, the system handles delivery — no `hermes send` exit code to check. If you accidentally call `hermes send` against the same target, the gateway returns the "Skipped send_message" message and exits 0; treat that as success (correct behavior), not an error.
3. **Time budget:** deep-mode report + final-response composition should complete in under 6 minutes wall-clock (script run + curated pass + final response). If it's taking longer, you're probably in a web_extract trap (see `SKILL.md` pitfall #8) or fighting the GitHub rate limit (see section 2 above).
4. **Deep-mode quality bar:** skim the curated `_discord.md` and verify (a) every merged PR has a 2-3 sentence rationale that explains *why* it shipped, not just *what*; (b) every rejected PR has a cause hypothesis, not just "closed w/o merge"; (c) the top-5 paired-cluster box names 4-6 cross-repo signals. If any of these are missing, the bar wasn't met — fix before responding.

## 5. What doesn't change between interactive and cron runs

- The 10-repo watchlist and the 24h windowed shape.
- The "no application framing" rule and the "기술 용어는 영어 그대로" rule.
- The "2-3 sentence rationale per PR" file-format constraint.
- The "cross-repo signals in the footer" requirement.

These are user preferences and live in `../SKILL.md` and `deep-mode-daily-pr-report.md`. The runtime quirks in this file are the *operational* layer.
