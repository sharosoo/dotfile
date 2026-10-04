# Prompt/cache audit evidence bank — gpai-monorepo

Session-specific reference for the repository audit that established this skill’s evidence-first workflow. Keep the main skill generic; use this file as a compact pattern library for future audits.

## Repository provenance

- Repository: `/home/global/workspaces/weareteamturing/gpai-monorepo`
- Branch: `feat/2-year-subscription`
- HEAD: `5f01278759` (merge PR #768)
- Working tree: `git status --short --branch` showed no modified paths.

Relevant history:

- `685fb6c3220` — stable AI-chat prompt prefix and tool-signature propagation.
- `34336d2ab2` — isolate stable Vertex Gemini cache prefix.
- `7b3f6b65c8c` — cache only immutable Anthropic system prefix.
- `1d54df4d1f` — LLM port owns prompt cache and image pre-shrink boundary.
- `18291a1fb2` — provider transport package and cross-provider native replay.
- `c95683b7ac9` — direct OpenAI Responses transport for GPT-5.6.
- `8f64081825` — replay native Responses output across chat turns.
- `6369dbe20d` — refresh editor document context from session.
- `418f508f6d` — typed native replay envelopes.

## Prompt topology

`python-worker/app/domain/services/ai_chat/ai_chat_service.py`

- `AiChatPromptTopology` (106–112): stable prompt, stable key, full tool manifest key, selected policy key, volatility caveats.
- `AiChatPromptEnvelope.to_messages()` (126–162): one system message with `cache_prefix=True`; history and current turn follow. Runtime language/time, personalization, references, and sandbox suffix are folded into the current user turn.
- `AiChatService.build_prompt_topology()` (1083–1142): stable markdown sections, normalized tool manifest, optional `SANDBOX_FIXED_PREFIX`, independent hashes.
- `compose_prompt_envelope()` (1144–1227): runtime prompt and current-turn payloads remain separate from stable topology.
- `build_continuation_prompt_envelope()` (1229–1318): reconstructs tool turns while reusing the same stable topology.
- `_build_runtime_system_prompt()` / `_build_temporal_context()` (2261–2315): volatile server time and model cutoff.
- `_build_stable_default_system_prompt()` (2324–2331): strips the volatile markdown section.

Tests:

- `python-worker/tests/domain/services/ai_chat/test_ai_chat_prompt_topology.py`
  - `test_prompt_topology_stable_keys_ignore_runtime_values`
  - `test_only_stable_prompt_is_system_dynamic_goes_to_user_turn`
  - `test_tool_manifest_policy_keys_change_independently`
  - `test_stable_system_prompt_includes_sandbox_fixed_prefix_only_with_sandbox_tools`
  - `test_initial_and_continuation_emit_identical_cached_system_prefix`

## Dynamic context placement

- `python-worker/app/application/use_cases/ai_chat_use_case.py`
  - `_prepare_stream` prompt assembly (2270–2304): sandbox attachment manifest is runtime-only; provider calls receive `prompt_envelope.to_messages()` followed by context-provider and native overlays.
  - `_maybe_inject_context_provider_prompts()` (2330–2358): re-resolves volatile context each turn and folds it into the last user turn.
- `python-worker/app/domain/services/ai_chat/context/editor_document_context_provider.py`
  - `EditorDocumentContextProvider.resolve_context()` (34–52): re-reads current editor state.
  - `_build_prompt()` (67–78): current authoritative HTML is prompt text; document body is not copied into persisted history.
- `python-worker/app/domain/services/ai_chat/sandbox_prompt_builder.py`
  - `SANDBOX_FIXED_PREFIX` (24–63): fixed cached layer.
  - `build_runtime_suffix()` (107–134): per-turn attachment manifest.

## Cache derivation and transports

- `python-worker/app/infrastructure/adapters/outbound/llm/llm_cache_derivation.py`
  - `derive_cache_options()` (32–87): hashes model + canonical cache-prefix messages + provider-neutral tools; derives conversation affinity separately; returns `None` if no stable messages/tools.
- `python-worker/app/infrastructure/adapters/outbound/llm/llm_provider_router_adapter.py`
  - `_resolve_cache()` (164–189): explicit cache wins; otherwise auto-derives; `disable_cache=True` returns disabled mode.
- `python-worker/app/infrastructure/adapters/outbound/llm/provider_transport/openai.py`
  - `openai_prompt_cache_key()` (265–271), `openai_system_rolling_cache_options()` (283–292), `mark_last_supported_content_block()` (409–415).
- `python-worker/app/infrastructure/adapters/outbound/llm/provider_transport/anthropic.py`
  - `apply_system_cache_strategy()` (272–292): 1h system marker for system-only strategies.
  - `apply_message_cache_strategy()` (295–334): recent rolling tail markers use default TTL and cap marker count.
- `python-worker/app/infrastructure/adapters/outbound/llm/provider_transport/gemini.py`
  - `prepare_generation_request()` (155–188): creates/reuses explicit `cached_content`; removes system/tools/tool config from hit requests.
  - `convert_messages()` (243–270): cache-prefix system instruction is separated from volatile leading system content.
- `python-worker/app/infrastructure/adapters/outbound/llm/provider_transport/openrouter.py`
  - `prepare_request_body()` (113–140): explicitly requests usage and pins provider routing with `session_id`.
  - `convert_messages()` / `_inject_trailing_cache_control()` (222–337): inserts a single ephemeral marker into stable cacheable content.

Provider cache tests:

- `python-worker/tests/infrastructure/adapters/outbound/llm/test_openai_llm_adapter.py`
- `python-worker/tests/infrastructure/adapters/outbound/llm/test_anthropic_llm_adapter.py`
- `python-worker/tests/infrastructure/adapters/outbound/llm/test_vertex_gemini_llm_adapter.py`
- `python-worker/tests/infrastructure/adapters/outbound/llm/test_openrouter_llm_adapter.py`
- `python-worker/tests/infrastructure/adapters/outbound/llm/test_grok_llm_adapter.py`

## Tokens, cost, and persistence

- `python-worker/app/domain/services/ai_chat/ai_chat_service.py`
  - `_count_message_tokens()` (2226–2232): coarse `len(content)//4` estimate.
  - `_truncate_messages_to_fit()` (2234–2258): preserves system/current user and reserves 4000 output tokens.
- `python-worker/app/infrastructure/adapters/outbound/llm/openai_request_guard.py`
  - `enforce_openai_input_limit()` (77–96): preflight counts GPT-5.6 input and rejects above profile limit.
- `python-worker/app/infrastructure/adapters/outbound/llm/pricing/calculator.py`
  - `calculate_usage_pricing()` (30–118): subtracts cache-read/write input from uncached input; keeps provider total as reconciliation evidence rather than scaling local bucket rates.
- `python-worker/app/infrastructure/adapters/outbound/llm/conversation_persist.py`
  - `prune_native_for_call()` (26–34), `build_snapshot()` (74–105).
- `python-worker/app/domain/services/conversation_history.py`
  - `overlay_native_payloads()` (28–61): overlays only while canonical history is byte-equivalent; stops at first mismatch.
  - `merge_restored_messages()` (79–92): fresh system prompt + restored history + new turns.

Tests for these behaviors include:

- `test_openai_llm_adapter.py`: exact 272,000 acceptance / 272,001 rejection; malformed preflight fail-closed; stream preflight rejection.
- `test_ai_chat_prompt_topology.py`: stable prefix equality and dynamic placement.
- `test_ai_chat_tool_turn_replay.py`: tool-turn/native replay reconstruction.
- `test_conversation_persist.py`: canonical snapshot and native persistence.
- `test_openrouter_llm_adapter.py`: cached usage defaults and volatile marker stripping.

## Diff/update pattern

`python-worker/app/application/llm_tools/edit_document/chat_tool.py`

- `_parse_edit_pairs()` (130–136): parses targeted `<old>/<new>` blocks.
- `_morph_snippet()` (139–143): wraps changed fragments with existing-code markers.
- `PatchDocumentChatTool.execute_stream()` (441–511): writer model emits minimal edits; fast apply model merges into the full HTML; returned edit pairs support UI diff while the merged body is the apply payload.

## Verification note

Focused pytest execution was attempted with prompt-topology and provider-cache tests, but collection stopped at `python-worker/tests/conftest.py:12` because `asyncpg` was unavailable. Report this as blocked collection, not as a test failure or success.
