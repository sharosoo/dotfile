---
name: hermes-model-config
description: "Use when selecting Hermes models via the local omp gateway."
version: 2.0.0
author: Hermes Agent
license: MIT
platforms: [linux]
metadata:
  hermes:
    tags: [hermes, model, provider, configuration, omp, gateway]
    related_skills: [hermes-agent, model-routing, omp-auth-gateway]
---

# Hermes Model / Provider Configuration

## When to Use

- You need to select a Hermes model or diagnose an unexpected session model.
- A model switch routes around the local omp gateway, retains a stale direct endpoint, or fails with a catalog/credential error.
- You need to translate the shared omp model-routing policy into Hermes delegation configuration.

On this machine, **Hermes uses provider `omp` for model calls**. Read `omp-auth-gateway` for usage commands, provider boundaries, diagnostics, and Hermes delegation adaptation; read the shared `model-routing` before choosing a model or starting a wave. The general `hermes-agent` skill remains the hub for unrelated Hermes setup. Historical xAI/Grok notes below are not the active provider setup.

## Active provider and model IDs

```yaml
model:
  provider: omp
  default: anthropic/claude-haiku-5-5
  base_url: http://127.0.0.1:4000/v1
  api_mode: chat_completions
```

- `model.default` is the qualified gateway model ID, not `model.name` and not an omp agent name such as `haiku`.
- `model.provider` stays `omp`; the model ID carries the upstream provider (`anthropic/...`, `openai-codex/...`, `google-antigravity/...`).
- The provider plugin at `~/.hermes/plugins/model-providers/omp` resolves its local secret from `OMP_GATEWAY_API_KEY`. Hermes must not receive copied upstream OAuth tokens or direct provider keys.
- The broker URL is scoped to `omp-auth-gateway.service`. Interactive omp clients and local usage commands still use `~/.omp/agent/agent.db`; do not globally export `OMP_AUTH_BROKER_URL`.
- The gateway catalog ignores custom `~/.omp/agent/models.yml` overrides, including omp context caps. Agent bindings are policy inputs, not proof that the same ID or cap exists in the gateway. Use `/v1/models` and report absent selectors instead of silently substituting an older ID.

## Switch procedure

For an explicitly requested change to the persistent default:

```bash
hermes config set model.provider omp
hermes config set model.default anthropic/claude-haiku-5-5
hermes config set model.base_url http://127.0.0.1:4000/v1
hermes config set model.api_mode chat_completions
hermes config get model
```

For a session-only change, pin the Hermes provider explicitly:

```text
/model anthropic/claude-haiku-5-5 --provider omp --session
```

Replace the qualified model ID only after checking `headroom.sh`, `omp usage --redact`, the canonical routing policy, and the gateway catalog. Do not switch Hermes to a direct upstream provider to resolve a gateway failure. Do not unset the gateway endpoint/transport as though switching back to the old native-provider setup.

## Hermes delegation is not omp `task`

omp agent names and `effort: lo|med|hi` are not Hermes tool arguments. Read the current `model:`/`thinking-level:` in `~/.omp/agent/agents/<agent>.md` and translate the intended selector and explicit reasoning level using `omp-auth-gateway`.

The current model-facing `delegate_task` uses `tasks` entries with `goal`, `context`, and optional output schema/images/group. It has **no per-task model, provider, agent, or effort field**. Children inherit the parent route unless the shared `delegation.provider`/`delegation.model` configuration pins the entire wave. Explicit child reasoning belongs in `delegation.request_overrides.reasoning_effort`, not an invented task argument. Do not change shared config under active waves or call a same-model batch an independent-family review.

The canonical skill is shared through `~/.hermes/skills/model-routing`; gateway guidance is shared through `~/.hermes/skills/omp-auth-gateway`. Neither link needs a cron copy or a second routing policy.

## Verification

Configuration is not runtime proof. When verification is explicitly requested, `hermes chat -q "Reply with exactly: ok"` checks credential resolution, transport, and model-ID validity for that invocation. It does not prove a long-lived gateway chat has no session override.

For actual skill discovery, run `hermes skills list --source local --enabled-only` and then use `skill_view` for `model-routing`, `omp-auth-gateway`, and `hermes-model-config` in a new Hermes session. See `omp-auth-gateway` for safe service and endpoint diagnostics; never print tokens or dump `.env`.

## Gateway live-reload and session overrides

The running Hermes gateway reads `config.yaml` through an mtime-keyed raw-YAML cache when building sessions, so default model changes apply to **new sessions without a restart**. A running session keeps its built model; use an explicit `/model ... --provider omp --session` switch or start a new thread.

- A session-only `/model` switch is persisted in `~/.hermes/sessions/sessions.json` as a `model_override` and can survive a gateway restart.
- Resolution order is session override → channel overrides → global config. `hermes config get model` therefore does not establish the effective model in an existing chat.
- `/new` clears conversation-scoped state, including the model override, and re-resolves the configuration. Use `--global` only when the user actually requests a persistent default change.
- A stale override pointing to a direct provider must be cleared or explicitly switched to `omp`; restarting the gateway does not remove a persisted override.
- If a service restart is needed for plugin code or environment changes, the outside orchestrator handles it. Never restart the gateway from a gateway/child shell.

## Image generation

The user approved Gemini image generation through `image_gen/omp`, using `google-antigravity/gemini-3.1-flash-image` on the local omp gateway. This is separate from chat model selection. Codex image-generation carriers are unsupported by the installed gateway image route; do not re-enable the old direct Codex image plugin or introduce separate provider credentials as a fallback.

## Historical references — not active instructions

`references/xai-grok-provider-notes.md` records the former direct xAI/SuperGrok setup and source-resolution pointers. Its provider choices, credential pool, model-ID list, and native-provider switch recipe are historical context only, not instructions for the current omp gateway setup.

Historical incident (2026-08-30): a long-lived group session retained a Grok/direct-provider override while new threads used the then-current default. This illustrates override persistence, not permission to restore Grok routing; the canonical routing policy controls disabled providers.
