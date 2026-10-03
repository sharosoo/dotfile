---
description: >-
  Never push to a shared branch or trigger a deploy unless the user asked for it in
  this conversation. Applies to every repository, and to gpai-monorepo's dev/prod
  branches in particular.
alwaysApply: true
---

# Shipping requires an explicit request

Committing locally is ordinary work. **Publishing is not.** The following actions change what other people and real users get, so they happen only when the user asks for them in this conversation — a plan that mentions them, a prior session, or "it seemed like the obvious next step" do not count:

- `git push` to any branch other than the working feature branch
- merging into a shared branch (`dev`, `develop`, `staging`, `master`, `main`, `prod`, release branches) by any means: `git merge` + push, `gh pr merge`, or the REST `POST /repos/{owner}/{repo}/merges` endpoint
- taking a PR out of draft (`gh pr ready`), or opening a non-draft PR
- anything that triggers a deployment pipeline: pushing to a branch with a deploy workflow, `workflow_dispatch`, CodePush, Cloud Build, `wrangler deploy`, store submissions
- rerunning or cancelling CI/CD runs on shared branches

## gpai-monorepo specifics

`dev` deploys the web app, backend, and python-worker to the dev environment on push; `prod` does the same for production. Merging a feature branch into `dev` **is** a deploy. Do not do it as a follow-up to "make a PR", "commit this", or "finish the task".

## What to do instead

Finish the feature-branch work (commit, CI preflight, push the feature branch, draft PR), then stop and report what is ready plus the exact command you would run:

```
준비됨: PR #<n> (draft, head <sha>) — CI preflight 통과.
dev 배포하려면: gh api -X POST repos/<owner>/<repo>/merges -f base=dev -f head=<branch>
```

Let the user say go. When they do, run it and report the deploy workflow result.

## Subagents

No subagent pushes to a shared branch or deploys, ever — not even when its brief says "ship it". A subagent that believes a deploy is needed reports it to the orchestrator, which asks the user.
