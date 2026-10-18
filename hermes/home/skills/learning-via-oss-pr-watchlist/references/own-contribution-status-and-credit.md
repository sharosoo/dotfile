# Checking the user's own OSS PR/issue status and recording credit

Use when the user asks "내 PR 상태", "머지됐냐", "컨트리뷰터 들어갔냐", "내 이슈 중 머지된 것", or wants the contributions logged as career evidence. Read-only unless the user explicitly asks to comment: never post a comment/label request on their PR unprompted, and honor "코멘트는 달지 마".

## 1. Status check (re-run when asked again; state changes within minutes)

One `gh pr view N -R owner/repo --json state,mergedAt,mergedBy,mergeCommit,labels,reviews,statusCheckRollup,commits,isDraft,mergeable` call, then:

- Timeline for who/what moved it: `gh api repos/O/R/issues/N/timeline --paginate --jq '.[]|[.created_at,.event,(.actor.login//.user.login//""),(.label.name//"")]|@tsv'`.
- Failing CI: `gh pr checks N -R O/R` then `gh run view <run> --log-failed`. Distinguish a repo-policy gate (e.g. a required package/triage label that only maintainers can add) from a code failure and say which it is.
- Answer shape: state first, then the blocker. A second "다시 확인해봐" usually means it changed (merged/labelled); re-fetch rather than reuse the earlier answer.

## 2. Does the user get "contributor" credit?

- Merge commit on main with `author.login == user` (`gh api repos/O/R/commits?author=<login>`) is the real signal. Squash merges keep the PR author.
- `/contributors` API and the repo contributor badge lag by hours to a day; empty there right after merge is not a negative.
- `search/issues?q=repo:O/R+author:<login>+is:pr` gives merged_at for their PRs.

## 3. Issues the user filed that were fixed by someone else (or a bot)

- For each issue: timeline for `cross-referenced`/`closed` events, then `gh pr view <fix> --json author,mergedBy,closingIssuesReferences,body`.
- Credit is NOT the user's when the fix PR author and merge commit author are another person or an app (check `Co-authored-by`, and release notes: `gh api repos/O/R/releases/tags/<tag> --jq .body | grep <PR#>`). The user stays only as issue reporter plus the `Closes #N` link. Say so plainly and word the evidence accordingly: "root cause, repro and fix proposal supplied in the issue; fixed upstream by X in release Y", never "I fixed".
- Maintainer-run repos with triage bots (pydantic-ai's pydanty) may implement a well-specified issue themselves even when the reporter offered a patch and asked to be assigned. Mention this possibility when the user plans issue-first contributions: get assigned before posting the full patch, or open the PR immediately if trivial.
- Open issues: report maintainer/bot decision label (`feature`, `is-working`, discussion) and whether any implementation PR exists, from the issue comments plus `gh pr list --search "<N> in:body" --state all`.

## 4. Logging as career evidence

File: `~/workspaces/sharosoo/career-meterials/career-evidence/projects/oss-<repo>.md` (not `google-fde`, that is the final FDE application only). Add a line to that folder's `README.md` project list. Per item record: number, title, state, dates, who merged, release/commit, and one line tying it to the user's real experience. For issues include problem, impact, repro result, proposed fix, outcome, and an explicit credit-status line (see 3). Include a summary block (merged PRs / issues resolved / unresolved) and next candidates. Dates and states are as-of the check date; write that at the top.
