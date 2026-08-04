# Variant manifest

`/omo-route` swaps an agent's prompt body to a model-family variant when
`variants/<agent>/<family>.md` exists. The `variantFamily()` detector (in
`src/extension.ts`) maps a resolved model id to a family name. This file lists
every OMO variant source so each can be ported incrementally.

## Family detection (variantFamily)

| model id pattern | family |
|---|---|
| `fable` | `claude-fable-5` |
| `opus-4-8` / `opus-4.8` | `claude-opus-4-8` |
| `opus-4-7` / `opus-4.7` | `claude-opus-4-7` |
| `sonnet`/`opus`/`haiku` | `claude` |
| `k2.7`/`k2-7` | `kimi-k2-7` |
| `kimi…k2` | `kimi-k2-6` |
| `gpt-5.5`/`gpt-5-5` | `gpt-5-5` |
| `gpt-5.4`/`gpt-5-4` | `gpt-5-4` |
| `glm-5.2`/`glm-5-2` | `glm-5-2` |
| `glm` | `glm` |
| `gemini` | `gemini` |

## Ported

| agent | family | source | status |
|---|---|---|---|
| sisyphus | gpt-5-5 | `packages/omo-opencode/src/agents/sisyphus/gpt-5-5.ts` | ✅ ported (adapted) |

## Default bodies already shipped (in `agents/*.md`)

These serve when no variant file matches the resolved family (the recommended
primary path for each agent):

| agent | default variant shipped | OMO source |
|---|---|---|
| sisyphus | claude-opus-4-7 | `agents/sisyphus/claude-opus-4-7.ts` |
| hephaestus | gpt-5-5 | `agents/hephaestus/gpt-5-5.ts` |
| atlas | default (claude-family) | `prompts-core/prompts/atlas/default.md` |
| momus | default (non-GPT) | `agents/momus.ts` :: MOMUS_DEFAULT_PROMPT |
| prometheus | default | `prompts-core/prompts/prometheus/default.md` |
| oracle | default (non-GPT) | `agents/oracle.ts` :: ORACLE_DEFAULT_PROMPT |
| librarian | (single) | `agents/librarian.ts` |
| explore | (single) | `agents/explore.ts` |
| metis | (single) | `agents/metis.ts` :: METIS_SYSTEM_PROMPT |
| multimodal-looker | (single) | `agents/multimodal-looker.ts` |
| sisyphus-junior | default (claude) | `agents/sisyphus-junior/default.ts` |

## Remaining variants to port (OMO source paths)

**sisyphus** (`packages/omo-opencode/src/agents/sisyphus/`):
- [ ] `claude-fable-5.ts` → `variants/sisyphus/claude-fable-5.md`
- [ ] `claude-opus-4-8.ts` → `variants/sisyphus/claude-opus-4-8.md`
- [ ] `claude-opus-4-7.ts` → `variants/sisyphus/claude-opus-4-7.md` *(already the default body)*
- [ ] `kimi-k2-7.ts` → `variants/sisyphus/kimi-k2-7.md`
- [ ] `kimi-k2-6.ts` → `variants/sisyphus/kimi-k2-6.md`
- [ ] `gpt-5-4.ts` → `variants/sisyphus/gpt-5-4.md`
- [ ] `glm-5-2.ts` → `variants/sisyphus/glm-5-2.md`
- [ ] `sisyphus-dynamic-prompt.ts` (fallback) → `variants/sisyphus/default.md`

**hephaestus** (`packages/omo-opencode/src/agents/hephaestus/`):
- [ ] `gpt.ts` → `variants/hephaestus/gpt.md`
- [ ] `gpt-5-4.ts` → `variants/hephaestus/gpt-5-4.md`

**atlas** (`packages/prompts-core/prompts/atlas/`):
- [ ] `opus-4-7.md`, `gpt.md`, `gemini.md`, `kimi.md`, `kimi-k2-7.md`, `glm.md`

**momus** (`packages/omo-opencode/src/agents/momus.ts`):
- [ ] `MOMUS_GPT_PROMPT` → `variants/momus/gpt-5-5.md`

**oracle** (`packages/omo-opencode/src/agents/oracle.ts`):
- [ ] `ORACLE_GPT_PROMPT` → `variants/oracle/gpt-5-5.md`
- [ ] `ORACLE_GPT_5_5_PROMPT` → `variants/oracle/gpt-5-5-full.md`

**sisyphus-junior** (`packages/omo-opencode/src/agents/sisyphus-junior/`):
- [ ] `default.ts`, `gpt.ts`, `gpt-5-5.ts`, `gpt-5-4.ts`, `gemini.ts`, `kimi-k2-6.ts`, `kimi-k2-7.ts`, `glm-5-2.ts`

## Ultrawork prompt variants (group 3 loop nudge content)

`packages/prompts-core/prompts/ultrawork/`: `default.md`, `gpt.md`, `gemini.md`, `glm.md`, `planner.md`, `codex.md`.
Currently the loop nudge is generated in `src/loop.ts :: buildNudge`. Porting these would make the nudge model-family-specific.
