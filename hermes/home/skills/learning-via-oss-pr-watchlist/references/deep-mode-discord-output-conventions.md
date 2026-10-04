---
name: deep-mode-discord-output-conventions
description: The actual output template + phrasing conventions for the curated `YYYY-MM-DD_discord.md` file (the deep-mode deliverable for the LLM-serving daily cron). Use after running `daily_pr_report.py` and BEFORE writing the curated file. Captures the specific emoji markers, section header transparency, reject-cause phrasing, and Korean/English mix rules that emerged across the 2026-07-16 + 2026-07-17 runs.
license: MIT
metadata:
  hermes:
    tags: [llm-serving, daily-cron, deep-mode, output-template, discord, markdown]
---

# Deep-mode discord output: worked conventions

The recipe in `references/deep-mode-daily-pr-report.md` covers the **what** (per-PR rationale, web_extract, two-file split). This file covers the **how** — the specific markdown template and phrasing patterns that emerged across two consecutive runs of the LLM-serving deep-mode cron (2026-07-16, 2026-07-17) and that the next cron run should start from. Treat this as a starting template, not a hardcoded output.

## File shape

```
# 📡 LLM Serving Daily Report — YYYY-MM-DD (요일) HH:MM KST
_(최근 24시간 · 10개 레포 · PR + Issue · 깊이 모드)_

> **핵심 시그널 (next-day 큰 사건)**:
>
> 1. **{REPO} #{PR} {title}** (@author, optional state) — {2-3 sentence technical rationale with **bold key terms**} — paired with #{other-PR} (companion work).
> 2. ...
> 3. ...
> 4. ...
> 5. ...

---

## 🔷 {repo short name}
_포커스: {focus keyword}_

### ✅ MERGED (N) *(raw M, {one-line summary of the section's theme})*
- **#{PR}** `{title}` _(@author)_ 🎯 — {rationale, 2-3 sentences, with **bold** for key technical terms} — paired with #{companion}.
  - 🏷 `label1, label2` · 🔗 {url}
- ... (up to 6)

### ❌ REJECTED (N) — *{theme, e.g. "raw 7, MpiPoolSession isinstance pattern + Cutlass MoE ABI 두 종 다수"}*
- **#{PR}** `{title}` _(@author)_ — {body context, 1-2 sentences}. **reject 추정**: ① {label-driven cause} ② {architecture/comment-driven cause} ③ {alternative-cause}. **근본**: {prescription for resubmit}.
  - 🏷 `label` · 🔗 {url}
- ... (up to 3)

### 🆕 NEW OPEN (N) + 🐛 (M)
- **#{PR}** `{title}` _(@author)_ 🎯 — {rationale}. issue: #{related-issue}.
  - 🏷 `label` · 🔗 {url}
- 🐛 **#{issue}** `{title}` _(@author)_ — {1-sentence issue summary}.

---

## 🔷 {next repo}
...

---

## 🔍 한 줄 흐름

- **공통 키워드**: {4-7 keywords from the 24h window}
- **paired 흐름**:
  - **{cluster name 1}** ({repos + #PRs in the cluster})
  - **{cluster name 2}** ...
  - **{cluster name 3}** ...
- **읽을 거리**: {top 5 PRs/issues in priority order, with one-line justification for each}

---
**오늘의 흐름**: merged=N · rejected=M · new_open_PR=X · new_issue=Y

💡 **읽는 법**: {the standard footer that explains how to read merged/rejected/issue per the user's learning style}
```

## Specific conventions that emerged

### 1. The `> 핵심 시그널` block is a **top-5 ordered list**, not a "top signals" callout

It is the single most-skimmed section. The user reads this first, decides whether to open the file, and decides what to deep-dive. The 5 slots are filled in priority order:

