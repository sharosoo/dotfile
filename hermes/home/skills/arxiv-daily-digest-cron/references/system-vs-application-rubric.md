# System-level vs Application-level Rubric

The hardest part of running the daily arXiv digest cron is not fetching — it's filtering. A keyword query on a serving-related term like "KV cache" or "speculative decoding" will return a mix of:

- **System-level** papers (KV cache layout, kernel design, scheduling, topology)
- **Application-level** papers (specific model × specific hardware benchmarks, eval results, training recipes)
- **Security / privacy** papers (cs.CR — usually excluded, sometimes included)
- **Adjacent-domain** papers (video gen, multi-modal, robotics — usually excluded)

The default arXiv search API does not separate these. You have to judge per paper.

## The single test

> "Would a backend engineer building an LLM serving stack change something in their stack because of this paper?"

If **yes** → include. If **no** → exclude, even if the keyword matches.

Concrete sub-tests:

1. **Does the paper introduce a new system primitive** (KV cache layout, attention kernel, scheduler policy, network topology, memory hierarchy)? → include.
2. **Does the paper measure an existing primitive in a new regime** (longer context, more experts, different hardware, larger batch) and the contribution is the measurement/methodology? → include.
3. **Does the paper prove a property of an existing primitive** (memory bound, traffic bound, formal correctness)? → include.
4. **Does the paper apply an existing primitive to a new model / new domain** ("we use FlashAttention for video diffusion", "we use paged attention for code models")? → exclude — this is the application framing the user wants to avoid.
5. **Does the paper measure model quality (accuracy, perplexity, benchmark score) without a system contribution**? → exclude.
6. **Is the paper about training, finetuning, RLHF, dataset construction, or pretraining recipes**? → exclude, even if the topic overlaps.

## The cs.CR sub-test

Keyword search on "KV cache" surfaces ~1-3 cs.CR papers per day, almost all "leak model X via timing" attacks. Default disposition: **exclude**. The exception:

> Does the attack expose a structural weakness in a serving primitive that an engineer would need to *redesign* around (not just patch)?

If yes → include. If the attack is "we can fingerprint the draft model size from timing" (a privacy leak) → exclude.

### Worked examples from the 2026-07-25 LLM serving run

**Include: HijackKV (2607.19957, cs.CR)** — "New Threat in Position-Independent KV Cache Reuse"
- Why included: the attack works because position-independent KV cache reuse retrieves by token match, and a poisoned prefix can be hidden inside a benign-looking chunk's KV. This is a **structural weakness in the KV cache reuse primitive** — the fix is system-level (revise the cache key, add provenance checks, redesign the reuse policy). A serving engineer reading this would reconsider whether to deploy position-independent KV reuse at all, or how to gate it.
- One-line judgment: "attack surfaces a design flaw in a serving primitive → include."

**Exclude: Leaky Language Models (2607.20723, cs.CR)** — "Stealing Architecture and Inference Optimizations via Per-Token Timing"
- Why excluded: the attack is "from token timing, we can infer whether you use speculative decoding, your draft model context length, your number of layers, etc." This is a **privacy/fingerprinting leak about the deployment**, not a flaw in a serving primitive that requires a serving-side redesign. The mitigation is "add timing noise", not "redesign the inference engine".
- One-line judgment: "attack fingerprinting the deployment → exclude, even though it's cs.CR."

**Exclude: HeadCast (2607.20125, cs.CV)** — "Casting Attention Heads for Efficient Autoregressive Video Generation"
- Why excluded: the contribution is a *new attention pattern* for video diffusion models. The technique (attention head casting for KV cache compression) is interesting but the *domain is video generation*, and the user has explicitly framed the digest as LLM serving. If a future LLM serving paper cites this as a kernel primitive, the derivative paper would be includable; the original is out.
- One-line judgment: "video diffusion paper → exclude, even if it cites paged attention and would fit a cs.LG query on `KV cache`."

