---
name: hermes-model-config
description: "Use when switching Hermes model or provider."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [hermes, model, provider, configuration, xai, grok, oauth]
    related_skills: [hermes-agent]
---

# Hermes Model / Provider Configuration

## When to Use

- You need to change the Hermes agent's default model or provider (`hermes config set model.*`, `hermes model`, `/model`, or `hermes setup`).
- A model is routing to the wrong provider/credential, or a switch left stale `base_url`/`api_mode` residue.
- You're choosing between xAI direct API (`xai`) and SuperGrok OAuth (`xai-oauth`) for Grok.

The bundled **`hermes-agent`** skill is the authoritative hub for general Hermes setup — load it first. This skill captures the operational gotchas its references don't spell out.

## Config keys (nested under `model:` in config.yaml)

- `model.default` — the model ID. **Not** `model.name`; `hermes config get model.name` errors "Config key not set". `hermes config get model` prints the effective section.
- `model.provider` — provider slug.
- `model.base_url` / `model.api_mode` — only meaningful for custom providers. **Unset them when switching to a native provider**; a leftover `base_url`/`api_mode` from a prior custom endpoint (e.g. `opencode-go`) lingers and confuses routing/the picker.

## Provider selection nuance — xAI / Grok

- `xai` = direct API key (`XAI_API_KEY`), `api_mode=codex_responses`.
- `xai-oauth` = SuperGrok / Premium+ OAuth (device_code), also `codex_responses` + `https://api.x.ai/v1`, forced regardless of `model.api_mode`.
- The built-in alias **`grok` maps to `xai` (API key), NOT `xai-oauth`**. So `/model grok` takes the API-key path; if only OAuth creds exist, use the explicit model name with provider `xai-oauth`.

Check what credentials actually exist before choosing a provider: `hermes auth list` (shows e.g. `xai-oauth  device_code  oauth`). OAuth pool lives in `auth.json` under `credential_pool.xai-oauth` (tokens + refresh_token, auto-refreshes).

## Switch procedure (native provider)

```bash
hermes config set model.provider xai-oauth
hermes config set model.default grok-4.6
hermes config unset model.base_url     # clear stale custom endpoint
hermes config unset model.api_mode     # clear stale transport mode
hermes config get model                # confirm
```

## Verification (do not trust config alone)

`hermes chat -q "reply with exactly: ok"` is the authoritative end-to-end test — it proves credential resolution + token refresh + model-ID validity in one shot. Reading config or `hermes auth list` is not proof the model actually responds.

## Gateway live-reload

The running gateway reads `config.yaml` through an mtime-keyed raw-yaml cache per session build, so `model.default` changes apply to **new sessions without a restart**. The already-running session keeps its previously-built model (prompt-cache invariant); to switch that live session use `/model <id>` or start a new thread. Gateway restart, if ever needed, is external only: `systemctl --user restart hermes-gateway` — never from a gateway/child shell.

## Gateway /model ≠ config.yaml — session overrides

- A bare `/model <name>` in a gateway chat (Discord/Telegram/…) sets a **per-session model override**, not `config.yaml` (unless `--global`). Overrides are write-through persisted to `~/.hermes/sessions/sessions.json` under the session key (`"model_override": {model, provider, base_url}`) and survive gateway restarts.
- Resolution order: session override → channel_overrides → global config. So `/model` can report e.g. `grok-4.6` while `hermes config get model` shows the intended default — global config was never the effective model for that chat.
- Fix: run `/new` in that chat (clears all conversation-scoped state incl. the model override, session re-resolves from config), or `/model <id> --provider <p> --global` to overwrite both global and session state. `/model --provider p` alone only re-sets the session override.
- Historical note (2026-08-30): the `#일반` group session carried a stale `grok-4.6/xai-oauth` override for months while config was `z-ai/glm-5.3-flash` on commandcode. New auto-threads from `#일반` correctly used config default; only the long-lived group session itself kept the override.

## Pitfalls

- `hermes config get model.name` fails — the key is `model.default`.
- `/model` showing a stale model while config looks correct → check `model_override` in `sessions.json` for that session key before touching config.
- `grok` alias resolves to `xai` (API key), not `xai-oauth`; with OAuth-only creds that path is dead.
- Forgetting to `unset model.base_url`/`model.api_mode` when leaving a custom provider leaves stale routing residue.
- Assuming a gateway restart is required for a model.default change — it isn't (mtime cache).

## Reference

See `references/xai-grok-provider-notes.md` for the xAI model-ID list and source-code resolution pointers (models.py, runtime_provider.py, gateway/run.py).
