---
name: no-ai-slop
description: Flag AI-slop phrases that edits introduce — comment-checker as a triggered rule
condition: 'TODO:|FIXME|XXX|HACK|as (required|above|below)|simply |just (do|need to)|etc\.|rest of (the )?implementation|placeholder'
globs:
  - "**/*.ts"
  - "**/*.tsx"
  - "**/*.js"
  - "**/*.jsx"
  - "**/*.py"
  - "**/*.go"
  - "**/*.rs"
  - "**/*.java"
  - "**/*.c"
  - "**/*.cpp"
---
# No AI slop (triggered on edit/write streams)

This is a TTSR rule: it fires only when an edit or write introduces text
matching the `condition` regex into a file under `globs`. When it fires, treat
the match as a defect to remove, not a note to keep.

## What counts as slop

- Placeholder markers left in shipped code: `TODO:`, `FIXME`, `XXX`, `HACK`.
- Vague references: "as required", "as above", "as below", "etc." where the
  reader still has to guess.
- Filler that adds no information: "simply", "just do", "rest of the
  implementation", "placeholder".

## When it fires

Rewrite or remove the matched phrase. A comment should carry a fact, a
decision, or a reason — not a shrug. If the code is genuinely incomplete, say
*what* is missing and *why*, not `TODO`.
