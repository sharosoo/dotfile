# Discord Summary Template

Use this skeleton and fill in the content. Target: **≤ 2000 characters** (Discord hard limit).

## The skeleton

```markdown
📡 **<Title> — YYYY-MM-DD (Day) HH:MM KST**
_24h · <N>레포 · 깊이 · m<merged> r<rejected> n<new_open> i<issues>_

🔥 메가픽 5건
1. **<repo> #PR1→#PR2** <1-line desc> — <system-level why>
2. **<repo> #PR1+#PR2+#PR3** <1-line desc>
3. **<repo1> #PR + <repo2> #PR** <1-line desc>
4. **<repo> #PR1→#PR2** <1-line desc>
5. **<repo> #PR1+#PR2** <1-line desc>

✅ 머지 <repo-grouped bullet list with · separator>
❌ reject <one-line bullet list, key rejects only>
🆕 new open <one-line bullet list, key signals only>
🐛 issue <one-line bullet list, key production issues only>

📌 (1) <cross-signal 1> (2) <cross-signal 2> ... (8) <cross-signal 8>

📁 `<note path>`
```

## Megafic line format (each item)

`<n>. **<repo short> #PR#** <1-line what the PR does, with the headline number> — <1-line why it matters, ideally linking to recent series>. **시그널: <the deeper pattern>**.`

Examples from real reports:
- `1. **vLLM #48597→#49768** GLM-5.2 Blackwell decode perf main 머지 후 **revert** — v1 Blackwell+DSpark+NVFP4 integrate가 production-blocking. **시그널: v1 의 main 머지 후 revert 패턴은 Blackwell hot path의 production-readiness 가 아직 미완**.`
- `2. **Mooncake #3105/#3106+#3054** v0.3.12 cut 후 24h hotfix: mooncake_master invalid ELF→dyn loader segfault; batch zero-copy multi-buffer PUT wrong-data 복원. **시그널: release-24h 의 hotfix 가 distributed KV store 의 main-1d-nightly-nightly cadence 로 올라옴**.`
- `3. **SGLang #32356 + LMCache #4226** DSpark TP=8+HiCache long-prefix→permanent stall; MP coordinator→distributed KV control plane RFC. **시그널: distributed serving 의 silent correctness boundary 가 일제히 surface**.`
- `4. **SGLang #32459 (issue) EAGLE + radix prefix reuse silent collapse 97%→40-53% (GLM-DSA NVFP4 8xB200)** — spec-decode 가 radix-populated KV 에서 prefix hit 의도적 bypass 또는 silent recompute; 사용자 직접 hit. **시그널: spec-decode + radix cache 의 interaction 이 production correctness boundary**.`
- `5. **Dynamo #12020 (closed-not-merged) FPM self-benchmark design-reject on +526-line fix** — maintainer 'turning off GC for all processes seems too aggressive' + sidecar API redirect. **시그널: Dynamo 의 benchmarking infra를 production correctness source 로 취급하고 있다는 시그널**.`

The 4th and 5th examples show that **megafics can come from issues and closed-not-merged PRs**, not just merges. The new open and closed-not-merged sections of the per-repo list are not the only place for high-signal events.

## Section line formats

### 머지 (one line, repo-grouped with separator)
`OK 머지 vLLM #49734 - SGLang #32296 (fp8 quant half), #32363 - TRT-LLM #16760 (어제 #15605 정정판), #16816, #16865/#16864 (ConfigurableMoE 단일화) - llm-d #2034, #2093 (L3 Lustre) - Dynamo #12065 (어제 #11740 frontend-only) - LMCache #4203 (ObjectKey) - Mooncake #3105/#3106 (ELF), #3054 - Triton #11030, #11033 - FlashInfer #3960 (SM121 fix), #3962, #3759 (FP8 AR), #3993 (CC)`

### reject (one line)
`X reject vLLM #49701 (DFlash/MTP NPU) - TRT-LLM #14470 (beam×disagg) - Dynamo #12143 (Pareto) - Triton #11035 (TTGIR API) - FlashInfer #3902 (GDN+public Cutlass)`

### new open (one line)
`new open vLLM #49756 (PCP peer-store) - SGLang #32372 - llm-d #2113 (Intel XPU+NVIDIA E/PD) - LMCache #4235 (AES-GCM), #4226 (control plane) - Mooncake #3112, #3113 - Triton #11041, #11040 - FlashInfer #4139 (NIXL-EP deadlock), #4122 (SM107)`

### issue (one line)
`issue SGLang #32356 (DSpark stall) - LMCache #4234 (SageMaker shm) - Mooncake #3111 (heterogeneous weight) - Triton #11037 (gfx950 atomic_add hang), #11038 (PTXAS 2.14)`

### cross-signal (one line, 5-8 numbered items)
`P (1) GLM-5.2 Blackwell main revert (2) Mooncake release-24h hotfix (3) distributed KV: data-control plane (4) LMCache multi-tenant L2 enc (5) FI FP8 AR + TEE (6) TRT-LLM ConfigurableMoE 단일화 (7) SM121 CuTeDSL prod-ready (8) SGLang fp8 quant half`

(Use emoji, but the bullet examples above use ASCII placeholders for readability.)

## Compression order (apply until ≤ 2000)

1. Drop articles ("the", "a")
2. Tighten megafic descriptions to 1 short sentence
3. Use a bullet/dot separator for in-line lists (not newlines)
4. Abbreviate long repo names only when over budget: "FlashInfer" → "FI"
5. Drop redundant glue: "main 머지 1h 후" → "main 머지 후"
6. Drop the bottom item from any list (5th reject → 4, 8th cross-signal → 7)
7. Move file path to a single final line

## Verify

```bash
python3 -c "import sys; t=open(sys.argv[1]).read(); print(f'{len(t)} chars', 'OK' if len(t)<=2000 else f'OVER {len(t)-2000}')" <file>
```

Iterate 3-5 times is normal.

## Hard rules
- Keep all 5 megafics — that's the unique value.
- Keep at least 1 entry per section.
- Don't move detail to the full note and send a vague pointer; the Discord summary must stand on its own.
- Don't use "..." or "etc." — the user wants the real list.
