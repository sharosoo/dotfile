---
name: llm-serving-study-continuity
description: "Use when continuing prior LLM-serving study."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [llm-serving, study, sessions, cron, papers, prs]
    related_skills: [interactive-technical-tutoring, serving-llms-vllm, oss-pr-daily-digest-depth-mode]
---

# LLM-serving study continuity

## Overview

Use this skill to recover what 정혁 has already studied and select the next LLM-serving case from prior discussions, scheduled reports, papers, PRs, and live source material. This skill owns **domain knowledge, study continuity, and evidence retrieval**. It does not own the generic tutoring dialogue format; load `interactive-technical-tutoring` alongside it when teaching interactively.

## When to use

- The user wants to continue, review, or deepen prior LLM-serving study.
- The user refers to “전에 공부한 것”, recent PR/paper reports, cron output, or another thread.
- A current PR, issue, paper, or implementation should be connected to concepts already learned.
- The next lesson should start from a real failure or design change rather than a foundations curriculum.

Do not use this for generic tutoring outside LLM serving.

## Source-first recovery workflow

1. **Discover scheduled sources.** Call `cronjob(action='list')`; identify jobs by current name and purpose rather than relying on remembered job IDs. Relevant names currently include reports for daily PR/issues, daily arXiv papers, weekly industry trends, and a daily learning/PR plan. Completion criterion: the currently enabled LLM-serving jobs and latest statuses are known.
2. **Recover recent cron outputs.** Search sessions using exact job names and topic terms, for example:
   - `"llm-serving-daily-report" OR "arxiv-llm-serving" OR "llm-serving-daily-learning-and-pr-plan"`
   - a concrete PR number, paper title, repository, or mechanism from the user's request
   Use `sort='newest'`, then scroll the selected session when the discovery window is insufficient. Cron runs appear as ordinary searchable sessions with a `cron_...` session ID. Completion criterion: the actual recent report text, not just the job configuration, has been read.
3. **Recover learning state.** Search for the mechanism plus teaching signals, e.g. `"KV cache" AND 질문`, `speculative AND tree`, `P/D AND preemption`, or exact phrases from the user's recollection. Prefer sessions containing user answers because they show demonstrated understanding. Completion criterion: distinguish what was merely reported from what the user actually reasoned through.
4. **Inspect durable local artifacts when named.** If a cron report points to notes under `~/workspaces/llm_serving_study/`, read the named files. Do not infer their current contents from session history.
5. **Refresh the original source.** Before teaching a current GitHub PR/issue, paper, repository, or product fact, inspect that live source. Session history records what was said earlier; it is not proof of the source's current state. Completion criterion: current claims are grounded in the original source or explicitly labeled historical.
6. **Build a tiny lesson context.** Carry forward only:
   - the last demonstrated invariant or causal link;
   - one unresolved question;
   - one current source case;
   - the evidence link or session link.
   Do not dump all recovered history into the lesson.

## Choosing the next lesson

Default to reverse reconstruction from a real case:

```text
observed failure or design change
→ conflicting state/lifetime/ownership boundary
→ invariant that must hold
→ code or paper mechanism enforcing it
→ transfer to one related system
```

Use a foundations step only when the user asks for it or when the current case depends on a genuinely missing prerequisite. Do not restart autoregressive-generation basics merely because a foundations map exists.

When several cases are available, prefer one that:

1. continues an unresolved prior question;
2. appears in the newest cron output;
3. exposes a reusable systems invariant;
4. can be checked against a real diff, issue, figure, or execution trace.

## Current demonstrated study state

Read `references/studied-state.md` before selecting difficulty. Treat it as a compact orientation, then verify important details through `session_search` and live sources. It is not a substitute for retrieval and may lag behind new sessions.

Read `references/llm-serving-concept-map.md` only when a prerequisite map or misconception check is needed. Do not present it as a mandatory linear curriculum.

## Interaction with the tutoring skill

When the user wants a question-by-question lesson:

1. Load this skill to recover domain context and evidence.
2. Load `interactive-technical-tutoring` for the teaching contract.
3. This skill chooses **what case and technical depth**; the tutoring skill controls **how each turn is taught**.
4. Ask one question about the selected invariant or mechanism. Do not let domain retrieval produce a report dump before the question.

## Common pitfalls

- Starting from token-generation basics despite evidence that the user has already studied KV cache, scheduling, P/D, MoE, or speculative decoding.
- Treating a cron job configuration as its latest report. Search the cron-run session output.
- Treating prior chat text as current proof of a GitHub or paper claim.
- Conflating “appeared in a report” with “the user understands it.” Look for the user's own answer.
- Hard-coding cron job IDs or session IDs into the procedure. Discover them at runtime; only user-facing session links are stable references to prior discussions.
- Turning recovered context into a roadmap or terminology dump.

## Verification checklist

- [ ] Current cron jobs were discovered rather than assumed.
- [ ] Relevant cron output and prior user answers were retrieved.
- [ ] Current external claims were refreshed from the original source.
- [ ] Difficulty reflects demonstrated understanding.
- [ ] The lesson carries one case and one unresolved causal question.
- [ ] Interactive delivery also loads `interactive-technical-tutoring`.
