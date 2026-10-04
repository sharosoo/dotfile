# Public draft and evidence-ledger audit

Use this checklist after a multi-file rewrite.

## Inventory

- List only the requested public files.
- For each public basename, check for `<basename>-evidence-ledger.md`.
- Record that each ledger exists before editing.
- Do not include indexes, checklists, rough drafts, or ledgers in the write set.

## Fact preservation

Build a per-file anchor list before writing:

- problem statement and trigger;
- original design benefit;
- failure mode;
- selected design and rejected alternatives;
- ownership, identity, retry, ordering, and state-transition rules;
- every exact count, unit, percentage, duration, and measured value;
- test scope and explicit non-claims.

A useful wording pattern is: “선별한 테스트 N개가 통과했다. 이는 해당 계약에 대한 제한된 regression evidence이며 전체 suite나 production 성능을 뜻하지 않는다.” Adjust the nouns and number to the evidence; never fabricate the number.

## Public-surface filter

Before delivery, search public files for:

- internal filesystem paths;
- branch names, commit identifiers, private attribution;
- audit metadata and unverified-item lists;
- claims that turn a limited test or snapshot into a production result.

Do not remove genuine technical terms mechanically. `DB commit`, for example, is a domain operation rather than repository metadata.

## Markdown checks

For every public file verify:

- exactly one H1;
- balanced fenced code blocks;
- tables and code examples remain readable;
- technical identifiers and numeric anchors remain present;
- the first substantive paragraph and final paragraph can be extracted for the report table.

If the opening is `안녕하세요.` followed by the actual context, report the first substantive sentence rather than making all rows of the summary table identical.

## Final report

Report:

1. the public files changed;
2. confirmation that existing ledgers were not overwritten;
3. the structural and anchor checks performed;
4. a table with H1, first substantive sentence, and closing paragraph for every article.
