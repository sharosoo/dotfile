# Standard 10-repo LLM Serving Monitor List

The canonical repo list for the daily PR/issue digest. Used by the user's cron job in `~/workspaces/llm_serving_study/`.

## Tier 1 (5 — primary)
| Repo | Short | Focus keywords |
|---|---|---|
| `vllm-project/vllm` | vLLM | v1 엔진, KV cache, attention backends, PagedAttention, speculative decoding |
| `sgl-project/sglang` | SGLang | RadixAttention prefix tree, structured gen, MoE Triton kernels |
| `NVIDIA/TensorRT-LLM` | TensorRT-LLM | NVIDIA TensorRT engine, in-flight batching, FP8/FP4, paged KV |
| `llm-d/llm-d` | llm-d | K8s-native LLM serving, WideEP, autoscaling, vLLM/SGLang 통합 |
| `ai-dynamo/dynamo` | Dynamo | NVIDIA Dynamo: disaggregated serving, KV routing, NIXL transport |

## Tier 1 (1 — secondary tier-1)
| Repo | Short | Focus keywords |
|---|---|---|
| `triton-inference-server/server` | TIS | 다중 모델 backend, dynamic batching, ensemble, BLS |

## Tier 2 (4)
| Repo | Short | Focus keywords |
|---|---|---|
| `LMCache/LMCache` | LMCache | KV cache offload/storage, NIXL backend, multi-device |
| `kvcache-ai/Mooncake` | Mooncake | 분산 KV cache store, Transfer Engine(TENT), RDMA |
| `triton-lang/triton` | Triton | GPU compiler, kernel IR, AMD backend |
| `flashinfer-ai/flashinfer` | FlashInfer | JIT attention kernels, CuTeDSL, MoE EP, FP8 fused |

## Why this set
- **Tier 1** are the production-grade serving stacks that run today at scale (H100/B200 fleets). Together they cover PyTorch (vLLM/SGLang), TensorRT (TRT-LLM), and K8s-native orchestration (llm-d/Dynamo).
- **TIS** is a longstanding production server (multi-backend, BLS/ensemble) that still evolves the 26.07 release train.
- **Tier 2** are the system-level primitives the Tier 1 stacks are built on: KV cache offload/distribution (LMCache, Mooncake), GPU compiler (Triton), and JIT attention kernels (FlashInfer).

## When to update this list
- New repo enters Top-5 of serving internals (e.g. a new disagg framework from a major lab).
- A repo here becomes unmaintained (last commit > 6 months with no critical fixes).
- The user explicitly asks to add/drop a repo.
