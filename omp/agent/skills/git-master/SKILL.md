---
name: git-master
description: "Git operations and history investigation for this repo: atomic commits with path/hunk staging, commit-message style, rebase, squash, fixup/autosquash, blame, bisect, reflog, git log -S/-G, and questions like 'who wrote this' or 'when was this added'. Use whenever a task needs a commit or a git-history answer. Not for ordinary code edits unless git work is requested. Stage-branch deploys (dev/dev2/prod merges) go to gpai-deploy; PR review goes to feature-review."
---

# Git Master

Use this for Git writes (commit, history rewrite) and Git-history questions. Read repository state before inferring anything, and cite the evidence.

## Mode

Classify the request first:

- `COMMIT`: stage and commit local changes.
- `REBASE`: rebase, squash, fixup, autosquash, reorder, split, or otherwise rewrite history.
- `HISTORY`: when, where, who, why, or which commit changed something.
- `STATUS`: inspect branch, diff, or working tree without changing it.

Only commit, rebase, push, reset, stash, or delete when the user asked for that operation. For investigative requests, report findings and stop.

## Ground truth

Collect these in parallel:

```bash
git status --short
git diff --stat
git diff --staged --stat
git branch --show-current
git log -30 --oneline
git rev-parse --abbrev-ref @{upstream}
git merge-base HEAD origin/master
```

The default branch is `master`. A missing upstream is normal for a fresh branch; report it rather than treating the failed lookup as a fact.

## Commit mode

Commit only what the user asked for and leave unrelated dirty work alone.

1. Match the repo's message style: `type(scope): description`, description usually in Korean (e.g. `fix(llm): GPT-5.6+ 롤링 요청에서 prompt_cache_key 전송을 생략한다`). Check `git log -30 --pretty=format:%s` and follow what is there.
2. Read the full diff, not only file names. Separate the user's unrelated edits from the requested change.
3. Group by behavior, module, and revertability. Keep an implementation and its direct tests together.
4. Unrelated concerns get separate commits. Use one commit only when the files form one indivisible change or the user asks for one.
5. Stage by path or hunk. Never `git add .` or `git add -A`: other agents and the user often have unrelated work in the same tree.
6. Before each commit, check `git diff --staged --stat` and enough of the staged diff to prove the group is right.
7. After each commit, check `git log -1 --oneline`.

Grouping rules:

- Keep generated files with the source change that produced them when leaving them out would make the tree inconsistent (PgTyped `*.queries.ts` with their `.sql`, `packages/model-contract/src/generated.ts` and the web catalog snapshot with the model catalog).
- Docs that describe a code change (`docs/agent-context/**`) go in the same commit or the same PR as that change; the doc-guard contract expects them together.
- Do not hide failing or unrelated changes inside a broad commit.

Report commit hashes, messages, and anything left uncommitted.

## Rebase mode

History rewriting affects everyone who pulled the branch.

- Do not rewrite `master` or the stage branches `dev`, `dev2`, `prod` unless the user named that exact operation. Pushing to a stage branch deploys it.
- If commits may already be pushed, ask before force-pushing, and use `--force-with-lease`, not `--force`.
- If the tree is dirty, preserve that work deliberately before rebasing. Do not pop a stash over conflicts without checking what changed.
- For fixups: `git commit --fixup=<hash>` then `GIT_SEQUENCE_EDITOR=: git rebase -i --autosquash <base>` (the no-op editor keeps it non-interactive).
- Resolve conflicts by reading both sides and the intent; do not pick ours/theirs blindly.
- If a rebase goes wrong, `git rebase --abort` first. Reach for reflog only after explaining the recovery path.

After rewriting, run the relevant tests (`pnpm test <scope>`) or at least the cheapest check, then show the log from base to HEAD.

## History mode

Pick the tool by the question:

- `git log -S "text"`: commits where the count of an exact string changed (added or removed).
- `git log -G "regex"`: commits whose diff touched lines matching a pattern.
- `git log --diff-filter=D --oneline -1 -- <path>`: the commit that deleted a file; then `git show` it to see what replaced it.
- `git blame -L start,end -- file`: who last changed specific lines.
- `git log --follow -- file`: one file's history across renames.
- `git show <hash>`: inspect a candidate commit.
- `git bisect`: first bad commit, given a deterministic pass/fail command and known good/bad bounds.
- `git reflog`: recover or explain recent local movement.

Cite the evidence: hash, subject, path, and line or diff context. If it is ambiguous, say what remains unproven.

## Before any history write

- Current branch is known.
- Dirty work is accounted for.
- Pushed/upstream status is known or explicitly unknown.
- The operation matches what the user asked for.
- A recovery path exists (`rebase --abort`, a reflog hash, or an untouched tree).

When done, report which verification commands passed, which you could not run, and the final state of the working tree.
