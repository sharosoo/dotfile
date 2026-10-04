# xAI / Grok provider notes (condensed)

Source-code pointers as of Hermes `hermes_cli` tree. Re-verify against the live tree if anything changes.

## xAI model IDs

Static fallback + curated extras (`hermes_cli/models.py`, `_XAI_STATIC_FALLBACK` / `_XAI_CURATED_EXTRAS`):

- `grok-build-0.1` (top model)
- `grok-4.6` (GA 2026-08)
- `grok-4.5` (GA 2026-07)
- `grok-4.3`
- `grok-4.20-0309-reasoning`, `grok-4.20-0309-non-reasoning`, `grok-4.20-multi-agent-0309`
- `grok-composer-2.5-fast`

Retired May 15 2026 (mapped to `grok-4.3` via `hermes_cli/xai_retirement.py`): `grok-4`, `grok-4-0709`, `grok-4-fast*`, `grok-4-1-fast*`, `grok-code-fast-1`, `grok-3`.

## Alias → provider mapping (`hermes_cli/models.py`)

```
grok         -> xai          (API key path — NOT oauth)
grok-oauth   -> xai-oauth
xai-oauth    -> xai-oauth
x-ai-oauth   -> xai-oauth
xai-grok-oauth -> xai-oauth
x-ai         -> xai
x.ai         -> xai
```

Both `xai` and `xai-oauth` are first-class model-provider slugs (`ProviderEntry` in models.py), and both share the same curated model list.

## api_mode / base_url resolution (`hermes_cli/runtime_provider.py`)

In the credential-pool resolution path:

- `xai-oauth` → `api_mode = "codex_responses"`, `base_url = base_url or DEFAULT_XAI_OAUTH_BASE_URL` (`https://api.x.ai/v1`), forced regardless of `model.api_mode`.
- `xai` → `api_mode = "codex_responses"` (API key path).

The xAI model-provider profile plugin (`plugins/model-providers/xai/__init__.py`) declares `api_mode="codex_responses"`, `env_vars=("XAI_API_KEY",)`, `base_url="https://api.x.ai/v1"`. There is NO separate model-provider plugin for `xai-oauth` — it resolves from the auth registry (`auth.py` `PROVIDER_REGISTRY["xai-oauth"]`, `inference_base_url=https://api.x.ai/v1`).

## Gateway live-reload (`gateway/run.py`)

- `_load_gateway_config()` → `read_raw_config()` (mtime-keyed raw-yaml cache). Config changes are picked up on the next session build without a restart.
- `_resolve_gateway_model(config)` reads `model.default` (falls back to `model.model`).
- `_reload_runtime_env_preserving_config_authority()` reloads `.env` per turn for fresh credentials.

## Credential pool shape (`~/.hermes/auth.json`)

`providers.xai-oauth` = `{tokens: {access_token, refresh_token, id_token, expires_in, token_type}, last_refresh, auth_mode: oauth_device_code}`; `credential_pool.xai-oauth` = list of `{access_token, refresh_token, base_url: https://api.x.ai/v1}`. Tokens are JWTs; presence of `refresh_token` means Hermes auto-refreshes expired tokens.
