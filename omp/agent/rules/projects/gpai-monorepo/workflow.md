# gpai-monorepo workflow (project rules for Main and subagents)


## 1. Who reads this

- **Main**, when writing task packets for gpai-monorepo work: copy the relevant section's rules into the packet (or point the agent here).
- **Subagents** when the packet points here: model agents (`opus`, `sol`, `astra`, `fable`, `luna`, `gemini`, `grok`, `swe`, `mimo`, `deepseek`) acting in the role their packet's `Role:` line names (`skill://agent-orchestration`), plus `ci`, `committer`, `pr`. Model choice per slot: `skill://model-routing` (backend → GPT family, `web/` → `opus`).

Routing docs, read before editing or planning any concern:
- `docs/agent-context/README.md` → recipes → concerns → failure-modes.
- When unsure which concern applies: `node cli/gpai-doc/gpai-doc.mjs query "<task>"`.

Role notes specific to GPAI:
- **researcher** — one layer (BE or FE) per run. Cite `path:line` for existing modules, entry points and patterns; prior art via `git log -S`, `git log --grep`, reverted PRs (with SHAs). External surfaces (third-party APIs, OAuth scopes, SDKs, LMS/provider APIs): primary docs, one bullet per hard fact (endpoint, auth model, scopes, pagination, rate limits, quotas, token lifetime, webhook/change-feed availability, file/MIME constraints, error shapes), with links. Platform constraints (Cloudflare Workers runtime limits, secret handling, DB migration path, i18n mirroring, existing auth/session model) each with the proving file. Name open forks with evidence on each side; do not resolve them, do not plan. Unverifiable facts are marked as such. Report in Korean 평서체 (identifiers verbatim): 범위 / 현황 / 선행 사례 / 외부 사양 / 제약·함정 / 계약 후보 / 미해결 질문.
- **planner** — inspect code (`grep`, `lsp references`, `git log -S`) and prior art (`git log --grep`, reverted PRs). Figma link given → extract with `cli/figma` and read frames as images, not only text; note newer node ids vs. older frames and memo frames. Plan in Korean 평서체 (identifiers verbatim): **근거** (what exists, what changed before, docs/frames consulted with ids/paths) / **슬라이스** (one per coder, disjoint owned files, steps, tests, docs to update) / **계약** (every cross-layer interface fixed up front: field names, nullability, error bodies/codes, ordering, i18n keys, analytics sources — coders must not renegotiate) / **DECISION 목록** (id, question, options with pros/cons, recommended default, severity `cross-layer` | `product`; product taste, copy, visibility rules, deviations from Figma/brief always go here) / **검증** (exact commands per slice, what Main verifies after: browser QA surfaces, CI preflight) / **범위 밖** (excluded work and why). Have the `advisor` peer (if running) review the contract section; fold in its blockers, list its warnings under an `advisor` note. Never guess product intent; never shrink scope silently.
- **advisor** — plan/contract review checks: (a) every cross-layer field/error/ordering fixed in one place, (b) file ownership disjoint, (c) no failure-mode doc violated (stale generated types, runtime-schema drift, mobile-web divergence, env-endpoint mismatch, …), (d) named tests actually cover the contract. Reply `BLOCKERS` / `WARNINGS` / `OK`. Decision answers: see §3.

## 2. Slices by layer

File ownership between FE and BE slices is disjoint. Implement the contract given; if it is ambiguous or looks wrong, that is a `cross-layer` decision (§3): ask, do not improvise.

### Frontend slice (`web/`)

