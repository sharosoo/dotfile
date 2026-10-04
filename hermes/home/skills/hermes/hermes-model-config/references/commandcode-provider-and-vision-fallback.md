# Command Code provider & auxiliary vision fallback

Verified 2026-08-17.

## Command Code (commandcode provider)

- Base URL: `https://api.commandcode.ai/provider/v1` (OpenAI-compatible).
- Model IDs are `org/model` slugs, e.g. `deepseek/deepseek-v4-flash`,
  `xiaomi/mimo-v2.5`, `xiaomi/mimo-v2.5-pro`, `meta/muse-spark-1.2-contributor`.
  A bare slug like `deepseek-v4-flash` without the org prefix is NOT valid — always
  verify the exact ID on `commandcode.ai/models/<slug>` before writing it into config
  or cron jobs.
- DeepSeek V4 Flash/Pro on Command Code bill by the hour: peak
  (01–04 & 06–10 UTC = 10:00–13:00 & 15:00–19:00 KST) = 2× off-peak.
- MiMo V2.5 pricing on Command Code is a permanent 98% discount; MiMo V2.5 Pro 99%;
  MiniMax M3 50% (2× credits). Muse Spark 1.2 Contributor is ~95% off vs standard
  ($0.10/$0.20 vs $1.25/$4.25 per M) in exchange for Meta using prompts/outputs for
  training (data-use tradeoff — flag it when the user picks Contributor for cron jobs
  with non-public data).

## Image/vision fallback (auxiliary.vision)

- The "image fallback model" the user refers to is `auxiliary.vision` in config.yaml —
  used by the `vision` toolset when the main model has no native vision or for
  auxiliary vision tasks.
- Default is `provider: auto, model: ''`, which falls back to whatever backend is
  available (OpenRouter/Google key etc.). To pin it explicitly to OpenAI Codex:
  ```bash
  hermes config set auxiliary.vision.provider openai-codex
  hermes config set auxiliary.vision.model gpt-5.6-luna
  ```
  Verify: `hermes config get auxiliary.vision --json`.
- `image_gen` is a separate section (provider `openai-codex`, model
  `gpt-image-2-medium`) — not the vision fallback.
- User preference (정혁): the vision/image fallback model stays on
  `openai-codex` / `gpt-5.6-luna` even when the main model is a Command Code model.
