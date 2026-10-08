---
name: omp-auth-gateway
description: "Use for local omp gateway, Hermes routing, or usage checks."
---

# Local omp auth broker and gateway

Use this skill for Hermes model selection, shared usage checks, provider failures, or the local omp credential gateway on this machine. Read `model-routing` before choosing a model or dispatching a delegation wave; its current account policy and live steering take precedence over older tables. This skill adapts that policy to Hermes without changing it.

## Boundaries and credential ownership

```text
Interactive omp clients + omp usage + account-rotation service
    -> ~/.omp/agent/agent.db (local SQLite)

Hermes (provider: omp; OMP_GATEWAY_API_KEY)
    -> http://127.0.0.1:4000/v1 (omp-auth-gateway.service)
    -> http://127.0.0.1:8765 (omp-auth-broker.service)
    -> the same ~/.omp/agent/agent.db
```

- Local omp clients still read their local SQLite vault. Do not globally export `OMP_AUTH_BROKER_URL`, change their auth mode, or migrate their credentials to make Hermes work.
- `OMP_AUTH_BROKER_URL=http://127.0.0.1:8765` is scoped to `omp-auth-gateway.service`. The broker itself opens the local vault; it does not use its own HTTP endpoint as a backend.
- Direct SQLite account rotation has been confirmed to propagate to the running broker. `omp-account-rotate.service` remains the account owner; no cron synchronization, credential copying, manual enable/disable, or broker restart is needed for account rotation.
- `~/.omp/auth-broker.token` authenticates broker clients. `~/.omp/auth-gateway.token` authenticates gateway clients. Hermes receives only the latter through local `OMP_GATEWAY_API_KEY`; it does not need upstream OAuth tokens or provider API keys.
- Token files, SQLite databases, and the real Hermes `.env` are private. Never print token contents, run `omp auth-broker token` or `omp auth-gateway token` for diagnostics, place a bearer in a command-line argument, or commit these files to the public dotfile repository.
- Bind both services to loopback. Do not use `--no-auth`, widen the bind address, regenerate tokens, log in, redeem resets, or toggle credential rows as a routing workaround.

## Canonical skill links

- `~/.hermes/skills/model-routing` -> `~/.omp/agent/managed-skills/model-routing`
- `~/.hermes/skills/omp-auth-gateway` -> `~/.omp/agent/managed-skills/omp-auth-gateway`
- Hermes-specific model-switch guidance: `~/.hermes/skills/hermes/hermes-model-config/SKILL.md`

These are live directory symlinks, not copied policy snapshots. Keep the canonical routing policy unchanged when adapting Hermes APIs. The dotfile capture/restore workflow owns persistence; do not create a cron sync. Settings, plugins, and shareable skill files are managed in `~/workspaces/sharosoo/dotfile`; only secret-free configuration belongs there.

## Usage and headroom before routing

Run both the compact routing view and the underlying local usage view before choosing a provider or launching each wave:

```bash
~/.omp/agent/managed-skills/model-routing/headroom.sh
omp usage --redact
```

`headroom.sh` calls `omp usage --json --redact` itself and adds the rotation service's live `SUBAGENT BUDGET` and `ROUTING STEER`. Treat the budget as a limit on Hermes work as well, not just omp `task` work. Also obey Hermes `delegation.max_concurrent_children`; use the smaller applicable limit. Do not silently route around exhausted accounts, failed logins, or the canonical disabled-provider policy.

Useful local commands:

```bash
omp usage --json --redact
omp usage --provider anthropic --redact
omp usage --provider openai-codex --redact
omp usage --provider google-antigravity --redact
omp usage --history --days 7 --redact
omp usage clients --days 7 --redact
omp usage accounts
```

`accounts` lists identity keys, not tokens; keep full identities out of public reports. When investigating genuinely stale quota data, `omp usage invalidate --provider <provider-id>` invalidates that provider's cached report; fetch usage again afterwards. Invalidation does not rotate credentials or redeem resets. A provider with no percentage is not proof of usable credits; use the current canonical policy and actual quota errors.

Do not export the broker URL for these commands. If a shell unexpectedly inherited it, use `env -u OMP_AUTH_BROKER_URL` for the local usage/headroom invocation rather than altering global auth configuration.

## Hermes provider and qualified selectors

The model-provider plugin is `~/.hermes/plugins/model-providers/omp`. Use:

