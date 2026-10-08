---
name: omp-auth-broker
description: "Use for Hermes direct provider authentication through the local omp auth broker, usage checks, recent-model visibility, or shared routing policy."
---

# Local omp auth broker and Hermes

## Architecture and credential ownership

Hermes selects native providers separately: `anthropic`, `openai-codex`, `google-antigravity`, `devin`, and `commandcode`. Hermes core launches a request-scoped Bun host using the pinned `@oh-my-pi/pi-ai` SDK. That host obtains credentials from `omp-auth-broker.service` at `http://127.0.0.1:8765` and sends inference directly to the selected upstream. It is not an HTTP gateway or daemon. There is no model provider named `omp`, no model integration plugin, and no service on port 4000.

`hermes-gateway.service` is the Discord/messaging and cron service, not an inference proxy. Keep it running. Its dependency is the auth broker, not the removed `omp-auth-gateway.service`.

- The broker owns OAuth refresh over `~/.omp/agent/agent.db`; `omp-account-rotate.service` remains the account-policy owner. Native request authentication reads a fresh broker snapshot and observes disabled/deleted accounts.
- Hermes reads `~/.omp/auth-broker.token` to authenticate to the broker. Never copy upstream credentials into Hermes auth pools or `.env`. Broker failure must fail closed, not fall back to local provider credentials.
- Local omp clients and usage commands continue to use their local vault. Do not globally export `OMP_AUTH_BROKER_URL` or change interactive omp auth mode.
- Never print token files, bearer values, `.env`, credential snapshots, or SQLite credential rows. Do not run token-generation commands for diagnostics, widen the loopback bind, disable authentication, log in, redeem resets, or toggle accounts as a routing workaround.
- Broker tokens, vault databases, conversation history, and the real Hermes `.env` stay private and outside dotfiles.

## Shared policy and usage

Read the canonical `model-routing` before selecting a model or starting each delegation wave. Current live steering overrides historical examples. Run:

```bash
~/.omp/agent/managed-skills/model-routing/headroom.sh
omp usage --redact
```

Headroom includes `SUBAGENT BUDGET` and `ROUTING STEER`. Respect those limits in Hermes too, alongside `delegation.max_concurrent_children`; use the smaller applicable bound. A registered provider is not permission to spend exhausted credits or bypass company-code/contributor restrictions.

Useful diagnostics:

```bash
omp usage --json --redact
omp usage --provider anthropic --redact
omp usage --provider openai-codex --redact
omp usage --provider google-antigravity --redact
omp usage --history --days 7 --redact
omp usage clients --days 7 --redact
```

`omp usage accounts` lists identities rather than tokens; keep full identities out of public reports. For genuinely stale usage, `omp usage invalidate --provider <id>` invalidates the report cache, not credentials or reset allowances. No percentage does not imply usable credits. If a shell inherited the broker URL, use `env -u OMP_AUTH_BROKER_URL` for local usage/headroom commands.

## Hermes configuration and model selection

```yaml
model:
  provider: anthropic
  default: claude-haiku-5-5
omp_broker:
  enabled: true
  url: http://127.0.0.1:8765
  token_file: ~/.omp/auth-broker.token
  providers: [anthropic, openai-codex, google-antigravity, devin, commandcode]
model_visibility:
  max_age_months: 4
  hide_unknown: true
```

Use native provider IDs and bare upstream model IDs, for example:

```text
/model gpt-6.1-sol --provider openai-codex --session --reasoning xhigh
/model claude-haiku-5-5 --provider anthropic --session
```

Do not set a gateway `base_url`, `api_key`, or provider `omp`. `broker://<provider>` is an internal client identity, not a network endpoint to configure. Enabled broker mode rejects providers outside its configured provider list, including stale auxiliary routes.

Model discovery uses native SDK catalogs and provider discovery, not the old gateway or omp's custom `models.yml`. Do not assume omp-only aliases, context overrides, agent overrides, or fallback chains are imported. Report absent IDs rather than substituting an older model silently.

The picker shows releases within the last four calendar months, including the cutoff day; unknown and future release dates are hidden. Metadata comes from verified release fields, models.dev, and documented vendor announcements, not model-name guesses or cache timestamps. The filter covers cached/current injected entries and image catalogs. It does not rewrite saved defaults or prohibit explicitly named older models. The configured Gemini image model may therefore remain callable while absent from the picker.

## Translating omp delegation policy

Read the selected role's actual `model:` and `thinking-level:` from `~/.omp/agent/agents/<agent>.md`, plus applicable omp model overrides. Split the qualified selector at its first slash: provider `commandcode` with model `xiaomi/mimo-v2.6-pro` is valid. Agent names are not Hermes model IDs. Selecting a model does not import an omp role prompt, tools, or constraints; supply those explicitly in the task context.

Hermes `delegate_task` accepts `tasks` with `goal`, `context`, and optional output schema/images/group. It has no per-task `agent`, `model`, `provider`, or `effort` field. Children inherit the parent route unless shared delegation configuration pins the wave:

```yaml
delegation:
  provider: openai-codex
  model: gpt-6.1-sol
  request_overrides:
    reasoning_effort: xhigh
```

This is a mapping example, not permission to overwrite live shared config. For heterogeneous models or independent-family review, use separately configured sessions/profiles or the established omp delegation handoff. Never churn shared configuration while waves are active or claim same-model children are independent-family reviewers.

omp effort shorthand is model-relative: `med` maps to `medium`; `hi` means the model's highest supported level capped at `xhigh`, not always `high`. Use explicit Hermes reasoning levels and follow current routing directives. Never lower unsupported effort silently.

## Images

`image_gen.provider: google-antigravity` uses native SDK image generation in core, not `image_gen/omp` or a gateway. The configured model is `gemini-3.1-flash-image`, with default native image size `1K`. Reference inputs pass through Hermes' existing image-source and SSRF boundary. Chat vision URLs use that same boundary before reaching Bun. Do not enable old direct Codex image plugins or invent credential fallbacks when a request fails.

## Operations and persistence

```bash
systemctl --user is-active omp-auth-broker.service hermes-gateway.service
systemctl --user is-enabled omp-auth-broker.service hermes-gateway.service
hermes auth list
hermes skills list --source local --enabled-only
```

Use a real response, not only a catalog or auth status, to prove inference. Never claim a provider is usable merely because its credential exists; quota failures are surfaced directly.

Shared skills are live directory links:
- `~/.hermes/skills/model-routing` → `~/.omp/agent/managed-skills/model-routing`
- `~/.hermes/skills/omp-auth-broker` → this skill
- Hermes switch details: `~/.hermes/skills/hermes/hermes-model-config/SKILL.md`

The dotfile repository is `~/workspaces/sharosoo/dotfile`. `hermes/sync.sh capture` snapshots secret-free configuration, authored plugins, native runtime sources/lockfile, and skill link metadata. `hermes/core-patches/omp-broker.patch` persists the Hermes core changes; `hermes/apply-core-patches.sh` applies them idempotently and installs pinned Bun dependencies. After a Hermes update, reapply the patch; conflicts require an explicit port, never reset or overwrite source changes. Restore does not start services. Do not add a cron sync or unattended commits.

Before work, safely refresh with `git -c pull.rebase=false pull --ff-only`. Review and commit only the task's secret-free paths, then push the working dotfile branch when authorized; never auto-stash, force-pull, or force-push. Preserve unrelated user work.
