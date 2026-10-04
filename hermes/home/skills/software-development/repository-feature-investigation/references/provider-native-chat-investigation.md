# Provider-Native Chat Investigation Reference

This reference records a reusable evidence pattern from a monorepo investigation of provider-native reasoning, artifact-backed chat, continuation, and model/provider affinity.

## Trace map

### Provider-native state

- Neutral carrier: `python-worker/app/schemas/llm.py` → `ThinkingContent`, `NativeReplayPayload`, `Message.native_payload`.
- Provider/model identity: `python-worker/app/domain/ports/outbound/llm_port.py` → `ToolCall.signature`, `LLMNativeReplayEnvelope`.
- Provider gate: `python-worker/app/domain/types/llm_continuity.py` → `replay_signature`.
- Envelope helpers: `python-worker/app/infrastructure/adapters/outbound/llm/native_replay.py` → `wrap_native`, `native_replay_payload`, `native_replay_blocks`.
- Persistence: `python-worker/app/infrastructure/adapters/outbound/llm/conversation_persist.py` → `build_snapshot`, `snapshot_to_messages`, `prune_native_for_call`.
- Canonical overlay: `python-worker/app/domain/services/conversation_history.py` → `overlay_native_payloads`, `merge_restored_messages`.
- Runtime continuation: `python-worker/app/domain/services/llm_agent_runtime.py` → `_restore_messages`, `build_continuation`, `_native_replay_payload`.
- AI Chat integration: `python-worker/app/application/use_cases/ai_chat_use_case.py` → `_overlay_persisted_native`, `_prepare_stream`; AI Chat calls the LLM with `conversation_id=session_id` and `persist=True`.

### Provider transport details

- Gemini: `vertex_gemini_llm_adapter.py` captures streamed `thought_signature`; `provider_transport/gemini.py` restores it on `Part.thought_signature` or validates a matching native `vertex_gemini` payload.
- Anthropic: `provider_transport/anthropic.py` restores signed `thinking` blocks and replays matching `anthropic_messages` content blocks.
- OpenAI Responses: `provider_transport/openai.py` requests `reasoning.encrypted_content`, captures ordered output items, and projects response-only fields before replay.
- xAI/Grok: `provider_transport/grok.py` requests encrypted reasoning, stores `xai_chat` native output, and restores `encrypted_content` on the assistant proto.
- OpenRouter stream handling accepts `reasoning`, `reasoning_content`, and `thinking` deltas in `openrouter_llm_adapter.py`.

### Artifact and live feature context

- Session loading: `ai_chat_service.py` → `load_stream_session_context` loads history, artifacts, and reference contexts.
- Artifact projection: `ai_chat_prompt.py` → `AiChatHistoryPayload.to_messages` expands `deep_explain_card` messages from stored artifact content and reconstructs executed tool turns.
- Artifact creation: `app/application/ai_chat/tools/create_deep_explain/tool.py` creates a session artifact and returns `ArtifactRefContent`.
- Live editor context: `context/editor_document_context_provider.py` resolves the current document every turn and folds it into the user message without persisting the document body.
- Live canvas context: `context/canvas_context_provider.py` resolves the gallery/focused image and provides edit-specific prompt context.
- Historical slide context: commit `df696d99e6d712ec9a02c45772d0e96d7a5fd76f` added `context/slide_generator_context_provider.py` and tests for fresh deck snapshots after direct edits; verify whether the path still exists before reporting it as current.
- Dynamic prompt placement: `ai_chat_service.py` → `AiChatPromptEnvelope.to_messages` keeps the stable system prefix cacheable and folds volatile context into the current user turn. `ai_chat_use_case.py` → `_maybe_inject_context_provider_prompts` re-resolves context refs every turn.

### Affinity and cache

- Three axes: `llm_profiles.py` → `TransportBinding` models `(model × provider × transport)` and derives routing family from transport.
- Public/runtime mapping: `ai_chat_model_policy.py` → `BRANDED_MODEL_MAP`, `resolve_runtime_model`, `routing_family_for`, `CHAT_REQUEST_OPTIONS_MAP`.
- Cache derivation: `llm_cache_derivation.py` → `derive_cache_options`; stable key includes logical model, stable messages, and tools; conversation affinity separately includes conversation id.
- Router boundary: `llm_provider_router_adapter.py` resolves binding, derives cache, stamps provider identity, and prunes native state on provider/model mismatch.

## High-value tests

- `tests/infrastructure/adapters/outbound/llm/test_native_roundtrip_fidelity.py`: capture → JSON store round-trip → transport replay for Anthropic, OpenAI, OpenRouter, Gemini, and Grok.
- `test_conversation_persist.py`: snapshot restoration, field-by-field fidelity, legacy envelope rejection, and provider/model mismatch pruning.
- `test_gemini_native_replay.py`, `test_anthropic_native_replay.py`, `test_openai_native_replay.py`: provider-specific native extraction/replay and fallback behavior.
- `tests/application/agents/test_llm_agent_runtime.py`: `test_runtime_echoes_tool_call_signature_into_continuation_message` and `test_runtime_replays_native_output_across_rounds`.
- `tests/infrastructure/adapters/outbound/llm/test_provider_cache_topology.py`: stable cache key, byte-stable wire prefix, per-provider tool topology, and conversation affinity.
- `tests/application/use_cases/test_editor_chat_surface.py`: editor profile, current document folding, and model mapping.
- `tests/domain/services/ai_chat/test_ai_chat_model_policy.py`: branded/runtime ids, reasoning options, routing families, and frontend/backend model contract.
- `tests/domain/services/ai_chat/test_ai_chat_service_tool_continuation.py`: signature-provider and tool-call ordering preservation.

## Commit anchors

- `8f64081825fe31a9b88cbbff0053bdb452879dce`: native Responses output replay across chat turns.
- `82887d6cdbca507c089915c4142d8de038a5362b`: remove OpenAI Responses input status during replay.
- `fd18d7cc735e4ad80a09012e12179b429c39ff58`: persist/replay tool and document topology for cross-turn caching.
- `f382fcc1fe6cd04f7f6393a6e49ecd456be6fccb`: editor chat with ephemeral document context.
- `6369dbe20d388065df5606845a85dfb28a2a1590`: refresh editor context from the session.
- `df696d99e6d712ec9a02c45772d0e96d7a5fd76f`: live slide-generator deck snapshot context; historical unless present at current HEAD.
- `d88bff93e34467e72ebe6316b95ae38fd6239ac3`: enable thinking for dedicated chat surfaces.
- `d9f345565504775378c32c4f6fbe5352fee2a25f`: route AI Chat brands to GPT-5.6.
- `525153443f868a7470dc6bf70d46b0a2eeb930da`: OpenRouter sticky-session prompt caching.

## Verification note

A focused pytest command in the source session failed during collection because the environment lacked `asyncpg`. Preserve the exact blocker and do not report tests as passed when imports prevent collection. Also record the repository HEAD/branch and clean status for read-only inspections.