```yaml
model:
  provider: omp
  default: anthropic/claude-haiku-5-5
  base_url: http://127.0.0.1:4000/v1
  api_mode: chat_completions
```

`omp` is the Hermes provider. The upstream provider is part of the **model ID**, such as `openai-codex/gpt-6.1-sol` or `anthropic/claude-haiku-5-5`; do not switch Hermes to direct `anthropic`, `openai-codex`, or `xai-oauth` to select it. Use `--provider omp` on explicit session switches so Hermes does not infer a direct provider from the model name:

```text
/model anthropic/claude-haiku-5-5 --provider omp --session
```

The gateway catalog is the source of available wire IDs. It currently ignores custom overrides in `~/.omp/agent/models.yml`, including locally configured context caps. Do not assume an omp-only custom model, context override, alias, agent override, or fallback chain applies to gateway calls. If a canonical selector is absent from `/v1/models`, report the mismatch; do not silently substitute an older model or use a direct credential path.

### Translating omp agent names

Resolve the chosen agent's `model:` and `thinking-level:` from `~/.omp/agent/agents/<agent>.md`, and check applicable `task.agentModelOverrides` in omp config when relevant. The following are the current agent-file bindings, not a second routing policy and not a promise that every selector is advertised by the gateway:

| omp agent name | Qualified model ID | Agent default thinking |
|---|---|---|
| `sol` | `openai-codex/gpt-6.1-sol` | `high` |
| `astra` | `openai-codex/gpt-6-astra` | `medium` |
| `luna` | `openai-codex/gpt-6-luna` | `high` |
| `opus` | `anthropic/claude-opus-5-5` | `medium` |
| `fable` | `anthropic/claude-fable-5-1` | `medium` |
| `sonnet` | `anthropic/claude-sonnet-5-5` | `high` |
| `haiku` | `anthropic/claude-haiku-5-5` | `high` |
| `gemini` | `google-antigravity/gemini-3.8-flash` | `high` |
| `swe` | `devin/swe-2` | `high` |
| `mimo` | `commandcode/xiaomi/mimo-v2.6-pro` | not specified |
| `deepseek` | `commandcode/deepseek/deepseek-v4.1-flash` | `high` |
| `muse` | `commandcode/meta/muse-spark-1.3-contributor` | `high` |
| `ci`, `committer`, `pr`, `reporter` | `google-antigravity/gemini-3.8-flash` | `medium` |
| `naturalizer` | `google-antigravity/gemini-3.8-flash` | not specified |

The canonical policy controls whether a route is permitted; an existing agent file or catalog entry is not permission to use a disabled or exhausted provider. Contributor and company-code restrictions still apply. Agent names are not Hermes model aliases, and selecting a model does not import an omp agent's role prompt, tools, or autoloaded skills; include the required role and constraints in the Hermes task context.

### Hermes delegation API, not omp `task`

Current model-facing `delegate_task` accepts a `tasks` array whose entries have `goal`, `context`, and optional `output_schema`, `images`, and (when enabled) `group`. It has **no per-task `agent`, `model`, `provider`, or `effort` selector**. Do not pass omp `task` fields to it or claim a batch is cross-family because its goals mention different agent names.

Children inherit the parent's model and route unless the profile's shared `delegation` configuration pins them. For a homogeneous Sol wave, the corresponding configuration is:

```yaml
delegation:
  provider: omp
  model: openai-codex/gpt-6.1-sol
  request_overrides:
    reasoning_effort: high
```

This is an example mapping, not an instruction to overwrite the user's configuration on every call. `delegation.base_url`, when set, takes precedence over `delegation.provider`; stale direct endpoints or keys must not bypass the omp route. Keep credentials in the existing local secret environment, never `delegation.api_key` in shareable config.

Use the actual tool shape:

```json
{
  "tasks": [
    {"goal": "Investigate the first independent slice", "context": "Role: researcher. Include owned paths, evidence requirements, and all shared constraints. Do not edit files."},
    {"goal": "Investigate the second independent slice", "context": "Role: researcher. Include this slice's full background and output contract. Do not edit files."}
  ]
}
```

All children in that call use the same configured/inherited route. For heterogeneous model or independent-family work, use separately configured Hermes sessions/profiles or an explicit omp handoff under the existing delegation workflow; never churn shared config while other waves are active. Confirm each worker's effective qualified model before treating its report as independent evidence.