**Include: Windowed-MTP (2607.21535, cs.LG)** — "Removing the Full-Context Draft-KV Tax at Million-Token Context"
- Why included: the paper shows that MTP draft heads in modern LLMs (Qwen, DeepSeek-style) run full attention over the full KV cache on every draft step, and at million-token context this is the bottleneck. The fix (sliding window on draft attention only, full-attention verification intact) is a **serving-system primitive change** that any system shipping MTP-style draft heads would adopt. Measured in SGLang — directly system-level.
- One-line judgment: "new serving primitive for speculative decoding → include."

**Include: MoA-Structured Decode Attention (2607.19456, cs.LG)** — "DNF Derivation, KV-Cache Accumulation, GQA/MQA, and OpenACC Kernel"
- Why included: the paper derives the *minimum memory traffic* shape of the decode step using formal array mathematics, and shows that the standard attention formulation has redundant Kᵀ traffic. Includes an OpenACC GPU kernel implementation. This is a *kernel micro-architecture* contribution with formal guarantees — directly serving-system.
- One-line judgment: "kernel + formal memory bound → include."

**Include: AdaFlash (2607.19223, cs.LG)** — "Adaptive Speculative Decoding via On-Policy Distilled Diffusion Drafters"
- Why included: the paper addresses the *acceptance variance* of diffusion-based drafters (DFlash-family) and proposes on-policy distillation + adaptive draft length. The contribution is to the speculative-decoding **draft model + scheduler policy** — the serving system controls both. Mixed-batch serving with heterogeneous acceptance is a known production pain point, this paper directly addresses it.
- One-line judgment: "scheduler + draft policy for speculative decoding → include."

## Edge cases the rubric doesn't cover

