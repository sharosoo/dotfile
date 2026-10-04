# Depth-mode Enrichment Patterns

How to write the three enrichment sections that turn a raw GitHub API listing into a depth-mode digest: **megafics**, **reject hypotheses**, and **cross-signals**.

## Megafics (3–5 across all repos)

A megafic is a PR that is one or more of:
- **Production-critical** — a perf land that was reverted, a correctness fix in a hot path, a release-blocking bug
- **Ecosystem-shaping** — a new model family lands, a major API deprecation, a new first-class integration
- **Unblocking a known series** — a follow-up to a long-running PR that finally lands
- **Cross-repo boundary** — one repo's release cycle forces another repo's hotfix

### Writing a megafic
- **1 short sentence** of what the PR does (system-level, not application framing).
- **1 short sentence** of WHY it matters, ideally linking to recent series (yesterday's report, last week's pattern).
- **Cross-link** to the related PRs explicitly: "(어제 #48776의 follow-up)" or "DeepSeek-V3.2 stack의 #N/#M의 follow-up".

### Worked examples
- ❌ Bad: "Adds a new fused kernel for FP8 quantization on Blackwell." (no why)
- ✅ Good: "**vLLM #40408** Batch invariance with Cutlass fp8 support, 28.9% E2E latency improvement. `VLLM_BATCH_INVARIANT=1` + fp8의 quantization overhead를 CUTLASS FP8 GEMM으로 inline 처리. **시그널: v1의 batch-invariance가 quantization의 correctness-bound와 latency-bound를 동시에 통과.**"
- ❌ Bad: "Applies to GPT-OSS router for tokenization." (application framing)
- ✅ Good: "**TRT-LLM #16760** Fix GPT-OSS router token identity. KV-cache-aware router가 generic tokenizer chat template으로 tokenize → Harmony adapter mismatch. **시그널: 어제 reject #15605의 product-team cross-review 후 정정판 merge.**"

