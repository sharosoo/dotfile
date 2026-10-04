# Sibling-PR Patterns: When Multiple PRs Form One Megafic

Several PR categories naturally come in pairs or series on the same day. When you spot one, treat the family as **one megafic**, not N independent entries — it saves Discord budget and gives a richer technical signal than listing each PR separately.

## 1. Transport / kernel family fix
The same bug shape repeats across sibling implementations. A fix to one is almost always followed by sibling PRs fixing the others the same day or week.

- **Example (Mooncake 2026-07-28)**: #3125 fixed double-free in `RdmaTransport::submitTransferTask`; #3146 then fixed the same pattern in `UbTransport::submitTransferTask` and `BarexTransport::submitTransferTask` — `slices_to_post` walked and deallocated on the device-selection failure path. Body text explicitly says "Sibling fix of #3125".
- **Generalization**: TENT transport (RDMA / UB / Barex), MoE backend (different expert groups), attention backend (FlashAttention / xFormers / CuTeDSL), platform backend (ROCm / XPU / CUDA).

**How to write the megafic**: identify the shared root cause (e.g. "slices-to-post deallocation on error path"), name each transport affected, link all PR#s.

## 2. Red-precommit / CI-bypass hot fix + cleanup
A substantive fix lands while the precommit check is red. The cleanup PR (isort/ruff/format) follows within hours.

- **Example (TRT-LLM 2026-07-28)**: #16916 restored fp8 KV scale delivery in MLA generation (substantial fix, 22-point accuracy recovery). #16917 applied isort/ruff-format pre-commit formatting because the previous PR was merged with a red precommit check. Body says "Follow-up to #16916, which was merged while its Pre-commit Check was red".

**Megafic framing**: "fix PR + format-cleanup PR on same day → product velocity > CI gating" cross-signal. The hot fix is the real megafic; the cleanup is N/A mention.

## 3. Series split (1 PR → N split PRs)
A large PR was closed/superseded in favor of a series of smaller, more reviewable PRs. The first 1/n often appears the same day the original is closed.

- **Example (SGLang 2026-07-28)**: #31520 (LoRA under DP attention) was closed. #32580 is "split https://github.com/sgl-project/sglang/pull/31520" — 1/n per-rank tensor serialization under dp_size > 1.
- **Hypothesis on the closed PR**: "**comment-driven hypothesis: design-reject on substantive fix**; scope too large → author split into series" or "comment-driven hypothesis: held until split landed".

## 4. Issue + fix-pair from same reporter
A user files an issue with concrete reproduction/quantification, and a maintainer ships a fix PR the same day. The pair is a megafic because the issue's production-hazard signal is the WHY of the fix.

- **Example (FlashInfer 2026-07-28)**: #4190 (issue, "default tactic regressed +28-30% at >=8k tokens on sm100f") + #4173 (fix PR, "disable PDL for FP4 MoE to prevent TP deadlock"). Different angle of the same underlying correctness/perf boundary on the same kernel.

## 5. Cross-repo stack adoption
A model lands across multiple repos on the same day as each stack adds support.

- **Example (Kimi K3 2026-07-28)**: TRT-LLM #16916 (MLA fp8 KV fix) + Dynamo #12228 (Kimi-K3 recipes on main) + llm-d #2121 (Kimi k3 WIP). All on same day → "Kimi K3 stack 4-repo 동시 production" cross-signal.

## 6. Closed-with-documented-root-cause (rejection IS the deliverable)
A PR is closed without merge, but the body contains a precise root cause analysis. The PR's value is **not the fix code** but the **documented understanding of the failure mode**. This is interview-grade material because the team chose to formalize a known failure shape as a written artifact instead of patching it.

- **Example (TRT-LLM 2026-07-29)**: #16901 closed without merge, but the body precisely captures: `The allocator selects the NUMA huge-page path whenever a GPU-memory NUMA node exists without checking that mbind(MPOL_BIND) is permitted, so createResources() throws o...`. This is a real production-hazard mapping — operators reading the closed PR learn the exact failure mode and the workaround. The fix code may come in a separate, larger refactor; the closed PR is the post-mortem.
- **How to detect**: PR is `closed` (not merged) + body has the phrase "Root cause" / "root cause:" / "fails because" / "throws on" + the body text describes the failure path in operational terms (not "TODO" or "WIP").
- **Megafic framing**: `**TRT-LLM #16901 (closed with documented root cause)** <one-line failure mode>. *closed = "fix 코드가 아니라 root cause 문서화로 처리." 운영 blueprint가 코드보다 큰 산출물.*` Connect to any open issue that reports the same failure in production (e.g. the same day's #16976 GDN host-bound) — pair them as one megafic.
- **Why it matters**: Most teams leave a rejected PR to rot in the issue tracker. Teams that close with explicit root-cause analysis are signaling operational maturity — the engineer who debugs the next instance will read the closed PR first. Worth a megafic because the team's design *posture* is the signal, not the patch.

## How to detect

When scanning the raw fetcher output, look for these textual signals in the body excerpt:
- "Sibling fix of #X"
- "Follow-up to #X"
- "Reapply #X" / "Reapply of #X"
- "split https://github.com/.../pulls/X"
- "Supersedes #X" / "Replaces #X"
- Same-day author + same body keyword → almost always siblings

When you detect ≥2 of these in the same repo on the same day, consolidate to one megafic. This is a higher-signal frame than N independent list items.

**Codename cross-reference**: when sibling PRs across repos all touch the same hardware target (e.g. "GB300", "B300 SXM6 AC", "sm103", "Blackwell Ultra"), resolve via `compute-capability-gpu-map.md` to confirm they ARE siblings — different vendors/PRs often use different names for the same silicon, and treating them as separate events fragments the megafic.