- **Hardware-specific papers** (e.g. a paper only relevant to TPU, or only to Apple Silicon). If the user is on NVIDIA GPUs (정혁's stack), include only if the contribution generalizes. Otherwise note it and demote.
- **MoE training papers**. The user's stack is serving, not training. Exclude unless the paper explicitly addresses serving-side EP/DP topology.
- **Quantization for serving**. Include if the paper is about *serving-time* quantization (KV cache quantization, activation quantization with kernel support). Exclude if it's a training-time PTQ/QAT method.
- **Distributed inference papers**. Include if the contribution is topology, comm primitive, or scheduler. Exclude if it's "we trained a model on N GPUs" with no serving-system contribution.

## When the rubric fails

The rubric fails when the paper is genuinely both system-level AND application-level (e.g. a paper that introduces a new attention kernel AND applies it to a specific model). In that case, the rule is: **default to the system-level framing in the Korean summary** (describe what the kernel does, not what it achieves on the model). The paper is includable, the framing is what matters.

## Worked examples from the 2026-07-29 LLM serving run (2026-07-27/28 papers)

**Include: DOPS — Beyond Prefill-Decode Disaggregation (2607.25498, cs.AR)**
- Why included: the paper argues that prefill-decode disaggregation + roofline operator placement are insufficient for heterogeneous systems, and proposes DOPS — a hardware-aware, closed-loop scheduler that places operators per stage with blockwise weight layout awareness. This is the user's main interest area (disagg + scheduling topology).
- **Key rubric lesson**: the abstract says "heterogeneous platforms" and "operator scheduling" — it does NOT contain "LLM serving", "prefill decode", or "KV cache". A strict-keyword query would skip it. The broad-keyword + per-paper rubric path is what catches it. **If a paper proposes a scheduler / placement / kernel change for inference workloads, include it even when the strict keyword set misses**.
- One-line judgment: "scheduler + heterogeneous placement → include, even without strict-keyword match."

**Include: LOCKS — Page-Local Compact Key Summaries (2607.24555, cs.LG)**
- Why included: every page of the KV cache gets its own spectral summary (~10% of cache size); selection reads summaries, not candidate keys/values. This is **decode-time memory traffic reduction**, not training-time optimization. The 12-year-old analogy: "the model has a notebook, but reading the whole notebook per token is the bottleneck — so make a per-page index that says 'this page matters'."
- One-line judgment: "decode-time KV read reduction → include, top 5."

**Include: AngelSpec — Speculative Decoding Framework (2607.25852, cs.CL)**
- Why included: MTP and block-parallel diffusion drafters are both valuable but neither is universally best; AngelSpec is a **unified training framework that co-specializes drafter structure and training data per workload**. The contribution is the drafter-selection policy + training pipeline, both of which are serving-system concerns.
- One-line judgment: "drafter selection policy for speculative decoding → include."

**Include: CoSA — Proxy-Kernel Co-Designed Sparse Attention (2607.25291, cs.CL)**
- Why included: block-sparse attention is bottlenecked when the proxy drops salient blocks; CoSA couples the proxy with the kernel so the dropped blocks get revisited in a controlled way. The contribution is a **co-design pattern between attention-scheduling primitives and the kernels that consume them**.
- One-line judgment: "sparse attention kernel + co-design → include."

**Include: DraftExpert — Self-Speculative for End-Device MoE (2607.24434, cs.LG)**
- Why included: addresses a specific serving bottleneck — extra expert loads from a bigger draft expert set — by **overlapping the draft's expert load with the verify step's expert load**. The system-level contribution is a scheduling change, not a model-quality change.
- One-line judgment: "MoE serving scheduler → include, especially given user tracks MoE."

**Excluded: CARE — Confidence-Adaptive Routing for MoE LoRA (2607.26052, cs.LG)**
- Why excluded: the paper is about **routing tokens through LoRA experts** in a MoE adaptation setup. LoRA is a training-time adaptation primitive; the contribution is to the routing policy, not to the inference serving system. A serving engineer wouldn't change their stack because of this paper.
- One-line judgment: "LoRA routing → exclude, this is training-time adaptation, not serving."

**Excluded: MDTransformer — Photonic Transformer Accelerator (2607.26016, cs.AR)**
- Why excluded: photonic HW accelerator. While it's a `cs.AR` paper on transformer inference, the contribution is to **hardware design** (mode-division optical dataflow) — not to the serving software stack. The user is on NVIDIA GPUs; a photonic accelerator paper is not actionable.
- One-line judgment: "HW accelerator, not actionable in user's GPU stack → exclude, even with cs.AR + transformer inference."

**Excluded: Bits and Memories — Verbatim Extraction Across Quantization (2607.25451, cs.LG)**
- Why excluded: the paper is about **privacy / membership inference under quantization** — it measures whether quantized models leak training data. Quantization-as-a-feature is a serving concern, but this paper uses quantization as a *condition* for a privacy study, not contributing to quantization itself.
- One-line judgment: "quantization as study condition, not serving contribution → exclude."

**Excluded: Memory for Large Language Models (2607.25380, cs.CL) — survey**
- Borderline: survey paper on LLM memory architectures. Surveys crowd out primary papers in a daily digest. User prefers individual contributions.
- One-line judgment: "survey → exclude, prefer primary papers."

**Excluded: UniMem — Episodic-to-Parametric Memory (2607.26017, cs.CL)**
- Borderline: memory architecture for LLM agents. The "agent" framing is application-level, not system-level.
- One-line judgment: "agent memory → exclude from LLM serving digest."

**Excluded: Linguistic Rules as Prompt Compressors (2607.25335, cs.CL)**
- Excluded: rule-based prompt compression. The goal is serving-cost reduction but the contribution is a preprocessor that runs *before* the model — "fewer input tokens" is application-level tuning, not a serving-system primitive change.
- One-line judgment: "input preprocessor → exclude, not a serving primitive."

**Excluded: Matryoshka Agent — Long-Horizon ML Engineering (2607.25090, cs.AI)**
- Excluded: hierarchical agent framework for ML engineering tasks. Agent architecture, not serving infrastructure. cs.AI is outside the system-relevant category set.
- One-line judgment: "agent framework → exclude."

These examples add up to a clear heuristic refinement:

> The keyword set is the *entry gate*, not the *inclusion decision*. A paper that matches a broad keyword (e.g. `"attention"`, `"MoE"`) but fails the strict system-rubric test is excluded. A paper that fails to match any keyword but is *unambiguously* about serving-system design (scheduler, kernel, topology, memory layout) is included.
> 
> When in doubt, ask: "if I read this paper, would I learn a new way to *build* an inference system, or just a new way to *use* one?" The former is in, the latter is out.