Packet MUST tell the coder to read `skill://gpai-frontend-dev` first.
- Follow existing patterns exactly: react-kit components, `Trans`/`t` i18n keys with English fallbacks, feature-scoped data modules, shared `ChatSendForm` plugins.
- Every new i18n key goes into `web/locales/en/*.json` and is mirrored into every other `web/locales/*/` directory (same namespace file) with natural translations, not English copies.
- Korean a person reads is composed by the `naturalizer` from English intent (one batched call per task), then verified — not polished from a draft. Product register; never leak identifiers like `showDailyUsage` into copy.
- Comments in English, only *why*-comments.
- Focused checks only — no project-wide lint/format/test: `pnpm -F web exec vitest run <file>` for each touched vitest file, and `pnpm -F web type-check` once at the end.
- Do not touch `backend/`, `python-worker/`, or `config/`.
- `product` forks (copy, visibility, ordering, fallback behaviour, deviations from Figma/brief) go to Main and wait before implementing.

### Backend slice (`backend/`, `python-worker/`, `config/`)

Packet MUST tell the coder to read `skill://gpai-backend-dev` first.
- `backend/` runs on Cloudflare Workers: no Node APIs.
- `python-worker/` follows `python-worker/CLAUDE.md` and `python-worker/tests/test_guide.md`.
- Keep backend, python-worker and `config/billing.json` in sync; fallback constants that mirror config are updated together.
- SQL changes go through PgTyped (`pnpm -F backend pgtyped`, Docker temp DB); the regenerated `*.queries.ts` is part of the change.
- Focused checks only — no project-wide lint/format/test:
  - `pnpm -F backend exec vitest run <file>` per touched test file
  - `uv --project python-worker run pytest <file>` per touched test file
  - `pnpm -F backend build`
  - `python-worker/scripts/check_backend_web_model_contract.py` when model enums are involved
  - `make -C python-worker format lint` on touched python files, so CI's formatter does not reject the branch
- Do not touch `web/` except the single type file named in the packet.
- New or edited comments in `backend/`, `python-worker/`, `config/` are English; otherwise match file style (do not mass-translate untouched Korean comments).
- Contract shape, nullability, error codes and data ownership are `cross-layer`; anything user-visible is `product` (to Main, wait).

### Both

- Update the `docs/agent-context/` concern docs describing the changed behaviour in the same patch. Prose follows each document's existing language.
- Finish with: files changed, behaviours added, tests run and results, the `decisions` list (§3), anything left undone (including unconfirmed `product` decisions).

## 3. Decision severities in GPAI

A decision is anything the brief does not fix that a reviewer could reasonably dispute: API/contract shape (field names, nullability, error codes), data ownership (who computes what), state derivation rules; user-visible behaviour (copy, ordering, visibility rules, fallbacks, edge cases); where code lives (new module vs. extend existing), reuse vs. new component, test strategy; anything deviating from the brief, the Figma, or an agent-context concern doc. Trivial mechanics (variable names, import order, obvious refactors) are not decisions.

| severity | GPAI examples | confirmation |
|---|---|---|
| `local` | file placement, helper naming, test structure | none — log it |
| `cross-layer` | any contract between web/backend/python-worker, shared config keys, error semantics | ask the running `advisor` peer **before** implementing (no advisor → Main); log the advice |
| `product` | copy, visibility, ordering, fallback behaviour, deviations from Figma/brief | ask Main and wait — Main asks the user. Do not implement the fork until answered; keep working on unrelated parts |

Ask with one message per decision:
```
DECISION <short id>: <question in one line>
context: <2–4 lines: what the brief says, what the code does today>
options:
  A) <option> — pros / cons
  B) <option> — pros / cons
default if unanswered: <A|B> because <reason>
blocks: <what you cannot finish until answered | nothing>
```
Advisor answers (after inspecting code and docs):
```
ANSWER <id>: <A|B|ABSTAIN>
reason: <one paragraph, evidence-backed — file:line or doc>
blast radius: <files/contracts/tests affected>
caveat: <what Main/user still needs to confirm, if anything>
```
`ABSTAIN` = product taste, not engineering → escalate to Main. Advisor never decides `product`, keeps an advice log (id, question, answer, who asked) and yields it on `STOP`; Main verifies that coders followed advice.

