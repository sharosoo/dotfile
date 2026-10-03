---
description: >-
  Comment discipline and Korean copy discipline. Code comments we write are English
  and explain why, not what. Korean text a person reads is composed by the
  naturalizer from the intent — never by polishing a model's first draft.
alwaysApply: true
---

# Comments

- **Write code comments in English.** One file, one comment language; do not mix. Existing Korean comments in untouched code stay as they are — do not mass-translate.
- **Only write a comment that survives the "so what" test.** It must say *why*, or record a constraint, a hazard, or a decision that the code cannot show. If a reader could infer it from the line below, delete it.
  - Delete: `/** 한 자 칠 때마다 요청을 보내지 않도록 기다리는 시간. */` above `const DEBOUNCE_MS = 300;` — the name already says it.
  - Keep: `// team has no fixed-quota policy; members are provisioned with the plus entitlement.`
- No decorative section banners, no restating the function signature, no "// 상태 이름별 색" above a colour map.

# Korean that a person reads

This includes UI copy, i18n values, debug/admin labels, QA notes, commit messages, PR bodies, and docs.

**Do not naturalize your own Korean draft.** Polishing a machine-written sentence keeps its machine-written shape — the result is still off, just smoother. Instead:

1. Write the *intent* in English (or as a spec): what this string means, who reads it, what they should do next, any number or term that must appear.
2. Spawn the `naturalizer` agent (`task`, agent `naturalizer`) and ask it to **compose the Korean from that intent**, stating plainly that there is no Korean source text to preserve. Give it register, audience, domain, and a glossary of identifiers/UI strings to keep verbatim.
3. Verify the result says what you meant, then use it. If it drifted, send back the discrepancy.

Batch every string from one task into a single call.

## Register

Write it the way the product's own copy talks, not the way an engineer describes the implementation.

- Bad (engineer-facing internals leaking into copy): `일일·주간 막대를 다 그린다. 아래에는 floor 안내만 붙는다.`
- Good (says what the person sees): `일일·주간 사용량을 모두 보여주고, 최소 보장 크레딧 안내를 함께 표시합니다.`

Never leak internal identifiers (`showDailyUsage`, `weeklyBlocked`, `floor`, `snapshot`) into text a person reads — unless the surface is an internal debug tool and the identifier is exactly what the reader is there to inspect.
