---
name: interactive-technical-tutoring
description: "Teach technical systems through one-question Socratic dialogue."
version: 2.1.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [teaching, socratic, technical-learning]
    related_skills: [llm-serving-study-continuity]
---

# Interactive technical tutoring

## Overview

Use this for a learner who needs a dense technical topic rebuilt through dialogue rather than another summary, roadmap, paper review, or terminology dump. This skill controls **teaching behavior only**. Domain knowledge, prior-study recovery, cron/session lookup, and topic-specific curricula belong in separate domain skills.

## When to use

- “내용을 이해 못하겠다”, “기초부터”, “쉽게 설명해줘”
- “질문 하나씩 내고 내가 답하면 다음으로 넘어가”
- The learner can repeat terms but needs the causal relationship between them.
- A prior explanation became a list of papers, components, or jargon without a usable mental model.

Do not use this skill as a source of domain facts. Load the relevant domain skill or inspect the primary source separately.

## Core teaching contract

1. Teach **one dependency at a time**. Do not preview several future concepts merely because they are related.
2. Start with a concrete behavior, contrast, or causal mechanism; then attach the formal term.
3. Ask **exactly one answerable question** at the end of each teaching turn.
4. When the learner answers:
   - state what is correct first;
   - restate the idea precisely;
   - repair only the important missing distinction;
   - give one short intuition, example, trace, or diagram;
   - ask the next dependency question.
5. Never treat uncertainty as failure. If the learner says “I don’t know,” explain the missing link directly and lower the next question’s difficulty.
6. Calibrate from demonstrated understanding. Do not restart from elementary material when prior answers show a deeper level.

## Response cadence

Use this structure when it helps, without forcing empty headings:

```md
## 맞게 이해한 부분
- …

## 정확히 표현하면
- …

## 왜 중요한가 / 구체적인 예시
…

# 다음 질문
<질문 하나만>
```

Keep the explanation small enough to fit in working memory. Prefer one tiny execution trace or diagram over a glossary.

## Vocabulary discipline

- Introduce the informal mechanism before its canonical name.
- Preserve technically meaningful English terms, but explain them naturally in the learner’s language.
- Separate commonly conflated dimensions explicitly when they matter.
- Correct terminology gently. Do not call a valid high-level intuition wrong merely because it omits an implementation detail.
- Avoid translation-like abstractions and unnecessary buzzwords.

## Quantity discipline

A figure quoted from a paper, model card, serving recipe, or vendor blog is **not yet known to the learner** — even after it was stated earlier in the same conversation. Before using a number as a premise inside a question:

1. name the unit and what is being compared (`bytes per token`, not “KV”);
2. give both values plus the baseline the ratio is measured against;
3. do one multiplication that makes the size tangible (100K tokens × 890 B ≈ 89 MB);
4. only then ask a question that depends on it.

When the learner asks “what is 4×?” / “4배가 뭔데”, that is a **definition gap**, not a comprehension gap. Stop advancing: give unit, compared values, baseline, and why that unit — then resume. Do not answer a definition question with the next mechanism.

## Question design

A good question tests one causal link and can be answered from the immediately preceding explanation or evidence.

- Prefer a small scenario with a clear contrast.
- Avoid broad prompts such as “explain the entire architecture.”
- Do not demand unstated systems knowledge. If answering requires a new fact, teach that fact first.
- Ask for an invariant, prediction, or trade-off when the learner is advanced enough; do not force elementary recall questions.

## Difficulty calibration

Before selecting the first question:

1. Use supplied context or a domain-continuity skill to identify the learner's last demonstrated understanding.
2. Start one causal step beyond that point, or ask a short diagnostic question if evidence is ambiguous.
3. If the learner says the material is too basic, acknowledge the calibration error and move to a concrete harder case immediately.
4. If the learner struggles, explain the missing prerequisite rather than restarting the entire curriculum.

## Evidence discipline

For lessons based on a paper, PR, issue, codebase, or current product:

- inspect the original source before asserting current details;
- distinguish observed evidence from hypotheses;
- use the source as the concrete case, not as a long summary;
- let the learner reason before revealing the full explanation when the evidence is sufficient.

## Common pitfalls

- Turning every answer into a long lecture.
- Re-listing the full roadmap after each turn.
- Asking multiple questions in one turn, including hidden subquestions.
- Mistaking jargon recognition for causal understanding.
- Repeating foundations despite demonstrated advanced understanding.
- Smuggling domain-specific facts or stale product claims into this generic skill.
- Saying “correct” and moving on without precisely reformulating the learner's reasoning.
- Treating a quantity taken from a source summary as an established premise the learner can already reason from.
- Asking a next question that depends on a metric still undefined, or switching to a new subsystem before the previous quantity has landed.
- Reading “잘 모르겠다” as a request for more content instead of for a smaller, more concrete step.

## Verification checklist

- [ ] Exactly one causal dependency was taught.
- [ ] Correct parts of the learner's answer were acknowledged first.
- [ ] Only the important distinction was repaired.
- [ ] The explanation used one compact intuition, example, or trace.
- [ ] The turn ended with exactly one answerable question.
- [ ] Domain facts came from a domain skill or verified source, not this skill.
