"""omp auth-gateway provider: every model through the local omp auth-broker.

The gateway (`omp auth-gateway serve`, systemd unit `omp-auth-gateway.service`) speaks the
OpenAI Chat Completions wire and resolves the provider credential from the broker-backed
omp account vault, so Hermes holds no provider keys of its own. Model ids are
provider-qualified omp ids (`anthropic/claude-opus-5-5`, `openai-codex/gpt-6.1-sol`).
"""

from __future__ import annotations

import json
import threading
import urllib.request
from typing import Any

from agent.reasoning_effort import clamp_effort
from agent.secret_scope import get_secret_str
from providers import register_provider
from providers.base import ProviderProfile

DEFAULT_BASE_URL = "http://127.0.0.1:4000/v1"
API_KEY_ENV = "OMP_GATEWAY_API_KEY"
BASE_URL_ENV = "OMP_GATEWAY_BASE_URL"

# Union of what pi-ai accepts across models; a model-specific miss (e.g. `minimal` on Claude)
# comes back as a 400 that names the supported set, so map `minimal` up instead of off.
_EFFORTS = ("none", "low", "medium", "high", "xhigh", "max")
_EFFORT_OVERRIDES = {"minimal": "low", "ultra": "max"}

_catalog_lock = threading.Lock()
_catalog: dict[str, dict[str, Any]] = {}


def _load_catalog(api_key: str | None, base_url: str | None, timeout: float) -> dict[str, dict[str, Any]] | None:
    url = (base_url or get_secret_str(BASE_URL_ENV).strip() or DEFAULT_BASE_URL).rstrip("/") + "/models"
    key = api_key or get_secret_str(API_KEY_ENV).strip()
    req = urllib.request.Request(url, headers={"Accept": "application/json"})
    if key:
        req.add_header("Authorization", f"Bearer {key}")
    from hermes_cli.urllib_security import open_credentialed_url

    try:
        with open_credentialed_url(req, timeout=timeout) as resp:
            rows = json.load(resp).get("data") or []
    except Exception:
        return None
    # Non-chat rows (image/tts/judge/…) carry `kind`; the chat routes reject them.
    chat = {row["id"]: row for row in rows if isinstance(row, dict) and row.get("id") and not row.get("kind")}
    with _catalog_lock:
        _catalog.clear()
        _catalog.update(chat)
    return chat


class OmpGatewayProfile(ProviderProfile):
    def supported_reasoning_efforts(self, model: str | None) -> tuple[str, ...]:
        return _EFFORTS

    def build_api_kwargs_extras(
        self, *, reasoning_config: dict | None = None, **ctx: Any
    ) -> tuple[dict[str, Any], dict[str, Any]]:
        if not isinstance(reasoning_config, dict):
            return {}, {}
        effort = (reasoning_config.get("effort") or "").strip().lower()
        if effort == "none" or reasoning_config.get("enabled", True) is False:
            return {}, {"reasoning_effort": "none"}
        if effort:
            return {}, {"reasoning_effort": clamp_effort(effort, _EFFORTS, _EFFORT_OVERRIDES)}
        return {}, {}

    def fetch_models(
        self, *, api_key: str | None = None, base_url: str | None = None, timeout: float = 8.0
    ) -> list[str] | None:
        catalog = _load_catalog(api_key, base_url, timeout)
        return None if catalog is None else sorted(catalog)

    def get_model_context_length(self, model: str) -> int | None:
        with _catalog_lock:
            row = _catalog.get(model)
        if row is None and not _catalog:
            row = (_load_catalog(None, None, 3.0) or {}).get(model)
        value = (row or {}).get("context_length")
        return value if isinstance(value, int) and value > 0 else None


register_provider(OmpGatewayProfile(
    name="omp",
    display_name="omp auth-gateway",
    description="All models through the local omp auth-broker (Claude, Codex, Antigravity, Devin, CommandCode)",
    env_vars=(API_KEY_ENV, BASE_URL_ENV),
    base_url=DEFAULT_BASE_URL,
    api_mode="chat_completions",
    default_headers={"x-omp-app": "hermes"},
    supports_vision=True,
    default_aux_model="anthropic/claude-haiku-5-5",
))