Final report includes:
```
decisions:
  - id: <short id>
    topic: <one line>
    options: [<A>, <B>, ...]
    chosen: <A>
    rationale: <one or two lines>
    severity: local | cross-layer | product
    advisedBy: advisor | Main | none
    confirmedBy: user | advisor | default   # default = nobody confirmed; Main must surface it
    evidence: <file:line or test name>
```
- `product` with `confirmedBy: default` is **not done** — say so explicitly.
- Never rewrite a fork the user or advisor already answered.
- Advisor vs. brief conflict → follow the brief, log the conflict as a decision for Main.
- Planner: every open fork is a numbered `DECISION` item with recommended default; Main takes them to the user before dispatch.

## 4. CI preflight

`ci` never edits source and never ships (no commit, push, merge, `gh pr merge`, `gh pr ready`, deploy workflow).

Scope and snapshot:
1. `REPO=$(git rev-parse --show-toplevel)`; `BRANCH=$(git rev-parse --abbrev-ref HEAD)`.
2. Base = orchestrator-given branch, else `gh repo view --json defaultBranchRef -q .defaultBranchRef.name` (default `master`).
3. Touched paths = `git diff --name-only <base>...HEAD` + `git status --short` (uncommitted counts). Only decides whether the `functions/**` chain applies.
4. Snapshot `git rev-parse HEAD`, `git status --short`, `git stash list`, `git rev-parse origin/<branch> origin/dev origin/master 2>/dev/null`.

Chains, from `$REPO`, in order, stop at first failure:
0. `$REPO/node_modules` missing (fresh worktree) → `pnpm install --frozen-lockfile` (setup, but failure is a failure).
1. `pnpm check all` — affected format, lint, type-check, build for web + backend + python. **Always required.**
2. `pnpm test all` — web + backend + python tests. **Always required.**
3. Only when `functions/**` is touched: `pnpm type-check` inside each changed function directory.

Pass options via `pnpm run check …` (`pnpm check` may swallow flags). Never substitute a narrower command (`pnpm check python`, `pnpm --filter …`, `make -C python-worker …`) and never add `--task` or other selection-narrowing flags. Record command, cwd, exit code; on failure keep only the error tail identifying file:line, rule id, test name or assertion diff.

State verification: every applicable command ran (missing = failure); all exited `0`; HEAD, branch, stash list, snapshotted remote refs unchanged; final `git status --short` vs. snapshot — files rewritten by format/lint that were not already dirty mean the branch was not formatted → failure with file list (do not stage, revert or commit them). Any branch/history/stash/remote-ref/unexpected worktree change is a hard contract failure separate from the verdict.

Failure: do not fix; send Main the failed command + cwd, verbatim blocking error, and what already passed. On retry, rerun the failed command and every required command after it, then re-verify state.

Output: table of commands with exit codes, then exactly one of
- `CI preflight: 통과 (pnpm check all · pnpm test all[ · functions])`
- `CI preflight: 실패 — <command>` + blocking error summary.
State violation → `실행 규약 위반: <what changed>` above the verdict; never report a pass.

## 5. Commits

`committer` only stages and commits; never edits files, pushes, merges, `gh pr merge`, `gh pr ready`, deploys, or creates/switches branches. Reads `skill://git-master`.

Message contract:
- `action(scope): subject`, or `docs: subject` for documentation-only.
- `action` ∈ `feat`, `fix`, `test`, `refactor`, `docs`.
- `scope` ∈ `backend`, `web`, `python-worker`, or a `packages/` directory name (e.g. `react-kit`, `porter`, `drive-contract`, `bento-grid`, `capacitor-airbridge`, `token-studio`). `docs` never takes a scope.
- Subject: imperative, ≤ 72 chars, no trailing period. English by default; Korean OK when the diff's own comments/docs are Korean; never mixed in one subject.
- Describe the change, not its provenance — banned: "match figma", "apply design feedback", "per the meeting", "as reviewed", "follow the spec", "address QA".
- Optional body after a blank line: 1–5 short why-lines.
- No trailers (`Co-Authored-By`, `Signed-off-by`, generated-by).

