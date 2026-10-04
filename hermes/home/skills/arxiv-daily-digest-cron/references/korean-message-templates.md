# Korean Message Templates for the Daily Digest

The Korean 1-2 sentence summary is the core deliverable. The user (정혁) wants:
- **Mechanism first** — what the paper does, then why it matters
- **12-year-old analogy tone** — concrete metaphors when the system concept is the point
- **System-level only** — no "TAKT/LLaMA-3/5090" application framing
- **Why hot in the same breath** — don't separate "what" and "why" into two sentences

These templates are from the 2026-07-25 run and a few prior runs. Use them as scaffolds; adapt the specific mechanism to each paper.

## Template A: The "the model has X, but X turns out to be the bottleneck" framing

Use when a paper reveals that a previously-assumed-cheap primitive is actually expensive in a new regime.

```
[기존 가정]이/가 [새 조건]에서 [왜 깨지는지] — [해결 트릭]. [검증/측정 결과].
"이건 [X]가 언제 의미 있는지"의 경계가 [무엇]이라는 걸 보여주는 얘기.
```

Worked example (Windowed-MTP):
> 추측 디코딩(빠른 초안이 먼저 토큰 던지고 큰 모델이 검증)이 1M 토큰짜리 초장문 컨텍스트에서는 self-defeating이 돼버림 — 초안 모델이 매 step마다 KV cache 풀스캔하니까, 큰 모델이 진짜 답 정하는 비용보다 초안 읽기 비용이 더 커져서 speculation이 오히려 손해가 됨. 초안 attention에만 sliding window + attention sink를 씌워서 draft 쪽 KV 작업셋을 상수 크기로 묶어버리는 트릭이고, 검증 쪽은 full-attention 그대로라 정확도는 안 깨짐. SGLang에서 Qwen GDN-MoE·Mamba2-hybrid로 1M 컨텍스트 측정 시 decode step 비용을 28–44% 깎음 — "speculative decoding이 언제 net-positive인가"의 경계가 결국 KV working set이라는 걸 보여주는 얘기.

## Template B: The "here is the minimum memory shape" framing

Use when a paper proves a lower bound or derives the memory-optimal layout for a primitive.

```
[primitive]을 [수학적 formalism]으로 다시 쓰면, [어떤 buffer/operation]이 [왜 redundant]이고 [최소 shape]이 [어떤 복잡도]라는 게 [증명 가능/수치 검증]. 
[응용: GQA/MQA 같은 reduction]까지 같은 formalism으로 도출해서 [traffic이/메모리가] [N×] 줄어드는 걸 [수학적으로 보장/실험으로 확인].
[측정: X% / X× / exact]. 
[framing: "어디에 쓰이나"가 아니라 "왜 이 형태가 최적인가"로 미는 페이퍼].
```

Worked example (MoA-Structured):
> transformer decode step을 "Mathematics of Arrays"라는 형식적 표기로 다시 쓰면, attention 안의 Kᵀ 버퍼가 대수적으로 사라지고 KV cache append가 step당 O(d_k+d_v)만 필요하다는 게 증명 가능하다는 작업. 거기서 GQA·MQA까지 같은 formalism으로 도출해서 KV traffic이 h_q/h_kv배로 줄어드는 걸 수학적으로 보장하고, OpenACC GPU 커널은 IEEE-754 완전 정확. attention 구현을 "PyTorch 결과 맞나"가 아니라 "왜 이 형태가 메모리 최적인가"로 미는 페이퍼라, system-level에서 attention kernel의 minimum-traffic shape을 다시 잡아주는 신호.

## Template C: The "the old fixed-primitive becomes adaptive" framing

Use when a paper replaces a hardcoded assumption (fixed length, fixed window, fixed batch) with a learned or signal-driven version.

```
[기존 방식: 고정 X]가 [새로 발견한 문제] 때문에 [tail latency / variance / worst case]를 만듦. 
[새 방식]은 [signal A] 기반으로 [adapts X], [이론적/실험적 결과]. 
serving 입장에서는 "X는 고정이다"라는 [기존 시스템의 가정]이 [문제가 되는 지점]이라는 [insight].
```

