---
name: korean-technical-blog-rewriting
description: "Use when rewriting technical drafts as natural Korean prose."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [korean, technical-writing, localization, developer-blog, evidence-ledger, editing]
    related_skills: [engineering-blog-writing, technical-document-localization, humanizer]
---

# Korean technical blog rewriting

Use this skill when a user asks to rewrite one or more public technical drafts into natural Korean developer-blog prose while preserving source facts, judgments, numbers, structure, or evidence boundaries.

The target is not a sentence-by-sentence translation. It is a faithful editorial rewrite: the Korean should sound as if an engineer wrote it for other engineers, while the technical claims remain traceable to the source.

## Core contract

- Preserve factual claims, core judgments, technical constraints, numeric values, units, and measurement scope.
- Keep evidence ledgers and other source-of-truth files read-only. Modify only the explicitly requested public files.
- Remove AI-sounding filler, translationese, promotional inflation, and audit-report narration without weakening a technical qualification.
- Do not expose internal paths, branch or commit metadata, private attribution, audit metadata, or unverified-item lists in public prose.
- Do not turn a limited test result into a production claim. Keep qualifiers such as selected tests, measured-at-the-time, or not-a-full-suite when they are part of the evidence boundary.

## Workflow

### 1. Inventory before editing

For every public draft:

1. Resolve the exact public file path.
2. Check whether a same-basename `-evidence-ledger.md` exists.
3. If it exists, read it before editing and treat it as immutable.
4. Read the entire public draft before changing any section.
5. Record the public file list so no ledger, index, checklist, or rough draft is edited accidentally.

A ledger is evidence, not a second output target. Never overwrite it, rename it, or “clean it up” as part of the prose pass.

### 2. Build a fact spine

Before rewriting, extract a compact fact spine for each article:

- the operational problem and its trigger;
- why the original design was reasonable at first;
- the failure mode or semantic loss;
- the core design decision and its alternatives;
- data flow, ownership, lifecycle, concurrency, and failure boundaries;
- tests, measurements, counts, units, and scope limitations;
- the final judgment and where the design should not be generalized.

Keep exact numeric anchors. Distinguish a measured value from an estimate, an expected effect, and a limited regression result. If the ledger provides a number that sharpens the public draft, include it only with its evidence scope.

### 3. Rewrite as Korean engineering narrative

Prefer this order unless the source requires another one:

1. A short background paragraph that names the system and why the problem matters. If requested, open naturally with `안녕하세요`, not with a generic summary heading.
2. The moment the existing design stopped being sufficient.
3. The original design's legitimate strengths and the new constraint.
4. The decision, with the rejected alternatives and their costs.
5. The implementation boundary: data structures, ownership, state transitions, retries, idempotency, and rollout behavior.
6. Verification and measured results.
7. A closing judgment that states what was learned and where the approach does not apply.

Use explicit actors and direct predicates. Vary sentence length. Prefer concrete verbs such as `기록했다`, `차단했다`, `분리했다`, and `확인했다` over abstract chains of `~을 통해`, `~을 제공한다`, and `~을 수행한다`.

Preserve established technical tokens when translating them would reduce precision: `Provider`, `Transport`, `UseCase`, `Adapter`, `state machine`, `idempotency`, `fencing`, and similar terms may remain in English. Explain them through the surrounding Korean sentence rather than cycling through synonyms.

### 4. Remove the right kinds of artificial prose

Delete or rewrite:

- significance inflation and generic claims about importance;
- promotional adjectives and “best practice” conclusions without evidence;
- repetitive signposting such as “이제 살펴보겠습니다”;
- translationese nominalizations and subjectless fragments;
- mechanical rule-of-three lists and synonym cycling;
- report-like sections that only announce “results” or “challenges”;
- internal audit narration that belongs in the ledger, not the public article;
- **outline / taxonomy meta** (study-guide speak). For 정혁 technical notes:
  - hard ban: `두 갈래`, `N갈래`, `다섯 가지 축`, `N가지 핵심`, `구조 축`, `핵심 축`;
  - bare Korean `축` meaning architectural/math axis → English `axis` / `token axis` / `depth axis` / `channel axis` (do not “fix” by swapping in `줄기`/`쪽`);
  - same role under other skins also purge: overused `줄기`, plot-word `줄거리`, mechanical `~쪽이다` / `쪽으로 간다` branch lists, empty “N patterns are…” frames;
- **English-calque report voice**: `포인트는`, `취지다`, `관찰이다`, `로 읽으면 된다`, `뉘앙스다`, `처방이다`, `초입이다`, `동선으로 읽힌다`, `전장`, `본선`, bare template `남기는 말` with no judgment;
- **raw ASR transcript walls** (`[00:00] …` filler dumps) as the article body. Talk sources → refine into readable Korean first; sparse timestamps only for navigation. Full YouTube+Artifact pipeline: `youtube-full-transcript-localization`.

