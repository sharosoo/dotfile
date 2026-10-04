# Editing cron jobs: CLI vs hand-patching jobs.json

Verified 2026-08-17 (LLM-serving cron set, 4 jobs).

## Facts

- `cronjob action=update` does NOT accept `model`/`provider` (yields `"No updates provided."`).
  Pinning/repinning a cron job's model or provider is done exclusively via the CLI:
  `hermes cron edit <job_id> --model <M> --provider <P>`.
- `hermes cron edit <job_id> --schedule "0 5 * * *"` is the **only** path that recomputes
  `next_run_at` immediately. Confirm with `cronjob action=list` — the job's `next_run_at`
  should show the new time, not the old one.
- Hand-patching `~/.hermes/cron/jobs.json` (e.g. a Python script that rewrites `model`,
  `provider`, `schedule` fields) **looks successful**: `cronjob action=list` reads the file
  and shows the new values. But `next_run_at` stays stale until the scheduler rewrites the
  file itself. Do not trust a jobs.json hand-patch for schedule changes — always finish the
  job with `hermes cron edit --schedule` (or `--model`/`--provider`) and verify `next_run_at`
  via `cronjob action=list`.

## Working sequence (batch change of N jobs)

```bash
for jid in <job_id_1> <job_id_2> ...; do
  hermes cron edit "$jid" --model deepseek/deepseek-v4-flash --provider commandcode
  hermes cron edit "$jid" --schedule "0 5 * * *"
done
# verify every job:
hermes cron list   # or cronjob action=list
```

- `hermes cron edit` (CLI) accepts `--schedule`, `--model`, `--provider`, `--prompt`,
  `--name`, `--deliver`, `--skill`, `--workdir`, etc. — one flag per invocation.
- Absolute binary path (`/home/global/.local/bin/hermes cron edit …`) is a fallback if the
  lifecycle guard flags a bare invocation.

## Model ID formats by provider (Command Code)

Command Code model IDs use `org/model` slugs:

| Model | Full ID |
|---|---|
| DeepSeek V4.1 Flash | `deepseek/deepseek-v4.1-flash` |
| DeepSeek V4 Flash | `deepseek/deepseek-v4-flash` |
| MiMo V2.5 | `xiaomi/mimo-v2.5` |
| MiMo V2.5 Pro | `xiaomi/mimo-v2.5-pro` |
| Muse Spark 1.2 Contributor | `meta/muse-spark-1.2-contributor` |

`cmd --model <full-id>` in the Command Code CLI; the model page URL is
`commandcode.ai/models/<slug>`.

Verify a slug before repinning every job — the provider exposes a live list:

```bash
set -a && . ~/.hermes/.env && set +a
curl -s -H "Authorization: Bearer $COMMANDCODE_API_KEY" \
  https://api.commandcode.ai/provider/v1/models | python3 -m json.tool | grep id
```

This beats test-firing a job (a run delivers real output to the user's channel).
After `hermes cron edit --model/--provider`, `next_run_at` is preserved — only
re-confirm the model/provider fields via `cronjob action=list`.

## DeepSeek V4 time-of-day pricing (user preference)

DeepSeek V4 Flash/Pro bill by the hour on Command Code:

- **Peak (full price):** 01:00–04:00 and 06:00–10:00 UTC = 10:00–13:00 and 15:00–19:00 KST.
  7 h/day. Input $0.44/M, output $1.32/M (Flash).
- **Off-peak (half price):** the other 17 h/day. Input $0.22/M, output $0.66/M (Flash).

User preference (정혁): when a DeepSeek model is selected for cron jobs, schedule the jobs
**before the KST peak window (e.g. 05:00–06:00)** so every run lands in off-peak pricing.
Existing chain order matters: the 05:00 report → 05:30 arXiv → 06:00 learning plan job
(`context_from` chaining) was preserved when rescheduling.