omp's `lo`/`med`/`hi` are model-relative effort shorthands, not Hermes API values. Translate the requested policy to a supported explicit level such as `low`, `medium`, `high`, or `xhigh`; `med` means `medium`, while `hi` means the model's highest level capped at `xhigh`, not automatically `high`. Hermes session reasoning can be selected with `/model <qualified-id> --provider omp --session --reasoning <level>`; child-specific configuration uses `delegation.request_overrides.reasoning_effort`. The omp plugin forwards reasoning effort to the gateway, which may reject unsupported levels. Never silently lower effort after an error. The agent-file default table does not override a newer canonical routing directive.

## Image generation

The user approved Gemini image generation through the same gateway. Hermes uses `image_gen/omp` at `~/.hermes/plugins/image_gen/omp`, with image model `google-antigravity/gemini-3.1-flash-image`. This is a separate non-chat route, not the `gemini-3.8-flash` chat worker selector.

Codex image-generation carriers are unsupported by the installed gateway image route. Do not restore `image_gen/openai-codex`, bypass the gateway with separate provider credentials, or describe Codex image support as working. If the Gemini image route fails, diagnose and report it rather than inventing a credential fallback.

## Endpoint and service diagnostics

Start with metadata-only checks; do not restart services or mutate auth during diagnosis:

```bash
systemctl --user status omp-auth-broker.service omp-auth-gateway.service omp-account-rotate.service --no-pager
systemctl --user show omp-auth-broker.service omp-auth-gateway.service -p ActiveState -p SubState -p MainPID -p FragmentPath
journalctl --user -u omp-auth-broker.service -u omp-auth-gateway.service -n 40 --no-pager -o cat
journalctl --user -u omp-account-rotate.service -n 30 --no-pager -o cat
curl --fail --silent --show-error http://127.0.0.1:8765/v1/healthz
OMP_AUTH_BROKER_URL=http://127.0.0.1:8765 omp auth-broker status --json
OMP_AUTH_BROKER_URL=http://127.0.0.1:8765 omp auth-gateway status --json
```

The URL assignment on the last two commands is process-local, not a global switch for omp clients. Review logs locally and redact account identities or sensitive request data before sharing them; do not dump service environment, vault rows, `.env`, auth files, or full request bodies.

To check the actual gateway catalog without printing a bearer or placing it in process arguments:

```bash
python3 - <<'PY'
import json
from pathlib import Path
from urllib.request import Request, urlopen

key = (Path.home() / '.omp/auth-gateway.token').read_text().strip()
request = Request('http://127.0.0.1:4000/v1/models', headers={'Authorization': 'Bearer ' + key})
with urlopen(request, timeout=10) as response:
    catalog = json.load(response)
for row in catalog.get('data', []):
    print(row['id'])
PY
```

Distinguish connection refusal (service/listener), gateway 401 (local gateway bearer or Hermes secret scope), and upstream 401/quota errors (broker credential/provider). Fix the failing boundary, not unrelated provider config. `omp auth-gateway check` probes broker credentials; `--strict` also sends real chat pings and consumes quota. Run those only as explicitly requested verification, not as routine discovery.

Systemd unit templates live in `~/.omp/agent/managed-skills/omp-auth-gateway/systemd/`. Service activation or restart belongs to the outside orchestrator, not a Hermes gateway worker that would kill its own session. Authentication changes remain user-controlled.

## Discovery and later verification

After both canonical skills and symlinks exist, run the actual Hermes scanner:

```bash
hermes skills list --source local --enabled-only
```

Expect `model-routing`, `omp-auth-gateway`, and `hermes-model-config`. In a new Hermes session, use `skill_view` for each name to prove full content is loadable; directory existence alone is not discovery. Hermes discovery follows directory symlinks. A chat smoke test (`hermes chat -q "Reply with exactly: ok"`) checks credentials and transport separately; do not claim it proves model-routing policy or skill discovery.

## Sources

- Canonical local `model-routing/SKILL.md`, `headroom.sh`, and `~/.omp/agent/agents/*.md`.
- Local Hermes `tools/delegate_tool.py` (`DELEGATE_TASK_SCHEMA`), `tools/delegate_tool_config.py`, and `agent/skill_utils.py` (`iter_skill_index_files`).
- Local model-provider plugin `~/.hermes/plugins/model-providers/omp/__init__.py`.
- [Hermes delegation documentation](https://github.com/nousresearch/hermes-agent/blob/main/website/docs/user-guide/features/delegation.md).
- Installed `omp usage --help`, `omp auth-broker --help`, and `omp auth-gateway --help`.
