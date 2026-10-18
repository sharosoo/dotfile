---
name: product-design-research
description: "Use when researching and iterating a product design doc."
version: 1.0.0
metadata:
  hermes:
    tags: [design, research, architecture, artifact-hub, requirements]
    related_skills: [artifact-hub-publishing, coding-agent-orchestration, youtube-content]
---

# Product Design Research (multi-turn design doc)

Class: a raw requirements dump from 정혁 (often typo-heavy Korean, with blank placeholders and links) becomes a researched, versioned design document that he keeps steering for many turns. Publishing mechanics live in `artifact-hub-publishing`; this skill is the research-and-iteration loop around it.

## Procedure

1. **Parse the brief before researching.** List every requirement, every unfilled placeholder ("작품편집에 필요한 ㅇㅇ"), every named tool/link, and every constraint (serverless, specific vendors, who the users are). Do not invent meaning for a blank. Put it in the open-questions table and say so.
2. **Research on three axes in parallel batches** (`execute_code` with `web_search`/`web_extract`, printing only trimmed titles/descriptions, then extracting the few pages that matter with a `char_limit`):
   - practitioner pipelines and advice: studio write-ups, trade-body articles, lectures, academic summaries, the user's own video (`youtube-content` transcript);
   - existing products and the nearest local competitor (search in the user's language too, not only English);
   - enabling OSS and components: file-format parsers, editors, sync engines, agent harnesses. Record license, maturity signal, and what was actually read.
   Read the page, not only the search snippet. Keep at most two batches per turn, then reply: the user steers mid-run and long silent chains get interrupted.
3. **Label every claim**: confirmed on a page, inferred, or not checked. Give "확인하지 못한 것" its own list in the doc and in the chat reply. Never fill a gap (no public API found, product not recognized) with a plausible guess.
4. **Write the doc as section files** under `~/workspaces/.scratch/<topic>/`, assemble with Python, run `artifact-hub-publishing/scripts/preflight_ko_markdown.py`, publish one private artifact, and reuse the same `(project, slug)` for every later revision. Skeleton: `references/design-doc-skeleton.md`. Stack facts for collaborative-editor products (block editor, Notion-like version history, local-first sync, generated UI blocks): `references/collaborative-editor-stack.md`.
5. **Iterate by patching the assembled body** with `assert old in s` string replacements (a silent no-op replace hides a stale term), re-run preflight, publish a new version, read back, compare length in characters.
6. **Reply in chat short**: link, what changed, what could not be verified, only the decisions that change the doc. Match the user's register (반말, English terms mixed).

## Standing rules for this user

- **Do not anchor the design on one reference tool.** A named product is an input to survey, not the template. When he says a reference need not be followed fully, broaden to pipelines, advice, and several competitors, then pick features individually.
- **Fragments after a placeholder are ambiguous.** If "X ㅇㅇ" answers a blank, state your reading in one line; when he corrects it, re-derive the scope from his words instead of defending the first reading.
- **A runtime or vendor he names replaces your default everywhere.** After the correction, grep the whole body (diagram, premise table, phases, questions, sources) for the old terms before publishing. Keep his exclusions (e.g. a vendor's AI services) as a row in the premises table.
- **Lead with intent and user scenarios, not implementation.** When he asks the doc to centre on his intent and the scenarios he imagines, put a numbered intent-and-scenario section first: intent and non-goals, a pain → desired-state table, the people involved (author, reviewer, assistant, agent), 10+ short narrative scenarios (today's pain, the moment inside the product, the felt success criterion), then principles. Mark everything technical as 구현 참고 and move it after that section; keep tech choices out of the opening conclusion. Write scenarios from his own stated pains and requirements, call them a draft he should correct, and end the section with the assumptions you made.
- **Separate projects stay separate but connected.** When he splits work into sibling projects, give each its own section and timeline, and define one contract between them and the platform (what is recorded, who owns the record, how tools are called) instead of merging them.
- **Side questions mid-flow get a direct, researched answer in chat** (classify options, state what was verified) and no doc rewrite until he decides. Ask for a decision only when it changes the structure of the doc.
- **Serverless-first with honest exceptions.** When something cannot run serverless (a desktop 3D tool, a process-based agent harness), say it is an exception and give the bridging pattern rather than hiding it.

## Pitfalls

- Reading a single search snippet as evidence: snippets truncate and mix pages. Extract the page before citing a number or capability.
- Treating a third-party GitHub rule set as an industry standard. Cite it as an initial heuristic and say it needs testing on his own material.
- Wrong section order after reassembly: check heading order with `grep -n '^#'` after splicing files, because spliced section files keep their old numbers.
- A replacement loop that asserts every old string aborts at the first miss and, if the write comes last, loses all earlier replacements. Build every edit on an in-memory copy, fix the failing pattern (trailing table pipes and punctuation are the usual mismatch), and rerun the whole list before writing once.
- Cross-references by section number go stale when sections are inserted; grep `[0-9]절` after every structural edit.