### Architecture codename resolution (sm_XXX → product)
Before writing a megafic that mentions an architecture, resolve the codename. See `compute-capability-gpu-map.md` for the full table. Common mistakes to avoid:
- "SM120" alone → don't default to datacenter Blackwell; it's consumer Blackwell / RTX PRO Blackwell Server
- "SM107" → Rubin (NOT Blackwell Ultra — that's SM103)
- "SM103" → GB300 / B300 (Blackwell Ultra), NOT Rubin
- "sm_100f family" → covers SM100/103/107 (the whole CC 10.x group)
- "XPU" in vLLM/SGLang → Intel XPU (not NVIDIA)

## Reject hypotheses (label + comment-driven, not invented)

The user wants to learn **why** a PR was closed without merge. This is interview-prep material. Make the hypothesis evidence-based.

### Pattern: `comment-driven hypothesis: <reason> (<evidence>).`

Where `<evidence>` is:
- A label: `needs-rebase`, `stale`, `superseded`, `wip`, `do-not-merge`, `stale-bot`
- A specific PR/issue that supersedes: `#X has been merged; this is now obsolete`
- An architecture-level signal: "AMD-side decision 대기", "v1 NPU backend의 architecture-level 결정 후 풀림, hold"

### Reject reason taxonomy (in priority order)
1. **Superseded by series** — another PR in the same series was merged first; this one is obsolete.
2. **Hold at design level** — the fix is correct but blocked on a wider architectural decision (e.g. v1 NPU backend, AMD gfx950, MoE path unification).
3. **Hold at process level** — needs rebase, missing sign-off, contributor doesn't meet 3-PR guideline, DCO/license header.
4. **Stale** — bot closed after long inactivity.
5. **Test-only / DRAFT marker** — author explicitly tagged `DO NOT MERGE` for pacing.
6. **Maintainer design-reject on a substantive fix** — the PR is a real, working fix (+200-500 LOC, has benchmarks, was deemed correct enough to engage on) but the maintainer pushed back on the **scope or blast radius** of the solution. Phrase it as: `**comment-driven hypothesis: maintainer design-reject (<specific concern quoted>); proposed alternative (<sidecar API / process change>); likely resolves in follow-up series, not a quick re-merge.**`
7. **Author self-close after requalification** — the PR was correct when opened but the performance claim no longer clears the acceptance gate on current main; the author replays the unchanged candidate against a clean parent, reports the numbers, and closes. Phrase with the replay conditions (parent SHA, host, model, batch, eager/graph) — "correct but no longer faster" is a distinct outcome from "wrong".
8. **Wrong target repo / wrong layer** — the change belongs in a downstream fork or a different repo's contribution workflow (e.g. an Ascend-targeted fix opened against upstream vLLM). The close comment names the correct target; that is the whole reason.
9. **Branch topology** — the PR's **base branch lives in a fork**, so a stacked chain cannot form; the author closes and reopens with the same commit hash and the head on the upstream repo ("superseded by #Y, same contents `abc1234`, head now on upstream"). Evidence is the unchanged SHA, not the content.

### Batch-fetch comments for EVERY reject, not just two or three
On a day with 20–40 rejects the cheapest high-yield step is one script that loops all rejects and prints the **last 2 comments** of each (`gh api repos/{repo}/issues/{n}/comments`), truncated to ~380 chars. In recent 2026-09 windows roughly a quarter of rejects carried an explicit author self-close comment ("requalify failed", "the regression was #X, fix already on main", "wrong target repo", "superseded by #Y, same SHA") — those are verdicts you cannot recover from labels. Two endpoint quirks when batching: `/issues/{n}` returns merged PRs with `state: closed` and has **no `merged_at`**, so classify merged vs rejected from the search-bucket file, not from this call; and guard against a missing `state` key (fall back to `/issues/{n}` if `/pulls/{n}` returns a rate-limit or permission payload).

### Reading comments for stronger evidence
After fetching full PR body + comments via the `/tmp/gh_helpers.py` helper, look for these comment patterns:

- **Only `coderabbitai[bot]` comments + no human comments + same author as another merged PR** → "superseded by sibling series" is the strongest hypothesis. Phrase: "comment-driven hypothesis: same author의 sibling PR (#X) 이 merged되어 obsolete."
- **Human maintainer comment** like "thanks, but we're going a different direction" or "blocked on #X" → name the design / process reason explicitly, no hedging.
- **Maintainer engages substantively on a real fix (suggests alternative path, quotes a specific concern about blast radius or scope)** → this is category 6 (design-reject). Quote the specific concern verbatim in the hypothesis — the user wants to learn what the team actually weighed.
- **No comments, but PR body itself says "Replaces #X" / "Supersedes #X"** → that IS the evidence. Cite the body link, no need to call it comment-driven.
- **`Related` or `Closes` link in the PR body pointing to an issue** → check that issue for closure reason.

### Anti-patterns
- ❌ "Rejected because maintainers disagreed." (vague, no evidence)
- ❌ "Closed without comment." (true but useless — try to find any signal in labels)
- ✅ "**comment-driven hypothesis**: `#X` was merged first as the unified version; this branch's separate fix is now obsolete → close (superseded)."
- ✅ "**comment-driven hypothesis: maintainer design-reject** on substantive +526-line fix. 'Turning off the GC for all processes seems a little too aggressive. We want the engine to serve regular traffics normally after self-benchmarking.' (tedzhouhk, Dynamo maintainer). Proposed alternative: sidecar API (`model_executor.collective_rpc`). Likely resolves in a separate maintainer-level design decision, not a quick re-merge."

## Megafic source material (where the 3–5 come from)

Megafics are not limited to `MERGED` PRs. When picking the top 3–5, scan the **entire day across all repos and all states** for the highest-signal events:

- **Merged PRs** (most common source) — production-critical fixes, ecosystem-shaping APIs, series unblockers.
- **`closed-not-merged` PRs** (rare, but high-signal) — a maintainer design-reject on a substantive fix (category 6 above) is interview-grade material about the team's actual design priorities.
- **New open PRs** (underused as megafic source) — when a new open PR has author-attached benchmarks, regression tests, and a "fixes #X" link, it can be MORE important than the day's merges. Example: SGLang #32460 (+139/-37, production-critical correctness fix for overlap scheduler + CUDA graph metadata race) is the kind of new open that should be a megafic, not buried in the new open list.
- **Open issues** (underused as megafic source) — when an issue surfaces a **previously-unknown production hazard with quantified measurements** (e.g. 97%→40% silent collapse, no error), it is production-critical signal that warrants a megafic even though it has no fix yet. Phrase as: `**SGLang #32459 (issue)** EAGLE + radix prefix reuse silent collapse 97%→40-53% on GLM-DSA NVFP4 — spec-decode가 radix-populated KV에서 prefix hit 의도적 bypass 또는 silent recompute; production correctness boundary; 사용자 직접 hit.`
- **Issue + Fix pair** (new pattern) — when a reporter opens an issue (#4247) AND a maintainer opens a fix PR (#4253) the same day, treat the pair as a single megafic: `**LMCache #4247 (issue) + #4253 (fix)** MPConnector silent cross-KV-group corruption on hybrid Mamba/GDN + vLLM 0.26.0 — ...`. The issue surfaces the hazard, the fix shows the team's response speed.

**Anti-pattern**: reflexively relegating new open PRs and issues to their section lists, then picking 5 merges as the megafic block. The 5 megafics should be the day's 5 most important events, regardless of state.

## Megafic prose pattern (mid-paragraph bold for the 시그널)

A megafic that worked in practice uses **two** bold segments per line:

```
1. **<repo> #PR** <one-line what the PR does, with the headline number> — <one-line why it matters, ideally with cross-day series link>. **시그널: <the deeper pattern or boundary>**.
```

The leading bold identifies the PR. The trailing `**시그널:**` bold gives the user the interview-grade takeaway at a glance. The Korean connective tissue in between is for narrative flow.

Worked example (2026-07-27 megafic 1):
> **TRT-LLM #16875** inter-iter idle time **P50 72969→60563 ms (−16.9%)** — page table / out_cache_loc / kv_lens host-side pinned + non-blocking staging tensor hoist + MSA planner host-side copy-back / blocking `.item()` 제거. 어제 #16871 (D2D 110us→27us) 의 follow-up. **시그널: TRT-LLM 의 mixed-batch serving 이 microsecond-level host/device sync elimination 단계로 진입.**

## Cross-signals (5–12 numbered items)

The cross-signal block is what connects today's events into a multi-day arc. Each signal should be:
- **1 sentence** (or 2 short clauses)
- **Phrased as a pattern**, not a single event: "DSpark/MLA hybrid draft family 3rd wave" (not "vLLM PR #X was merged")
- **Linked to the broader trend**: production-readiness 마감, control plane expansion, security boundary, etc.

### Density targets
- **Full note** (markdown file): 8–12 cross-signals is the sweet spot. Long enough to be a digest, short enough to scan.
- **Discord summary**: 8 is the default; can stretch to 12 if the compression budget allows, but 5–8 if the day's events are dense.

### Worked example
```
📌
1. **v1 batch-invariance가 quantization correctness + latency를 동시에 통과** (vLLM #40408 CUTLASS FP8 28.9% E2E win) — 1.x production rollout의 가속
2. **DSpark/MLA hybrid draft family 3rd wave** (vLLM #48776 GLM-5.2-NVFP4 + SWA drafts) — 어제 AMD DSpark (#47419) / MXFP4 KV (#48993) 에 이은 spec decoding + sparse attention의 first-class
3. **SGLang↔Mooncake integration의 production-readiness 마감** (SGLang #32188 DeepEP TBO + #29830 presharded weight namespace + Mooncake #3085 LOCAL_DISK migration + LMCache #4210 fail-fast PD) — distributed serving의 silent correctness boundary가 일제히 surface
```

The 3rd one is the most useful — it connects 4 different repos into a single trend. **Always look for cross-repo patterns** when picking cross-signals. The single-day cross-signal is weaker than the multi-day arc.

### Multi-day arc pattern
When the day's top PRs are direct follow-ups to last week's events, NAME the predecessor explicitly. The 4-day rolling "story" of a series (e.g. "vLLM GLM-5.2 Blackwell decode: day 1 opt land → day 2 revert → day 3 hotfix #N → day 4 hotfix #M") is the most valuable pattern in the report.

## Style rules
- **Korean prose + English technical terms**: `v1 batch-invariance`, `DeepEP TBO CUDA graph UAF`, `NIXL transport`. Keep function names, PR numbers, system terms in English. Keep connective tissue in Korean.
- **No application framing**: never write "for serving X model" or "when applied to Y benchmark". System-level only.
- **Hedging language for rejects**: "comment-driven hypothesis:", "시그널:", "추정:" — the user values calibrated confidence.
- **Bold the WHY** in megafics: `**시그널: ...**` so the reader can scan.
- **Numbers with units**: prefer "5.51 GiB" over "5.5 GB", "110us → 27us" over "big perf win". User is a serving internals engineer; numbers ARE the signal.
