---
name: deep-mode-daily-pr-report
description: Worked recipe for the LLM-serving "deep mode" daily PR cron — 10-repo watchlist, the full prompt the user calibrated, the windowed-24h shape (not stateful dedup), and the per-PR web_extract technique that gives the report its depth.
license: MIT
metadata:
  hermes:
    tags: [llm-serving, daily-cron, deep-mode, pr-analysis, watchlist]
---

# Deep-mode daily PR report (LLM serving)

This is the worked recipe for the recurring cron that produces a **deep-mode** daily PR/Issue report across 10 LLM-serving repos. "Deep mode" means: per-PR technical rationale (2–3 sentences), reject-cause hypothesis, issues-as-signals framing, system-level framing (no application framing).

It evolved over multiple cron runs in July 2026 against the LLM-serving career-changer user. The shape converged on these choices, all of which are deliberate.

## Why this is "windowed", not "stateful"

The canonical `personal-watchlist` pattern is a **seen-set dedup**: emit a new item only the first time the user sees it. That works for vLLM good-first-issues (sparse, slow-moving, each item has long lifetime). It does **not** work for the daily PR digest because:

- The user wants to see *what got merged/rejected/opened in the last 24h* — a moving window, not "ever new".
- The same PR can be relevant in two different daily digests (e.g. opened day N, then closed day N+1) without being a duplicate.
- The cadence itself is the value — "what did NVIDIA upstream land in Dynamo yesterday" is the question.

