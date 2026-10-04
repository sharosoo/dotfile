# Digest archive: window recap

The scheduled digests are not just delivered, they accumulate. This file is the map for reading that accumulation back — where each layer lives, which layer to open for which task, and what to re-verify before quoting anything from it. Job IDs change; discover them at runtime.

## Layers

| Layer | Path | Holds | Open it for |
|---|---|---|---|
| Per-run cron output | `~/.hermes/cron/output/<job_id>/YYYY-MM-DD_HH-MM-SS.md` | One file per run: the skill and prompt text, then a `## Response` section with what was delivered | What a specific run actually reported |
| Daily signal block | `~/workspaces/<workspace>/notes/daily_pr/YYYY-MM-DD_discord.md` | ~20 lines: mega-picks, merged / reject / new-open counts, repo-PR list, signal list, artifact link | The scan unit for any multi-day window |
| Daily depth note | `~/workspaces/<workspace>/notes/daily_pr/YYYY-MM-DD.md` | 30–45 KB of per-PR detail | Depth on one specific day |
| Weekly synthesis | `~/.hermes/cron/industry/YYYY-Www.md` | Top Pick / Other Highlights / Releases / Hire-Readiness / scan scope / Sources | Trends no single day shows: hardware, vendor blogs, releases |
| Weekly synthesis raw run | `~/.hermes/cron/output/<job_id>/…md` | Prompt + `## Response` | When the curated weekly file is missing |
| Paper digest raw run | `~/.hermes/cron/output/<job_id>/…md` | Per-day `## Response`: theme sentence, selected papers, artifact link | The paper-side trend for the window |
| Dedupe state | `~/.hermes/cron/<topic>/state.json` | seen IDs, seen URLs, last run, last yield | Nothing — state only, never content |
| Engine blog feed (outside the archive) | `https://vllm.ai/blog/rss.xml`, the engine's `/blog` index, release pages | Title, link, `pubDate`, and a one-line summary per post | The window's direction: KV tiers, new hardware targets, benchmark shifts |

A job's `last_status: ok` in the scheduler listing is not its output. The status says the run finished; the substance is the run file.

## Sources outside the archive

Every layer above is repository activity. These sources carry what the archive structurally cannot, and a recap that skips them reports churn as direction:

- **Engine blog feeds.** Each engine publishes RSS/Atom beside its `/blog` index (`https://vllm.ai/blog/rss.xml` for vLLM) with title, link, `pubDate`, and a one-line summary per post — a month's post list costs one request and is enough to inventory and date-stamp, so open individual posts only for the items the recap actually rests on. Engine blogs run several posts a week covering offload tiers, parallelism, hardware bring-up, and workloads; a PR digest never sees any of it.
- **Release notes.** A default-path change (a runner, cache, or backend becoming the default) is the release headline even when the feature list is longer. Re-read the notes rather than quoting the digest's summary of them.
- **Vendor and analyst posts, model cards.** Throughput, cost-per-token, latency, layer counts, and KV-compression ratios live here with their qualifiers (precision, concurrency, hardware) intact. A digest line that dropped the qualifier is not verification.

Fetch the feed with a browser user agent. A terminal command that mixes `curl` with a shell heredoc can be hard-blocked by the command guard — write the fetch-and-parse as a script file and run that, then keep the parsed list next to the recap.

**Completeness check that takes one minute:** count the posts the window produced across the engine feeds, count what the window's digests actually covered, and name the difference in the recap. That gap — not the digest's own headlines — is usually what the user could not reconstruct on their own.

The weekly industry job scans a fixed feed list. Before assuming a source is covered, read the week file's own "scan scope" section: it states which feeds it checked and which produced nothing, and a source absent from that list is a blind spot regardless of how many weekly reports exist.

## Scanning a window

Batch so a month costs two or three calls instead of thirty:

```bash
cd ~/workspaces/<workspace>/notes/daily_pr
for f in 2026-08-13 2026-08-14 … 2026-08-25; do echo "##### $f"; sed -n '1,20p' "${f}_discord.md"; echo; done
```

Same shape for the paper and weekly run files, substituting the path. List the directory first — availability differs across the window, and some days have only the depth file.

Then aggregate: which mechanism, failure mode, or ownership boundary appears on three or more days. Those are the themes. Single-day items are anecdotes and belong in at most one section, not the spine.

## Verification targets

Re-check only the handful of items the recap rests on:

- **Engine releases** — the project's releases page and release notes: version number, contributor/commit counts, and any default-path change (a runner, cache, or backend becoming the default is the headline, not the feature list).
- **Design posts** — the engine's own blog for KV tiering, workload characterization, and hardware bring-up posts; these carry the numbers the digests only summarize.
- **Research and benchmark posts** — the analyst or vendor post, for throughput, cost-per-token, and latency figures **together with their comparison set** (precision, concurrency, hardware). A digest line that dropped the qualifier is not verification.
- **Model architecture claims** — the model card or release post for layer counts, active parameter counts, and any attention or KV-compression ratio.

## Rules that keep the recap honest

- Quote a number with its qualifiers attached; without them the number is a different number.
- Say which days of the window are unread rather than filling the gap from session memory. Archived chat proves what was said then, not what is true now.
- A release note can be edited after publication; the digest captured the earlier state.
- Never synthesize from `state.json`. It exists to prevent re-reporting, and its fields describe runs, not events.