Partitioning:
- One commit per `(action, scope)`; never bundle web + backend + python-worker.
- `config/**` → the `backend` commit if backend consumes it in this change, else `python-worker`.
- `docs/agent-context/**` touched with code → its own `docs:` commit after the code commits; one docs commit may span concerns.
- Test-only files → `test(scope)`, unless part of the same behavioural change (then in the `feat`/`fix` commit).
- Order: `refactor` → `feat`/`fix` → `test` → `docs`.
- Never commit `.omp/`, `.env*`, coverage files, or anything gitignored.
- Never `git add -A` / `git add .`; use `git add -- <paths>`, and `git add -p` when one file mixes groups.

Procedure:
1. Record `REPO`, `BRANCH`, `BASE_SHA=$(git rev-parse HEAD)`; snapshot `git status --short`, `git stash list`, `git rev-parse origin/<branch> origin/dev origin/master 2>/dev/null`; note paths Main requires to stay uncommitted; read `git diff --stat` and the full diff of every file.
2. Per group: stage explicit paths/hunks, check `git diff --cached` and `--stat` (one action, one scope), commit. Never amend unrelated commits, rebase, reset, stash, cherry-pick, force, push, merge, create PRs, trigger workflows, or touch branches.
3. Verify: still on `<branch>` and `git merge-base --is-ancestor <BASE_SHA> HEAD`; every subject in `git log --format='%H%x09%s' <BASE_SHA>..HEAD` matches `^(feat|fix|test|refactor)\((backend|web|python-worker|[a-z0-9-]+)\): .{1,72}$` or `^docs: .{1,72}$` with no trailing period or provenance phrasing; no trailers in bodies; `git show --stat` and `git show --name-only --format=` per commit follow partitioning and contain no forbidden path; `git status --short` empty except required exclusions; remote refs and stash unchanged.
4. Bounded repair (only commits after `<BASE_SHA>`, nothing pushed): message-only defect on tip → amend tip; wrong partitioning/forbidden file → reset to `<BASE_SHA>` and redo; re-verify. If `<BASE_SHA>` is no longer an ancestor or a remote ref changed, do not rewrite — report to Main.

Output: commit list (short hash + subject, in order), anything left uncommitted with reason, and exactly one of `커밋 검증: 통과` / `커밋 검증: 실패 — <what failed>`.

## 6. Shipping

- Pushing to `dev` deploys web, backend and python-worker to the dev environment; pushing to `prod` deploys production. Merging a feature branch into `dev` **is** a deploy.
- Never merge into `dev`, `prod` or `master` (by `git merge` + push, `gh pr merge`, or `POST /repos/{owner}/{repo}/merges`) without an explicit user request in this conversation. Subagents never do it at all.
- Finish feature-branch work (commit, CI preflight, push feature branch, draft PR), then report the command instead:
  ```
  준비됨: PR #<n> (draft, head <sha>) — CI preflight 통과.
  dev 배포하려면: gh api -X POST repos/<owner>/<repo>/merges -f base=dev -f head=<branch>
  ```

## 7. Pull requests

`pr` never edits source files and never ships: no merge into default/protected branches, no `gh pr merge`, no merges endpoint, no ready transition, no rerun/cancel of shared CI, no deploy workflow. If the brief asks for one, finish the draft PR work and report the exact command (§6). Pushing the current feature branch with `git push -u origin HEAD` is allowed; never force-push.