Worked example (AdaFlash):
> diffusion 모델을 drafter로 쓰는 speculative decoding(DFlash 계열)에는 양방향 attention이 "병렬 생성 + 전역 문맥"을 동시에 주지만, 그게 곧 도메인별·토큰별 acceptance 분산 폭발로 직결되는 약점이 있음. AdaFlash는 on-policy reverse-KL distillation로 draft 분산을 안정시키고, adaptive length head로 "지금 몇 토큰 뽑을지"를 acceptance 신호 기반으로 가변 조절함. serving 입장에서는 "draft 길이는 고정이다"라는 DFlash 초기 가정 자체가 tail latency를 만든다는 문제에 정확히 꽂히는 방향.

## Template D: The "new threat to a serving primitive" framing

Use for cs.CR papers that expose a structural weakness in a serving primitive.

```
[serving primitive 최적화]가 [도입되는 맥락: e.g. throughput, cache hit rate]에서 [위협: e.g. hijack, leak]이라는 attack surface를 연다는 연구. 
[공격 메커니즘 한 줄]. 
serving 입장에서 [primitive]는 [throughput / latency / efficiency] 핵심 primitive인데, [structural 약점: e.g. stateless text matching]을 [insight: fix는 system-level].
```

Worked example (HijackKV):
> prefix를 정확히 맞추지 않아도 같은 텍스트 청크면 KV cache를 재사용하는 position-independent KV cache 최적화가 최근 시스템들에서 도입되는데, 그게 정확히 "공격자가 만든 prefix가 benign한 청크의 KV 안에 은닉 → 다음에 그 청크가 reuse될 때 모델이 조용히 hijack"이라는 attack surface를 연다는 연구. "공격 텍스트가 prompt에 아예 없는데 모델이 공격자 의도대로 행동한다"가 point. serving 입장에서 KV reuse는 throughput 핵심 primitive인데, 그 primitive가 stateless 텍스트 매칭에 의존한다는 structural 약점을 짚어줘서 system-relevant.

## Anti-patterns

❌ "LLaMA-3에 적용하면", "TAKT에 쓰면", "5090에서 돌리면" — application framing, never include.
❌ "이 논문은 [domain]에서 중요한贡献을 했다" — generic praise, no mechanism.
❌ "실험 결과 SOTA를 달성했다" — accuracy claim without system meaning.
❌ Three sentences instead of two — if you can't say it in two, the framing is wrong.
❌ "흥미로운 연구" / "주목할 만한" / "가치가 있다" — filler adjectives.
❌ Starting the Korean sentence with the title in English — the title is already in the block header.
❌ Repeating the title's keyword as the first Korean word — "KV cache는 ..." right after the title already says "KV cache".

## The opening words that work

When the summary needs to start with a noun phrase, use:
- "[X]이/가 [상황]에서 [문제가 됨] — [이유]." (mechanism → problem)
- "[X]을/를 [수단]으로 [동사]." (paper action)
- "[X]가 [Y]라는 [구조적 약점/가정]을 [동사]는 [연구/작업/제안]." (paper reveals flaw)

When the summary needs to start with a verb:
- "[동사] [목적어]을 [방법]으로 [수식어]." (verb-led)
- "[동사] [X]을 [Y]로 [동사]." (paired verbs, A → B)

Avoid: "이 논문은", "이 연구는", "이 작업은", "저자들은". These are thesis-defense English, not how engineers talk.

## Length discipline

The summary is **2 sentences**, period. If your draft is 3, the third is almost always either:
- A numbers claim that can be folded into sentence 1 ("X% speedup at Y context" → "...이 X% 줄임")
- A "why this matters" claim that can be folded into sentence 2
- An application framing that should be cut

If still too long, the analogical framing is what's overrunning — cut the analogy, keep the mechanism. The user is reading this at 9 AM, the analogy is a bonus not the main course.
