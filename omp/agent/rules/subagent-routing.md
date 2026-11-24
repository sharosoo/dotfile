---
description: >-
  Every subagent spawn names a model agent chosen by skill://model-routing; never default to
  the orchestrator's own model family.
alwaysApply: true
---

# Subagent routing

- Before the first `task`/`agent()` spawn in a session, read `skill://agent-orchestration` and `skill://model-routing`, and run `~/.omp/agent/managed-skills/model-routing/headroom.sh`. Re-run it before each later spawn wave and keep concurrent subagents per model family within its `SUBAGENT BUDGET` lines (set by the account-rotation service from quota state and the number of working omp sessions).
- **Language boundary (2026-11-19).** Use English between agents of all families, including OpenAI, Anthropic and Gemini: task packets, IRC, plans, reviews, verification findings and handoffs. Keep quoted source text, errors, commands, paths and identifiers verbatim. Do not naturalize internal traffic.
- **Windows broker clients** (no bash/jq, no rotation service): run `powershell -ExecutionPolicy Bypass -File ~/.omp/agent/managed-skills/model-routing/headroom.ps1` instead of `headroom.sh`. `agy-agent` and the systemd services exist only on turing; on Windows, Main does the wrap-up role work itself following `managed-skills/model-routing/agy-roles/<role>.md`.
- Always set `agent` explicitly to a model agent (`swe`, `luna`, `deepseek`, `minimax`, `sol`, `terra`, `astra`, `opus`, `sonnet`, `haiku`, `fable`, `muse`) or to a fixed-purpose agent (`ci`, `committer`, `pr`, `reporter`, `naturalizer`). Omitting `agent` runs the generic `task` agent (now `opus`, falling back to `sol` then SWE-2; user, 2026-11-04), which is still not a routing decision. Grok is disabled (2026-10-07) and MiMo (`mimo`) is retired (2026-10-18, superseded by `deepseek` V4.1-Flash-1017 and `minimax` M3.1-Flash). There is no `gemini` task agent any more: Gemini work runs through `agy-agent` (below).
- **Roles (2026-11-24): Astra-first, backend in pairs.** Ordinary non-frontend implementation goes to GPT-6 Astra (user: "구현도 다 astra", "astra쓰다가 막히면 sol로 폴백"). Backend implementation always runs as a pair, Astra plus Opus on the same slice, never Astra alone (user: "백엔드 구현 항상 pair로 opus도 쓸것"); give each a distinct owned part or have one implement while the other cross-implements/verifies, with one integration owner per path. GPT-6.1 Sol replaces Astra in the pair only when Astra is unavailable, blocked or out of quota. `agy-agent coder` (Orchestrator) still takes real independent slices.
  - **Codex capacity (user, 2026-11-24).** Spend the available ChatGPT subscription quota on useful work instead of preserving it: GPT-6 Astra for implementation, deep logic, review and bug hunts, with GPT-6.1 Sol as fallback when Astra is blocked. Both stay on `ultrafast`. Two OpenAI verdicts are not cross-family independence; keep an eligible Fable or Neon reviewer for OpenAI-authored work. Do not create filler tasks or repeat a completed review just to consume quota. The rotation service chooses the nearest weekly reset first, including accounts more than 24 hours from reset. Native automatic Codex saved resets are authorized for 5h and weekly limits, including the last credit; new purchases and automatic top-ups are not.
  - **`opus`** (omit `effort`): owns frontend, UI and product copy; also takes a share of backend, scripts, integration and tests. Up to 10 concurrent. If unavailable, wait or ask before reassigning frontend.
  - **`fable`** (Claude Fable 5.2; omit `effort`, the agent default is high; user, 2026-11-10: "fable5.2가 opus5.5보다 좋은게 확실해서 메인 플래너나 리뷰어로"): the planner and the reviewer. Plans and design advice, cross-verification of every slice (correctness, edge cases, contracts, security against the spec), second opinions, and the final whole-change review. Spends its own `Claude 7 Day (Fable)` window. Up to 10 concurrent. NEVER implementation, docs, READMEs, changelogs, tests, or any other writing.
  - **`astra`** (GPT-6, omit `effort`): actively implements deep backend, authz, concurrency and crash-consistency work. Also takes planning and review alongside `fable`, plus research, scans and verification. `sol` and `astra` use the user's selected Codex tier (currently `ultrafast`).
  - **Neon reviewer** (user, 2026-11-19): Gemini 4 Neon is the independent Google-family seat beside `fable` + `astra`. Main runs `agy-agent reviewer < "$f"` (`gemini-4-neon-xhigh`), never via Devin or `task`. Read-only; send the same spec, base ref and scope as to the other reviewers. Exit 3 (no quota) → skip the seat without substituting Hydrogen.
  - **Devin is `swe` only (user, 2026-11-15: "swe-2 나 그런거 전용이야"):** spend the Devin quota on the SWE models (`swe-2`, `swe-2-flash`, `swe-2-fast`) through the `swe` agent; no Gemini, Claude or fusion models via `devin/…`.
  - **Antigravity runs through agy, not omp's paused `google-antigravity` provider.** Main runs `agy-agent <role> < "$f"` from bash in the repo cwd, with `timeout: 2400`. Wrap-up roles and `gemini` use Gemini 4 Hydrogen (`high`, except `ci` at `medium`); `reviewer` uses Neon (`xhigh`). The runner uses only the account in `~/.omp/agent/agy-account.local.txt`, with a private HOME overlay. It never falls back to another login or changes the standalone `agy` login. Exit 3 means the pinned route is unavailable; check model quota and catalog errors before reporting that the account is exhausted. Do not substitute another model for `naturalizer`.
  - Before a slice counts as done, resolve independent review findings. Fable and Astra are the core plan/review pair; review implementation with other families, adding Neon where it matters. Do not count Astra as independent of Sol, or Neon as independent of Orchestrator.
  - **`sol`** (GPT-6.1, omit `effort`): fallback implementer only, when `astra` is unavailable, blocked or out of quota. Do not use `terra` or `sonnet` for routine work while this policy stands.
  - **Gemini goes through `agy-agent` only:** Main runs `agy-agent gemini < "$f"` for research, vision, summaries and other worker roles selected by the packet's `Role:` line. Use `agy-agent reviewer` for the Neon review seat. Never use a `task` Gemini agent, Devin, or CommandCode.
  - **`agy-agent coder` is a normal implementer.** Run from Main in the repo to open the native Herdr pane below Main. The default is `gemini-pro-orchestrator-neon`; Neon xhigh and Carbon high are available as fallbacks or explicit selections. Supply owned paths, acceptance criteria and allowed checks. Read its handoff and independently verify the result.
  - **YOLO applies to every `agy-agent` role**, including ACP reviews and wrap-up roles. Tool approvals are skipped; review and drafting roles remain read-only by instruction.
  - **`haiku`**, **`luna`**: not used for research or scans while this rule stands; `astra` takes those slots.
