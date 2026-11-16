---
description: >-
  Every subagent spawn names a model agent chosen by skill://model-routing; never default to
  the orchestrator's own model family.
alwaysApply: true
---

# Subagent routing

- Before the first `task`/`agent()` spawn in a session, read `skill://agent-orchestration` and `skill://model-routing`, and run `~/.omp/agent/managed-skills/model-routing/headroom.sh`. Re-run it before each later spawn wave and keep concurrent subagents per model family within its `SUBAGENT BUDGET` lines (set by the account-rotation service from quota state and the number of working omp sessions).
- **Windows broker clients** (no bash/jq, no rotation service): run `powershell -ExecutionPolicy Bypass -File ~/.omp/agent/managed-skills/model-routing/headroom.ps1` instead of `headroom.sh`. `agy-agent` and the systemd services exist only on turing; on Windows, Main does the wrap-up role work itself following `managed-skills/model-routing/agy-roles/<role>.md`.
- Always set `agent` explicitly to a model agent (`swe`, `luna`, `deepseek`, `minimax`, `sol`, `terra`, `astra`, `opus`, `sonnet`, `haiku`, `fable`, `muse`) or to a fixed-purpose agent (`ci`, `committer`, `pr`, `reporter`, `naturalizer`). Omitting `agent` runs the generic `task` agent (now `opus`, falling back to `sol` then SWE-2; user, 2026-11-04), which is still not a routing decision. Grok is disabled (2026-10-07) and MiMo (`mimo`) is retired (2026-10-18, superseded by `deepseek` V4.1-Flash-1017 and `minimax` M3.1-Flash). There is no `gemini` task agent any more: Gemini work runs through `agy-agent` (below).
- **Roles (2026-11-11, user: "자꾸 astra subagent로 라우팅되는데 구현은 대부분 opus로 해도됨"; supersedes the 2026-11-07 astra-first split).**
  - **`opus`** (omit `effort`; the agent default is high): the main implementer — backend, logic, tests, contracts, migrations, scripts, infra, frontend, UI copy/Korean product text. Up to 10 concurrent.
  - **`fable`** (Claude Fable 5.2; omit `effort`, the agent default is high; user, 2026-11-10: "fable5.2가 opus5.5보다 좋은게 확실해서 메인 플래너나 리뷰어로"): the planner and the reviewer. Plans and design advice, cross-verification of every slice (correctness, edge cases, contracts, security against the spec), second opinions, and the final whole-change review. Spends its own `Claude 7 Day (Fable)` window. Up to 10 concurrent. NEVER implementation, docs, READMEs, changelogs, tests, or any other writing.
  - **`astra`** (omit `effort`; the agent default is high; its service tier follows the user's Codex tier choice, set by the rotation service in `task.agentServiceTierOverrides` and stated in its routing directive): no longer the default coder. **Plans and reviews together with `fable` (user, 2026-11-11: "astra도 계획과 리뷰를 같이 해주면 좋아, fable과 같이")**: every plan gets a `fable` and an `astra` draft or critique, and every review seat is a `fable` + `astra` pair, so each slice has a Claude and an OpenAI verdict. Also research, scans, exploration, summaries; implementation only for deep adversarial backend logic (security, authz, concurrency, crash consistency) or as overflow when `opus` is at its cap.
  - **Carbon reviewer** (Gemini 4 Carbon; user, 2026-11-11: "거의 fable astra급… 리뷰어로 넣어보자"; 2026-11-15: "카본 그걸로 쓰지말고 agy agent로 별도로 써 리뷰어로 쓸때 devin에서는 그런거 쓰지마"): an extra Google-family reviewer beside the `fable` + `astra` pair, run by Main from `bash` as `agy-agent reviewer < "$f"` (Antigravity, `gemini-4-carbon-high` on yh04060), never through Devin and never as a `task` subagent. Read-only; its packet carries the spec, base ref and scope like any review packet. Exit 3 (no quota) → skip the seat.
  - **Devin is `swe` only (user, 2026-11-15: "swe-2 나 그런거 전용이야"):** spend the Devin quota on the SWE models (`swe-2`, `swe-2-flash`, `swe-2-fast`) through the `swe` agent; no Gemini, Claude or fusion models via `devin/…`.
  - **Antigravity is off in omp (2026-11-09):** omp 18.18.6 pauses `google-antigravity` (Google may restrict accounts used outside its apps). The wrap-up roles (`ci`, `committer`, `pr`, `reporter`, `naturalizer`) and every Gemini slot (`gemini`, `reviewer`) therefore run on Google's own CLI (`agy acp`) through `agy-agent <role>` (`managed-skills/model-routing/agy-agent.py`, on PATH as `agy-agent`; user, 2026-11-11). **Main runs it itself from `bash`, never as a `task` subagent (user, 2026-11-11):** write the packet to a `mktemp` file and run `agy-agent <role> < "$f"` in the repo cwd with `timeout: 2400`; its stdout is the role's report. It picks, per run, the Antigravity login in omp's `agent.db` with quota for the role's model — Gemini 4 Hydrogen on yh04060 for `naturalizer`/`pr`/`committer`/`ci`/`gemini` (user, 2026-11-13), Argon for `reporter` and as the next fallback, 3.8 Flash on zk/sh last, Carbon for `reviewer` — in a per-account HOME overlay under `~/.local/share/agy-accounts/`, leaving the user's own `agy` login alone. Exit 3 (no quota) → Main does that role's work itself following `managed-skills/model-routing/agy-roles/<role>.md`, or skips a `reviewer`/`gemini` seat. CommandCode is never used for these.
  - Every slice gets an independent review before it counts as done: `fable` and `astra` both review opus's work (`agy-agent reviewer` on Carbon as an extra Google opinion where it matters); `fable` reviews astra's; every finding from either reviewer is resolved.
  - **`sol`** / **`terra`** / **`sonnet`**: do not spawn. Only if `headroom.sh` reports Claude LOW/EXHAUSTED, fall back to `sol`.
  - **Gemini goes through `agy-agent` only (user, 2026-11-15: "그거 다 agy agent로 변경해야함", "reviewer도 gemini 필요할땐 agy를 띄워"):** any slot that wants a Gemini model — research, screenshots/PDF/Figma reading, summaries, a Google-family review or verification — is run by Main from `bash` as `agy-agent gemini < "$f"` (Hydrogen → Argon → 3.8 Flash; the packet's `Role:` line picks researcher/reviewer/verifier/coder) or `agy-agent reviewer` (Carbon) for reviews. Never as a `task` subagent, never via Devin or CommandCode.
  - **`haiku`**, **`luna`**: not used for research or scans while this rule stands; `astra` takes those slots.
- **Scale.** Fan implementation out across `opus` (up to 10), research/scans across `astra`, and plan and verify every slice with a `fable` + `astra` pair. Still split only along real seams; no idle filler agents. Keep one integration owner per shared file.
  - Codex family (`astra`): no per-session cap.
  - Claude family: up to 10 concurrent `opus` and up to 10 concurrent `fable`.
  - The live numbers come from `headroom.sh` (`SUBAGENT BUDGET`) and the service's routing directive; they override this list when they differ.
- **Wrap-up roles are mandatory (2026-10-25).** CI preflight through `agy-agent ci`, reports through `agy-agent reporter`, and every human-facing explanation (user replies and reports, commit/PR bodies, docs, UI copy), even short, through `agy-agent naturalizer` (unless your own model is `gemini-4-argon`). Commits and PRs are split (user, 2026-11-15: agy has no GitHub credentials, "agy agent로부터 필요한 정보만 받아오게해"): `agy-agent committer` returns a `COMMIT PLAN` (groups of paths/hunks with messages) and `agy-agent pr` returns a `PR DRAFT` (mode, base, title, body); Main then stages and commits exactly that plan, and runs the push and `gh pr create --draft`/`gh api … PATCH` itself, then verifies with `git log`/`gh pr view`. For a PR update, Main passes the existing PR number, title and body in the packet. Run them from `bash` as above; never spawn the `ci`/`committer`/`pr`/`reporter`/`naturalizer` agents with `task`, never hand the work to a coding agent.
- Outside `gpai-monorepo`, the same opus-implements rule applies; `deepseek`/`minimax`/`swe` only as an extra review opinion.
- `muse`, `deepseek`, and `minimax` never touch gpai-monorepo; `muse` never touches company code, and no CommandCode route (`deepseek`, `minimax`, `muse`) ever receives credentials, API keys, or customer/personal data.

## Project rules

Per-repository rules live under `~/.omp/agent/rules/projects/<repo>/`. omp loads only the top level of `rules/`, so nothing in that subdirectory is auto-injected; read it on demand. They are kept out of the repository's own `.omp/` because those files are uncommitted and other worktrees would never see them. Identify the repository from `git remote get-url origin` (worktrees share it), not from the directory path:

| origin | rules | what it means |
|---|---|---|
| `weareteamturing/gpai-monorepo` (any worktree, including `~/.herdr/worktrees/gpai-monorepo/*`) | `~/.omp/agent/rules/projects/gpai-monorepo/workflow.md` | Main reads it before planning. Every packet includes `Project rules: ~/.omp/agent/rules/projects/gpai-monorepo/workflow.md §<section>`. No `muse`, `deepseek`, or `minimax`. Every reply to the user is in Korean, from the first turn, even before workflow.md is read (identifiers, paths, commands verbatim). |
| `sharosoo/tessel` (any worktree) | `~/.omp/agent/rules/projects/tessel/workflow.md` | Main reads it and IMP-0004 (committed in the repo) before planning. Every packet includes `Project rules: ~/.omp/agent/rules/projects/tessel/workflow.md §<section>`. Contributor-safe: `muse` allowed. |

Subagents do not load project rules by themselves; that packet line is how they get them. To add a repository: create `rules/projects/<repo>/` and add a row here.

## Effort

`effort` maps to the model's lowest, middle or top level; the top is clamped to xhigh. A missing `effort` uses the agent's default thinking level.

| agent | for real work | `hi` only when |
|---|---|---|
| `sol` | **omit `effort`** (= high). GPT-6.1 Sol needs high effort to reason. Never `lo`/`med` | the hardest problem → xhigh |
| `terra` | **omit `effort`** (= medium) | — |
| `astra` | **omit `effort`** (= high; user, 2026-11-06) | the hardest problem → xhigh |
| `opus` | **omit `effort`** (= high; user, 2026-11-06) | the hardest problem, or after a high attempt failed → xhigh |
| `fable` | **omit `effort`** (= high; Fable 5.2, user, 2026-11-10) | the hardest architecture or review question → xhigh |
| `swe` | `hi` for normal slots, `med` for fill-in | — |
| `deepseek` | omit (`high`) for normal coding/reviews, `lo` (`low`) for fill-in/scans | hard bug-hunting → `hi` (`max`) |
| `minimax`, `luna`, `sonnet`, `haiku` | omit | — |

Never use `hi` for search, reading or summaries.