Implementation: filter on `updated_at >= now - 24h` for closed PRs, `created_at >= now - 24h` for open PRs and issues. No persistent state.json. The script `scripts/daily_pr_report.py` (in the user's `llm_serving_study` workspace) does this directly.

## The 10-repo watchlist (converged)

The watchlist went through 8 → 10 expansions and the current set is well-calibrated for LLM-serving hire-readiness + kernel interest:

| Tier | Repo | Why it's on the list |
|---|---|---|
| 1 | `vllm-project/vllm` | The canonical engine. Every KV-cache / attention-backend / PD-disagg change shows up here first. |
| 1 | `sgl-project/sglang` | The RadixAttention peer. Faster on radix-tree workloads, faster on diffusion. |
| 1 | `NVIDIA/TensorRT-LLM` | NVIDIA's own engine. Paged KV, MXFP8, in-flight batching. Where NV-internal previews land. |
| 1 | `llm-d/llm-d` | K8s-native serving. WideEP, autoscaling, vLLM/SGLang integration. |
| 1 | `ai-dynamo/dynamo` | NVIDIA Dynamo: disaggregated serving, KV routing, NIXL transport. |
| 1 | `triton-inference-server/server` | TIS. The "boring" production option, still actively maintained. |
| 2 | `LMCache/LMCache` | KV cache offload/storage. NIXL backend, multi-device. |
| 2 | `kvcache-ai/Mooncake` | Moonshot AI's distributed KV cache store. Transfer Engine (TENT), RDMA. |
| 2 | `triton-lang/triton` | The GPU compiler itself. AMD backend, KERNEL IR changes. |
| 2 | `flashinfer-ai/flashinfer` | JIT attention kernels, CuTeDSL, MoE EP. Fastest moving of the kernel libs. |

**Hiring signal note (the user used this list as a hiring-readiness marker):** a job board cross-check (6/6 LLM-serving postings) shows vLLM and SGLang appearing on every posting; TensorRT-LLM, Triton-IS, llm-d, and Dynamo on 2–3/6. LMCache/Mooncake are specialized-but-mentioned. Triton (the language) and FlashInfer are not hire-readiness signals on their own — they're included for **kernel depth**, which the user has as a separate career interest.

## The prompt template (calibrated)

This is the actual prompt that the cron agent runs against. Trim or expand per user, but the structure has been validated across multiple daily runs.

```text
너는 Hermes Agent로서, 일일 LLM 서빙 PR/Issue 리포트를 작성하고 사용자에게 전달하는 일을 한다.

**컨텍스트**:
- 사용자: 정혁 (Discord `샤로수` 서버 `#일반` 채널, channel ID 1523289661680910469)
- 목적: LLM 서빙 엔지니어로 전향하기 위한 오픈소스 모니터링. 10개 레포의 PR/Issue를 매일 추적.
- 타겟 레포 (10개):
  - Tier 1 (5): vllm-project/vllm, sgl-project/sglang, NVIDIA/TensorRT-LLM, llm-d/llm-d, ai-dynamo/dynamo
  - Tier 1 (1): triton-inference-server/server
  - Tier 2 (4): LMCache/LMCache, kvcache-ai/Mooncake, triton-lang/triton, flashinfer-ai/flashinfer
- 리포트 깊이: **깊게 모드** — 각 머지 PR마다 기술 배경 2-3문장, reject 사유 추정, 신규 issue 요약
- 리포트 저장 위치: `~/workspaces/llm_serving_study/notes/daily_pr/YYYY-MM-DD.md`
- 리포트 생성 스크립트: `~/workspaces/llm_serving_study/scripts/daily_pr_report.py`

**작성 원칙**:
- 정혁은 서빙 internals 자체에 관심이 깊음. **기술적 배경 설명을 짧고 정확하게** — "왜 이 PR이 의미 있는지" 위주.
- application framing ("X 모델에 적용") 거절. system-level 변경점만 다룬다.
- 각 repo별로 3-4개 PR 요약 (머지/reject/open 중 hot한 것)
- 머지 PR: 배경 설명 + 영향 범위 + 코드 위치 (가능하면)
- reject PR: reject 사유 추정 (라벨 + 코멘트 기반)
- 신규 open issue: 요약 + 관련 PR 있으면 링크

**출력 형식**:
- # 📡 LLM Serving Daily Report — YYYY-MM-DD (요일) HH:MM KST
- 각 repo 헤더: 🔷 {repo} — focus 키워드
- 섹션: ✅ MERGED (핵심 3-4) / ❌ REJECTED (핵심 2-3) / 🆕 NEW OPEN (핵심 3)
- 각 항목: PR number, title, author, 배경 설명 (2-3문장), labels, URL
- 발송은 Discord로 (channel 1523289661680910469). 한국어 + 기술 용어는 영어 그대로.
```

**Two non-obvious rules embedded in the prompt** (and that the agent should enforce on every run, not just the first):

1. **"정혁은 서빙 internals 자체에 관심이 깊음"** — this is the explicit reason for the "no application framing" rule. The agent must keep technical terms in English (PagedAttention, MLA, KDA, EDF, NIXL) regardless of the Korean prose. Don't translate them.
2. **"reject 사유 추정 (라벨 + 코멘트 기반)"** — the agent is *allowed* to hypothesize a reject cause, and the hypothesis is the value. Just stating "closed without merge" with no analysis fails the bar. Read 1-3 review comments and the label, then give a 1-sentence verdict.

## The per-PR web_extract technique

After the script runs `fetch_prs()` for each repo, the agent has titles + body excerpts for the last 24h of activity. For the top 5–8 hot PRs, **call `web_extract` on the PR URL** to get the full body + 3 review comments + linked issue context. The body usually contains:

- A problem statement (what was broken)
- A design choice (why this approach, not others)
- Performance numbers (TTFT, tokens/sec, GB/s, % speedup)
- Linked issue / RFC for the original problem

Without this step, "왜 production에 들어갔는지" cannot be answered from the title alone. With it, the answer usually appears in the body verbatim.

**Practical pattern from real runs:**

- Batch 4-8 `web_extract` calls in parallel (not serial). Each call is ~1-3s; serial adds 30s+ for no reason.
- For merged PRs: extract gives the body + first 3 review comments + commit messages. Review comments often include the maintainer's reasoning for *approval* — that's gold for "왜 production에 들어갔는지".
- For rejected/closed PRs: extract gives the body + the closing reviewer's reason + any bot comment ("stale, no activity in 60 days"). That's the reject-cause hypothesis already pre-written.
- For open issues: extract gives the issue body + repro steps + any linked PRs. The "관련 PR" link is the cron prompt's "관련 PR 있으면 링크" line.

**Failure mode to avoid:** if `web_extract` returns 30K+ chars (common for long PR discussions), do NOT truncate. Read the full content, then synthesize. Truncating the input to web_extract and synthesizing from memory produces a degraded answer that fails the deep-mode bar. The user will see this as the same "왜 인터럽트야" cadence complaint from `learning-via-oss-pr-watchlist` pitfall #8.

## The web_search layer (external technical context)

`web_extract` on the PR URL gets you the PR body. That answers *what changed*. It usually does **not** answer *why the change is technically correct* — that's the user's actual bar ("왜 이 PR이 의미 있는지"). For the top 5-8 hot PRs, run **parallel `web_search` queries** to pull external context the PR body assumes you already know.

**When web_search is required vs. optional:**

| PR characteristic | Web search needed? | What to search |
|---|---|---|
| Touches a CUDA/PTX intrinsic (tcgen05, mbarrier, cutlass tensor) | **Required** | the intrinsic name + "tutorial" or "whitepaper" or the GPU arch (e.g. "tcgen05_mma_scaled tutorial NVFP4 VEC_SIZE") |
| References a paper (DSpark, KVarN, TriAttention, BLASST) | **Required** | arxiv id + "vllm/sglang" or just the paper title |
| Touches vendor library internals (DeepGEMM JIT, FlashInfer autotuner, Mooncake TENT) | **Required** | the library name + the error string from the PR (e.g. "DeepGEMM kernel_runtime 98 'cudaErrorInvalidDeviceFunction'") |
| Standard perf opt (f-string → %-format, O(n²) → O(n)) | Not needed | the rationale is self-evident |
| Vendor backport (B200 → B300, SGLang → Dynamo) | Optional | check the changelog of the source PR for the canonical description |
| Model-add PR (MiniCPM-SALA, GLM-5.2) | Not needed | the model card / paper is in the PR body already |

**Concrete pattern from the 2026-07-19 cron run.** Four of the four "메가픽" entries needed web_search to land the rationale, not just web_extract:

- **Triton #10941** (Rubin MMA + mbarrier.arrive.multicast): PR body mentions `BLOCK_M = 256` and the new multicast barrier, but the *why* — that Blackwell was 128 and the 5D TMA layout `[1, rep_m, rep_k, 2, 256]` enables 2× per-block throughput, that mbarrier multicast enables cluster-wide GPC wake — is in the Triton Gluon tcgen05 tutorial and the linked CUDA PTX doc. A single `web_search("tcgen05_mma_scaled BLOCK_M NVFP4 VEC_SIZE tutorial")` returns the tutorial page; the rationale is then obvious.
- **SGLang #31501** (FlashInfer SWA `window_left` plan-time): the PR body says "SWA mask compiled out" but the agent needs to know that FlashInfer's `fa2` module's `use_sliding_window` flag is locked at plan time, not at forward time — this is in the FlashInfer API docs and in the related FlashInfer issue tracker.
- **vLLM #49051** (DeepGEMM `is_deep_gemm_supported` JIT toolchain): the reject-cause hypothesis needs DeepGEMM's documented CUDA ≥ 12.3 requirement and the `kernel_runtime.hpp:108 '98'` error semantics. A `web_search("DeepGEMM kernel_runtime 98 cudaErrorInvalidDeviceFunction JIT nvcc 12.3")` returns the GitHub issue #156 with the exact root cause — the agent then writes "closed w/o merge because the real fix is to add `nvcc --version` parsing, which is being tracked in a follow-up PR" instead of guessing.
- **FlashInfer #4049** (SM120 MXFP4×MXFP8 autotuner IMA): the issue is filed as a P0 with minimal context; the real mechanism is in the autotuner's `_prepare_input_tensors` and the CUTLASS MXFP8 dtype detection path. A `web_search("FlashInfer autotuner MXFP8 swizzled E8M0 dummy initializer illegal instruction")` returns the previous bug report (#3558) and the production deployment follow-up on GB10/SM121 — exactly the "현 production의 reliability blocker" framing the user wants.

**Cost:** ~3-5s per `web_search`, ~1-3s per `web_extract`. Total for 5-8 hot PRs is ~40-60s, in two parallel batches. Worth it — the user's stated bar requires technical depth, and the body of a 50-line PR almost never carries the depth on its own.

**Failure mode to avoid:** searching the PR's own GitHub URL. The PR body already has what GitHub knows. Search the **underlying technology** instead — the paper, the GPU ISA, the library internals, the issue tracker of the upstream dependency. Otherwise you just paraphrase the PR body and add nothing.

**Frequency rule:** not every PR gets a search. If the PR title + 1-line body excerpt already tells you "this is a refactor / lint fix / chore / doc update", skip — those don't need depth. Search the 5-8 that touch internals.

## The Discord message vs file split

The cron prompt produces two artifacts:

1. **Discord message** (the actual `assistant` text delivered to the user via the gateway) — condensed, ~6–10KB, fits within the 2000-char-per-message hard limit *after* the gateway's chunker. Each `✅ MERGED` entry is 1–2 sentences instead of 3, the per-repo section is one paragraph instead of bullets, the "전체 리포트" footer references the file.
2. **File** (`~/workspaces/llm_serving_study/notes/daily_pr/YYYY-MM-DD.md`) — full deep version, 30–45KB, all PRs with full rationale, all reject-cause hypotheses, all issue summaries, the "오늘의 흐름" totals block, the "오늘의 핵심 키워드" 3–5 keywords.

The agent's job is to write the full version to the file first, *then* distill to the Discord message. Not the other way around (if you distill first, you lose the structure of the full version).

## Cross-repo signals (the highest-value pattern)

When the same technical problem appears in N out of 10 repos, that's the day's most important signal. The 2026-07-09 report had three such signals:

- **NIXL v1.3.0 `import nixl` regression hit LMCache (#4040), TRT-LLM (#16112), Triton IS indirectly, and Mooncake transitively in the same 24h window**. A single-repo reader would see "LMCache split NIXL into optional extra" and miss that this is a cross-ecosystem event with implications for every NIXL-consuming project.
- **Pre-existing unmigrated items as hire-readiness gold**: e.g. vLLM's Mamba prefix cache fix (#44243) signals that HMA serving is still in flux.
- **P0 regressions in upstream libs** (FlashInfer #3887 GDN prefill regression on SM100, vLLM #47949 SM75 FlashInfer regression) — both of these are "main has a regression, fix coming" stories that show the actual current state of the projects.

The "오늘의 흐름" footer at the end of the file should call out 1–3 of these cross-repo signals. That's what makes the report interview-useful.

## What doesn't work (and why)

- **Just dumping title+labels with no rationale** — degrades to a "merged=67, rejected=25" stats line. The user explicitly wants "왜 production에 들어갔는지", and a stats line doesn't answer that.
- **Fetching only the first 1-2 PRs per repo without the web_extract step** — produces the same title-only output. The capture rate of the deep-mode bar requires the per-PR web_extract.
- **Translation of technical terms into Korean** — fails the rule "기술 용어는 영어 그대로". The user reads PagedAttention faster than 페이지어텐션; translation adds friction.
- **Long per-PR rationale (3+ sentences per entry)** — file balloon to 60KB+, hard to scan. The 2–3 sentence constraint is calibrated to keep the file scannable.
- **Failing to call out cross-repo signals** — the "오늘의 흐름" footer is the difference between "I read 67 PRs" and "I learned that NIXL v1.3.0 broke half the ecosystem". Always include 1–3 cross-repo signals.