- **Scale.** Across independent slices and waves, rotate ordinary non-frontend work among Sol, Orchestrator and Opus by fit and remaining quota. Keep one integration owner per shared file; don't create filler slices to balance counts.
  - Codex family (`sol`, `astra`): no per-session cap unless live headroom says otherwise.
  - Claude family: up to 10 concurrent `opus` and up to 10 concurrent `fable`.
  - The live numbers come from `headroom.sh` (`SUBAGENT BUDGET`) and the service's routing directive; they override this list when they differ.
- **Wrap-up roles are mandatory.** Main runs `agy-agent ci` for CI, `agy-agent reporter` for report evidence, and `agy-agent committer` and `agy-agent pr` for read-only `COMMIT PLAN` and `PR DRAFT` handoffs. Main applies the plans, runs permitted GitHub writes and verifies the results. For an update, pass the existing PR number, title and body as source material. Run these roles from bash, never as `task` agents.
- **Korean for people, via Gemini.** Before a session reply or report, Slack post, GitHub PR/comment/commit message, human-facing doc or Korean UI copy is delivered, Main sends one English intent packet to `agy-agent naturalizer` (Gemini Hydrogen) with `target_language: ko`, audience, register and exact literals to retain. Verify facts and formatting against the intent, then use only the Korean deliverable. Do not publish the English handoff or replace Gemini with inline Korean from OpenAI or Anthropic. If Gemini is unavailable, hold the human-facing draft and report the block. When Main itself is `gemini-4-argon`, use the naturalization workflow in place; never spawn a second naturalizer.
- Outside `gpai-monorepo`, the same balanced implementation rule applies; `deepseek`/`minimax`/`swe` only as extra review opinions.
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
For reviews and bug hunting, use `effort: "hi"` on Sol, Astra, Fable and Opus (the supported top level, capped at `xhigh`); Neon uses its `xhigh` reviewer preset. Ordinary implementation keeps the defaults below.

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
