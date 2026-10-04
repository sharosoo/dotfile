# LLM-serving concept and misconception map

Use this as a dependency lookup, not as a mandatory curriculum. Select only the prerequisite needed by the current PR, issue, paper, or implementation trace.

| Concept | Required causal understanding | Useful diagnostic question |
|---|---|---|
| Autoregressive generation | future output depends on the actual prior sampled tokens | Why can candidate tokens be proposed but not independently finalized? |
| Prefill vs Decode | known prompt positions are parallel; generated positions are serial across sampling steps | Which phase exposes more parallel work? |
| KV cache | retains prior K/V to avoid recomputing past positions; prior Q is not needed for a new query | Why retain K/V but not old Q? |
| KV scaling | context length × layers × KV heads/head size × concurrent sequences consumes HBM | What grows when context and concurrency grow? |
| Decode bandwidth | each new query scans long K/V even when all KV fits in HBM | Why can TPOT worsen without offload? |
| Batching | improves aggregate throughput but can increase TPOT and queueing | Who waits when more requests share a step? |
| Continuous batching | admits/replaces requests at scheduler boundaries instead of waiting for a static batch | Why does a finished slot waste static-batch capacity? |
| Chunked prefill | chunks are sequential across boundaries but token positions within a known chunk are parallel | What happens if one giant Prefill monopolizes a GPU? |
| PagedAttention | logical-to-physical blocks avoid contiguous per-request allocation and fragmentation | Why is exact contiguous reservation wasteful? |
| Prefix caching | exact stable prefix computation can be shared, chiefly reducing Prefill/TTFT | What remains reusable after the first differing token? |
| Shared prefix safety | shared blocks are immutable; requests append private suffix blocks; partial final blocks need copy-on-write semantics | How can two requests safely append after a shared prefix? |
| P/D disaggregation | separates compute-heavy Prefill from bandwidth-sensitive Decode but pays KV transfer/locality costs | What must cross the boundary? |
| Receiver credit | sender queue space does not prove receiver HBM capacity | Why reserve destination capacity before transfer? |
| Cache-aware routing | balances cache locality against queue/load imbalance | When is a cache hit not worth the wait? |
| Remote/global KV tiers | trade fetch latency, NIC/fabric contention, capacity, and HBM opportunity cost against re-Prefill | When is recomputation cheaper than fetch? |
| FlashAttention | tiles exact attention and uses online softmax to avoid materializing the `L × L` score/weight matrix in HBM | What state must online softmax retain across tiles? |
| Decode attention shape | `Q length = 1`, `K length = L`; per-output-token attention is O(L), usually bandwidth-sensitive | Why is Decode not the same L² materialization problem as naive Prefill? |
| Speculative decoding | trades draft work for fewer serial target Decode iterations and more parallel target verification | Why does low acceptance erase the speedup? |
| Target verification | target computes its own conditional distributions over supplied candidates in a real forward pass | What computation does the target still perform? |
| Sampling correction | acceptance compares immediate `p_target(x|context)` and `q_draft(x|context)`; it is not factual checking or historical frequency | Why would unconditional acceptance reproduce the draft distribution? |
| Tree verification | shared candidate prefixes are reused, but unique nodes still consume compute and temporary KV | Why do width and depth need a node budget? |
| MoE / EP | tokens route to selected expert GPUs, creating dispatch/combine All-to-All and straggler sensitivity | Why does the busiest expert set layer latency? |
| TP | each token uses multiple ranks holding shards of the same matrix, with collectives to combine results | How does TP communication differ from token-dependent EP routing? |

## Exact speculative trace

Given committed context `C`, a draft proposes `A → B → C2` and records:

```text
q1(A | C)
q2(B | C,A)
q3(C2 | C,A,B)
```

The target forwards the supplied sequence in one verification pass and obtains:

```text
p1(. | C)
p2(. | C,A)
p3(. | C,A,B)
```

Candidates are tested in order. Exact sampling accepts candidate `x` with probability `min(1, p(x)/q(x))`; on rejection it samples from the residual correction distribution. Preserve accepted-prefix KV and discard rejected/later speculative KV.

For intuition: if the target wants A/B at 50/50 but the draft proposes A/B at 90/10, accepting every draft token would reproduce 90/10. Rejecting the right fraction of over-proposed A and correcting the rejected mass restores the target distribution.

## Frequent corrections

- “Context overflow makes Decode slow” → long local-HBM KV scanning already costs bandwidth before overflow.
- “Batching lowers latency” → separate aggregate throughput, queueing, TTFT, and TPOT.
- “Chunked Prefill makes the chunk sequential internally” → dependency exists across chunk boundaries; known positions inside a chunk are parallel.
- “P/D is automatically more efficient” → account for KV transfer, destination HBM reservation, and locality.
- “FlashAttention removes O(L²) exact-attention work” → it avoids the HBM intermediate, not all pairwise FLOPs.
- “Speculative verification avoids target computation” → it replaces several serial target Decode iterations with a more parallel target pass.
- “Reject means recompute all candidates” → retain committed and accepted-prefix KV; discard rejected descendants.
- “Tree forward makes all candidate nodes cost one token” → nodes are batched efficiently, not mathematically erased.
- Provider cache thresholds, TTLs, and pricing are current product facts; verify official documentation.
