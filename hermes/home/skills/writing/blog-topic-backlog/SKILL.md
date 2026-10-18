---
name: blog-topic-backlog
description: "Use when a blog topic is thrown or recalled."
version: 1.0.0
metadata:
  hermes:
    tags: [blog, backlog, topics, artifact-hub, discussion-archive]
---

# Blog topic backlog

정혁 throws blog topics one at a time and later asks "뭐쓰기로햇지?" (what did we decide to write?). This skill is the capture, refine, archive, and recall loop. Writing the post itself belongs to `engineering-blog-writing`; publishing belongs to `artifact-hub-publishing`.

## Where things live

- Local backlog: `~/workspaces/blog/topics.md`. One `### N. Title (date)` block per topic with bullets for the Artifact Hub link, the current recommended title, the thesis, the situation, the evidence, and the status. Create the file if it is missing.
- Discussion archive: one private Artifact Hub document per topic, project `blog-topics`, slug `blog-topic-NN-<english-slug>`, tags `blog-topic` plus the domain. Keep it out of `blog` and `blog-draft`, because the deepen workflows treat those projects as allow-lists.
- A short pointer to `topics.md` stays in memory so recall works in any session.

## Recall

On "뭐쓰기로햇지?" read `topics.md` and answer with the numbered list: title, one-line thesis, status, Artifact Hub link. Do not rely on memory text alone.

## Capture loop for a new topic

1. Append the block to `topics.md` immediately, before discussing, so nothing is lost if the thread ends.
2. Propose title candidates and an outline in the same reply when asked, and mark one as the recommendation with a one-clause reason.
3. Treat every user correction as a thesis rewrite, not an addition. Restate the corrected thesis in one sentence, rewrite the `topics.md` block in place (do not append "UPDATE"), and drop the superseded framing from the outline. The first reading of a topic is often a different point than the one the user means; the user's stated "what matters" bullets override your inferred center of gravity.
4. When the user says the topic lives in a repo on this machine, search it before the next reply (`grep -rIl` the feature keywords under the source dirs, then read the entry points and the docs folder) and report concrete file paths as evidence. Distinguish merged code from unmerged branches, because a public post cannot rely on code that is not shipped.
5. Keep the reply short: thesis, structure, evidence found, open questions, then ask for the next input.

## Archive to Artifact Hub ("전체 컨텍스트를 하나도 빠짐없이 담아")

Build one Markdown body in this order: one-paragraph purpose, blockquote with the one-line thesis, the origin of the topic in the user's own claims, a correction table (what was misread, what the user fixed, what changed), the user's explanations grouped by theme without dropping any claim, the final thesis with a mermaid diagram, repo evidence tables with paths, every title candidate grouped by round with the current recommendation, the outline, evidence still missing, writing constraints, and current status. Then:

1. Write the body to a scratch file and run `scripts/preflight_ko_markdown.py` from `artifact-hub-publishing` until it reports zero warnings. Put an intro sentence under every H2 and avoid colons in headings and bullet labels.
2. Search `list_artifacts` for the title first to avoid a duplicate.
3. Publish with `visibility: private` and the `blog-topics` project. A body under about 30KB can ship through the native `mcp__arthub__publish_artifact` call.
4. Read the document back with `read_artifact` and confirm the length and distinctive sections match; the preflight does not catch a truncated body.
5. Put the detail and raw links, project, and slug into the `topics.md` block, and tell the user the link plus any lint warning that remained.

The archive is an internal record, so it may contain repo paths and internal runtime names. State in its writing-constraints section that the public post must generalize them.

## Public-post constraints to carry into every topic

- Problem first, one failure mode, natural prose, verified evidence.
- No internal runtime names, languages, or identifiers in the public text; before/after code and fixed tests count as evidence even without numbers.
- Do not write the post until the user asks. A topic stays in the backlog with its missing evidence listed.
