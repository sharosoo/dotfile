# LLM Serving / MLSys Conferences — 2025–2026 Knowledge Bank

Snapshot of accepted papers in **MLSys / SOSP / OSDI** with relevance to LLM serving / inference / KV cache / disaggregation. Use as a starting watchlist before reading PRs in vLLM, SGLang, FlashInfer, etc.

> **Cycle interpretation note:** When the user asks for the "latest" conference, that means the **current calendar year**, not the most recent cycle. For 2026, MLSys 2026 (May 2026, Bellevue) is in scope; SOSP and OSDI are biennial — SOSP'25 was 2025-10 Seoul, OSDI'25 was 2025-07 Boston, neither runs in 2026. Always state which cycle is "latest this year" before answering.

---

## MLSys 2026 (May 18–22, Bellevue, WA) — 9th Annual

MLSys is annual. 2026 is the most recent cycle. Industry track has its own CFP, separate from research track.

### LLM serving / inference highlights (selected)

- **BEAM** — Energy-Efficient LLM Inference under SLO
- **MorphServe** — Runtime Quantized Layer Swapping + KV Resizing
- **BOute** — Cost-Efficient LLM Serving with heterogeneous LLM/GPU, Multi-Objective Bayesian Optimization
- **FaaScale** — Fast LLM Scaling for Serverless Inference
- **SkipKV** — Selective Skipping of KV Generation for Reasoning Models
- **FlashInfer-Bench** — Building the Virtuous Cycle for AI-driven LLM Systems (kernel benchmark)
- **OPKV** — High-Throughput Plugin-Driven Framework for Recallable Sparsity in Paged KV Cache
- **FlexiCache** — Temporal-Stability aware KV Cache Management
- **FarSkip-Collective** — Unhobbling Blocking Communication in MoE Models
- **Breaking the Ice** — Analyzing Cold Start Latency in vLLM

### Training

- **MTraining** — Distributed Dynamic Sparse Attention for Ultra-Long Context Training
- **ProTrain** — LLM Training via Automatic Memory Management
- **Zorse** — LLM Training Efficiency on Heterogeneous GPU Clusters
- **HexiScale** — Large Language Model Training
- **BOOST** — Scalable Training Framework for Low-Rank LLMs
- **Unleashing Scalable Context Parallelism for Foundation Models Pre-Training via FCP**

Source: <https://mlsys.org/virtual/2026/papers.html> (full poster/oral list)

---

## SOSP 2025 (Oct 13–16, Seoul) — 31st ACM SIGOPS, biennial

**17.7% acceptance** (65/368). No SOSP in 2026.

### Tier 1 LLM serving

| Paper | One-liner |
|---|---|
| **Mercury: Unlocking Multi-GPU Operator Optimization for LLMs via Remote Memory Scheduling** | Multi-GPU operator compiler, CommIR, auto-reproduces RingAttention/Ulysses. UCSD + Meta. |
| **Aegaeon: Effective GPU Pooling for Concurrent LLM Serving** | Token-granularity auto-scaling for multi-model serving. Alibaba Cloud Model Studio deployed; GPU 1192 → 213 (82% saving). |
| **Jenga: Effective Memory Management for Serving LLM with Heterogeneity** | Two-level memory allocator for heterogeneous embeddings, prefix-subset attention. THU + Chicago + Berkeley. |
| **DiffKV: Differentiated Memory Management with Parallel KV Compaction** | 3-level diff (K/V, token, head) + GPU parallel compaction. Huawei + CUHK + SJTU. |
| **IC-Cache: Efficient LLM Serving via In-context Caching** | Reuse historical request-response pairs as in-context examples. UIUC + Google. |
| **PrefillOnly: An Inference Engine for Prefill-only Workloads** | Suffix KV discard + chunked non-attention layers + continuous JCT scheduling. Chicago + THU + UC Berkeley. |
| **Pie: A Programmable Serving System for Emerging LLM Applications** | Wasm-based `inferlet` API; user programs control generation loop. Yale. |
| **KTransformers: CPU/GPU Hybrid Inference for MoE** | AMX CPU kernels + async GPU scheduling for MoE. THU + Approaching.AI. |
| **Characterizing Mobile SoC for Accelerating Heterogeneous LLM Inference** | Mobile heterogeneous LLM. SJTU + Tsinghua + SenseTime. |