**Audit before rewrite (정혁):** when user asks korean-review / 번역투 조사 first — inventory awkward phrases in a table (location · phrase · why · direction), then rewrite only after OK. Audience: LLM-familiar backend engineers; flesh out mechanisms in plain Korean; no forced backend-product metaphors. Catalog: `references/translationese-audit-catalog.md`.

**발표 정리 / talk-artifact rewrite (정혁 2026-08-10):** when the user asks to apply the Korean review skill to a talk-transcript Artifact ("한국어 리뷰 스킬써서 정리해줘"):

- Deliver the awkward-phrase inventory table (location · phrase · why · direction) in the reply even when the request was the rewrite itself, not a pure audit — the table is part of the expected delivery.
- Remove the production-metadata layer: caption provider, segment counts, sourcing meta-table rows, "재구성한 정리본입니다" notes. Keep only the speaker and source link.
- When the user says 하나의 완전한 문서 / 영어 원문 전사도 필요없음, drop the English-original appendix wholesale and deliver one standalone article — never a bilingual pair.
- Replace governance-style Korean `축` with `영역` (hard ban family) and retitle the H1 as a problem sentence.
- Enrich with official vendor references: `curl -sSL -o` the mentioned PDF, extract with `import pymupdf` (the `fitz` alias is deprecated; `file` reporting "0 page(s)" on a valid PDF is a false alarm — trust pymupdf's page count), read the extracted text, then fold concrete claims (token budgets, structure rules, test areas) into the body and close with a `## 참고자료` list.

Do not remove a technical caveat merely because it makes the prose less punchy. A sentence such as “선별 테스트 26개가 통과했지만 전체 suite나 production 성능을 뜻하지 않는다” is part of the factual contract.

### 5. Preserve document mechanics

For Markdown:

- keep one clear H1 per article;
- preserve code blocks, tables, identifiers, units, and technical examples unless the user explicitly asks to change them;
- keep code fence pairs balanced;
- do not add unrelated UI, navigation, or generated metadata;
- keep headings in natural Korean sentence style rather than title-case English.

### 6. Verify before reporting

Run a mechanical pass over the public outputs:

- every requested public file exists;
- every same-basename ledger still exists and was not targeted for writing;
- each public file has exactly one H1;
- code fences are balanced;
- numeric anchors and test counts from the fact spine remain present;
- internal path, branch, commit, attribution, audit metadata, and unverified-list terms are absent unless they are genuine technical concepts such as `DB commit`;
- the first paragraph, H1, and final paragraph are easy to extract.

Then do a prose pass aloud or sentence by sentence. Check particles after English technical terms, duplicated subjects, awkward Korean-English clause order, and accidental shifts in who owns a state or action.

Report a table with one row per article and these columns:

| 글 | H1 | 첫 문장 또는 첫 실질 문장 | 마무리 문단 |
|---|---|---|---|
| ... | ... | ... | ... |

If the first sentence is only a requested greeting, report the first substantive sentence instead and label the choice clearly.

For the compact inventory, anchor, public-surface, and Markdown audit, see `references/public-draft-ledger-audit.md`.

## Pitfalls

- **Editing the ledger:** read it first, then leave it byte-for-byte untouched.
- **Inventing public metrics:** never fill a missing number with a plausible estimate.
- **Flattening evidence scope:** a selected test count is not a full-suite or production claim.
- **Over-localizing technical terms:** keep the canonical token when it carries contract meaning.
- **Replacing one artificial style with another:** natural Korean does not require removing every English term or forcing casual slang.
- **Changing ownership while polishing prose:** preserve who chooses, claims, stores, retries, reconciles, or authorizes each action.
- **Summarizing only the title:** the final report must expose the opening and closing prose so the rewrite can be reviewed quickly.
- **Translationese question-form H1 titles.** `Agent가 제품의 인터페이스가 되면, feature는 어디로 가는가` — abstract noun (`인터페이스가 되면`) + literal question ending (`어디로 가는가`) — reads as machine translation; 정혁 rejected it as "이게 무슨 한국어야". Fix: concrete subject-verb (`에이전트가 제품의 화면을 대신하면`) + natural question ending (`기능은 어디로 이동할까`). After any title change, re-check the opening paragraph: if the intro echoes the same question as the new H1, rephrase it (`...는 어떤 형태로 살아남을까`) so the article does not open by repeating its own title. Observed 2026-08-10 on the skill-centric products article (H1 change v9→v10).

## Completion checklist

- [ ] Same-basename evidence ledgers were checked before editing.
- [ ] Only public files were modified.
- [ ] Facts, judgments, numbers, and evidence qualifications were preserved.
- [ ] The prose reads like Korean engineering writing rather than translation or an audit report.
- [ ] Internal metadata and unverified claims are absent from public outputs.
- [ ] H1, code fences, numeric anchors, and requested summary table were verified.
