---
name: naturalize
description: >-
  Rewrite non-English text (Korean, Japanese, Chinese, Arabic, Vietnamese, Hindi, …) so
  it reads as a native speaker actually wrote it, removing translationese — the stilted,
  English-shaped phrasing LLMs produce even when every token is grammatical. This is a
  separate POLISH pass over already-generated text. Use it WHENEVER you are about to emit,
  or have just emitted, more than a sentence or two of non-English prose: chat replies,
  commit messages, PR descriptions, READMEs, docs, code comments, user-facing strings, or
  a translation. Trigger it even if the text "looks fine" — translationese is subtle and
  accumulates. Do NOT use it for English output or for code itself.
when_to_use: |
  - You generated Korean / Japanese / Chinese / Arabic / Vietnamese / Hindi / other
    non-English prose and want it to sound native, not translated.
  - A user says the output "reads awkwardly", "feels translated", or "isn't natural".
  - You are localizing UI strings, docs, or messages into a target language.
  - Do NOT use for: English text, pure code, single short phrases, or proper-noun lookups.
---

# Naturalize: remove translationese (a polish pass)

LLMs build sentences on an English skeleton and render the surface in the target
language. The tokens are valid; the *rhythm* is foreign. This skill is the **second
stage** of a generate→polish pipeline. The main agent generates content; this skill (run
as a separate task, ideally a subagent) rewrites it to native quality and hands back a
**change log** the main agent verifies.

## Two principles that make this work (no training required)

1. **It's a separate rewrite task, not a "write naturally" instruction.** Telling a
   model "write more naturally" does not reliably reduce translationese and can worsen
   it; reframing the job as "rewrite this as a native speaker would" does. So this runs
   as its own pass/turn, not as a line in the generator's prompt.
2. **Regenerate, don't patch.** Editing only the awkward spans leaves "post-editese" —
   the text keeps its foreign shape. Re-express the meaning from scratch in the target
   language. Re-say it; don't touch it up.

## Inputs — context the caller should pass

Naturalization is only as good as the context. The main agent should hand over a context
block with the text. If a field is missing, **infer it and state your assumption in one
line** before rewriting.

- **target_language** — e.g. ko, ja, zh, ar, vi, hi.
- **text_type** — commit message / README / chat reply / UI string / marketing / docs / …
- **register (문체/口吻)** — formal vs casual, honorific level, written vs spoken.
- **audience** — who reads this.
- **domain** — dev-docs / legal / medical / marketing / casual …
- **glossary** — fixed term renderings and idiom mappings; terms to KEEP in English.
  (This is what blocks literal calques like rendering "break the ice" word-for-word.)
- **channel** — text vs voice/TTS (voice needs simpler syntax, no bullets/markdown).
- **constraints** — anything else (length cap, must-keep phrases, tone).

## Procedure

1. **Work in the target language.** Do your reasoning and rewriting in the target
   language, not in English — this activates the right linguistic patterns. Adopt the
   role of a native-level writer/editor for that language.
2. **Load the symptom reference** for the language from `references/<language>.md`
   (routing table below). Read it before rewriting. If none exists, use the
   "Language-agnostic symptoms" fallback.
3. **Apply the context block** (register, domain, glossary, audience, channel). Honor the
   glossary exactly. If context was missing, state your one-line assumption.
4. **Rewrite — regenerate, do not patch.** Produce a fresh version that preserves the
   meaning and intent but is composed as a native speaker would from scratch. Match the
   register. Add nothing, drop nothing semantically.
5. **Self-check against the checklist.** Go through each symptom in the reference and
   name any that remain — specifically ("3 unnecessary subjects in sentence 2", not
   "could be more natural").
6. **Iterate with named feedback (≤3 passes).** If a symptom remains, rewrite again and
   state *which* symptom this pass removes. Vague self-refinement degrades quality;
   symptom-named loops improve it. If two drafts oscillate (a fix reintroduces a
   different symptom), name the oscillation and pick the version with fewer total
   symptoms. Stop when the checklist is clean or after 3 passes.
7. **Emit the result + change log** (see output contract). Do not silently alter meaning.

## Output contract (strict handoff)

Return exactly two parts so the caller can verify fidelity:

1. **NATURALIZED TEXT** — the final text only.
2. **CHANGE LOG** — a short list of what changed and, critically, anything that could
   affect meaning. Include:
   - symptoms removed (e.g. "removed 2 subject-pronoun calques; converted passive→active"),
   - any phrase **condensed, merged, or dropped** and why,
   - any term kept in English / mapped via glossary,
   - any **assumption** made about missing context,
   - **MEANING-AFFECTING?** — explicitly flag yes/no for each non-cosmetic change.
   If the input was already native-quality, say so and return it unchanged with an empty
   change log.

The change log is not optional. It is what the main agent audits.

## Caller's responsibility (the verification loop)

The main agent that delegated the text MUST, on receiving the result:
1. **Compare meaning** between its original text and the NATURALIZED TEXT, using the
   CHANGE LOG to focus on flagged items.
2. **Reject on mismatch.** If any information was dropped, added, distorted, or a
   constraint/glossary term was violated, send it back with the *specific* discrepancy
   ("the second sentence dropped the deadline; keep it") — do not accept-and-fix silently.
3. The subagent then re-runs the rewrite honoring the correction. This outer loop
   protects meaning; the inner symptom loop protects naturalness.
Only surface the text to the user after fidelity passes.

## Language-agnostic symptoms (fallback)

Use the per-language reference when it exists. Generic tells:
- subject/pronoun overuse (target drops what English forces);
- literal connectives & prepositions ("in the case of", "through", "with respect to");
- passive overuse carried from English;
- nominalization stacking (noun-heavy "X of Y of Z" instead of verbs);
- calqued idioms (figurative English → literal target words);
- punctuation/connector habits foreign to the target;
- long English-shaped clauses a native writer would break or reorder.

## Hard rules

- Never "make it natural" by adjective instruction alone — always run rewrite + checklist.
- Never patch only the awkward spans; regenerate the passage.
- Never change meaning, add claims, or drop information to make it flow — and if a
  rewrite forces a meaning-affecting choice, FLAG it in the change log.
- Never switch register or honorific level unless asked.
- If the text is already native-quality, return it unchanged.

## Reference routing

| target_language | file                       |
| --------------- | -------------------------- |
| ko (Korean)     | `references/korean.md`     |
| ja (Japanese)   | `references/japanese.md`   |
| zh (Chinese)    | `references/chinese.md`    |
| ar (Arabic)     | `references/arabic.md`     |
| vi (Vietnamese) | `references/vietnamese.md` |
| hi (Hindi)      | `references/hindi.md`      |
| other           | language-agnostic fallback above |

Read only the one matching the target language. Add a language by dropping in a new
`references/<lang>.md` — no other change needed.
