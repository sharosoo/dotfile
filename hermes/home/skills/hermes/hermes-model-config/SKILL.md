---
name: hermes-model-config
description: Configure this machine's Hermes native providers using omp auth broker and the shared model-routing policy.
metadata:
  tags: [hermes, model, provider, configuration, omp, broker]
  related_skills: [hermes-agent, model-routing, omp-auth-broker]
---

# Hermes model configuration

Read `omp-auth-broker` for credential boundaries, usage checks, native SDK diagnostics, and delegation adaptation. Read shared `model-routing` before choosing a model or starting each wave. `hermes-agent` remains the hub for unrelated Hermes setup.

## Active setup

Hermes providers are registered separately: `anthropic`, `openai-codex`, `google-antigravity`, `devin`, and `commandcode`. Credentials come only from the local omp auth broker; native requests go directly to upstream through the request-scoped Bun SDK host. There is no `omp` model provider, inference gateway, or custom model integration plugin.

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

Provider and model are separate fields. Never copy OAuth tokens into Hermes, set a gateway `base_url`, restore `OMP_GATEWAY_API_KEY`, or select a non-broker provider as a fallback. The native adapter owns its internal `broker://` identity; that is not an HTTP endpoint.

## Switching models

For a session-only change:

```text
/model gpt-6.1-sol --provider openai-codex --session --reasoning xhigh
/model claude-haiku-5-5 --provider anthropic --session
```

For a persistent default:

```bash
hermes config set model.provider anthropic
hermes config set model.default claude-haiku-5-5
hermes config get model
```

Use the actual native catalog, not a remembered model alias. omp `models.yml` overrides and custom context caps are not automatically imported by Hermes.

All selectable catalogs show only releases within the last four calendar months. Unknown dates and future releases are hidden, including stale-cache and current-selection injections. The cutoff advances automatically. Saved models and explicit inference are not rewritten or date-blocked: the older configured Gemini image model remains callable even though it is hidden from the picker.

## Shared skills and delegation

`~/.hermes/skills/model-routing` and `~/.hermes/skills/omp-auth-broker` are live links to canonical omp managed skills. Do not maintain copied routing rules or add a cron sync.

omp agent names and `effort: lo|med|hi` are not Hermes tool arguments. Read each agent file's current binding and translate its provider/model and explicit reasoning level using `omp-auth-broker`.

Hermes `delegate_task` entries accept `goal`, `context`, and optional output schema/images/group, not per-task model/provider/agent/effort fields. Children inherit the parent route unless shared `delegation.provider` and `delegation.model` pin the wave. Set explicit child reasoning in `delegation.request_overrides.reasoning_effort`. Do not change shared routing under active waves or mislabel same-model children as cross-family reviewers.

## Messaging sessions and images

`hermes-gateway.service` is the messaging/cron service and stays enabled. Its dependency is `omp-auth-broker.service`. Configuration changes that affect loaded providers require a Hermes service restart; do not restart or mutate broker accounts just to change models.

Persisted session and cron overrides also carry provider/model fields. Keep them on native provider IDs and bare model IDs, with no old gateway URL or copied key. Do not erase conversation history to migrate routing.

Images use core `image_gen.provider: google-antigravity` and model `gemini-3.1-flash-image`, not a custom plugin. Keep `use_gateway: false`; native image size defaults to `1K`. Do not re-enable old Codex image plugins or add alternate credentials after an error.

## Verification and persistence

```bash
hermes auth list
hermes skills list --source local --enabled-only
systemctl --user is-active hermes-gateway.service omp-auth-broker.service
```

A catalog or auth status is not proof of working inference. Verify a real response and any changed tool/image path. Use `skill_view` to check `model-routing`, `omp-auth-broker`, and this skill in a new Hermes session.

Settings, authored plugins, native runtime source/lockfile, and the Hermes core patch live in `~/workspaces/sharosoo/dotfile/hermes`. See its README for safe capture, restore, patch reapplication after Hermes updates, and targeted pull/commit/push. Secrets and private conversations remain local.
