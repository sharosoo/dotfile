# Compute Capability → GPU Mapping (NVIDIA serving-relevant)

When a PR or commit message says `sm_XXX` or "compute capability Y.Y", you need to instantly know which physical GPU family it targets. This comes up in FlashInfer / vLLM / SGLang / Triton / TRT-LLM kernels and dispatch logic constantly. Wrong mapping = wrong megafic.

## Quick reference (serving-relevant only)

| Compute Capability | Family / Codename | Physical Products | Notes |
|---|---|---|---|
| 9.0 (sm_90) | Hopper | H100, H200, GH200 | WGMMA, TMA, async pipeline |
| 10.0 (sm_100) | Blackwell (datacenter, base) | B200, GB200 | UMMA / tcgen05, 2-CTA MMA, TPC-scoped TMA |
| 10.3 (sm_103) | Blackwell Ultra | GB300, B300, GB300 (DGX Station) | Incremental over 10.0 |
| 10.7 (sm_107) | **Rubin** (1st gen) | Rubin (2026 product line) | Blackwell-2-ISA; oversized SMEM 328 KiB, TMEM 576 cols, **3-bit programmable LUT TC**, FP8/FP4 2×/SM; CUDA 13.4 stack |
| 12.0 (sm_120) | Blackwell (consumer / RTX 50) | RTX 5090, 5080, 5070 Ti, 5070, 5060 Ti, 5060, 5050; **RTX PRO 6000 / 4500 / 5000 Blackwell Server Edition**, DGX Spark (GB10, sm_121 = 12.1) | Hardware blockwise scaling; max 128 KiB shared/SM; max concurrent warps 48 |
| 12.1 (sm_121) | Blackwell (consumer variant) | DGX Spark (GB10) | Often referenced as "SM120/121" together |
| 11.0 (sm_110) | Thor (auto/edge) — was SM101 renumbered | — | CUDA 13.0 renumbering for SM101 |

## Common confusions to avoid

- **SM12.0 ≠ Rubin.** SM12.0 is consumer Blackwell (RTX 50 series / RTX PRO Blackwell Server). If a PR says "SM120" without further context, default to consumer Blackwell unless a datacenter Blackwell is explicitly involved.
- **SM103 = GB300/B300 (Blackwell Ultra), NOT Rubin.** Sometimes news and PRs loosely call GB300 "next-gen Blackwell" but it is still SM103, ISA-compatible with SM100.
- **SM107 = Rubin, NOT Blackwell.** ISA similar to SM100 (kernel reuse) but a new product line. Often described as "Blackwell kicker architecture" (SemiAnalysis) — a Blackwell-2 microarchitecture rather than a new family.
- **"compute capability 10.x family" = all datacenter Blackwell AND Rubin.** When a Triton / FlashInfer PR says "sm_100f family" or "fallback to sm_100", it usually means the whole CC 10.x group, so it covers SM100/103/107 with one path.
- **sm_120a / sm_121a / sm_107a** = "architecture-specific" variant (with `a` suffix), enables ISA features not safe on the base variant. Most FlashInfer JIT work targets the `a` variants.

## How this maps to LLM serving PRs

- **"XPU" in vLLM/SGLang** ≠ NVIDIA. vLLM has an Intel XPU backend using `tl.make_tensor_descriptor` for Xe XMX 2D-block reads. Don't conflate Intel XPU with NVIDIA.
- **"sm_100f" in FlashInfer** = sm_100-family fallback (includes 10.3, 10.7). If you see a CuTe-DSL `device-support check with sm_100f family fallback`, that is a Blackwell+Rubin shared path.
- **"SM120" in SGLang** = RTX PRO 6000 Blackwell / consumer Blackwell. DeepSeek-V4 + GLM-5 + mxfp4 MoE kernels targeting SM120 means production consumer Blackwell.
- **"SM121" in FlashInfer/SGLang** = DGX Spark (GB10). Often appears as "SM120/121" pair in prefill kernels.
- **"SM90" in Triton/FlashInfer** = Hopper (H100/H200). WGMMA async pipeline, TMA. The "older hopper path" reference point.

## Source of truth

When in doubt, check:
1. CUDA C++ Programming Guide "Compute Capabilities" table (NVIDIA docs).
2. `deviceQuery` or `nvidia-smi --query-gpu=compute_cap` on a real GPU.
3. PR/issue body for explicit product mentions (e.g. "DGX Spark", "GB300", "B200").

## Worked example (today's 2026-07-26 report)

PR **flashinfer-ai/flashinfer #4122 "Adds SM107 support"**:
- ✅ "SM107 = NVIDIA Rubin, first-class support landing in FlashInfer main, Blackwell (SM100) ISA-similar so kernel reuse, oversized SMEM 328 KiB, TMEM 576 cols, 3-bit programmable LUT TC, FP8/FP4 2×/SM"
- ❌ "Adds Blackwell Ultra support" (wrong — SM107 is not Blackwell)
- ❌ "Adds Hopper successor support" (wrong — Rubin is the successor in name, but it is a Blackwell kicker not a new family; Feynman is sm_140, the next new family)

## Why this matters for the report

The user (정혁) is targeting LLM serving internals. Architecture boundaries are interview-grade material. A megafic that says "SM107" without naming Rubin is missing the most important signal — Rubin is the production-deployment horizon for the next 12–18 months. Always resolve sm_XXX → product name.