### RAG / compound AI

- **METIS** — RAG config adaptation per query (Chicago + Princeton + MSR)
- **HedraRAG** — Heterogeneous RAG workflow optimization, RAGraph abstraction (UCSD)

### Training infra

- **Robust LLM Training Infrastructure at ByteDance**
- **Mycroft** — Collective communication tracing + RCA
- **DCP** — Dynamic Context Parallelism for long-context training
- **TrainVerify** — Formal equivalence verification for distributed training

Sources:
- <https://sigops.org/s/conferences/sosp/2025/accepted.html>
- <https://dl.acm.org/doi/proceedings/10.1145/3731569>
- Companion list: <https://github.com/AmberLJC/LLMSys-PaperList> (SOSP 2025 MLSys/LLM/GenAI subset)

---

## OSDI 2025 (Jul 7–9, Boston) — 19th USENIX, biennial

**~18% acceptance (~50 papers).** No OSDI in 2026.

### LLM serving / inference

| Paper | One-liner |
|---|---|
| **NanoFlow: Towards Optimal LLM Serving Throughput** | Intra-device parallelism: nano-batch + resource overlap. 1.91× over SOTA; 50–72% of optimal. UW + Microsoft. |
| **WaferLLM: LLM Inference at Wafer Scale** | First wafer-scale LLM system (Cerebras WSE2). MeshGEMM/MeshGEMV. 10–20× over A100 + SGLang/vLLM. |
| **FuseLink** | Multi-NIC GPU comm via relay to idle NICs. Reduces LLM TTFT latency 1.04–2.73×, MoE training 1.3×, DLRM 1.2×. HKUST + MetaX. |
| **KPerfIR** | Open compiler-centric GPU kernel performance tooling. UCSD + Meta + OpenAI. |

### Distributed systems / database (relevant substrate)

- **FineMem** — Fine-grained RDMA memory management (95% latency reduction)
- **Tigon** — CXL-pod distributed in-memory database
- **PipeANN** — SSD-aligned graph vector search (billion-scale)
- **Basilisk** — Best paper; automated protocol invariants via provenance

Source: <https://www.usenix.org/conference/osdi25/technical-sessions>

---

## OSDI 2024 (Jul 10–12, Santa Clara) — reference baselines

For reference, the LLM-serving landmarks of the previous cycle (still cited as baselines):

- **DistServe: Disaggregating Prefill and Decoding for Goodput-optimized LLM Serving** — arXiv 2401.09670, DOI 10.5555/3691938.3691949
- **Sarathi-Serve: Taming Throughput-Latency Tradeoff** — arXiv 2403.02310, DOI 10.5555/3691938.3691945
- **ServerlessLLM: Low-Latency Serverless Inference** — 10–200× latency reduction
- **InfiniGen: Dynamic KV Cache Management** — SNU
- **Fairness in Serving Large Language Models** (VTC) — UC Berkeley
- **USHER: Holistic Interference Avoidance** — UVa + Georgia Tech

---

## SOSP 2023 (the cycle that defined LLM serving)

- **Efficient Memory Management for LLM Serving with PagedAttention (vLLM)** — Kwon et al. DOI 10.1145/3600006.3613165, arXiv 2309.06180. Foundational citation; still the entry point.

---

## Quick "where to publish" cheat sheet (for engineering work like Knowledge Tracing / non-LLM attention serving)

| Tier | Venue | Why |
|---|---|---|
| **Highest** | MLSys research track | Annual, ML-systems sweet spot |
| **High** | MLSys industry track | Separate CFP; engineering case studies welcome |
| **High** | EuroSys | Systems general; production deployments |
| **Med** | SOSP / OSDI | Biennial; need strong novelty, not just speedup |
| **Med** | NeurIPS SYS-ML workshop / ICML MLSys workshop | Systems + ML, lower bar |
| **Med** | LAK / EDM / AIED | If the domain (KT, education) is the contribution |
| **Low-effort** | arXiv preprint | Always possible; needed for any later citation |
| **High-impact non-paper** | Triton blog / vLLM blog / PyTorch forum | OSS contribution credit, faster reach than paper |

For "is this paper-worthy?" assessment framework, see SKILL.md §"Evaluating whether your own engineering work is paper-worthy".