Mode and snapshot:
- `REPO=$(git rev-parse --show-toplevel)`, `BRANCH=$(git rev-parse --abbrev-ref HEAD)`, `OWNER_REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")`; base = existing PR's `baseRefName`, else repo default branch (`master`), unless Main specifies another.
- `gh pr view --json number,url,headRefOid,isDraft,state,title,baseRefName,mergedAt`: no PR → **create** (preflight, draft, push, create **draft** PR); PR exists → **update** (preflight, push new commits, rewrite body from full `<base>...HEAD` diff; never change draft/ready state).
- Snapshot PR state, `HEAD`, branch, shared remote refs, `git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`.

CI preflight first: spawn `ci` (§4) with base branch, branch name and dirty files; proceed only when its output contains `CI preflight: 통과`. Failure/abort → do not create or update the PR; quote the blocking error; never fix source.

Analysis: read `git log --oneline <base>..HEAD`, `git diff --stat <base>...HEAD`, and `git diff <base>...HEAD -- <path>` for every modified layer, schema, API and key domain path. Every claim is backed by the diff or the brief; copy route paths, config keys, locale keys, error codes, numbers and types exactly; never invent tests or behaviour. Write the body to a temp file outside the repo, e.g. `/tmp/pr-agent-<branch>-body.md`.

Title contract:
- Korean, one sentence ending in `합니다.` / `추가합니다.` / `개선합니다.` / `지원합니다.` style, ≤ 80 characters, describing the user/system-visible outcome rather than mechanics.
- No conventional-commit prefix.
- Concrete behaviour, never provenance (design, meeting, review, QA origin).

Body contract — written for a reader who must understand background, behaviour change, implementation and impact without external context. Concise paragraphs, bullets, tables; Mermaid only for genuine architecture/flow; omit decorative diagrams and empty template sections. Required structure:
```markdown
# <PR title or concise feature name>

> **TL;DR**: <2–3 concise lines covering the problem, implementation, and outcome>

## Background
<What failed or was missing, who it affected, and why this change is needed.>

## Changes
- <Concrete behavior or contract change>
- <Key frontend/backend/worker changes, grouped by layer when useful>

## Before vs After
| Area | Before | After |
| :--- | :--- | :--- |
| <area> | <old behavior> | <new behavior> |

## Implementation
<Only the modules, interfaces, data flow, and safeguards needed to review the change.>

## Verification
- [x] `<command actually run>`
- [ ] <manual or deployment check that still remains, only if real>
```
Optional when the diff supports them: Mermaid architecture/sequence diagram; security and edge-case matrix; error classification and recovery matrix; migration, secret, rollout or rollback notes.

Body rules: short, concrete prose; quote Mermaid node/edge labels containing punctuation or parentheses; in update mode derive every section from the full `<base>...HEAD` diff and keep checked items only while still valid; compose Korean through the `naturalizer` from intent (no internal planning prose exposed).

Apply:
1. `git status -sb`.
2. Push only when the feature branch has no upstream or has unpushed commits: `git push -u origin HEAD`.
3. create: `gh pr create --draft --base <base> --head <branch> --title "<title>" --body-file "<body-file>"`.
4. update: `gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -F body=@"<body-file>"`; keep the title unless the branch outcome materially changed (then update it explicitly).
5. Never edit repo files, commit, amend, force-push, merge, mark ready, close the PR, create/switch branches, or trigger/rerun/cancel workflows.

Verify: `gh pr view --json number,url,isDraft,state,title,baseRefName,mergedAt,headRefOid,body` shows exactly one open, unmerged PR for the branch; `headRefOid` == local `HEAD`; base is the intended base; create mode produced a draft, update mode preserved draft/ready state; required headings exist, identifiers match the diff, Mermaid valid, Korean natural and respectful; branch, history and shared remote refs changed only as allowed. Fix title/body/missing PR and re-verify; a prohibited state transition is not repairable — report to Main immediately.

Output: PR URL, number, mode (create/update), final title, concise body summary, CI preflight verdict, and exactly one of `PR 검증: 통과` / `PR 검증: 실패 — <reason>`.
