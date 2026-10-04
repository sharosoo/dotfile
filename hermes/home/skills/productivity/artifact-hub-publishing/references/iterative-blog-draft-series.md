# Iterative technical-blog draft series

Use this when a batch of rough Artifact Hub drafts must later become evidence-backed articles.

## Two distinct completion states

1. **Rough-draft batch complete**
   - Every topic has a deterministic slug and separate Markdown artifact.
   - Each starts with six one-line fields: material, problem, alternatives, trade-off, conclusion, strength.
   - An index records every URL and rendered-content verification.
2. **Concretization complete**
   - Every artifact has a later version grounded in chronology, code paths, tests, history-verified alternatives, rollout state, and claim boundaries.
   - The index tracks `N/total`; do not collapse this into the rough-draft completion checkbox.

## Topic inventory rule

Build the inventory from both sources:

- topics the user explicitly names;
- useful topics the agent discovered while reading repositories, incidents, tests, and Git history.

When the user says “also draft the ones you organized,” preserve the agent-discovered items. Reconcile overlap explicitly rather than replacing the complete inventory with only the most recent pasted list.

## Project scope gate (user correction, 2026-08-06 — reinforced same day)

정혁 keeps **two parallel Artifact Hub projects**. A single index artifact may still *mention* both; that is inventory, not rewrite permission.

| Project | Meaning | Default agent action on sequential deepen |
|---|---|---|
| `blog` | reviewed public English articles | **rewrite allowed** after allow-list + recency checks |
| `blog-draft` | selection inventory / unfinished drafts | **do not rewrite** unless explicitly asked |

### Hard triggers (any one is enough)

- “blog 안에 있는 것들만” / “Project: blog” / “draft는 말고”
- Pasted `blog` search results + “5시간 이상 수정되지 않은 것들”
- Pasted keep-list of only Runtime / Agent Runtime / Context / Evaluation / Durable Execution (“이것들을 건드려야 하고 나머지는 draft”)
- “이어서 / 다음꺼 / 순차적으로” after any of the above was established in-session

### Mandatory preflight (every deepen batch)

1. `list_artifacts(project="blog", limit=100)` → **rewrite allow-list = these IDs only**.
2. If the user pasted a keep-list or index excerpt, intersect titles/IDs with that list. Architecture / Product / ML Serving / payment / CRM rows that live in `blog-draft` are out of scope even if an older full index still numbers them 10–34.
3. Recency (정혁 default): skip items modified within ~5 hours; prefer stale early versions (`v1`/`v2`) on the keep-list.
4. **Never** `update_artifact(..., project="blog-draft")` during a blog deepen run. Opening a draft “to be thorough” is a failure mode that already burned a full batch.
5. Trust live `project` from list/read, not the index section heading. If a reviewed-looking index row’s ID is actually `blog-draft`, skip rewrite and fix index drift instead of deepening the draft.
6. Orphans: IDs in `blog` but outside the user’s keep-list → do not deepen; `move_artifact` to `blog-draft` or archive/delete only when cleanup was requested.
7. After keep-list cleanup, the index should list only live `blog` articles in reviewed sections (renumber if needed). Draft inventory stays out of the reader-facing numbered set unless the user wants a separate draft index.
8. Report completion as “`blog` only; N drafts left untouched; orphans moved/deleted: …”

This gate overrides bare “continue the index in order” and overrides compaction summaries that still say “next draft ID is …”.

### Session anti-pattern already observed

Agent followed mixed index order into `blog-draft` IDs (architecture/payment/ML drafts), updated them with `project=blog-draft`, and only stopped after explicit user correction. Preflight list + hard project filter would have prevented the whole detour.

## Title numbering (user correction, 2026-08-06)

When the reader-facing index uses `1. Title`, `2. Title`, … every matching `blog` article H1/title must use the **same form**:

- Good: `# 10. The Tool Call Was Cheap. Replaying It Wasn’t`
- Bad: `# Part 1 — The Tool Call Was Cheap. Replaying It Wasn’t`
- Bad: bare title without the index number when the series is numbered

Apply across the whole keep-list in one pass when the user asks. Index link text stays `N. [Bare title](url)` — do not double the number inside the markdown link label. Residual body quotes like `Agent Runtime Series — Part 1` are also cleanup targets.

## Three work modes — name them honestly

Never report “살 붙였다 / deepened” for packaging-only work. Label each batch:

| Mode | What you may do | Honest report |
|---|---|---|
| **Hygiene** | `N. Title` H1, Part-label strip, project move, index renumber, warning-0 fixes | “title/metadata hygiene” |
| **Editorial** | Failure opening, section reorder, tables, discarded-alternatives, remove draft Material/Problem headers, externalize internal names | “editorial pass — not evidence deepen” |
| **Evidence deepen** | Repo/git chronology, concrete before/after code, tests re-run this session, alternatives from history, claim boundaries, measured/estimated labels | “evidence-backed version” |