1. The most interview-useful single PR (typically a protocol/contract change, e.g. FlashInfer #4015 unified prefill API, Mooncake #2933 Conductor vLLM v1 wire-compat).
2. The cross-repo convergence (e.g. vLLM M3 indexer + Triton 3.8.x + FlashInfer SM120 = GB300 stack).
3. A P0 correctness fix that hit main (e.g. vLLM #48902 Storage Identity 13+ bugs).
4. A new production guide / benchmark (e.g. llm-d #2048 P/D + latency predictor).
5. An open issue that signals industry direction (e.g. LMCache MP connector drift).

Each entry is 3-4 sentences, with `**bold**` on the technical mechanism (NOT the title). Pair each entry with at least one other repo's related work to set up the "paired 흐름" section.

### 2. Section header: `### ✅ MERGED (N) *(raw M, {theme})*`

The `(N)` is the **reported** count (what the section actually shows). The `*(raw M, ...)*` parenthetical is the **raw** count from the script (what the user would see in the file, before the agent's "reportable subset" filter). This transparency matters because:

- A repo with 9 raw merged but 6 reported means 3 were filtered (typically trivial chore/typo PRs).
- The user uses the raw number for "industry activity" signal, the reported number for "what to read".

The `{theme}` in the parenthetical is a 3-5 word summary of the section's cluster (e.g. "raw 9, M3 long-context indexer + Sparse MLA fp8 + ROCm QK-Norm/RoPE fusion + Inkling LoRA hot path"). It saves the user the work of scanning the entries to know what to expect.

### 3. The 🎯 marker

`🎯` is reserved for **the one most-interview-useful item per section** (typically 1-2 per repo). It is not used for "any merged PR". The criterion: would this PR be the answer to a system-design interview question about how LLM serving handles X? If yes, 🎯.

**Common 🎯 candidates:**
- Kernel productionization (CuteDSL indexer, trtllm-gen block-sparse decode)
- Contract / protocol changes (Unified API, Conductor hash-chain, Conductor vLLM v1 wire-compat)
- Cross-engine interop fixes (LMCache SGLang→vLLM KV sharing)
- Fail-fast / observability PRs in production stacks (disagg worker OOM detection)

**Common non-🎯 items:**
- Dependency bumps
- Test infra moves
- Doc / typo fixes
- Cherry-picks (unless the cherry-pick is itself a stability signal)

### 4. Reject PR phrasing

The reject section is the most distinct from the script's raw output. Pattern from real runs:

```
- **#{PR}** `{title}` _(@author)_ — {body context, 1-2 sentences explaining the bug/fix attempt}. **reject 추정**: ① {label-driven cause — what the label says about why it closed} ② {architecture/comment-driven cause — what the PR shape suggests, e.g. needs-rebase, dependencies, scope, format-trap} ③ {alternative cause to be honest about uncertainty}. **근본**: {1-sentence prescription for what the maintainer would want to see in a resubmit}.
  - 🏷 `label` · 🔗 {url}
```

Three things this does that the raw script output does not:

- **Hypothesizes cause from labels** — `needs-rebase`, `stale`, `dependencies`, `ci-failure`, `WIP` all have standard meanings. The agent reads these and explains what they imply about *why* the PR closed without merge.
- **Acknowledges uncertainty** — "**근본**" is the agent's opinion on what would actually fix the rejection. It's a hypothesis, not gospel. The user uses it to evaluate whether to attempt a similar PR themselves.
- **Frames the "why" question for the user** — the user is preparing for interviews. The "왜 안 받았지?" framing converts the PR into a practice case study.

### 5. The `paired with #{PR}` clause

Every merged/open PR entry should end with `— paired with #{PR} (companion work).` or `paired with ...` somewhere in the rationale. This is the connective tissue that makes the "paired 흐름" footer section deriveable from the per-PR entries. The reader skims the entries, sees the pairings accumulate, then reads the footer to get the synthesized clusters.

When there is no good paired work (e.g. a one-off cherry-pick), omit the clause rather than force a weak pairing.

### 6. The `## 🔍 한 줄 흐름` footer

Three sub-bullets, in this exact order:

1. **공통 키워드**: comma-separated list of 4-7 keywords from the 24h window (e.g. "Inkling, GB300/Blackwell, P/D, predicted-latency-routing, Conductor vLLM v1 wire-compat, Unified FlashInfer backend contract, LMCache MP v1"). This is the day's "index" — a year from now the user searches the daily_pr folder by keyword.
2. **paired 흐름**: 3-5 named clusters, each followed by `(repos + #PRs in the cluster)`. Example: "**GB300/Blackwell stack** (vLLM M3 #48582 + Triton #10900 + FlashInfer #4012 + #4013 + Dynamo #11791)". This is the **single highest-value paragraph in the entire report** — it converts "I read 76 PRs" into "I learned that the industry is converging on X".
3. **읽을 거리**: top 5 PRs/issues to deep-dive, in priority order, with a one-line justification for each. This is the "if you only read 5 things today" list.

### 7. Korean vs English

Per the user's explicit rule ("한국어 + 기술 용어는 영어 그대로"):

- Korean for prose, section labels, transitions, hypothesis clauses.
- English (untranslated) for: technical terms (PagedAttention, RadixAttention, MLA, KDA, NIXL, TENT, MUSA, RDMA, RoCE, prefix caching, MTP, Mamba, All-to-All, EP/TP/PP/DP), PR/issue titles (verbatim, inside backticks), repo names, file paths, code symbols, label values, env var names, CLI flag names.
- **Bold** for key technical terms in the rationale sentences — this is the user's skimming path. They read the bolded terms first to decide if a section is worth a full read.
- Backticks for code symbols, env vars, file paths, function/class names, and config keys.

### 8. What NOT to include

These are patterns that the user has implicitly rejected over multiple cron runs (they were tried and the next day's curation pass dropped them):

- **Stats bars / percentage pie charts** of merged vs rejected. The `**오늘의 흐름**` footer line is the only stats line.
- **A "이슈 요약" callout** at the top. Issues are integrated into the per-repo section as `🐛` items, not surfaced separately.
- **Per-PR commit hashes**. The PR number is enough; the user opens the PR for the commit details.
- **Duplicate explanations** of a single PR in both the top signals block AND the per-repo section. Top signal is a teaser, per-repo entry is the full rationale — never copy-paste.
- **A "내일 봐야 할 PR" prediction** at the end. The cron is windowed, not forecast-based. (If the user asks for a forecast later, that's a separate skill.)

## Worked output snippet (2026-07-17 vLLM, condensed)

```markdown
> 3. **vLLM #48582 [M3] CuteDSL indexer decode kernel for long-context (sm100/GB300)** (@gau-nernst) — **TMA + `mma.sync` design, tcgen05 대신 → context imbalance (req별 context 길이 상이) 에서 hardware scheduling + high occupancy로 memory bandwidth saturate하기 더 쉬움**. BF16/FP8 indexer cache 모두, spec decoding은 `(1 + num_speculative_tokens) * num_idx_heads <= 32` 제약 (over면 Triton fallback). **GB300 microbench: uniform ctx에서 Triton-512와 동등, non-uniform ctx (imbalance)에서 Triton-512/4096 둘 다 압도**. **DeepSeek-style sparse attention의 decode indexer가 Blackwell에서 CuteDSL로 productionized** — sparse/dense attention kernel pipeline의 long-context latency 결정.
```

```markdown
### ✅ MERGED (6) *(raw 9, M3 long-context indexer + Sparse MLA fp8 + ROCm QK-Norm/RoPE fusion + Inkling LoRA hot path)*
- **#48884** `[Model] Add Inkling LoRA support [4/N]` _(@WoosukKwon)_ 🎯 — **Inkling을 LoRA-capable로 marking + adapter 이름 매핑 (packed QKVR projection, shared sink experts, LM head)**, LoRA-capable linear implementation of shared sink experts 추가 (LoRA 비활성 시 fused impl 유지). **vLLM의 Inkling release work가 4번째 단계 (LoRA) 까지 merge** — 어제 #48768 (MTP + CUDA graph + prefix cache) 의 adapter-friendly 확장. **Inkling이 vLLM에서 first-class reference workload**.
  - 🏷 `ready` · 🔗 https://github.com/vllm-project/vllm/pull/48884
```

```markdown
### ❌ REJECTED (3)
- **#40768** `[Bugfix][Scheduler] Fix CUDA crash by stale async placeholder tokens in spec decode` _(@z1ying)_ — **#37159 fix: CUDA device-side assert (`vectorized_gather_kernel: ind >= 0`) — async scheduling + spec decoding에서 `-1` placeholder token이 `input_ids`로 leak → invalid GPU embedding lookup**. **reject 추정**: ① `needs-rebase` label — 본 PR이 `input_ids`의 placeholder contract를 다시 정의하는데 async scheduling + spec decoding의 동시 재설계 진행 중 (vLLM #48692 Adaptive Spec Decode + 어제 MTP work와 직접 겹침) ② placeholder token의 lifecycle owner가 명확하지 않음 (scheduler / spec decode / embedding lookup 중 어디?) ③ fix가 단일 symptom만 잡고 root cause (placeholder invariant) 는 미정. **근본**: MTP/Adaptive Spec Decode의 placeholder contract 정리 후 re-submit.
  - 🏷 `bug, needs-rebase, v1, nvidia` · 🔗 https://github.com/vllm-project/vllm/pull/40768
```

## When to deviate

The conventions above are calibrated for the LLM-serving deep-mode cron. Deviate when:

- **Different watchlist** (e.g. compiler, K8s, DB): the "P/D + predicted-latency" cluster framing is specific to LLM serving. For compilers, the clusters would be IR-level (TTX, MMA, layout) and the keywords different (TMA, tcgen05, async_copy). Adapt the cluster pattern, keep the structure.
- **Different user** (not 정혁): drop the Korean/English mix, keep the bold-for-skim convention, keep the 🎯 marker for highest-value items, but adjust the bar for what counts as "highest-value" to that user's learning goal.
- **Single-PR deep dive mode** (not the daily summary): the user asks for a single PR's full analysis. Skip the cross-repo cluster framing, expand the per-PR rationale to 6-8 sentences, and add a "production impact" or "interview question" section at the end.

The structure is the value. The wording is calibrated for one specific user, and re-calibrating it for another is the work the agent should be doing, not the work the skill should automate.
