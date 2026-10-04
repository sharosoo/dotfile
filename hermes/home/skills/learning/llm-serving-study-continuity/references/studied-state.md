# Demonstrated LLM-serving study state

Last compacted: 2026-07-30. This file is an orientation index, not the source of truth. Search the linked session and current source before relying on details.

## Clearly reasoned through in dialogue

### Foundations through scheduling and KV management

The long Socratic session reached well beyond basic autoregressive generation:

- Prefill vs Decode and their different parallelism
- KV cache lifetime and HBM growth
- Decode KV-bandwidth sensitivity
- batching vs per-request latency
- continuous batching and scheduler behavior
- PagedAttention / fragmentation
- prefix-cache reuse and correctness boundaries
- P/D disaggregation, KV transfer, locality, and backpressure
- FlashAttention's HBM materialization benefit versus unchanged exact-attention pairwise work
- MoE routing, Expert Parallelism, dispatch/combine All-to-All, expert imbalance, hot-expert replication, and its HBM trade-off

The learner explicitly identified that MoE layer latency waits for the busiest expert before combine, and that expert replication trades lower hot-expert contention for extra HBM use.

Session: @session:default/20260721_023808_7ad3c5f9

### Speculative decoding and tree verification

Reasoned distinctions:

- target verification is a real target forward pass, not a free equality check;
- candidate positions can be processed in one packed, parallel, Prefill-like verification pass;
- shared tree prefixes avoid duplicate prefix computation;
- unique candidate nodes still require separate mathematical outputs and consume compute/KV;
- different candidate queries can be stacked into batched GEMMs against shared K/V;
- a larger tree can improve GPU utilization initially but eventually increases FLOPs, temporary KV, attention work, and interference;
- accepted speculative-prefix KV remains committed while rejected and later speculative KV must be discarded.

Session: @session:default/20260721_230235_3ec0ba50

### Current preferred learning level

Do not restart at “why tokens are autoregressive.” The user explicitly rejected that as too basic. Prefer reconstructing internal invariants from a recent PR, issue, or paper:

```text
failure
→ conflicting state boundary
→ invariant
→ code/diff or paper evidence
→ transfer to another system
```

Sessions:
- @session:default/20260730_141217_c9775d0c
- @session:default/20260730_141523_a532481d

## Current unresolved / good continuation cases

These are historical learning pointers; refresh their live GitHub state before teaching.

- vLLM cache-hot tool markup issue discussed as a possible prefix-cache × MTP state interaction. The missing experiment was prefix caching on with MTP off; do not present root cause as established.
- vLLM P/D preemption case: a partial prefix must not become externally visible as completed KV. Useful invariant form: publishing length `N` must imply all `N` positions are computed, committed, and safe for downstream reuse.
- Cross-process KV lease deadlines: process-local monotonic clocks cannot be compared as though they share an epoch.
- NELSSA and other tiered-memory work: routing/migration boundaries connect to the same ownership, capacity, and timing questions as P/D.

## Reported or collected, but not necessarily learned

Do not mistake appearance in a digest for demonstrated understanding:

- Photonic-CXL KV appliance, NELSSA, DualDecoder, LLMET, StrataCL
- ChunkAttention, CacheBlend, Kairos, Mooncake, LMCache
- daily vLLM/SGLang/Dynamo/FlashInfer PR and issue signals
- weekly industry and daily arXiv reports

Recover the actual report with `session_search`, then ask a diagnostic question before assuming mastery.

## Reading artifacts

A prior session assembled topic-grouped PDFs rather than one ZIP:

1. model / Attention / FlashAttention / MoE
2. Tensor Parallelism
3. scheduler / KV cache
4. serving architecture / P/D / KV transfer / speculative decoding
5. recent KV / Kairos / UBEP / Weaver papers

Session: @session:default/20260725_001516_c1f5574b

Check whether the local paths still exist before offering the files again.