**Editorial is not deepen.** A short failure scene + `Discarded alternatives` + `Design lesson` + series-wide `Generalization beyond…` paste is an editorial template. If the body still lacks dates, code-grounded contracts, tests, or measured outcomes, do not claim flesh was added.

When the user asks “살 어떻게 붙였어?”, answer with this mode table / A·B·C tiers per article — not a single success line.

### Anti-templates (observed session failure)

Strip or replace when they repeat across a series without article-specific evidence:

- identical `## Generalization beyond structured state changes` paragraphs
- identical `## Design lesson` closers that only restate the title
- clone-shaped `## Discarded alternatives` tables unrelated to the article’s failure
- leftover Material/Problem/Alternatives/Trade-off/Conclusion/Strength draft headers in published bodies

### Post-batch tier check

| Tier | Signals | Report / next |
|---|---|---|
| A | chronology, concrete failure, code/tables, tests or measure conditions | maintain; residual hygiene only |
| B | failure opening OK but ~700–900w principle essay + copy-paste sections | **not deepened** — queue for evidence deepen |
| C | correct concept but thin body or public-doc sources only | needs evidence; do not mark complete |

## One-artifact version loop

For each item, in index order:

0. Confirm `project` is inside the user-scoped allow-list (when scoped: only `blog`). Skip otherwise. Apply any recency filter before reading the body.
1. Resolve the exact artifact identity from the persisted publish ledger or `list_artifacts`; never guess an ID from memory. Confirm it with `read_artifact(id)` before checking drafts.
2. Call `get_draft(id)`. Proceed only when it explicitly reports no unpublished draft. Treat `Document not found` as an identity/lookup problem—not as a human draft conflict—and recover the ID from the ledger/list before retrying.
3. Read the current artifact and local source. **Choose mode** (hygiene / editorial / evidence deepen) before writing.
4. For **evidence deepen only**: reconstruct `problem → constraints → previous state → chronology → alternatives → decision → implementation → tests → rollout/failure recovery → result`.
5. Separate code-verified facts, user-confirmed ownership/impact, inferred interpretation, canonical commits, branch-only work, collaborator-authored foundations, and docs-only plans. Preserve unfinished debt and incomplete rollout instead of presenting a falsely clean final architecture.
6. Include only alternatives evidenced by code, Git history, or contemporaneous docs; do not backfill generic industry options as if the team considered them.
7. Re-run selected regression tests in the publishing session **only in evidence-deepen mode**; record exact scope/count. Hygiene/editorial must not claim test proof.
8. Publish the same `(project, slug)` so a new version is appended. H1 must match index numbering when the collection is numbered.
9. If publication returns structural warnings, fix and append a clean version. `empty-section` also fires when a heading is followed only by a table — add one prose sentence before the table.
10. Verify latest source body/version/slug/project and title form `N. …`.
11. Mark the item complete with the **mode name**; update the index only when links/titles/sections changed; name the next item.

## Problem-led evidence article rules

- Show why the initial choice was reasonable before explaining why later constraints broke it; avoid hindsight-only narratives.
- Prefer concrete failure mechanisms—wrong dependency direction, mixed identifier namespaces, unsupported capability calls, partial commits, unknown external outcomes—over generic architecture slogans.
- Treat test passage as regression evidence, not proof of production rollout, incident resolution, or sole ownership.
- Keep chronology and attribution explicit: author/co-author, canonical reachability, collaborator work, branch-only continuation, and user-confirmed ownership are different evidence classes.
- Preserve previous Artifact versions and the local Markdown snapshot so the evolution remains auditable.

## Ownership confirmation

A user's confirmation that all listed topics are their work upgrades ownership to **user-confirmed**. Continue checking author, co-author, canonical reachability, collaborator-authored foundations, and production state. Ownership confirmation does not turn branch-only work into canonical production evidence or make narrow measurements product-wide metrics.

## Plain-Markdown mode

When the user asks to avoid live blocks:

- use headings, paragraphs, lists, tables, blockquotes, and ordinary code fences;
- do not add `html render`, chart, or other live fences for decoration;
- keep task-list text plain because inline code inside Artifact Hub checkboxes can duplicate visually;
- use normal bullets or tables for hashes and paths;
- inspect the actual rendered page for literal Markdown markers and duplicated text.

## Index example

```markdown
> 상태: **초안 구체화 진행 중 — 1/15 완료**

## 구체화 진행

- **완료:** 1번 — canonical history, alternatives, tests, claim boundary 반영; v6
- **다음:** 2번 — history reconstruction in progress
- **대기:** 3~15번 — sequential version updates
```

Keep the Discord response short: completed item, version, what became concrete, verification result, index link, and the next item already in progress.
