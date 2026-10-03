---
name: omp-turing-config
description: "Use when tuning this machine's omp (oh-my-pi) setup: context windows/compaction, model roles and overrides, models.yml, settings in ~/.omp/agent/config.yml, and keeping them in the sharosoo dotfile repo."
---

# omp configuration on `turing`

## Files
- Live: `~/.omp/agent/config.yml` (settings, `modelRoles`, `task.agentModelOverrides`, `retry.fallbackChains`), `~/.omp/agent/models.yml` (provider `modelOverrides`), `~/.omp/agent/models.db` (sqlite `model_cache(provider_id, models JSON)`; provider ids may carry a `:suffix`, e.g. `devin:models-v2`, `openai-codex:0.159.0` — the provider name is the part before `:`).
- Snapshot repo: `~/workspaces/sharosoo/dotfile/omp/` (public GitHub repo). It holds config.yml, mcp.json (secrets as `${SERVER_TOKEN}` placeholders), agents/, managed-skills/, rules/ (incl. `projects/`), skills/, extensions/, and `agents-skills/` (= `~/.agents/skills` minus symlinks and `synced/`).
- After any change to agents, skills, rules, extensions or settings: `dotfile/omp/sync.sh capture`, check `git diff` for secrets, commit. New machine: `sync.sh restore` (keeps an existing mcp.json, regenerates the context caps). Details in `omp/README.md`.
- Settings reference: `read cfg://` (all keys + defaults), docs at `omp://settings.md`, `omp://models.md`, `omp://compaction.md`. Writing via `cfg://` needs explicit user approval.

## Context window cap (decided 2026-10-03)
- Policy: ~1M-token models capped to **320K** context → compaction ≈ 272K (window − max(15%, 16384) reserve). Rationale: context rot (WorkOS, Chroma, Claude Code team considering 400K default).
- Implemented by `dotfile/omp/cap-context.py [CAP]`: rewrites `~/.omp/agent/models.yml` with `contextWindow: CAP` for every cached model ≥900K in providers anthropic, commandcode, devin, google-antigravity, kimi-code, openai-codex, xai-oauth. The file is generated — re-run after new models appear; put extra models.yml content in the script's `EXTRA`.
- Do **not** use global `compaction.thresholdTokens`: omp clamps it only to `contextWindow - 1` (function `resolveThresholdTokens`), so 262K `devin/swe-2` and 272K Codex gpt-6 would compact too late and overflow. Per-agent: `task.agentCompactionThresholdOverrides`.
- `extendedContext: false` only shrinks Codex gpt-6-astra/6.1-sol (272K); it does not cap Opus.
- Verify: `omp models <provider> --json | jq -r '.. | objects | select(has("selector")) | "\(.selector) \(.contextWindow)"'` (output is nested arrays). Already-running sessions keep their old window.

## Inspecting omp internals
Binary: `~/.local/share/mise/installs/github-can1357-oh-my-pi/<ver>/omp` (bun-compiled, JS embedded). Find a function: `grep -a -b -o 'function Oh(e, t) {'` then `dd` from that offset; names are minified, locate them via `grep -a -o 'resolveXxx: () => Name'`.

## Conventions
Commit to dotfile with English messages, no Co-Authored-By footer; push only when asked. Answer the user in casual Korean.
