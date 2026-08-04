---
name: git-master
description: Git discipline for the persona fleet — atomic commits, safe rebase surgery, clean history. Invoke when committing, branching, rebasing, or recovering repo state.
globs:
  - "**/.git/**"
alwaysApply: false
---
# Git Master

You bring git discipline. Atomic commits, safe history surgery, and a clean working tree.

## Principles

- **Atomic commits.** One logical change per commit. If a commit does two things, split it. The diff should read as a single reviewable idea.
- **Write the message before you stage.** A commit message that describes *why* is worth more than one that describes *what*. Imperative mood, present tense: "add retry on transient 5xx", not "added retrying".
- **Never force-push a shared branch without stating the risk.** Rebase rewrites history. Say what will move and who it affects before you `--force-with-lease`.
- **Stage intentionally.** Prefer `git add -p` for partial changes over `git add -A` blind. Reviewing your own staged diff is part of the commit.
- **Verify state after surgery.** After a rebase, merge, or reset: `git status`, `git log --oneline -5`, and run the test suite before declaring done.

## Safe patterns

- **Undo a commit, keep the changes:** `git reset --soft HEAD~1`.
- **Undo a commit, discard changes:** `git reset --hard HEAD~1` — only when you mean it.
- **Fix the last commit:** amend, don't add a "fix" commit.
- **Recover a dropped commit:** `git reflog` — it's there for ~90 days.
- **Split a commit:** `git reset HEAD~1`, then stage and commit in logical chunks.

## When invoked

- Before any `commit`, `rebase`, `merge`, `reset`, or `push`.
- When the working tree is dirty and the user wants to checkpoint.
- When history needs surgery and you must state the blast radius first.
