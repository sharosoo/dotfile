# GitHub Deep-Dive for PRs You Already Know

Use this when the fetcher (urllib or `gh pr list`) has surfaced candidate PRs and you need the full body + comment thread for ~3–10 specific PRs to write the depth-mode megafics and reject hypotheses. The `1.5` urllib helper is the right tool for **bulk** deep-dive (5+ PRs scripted at once). This file is the playbook for the **targeted** case — you have a handful of PRs in hand and need their full context fast.

## Why `gh` CLI is better than urllib for targeted deep-dive

- **Authenticated by default** (uses the user's keyring-backed `gh auth login` credential, no need to set `GH_TOKEN` or worry about 60 req/h anonymous limit).
- **10× faster per call** (~50–150ms vs 200–800ms for urllib + token round-trip).
- **Structured JSON output** with `--json field1,field2 --template '...'`, no need to parse REST envelopes.
- **No rate-limit math** — authenticated `gh` shares the user's 5000 req/h budget.

The cost: you have to be in a shell that has `gh` installed and the user must have run `gh auth login` at some point. Verify with `gh auth status | head -3` first.

## Patterns

### Get full body + metadata for one PR

```bash
gh pr view 33521 --repo sgl-project/sglang \
  --json title,body,state,closedAt,mergedAt,author,labels \
  --template '{{.title}} [{{.state}}{{ if .mergedAt }} M{{ end }}] @{{.author.login}} | labels: {{ range .labels }}{{.name}},{{ end }}
{{ .body }}
---'
```

The `--template` flag lets you put metadata on the header line and dump the full body below. This is the workhorse call.

### Get the human-comment thread (filter out bot noise)

```bash
gh api repos/sgl-project/sglang/issues/33521/comments \
  --jq '.[] | select(.user.login != "github-actions" and .user.login != "gemini-code-assist" and .user.login != "coderabbitai" and .user.login != "copy-pr-bot") | "\(.user.login): \(.body[:300])"'
```

The bot list to filter out (extend if you find more):
- `github-actions[bot]` — CI status comments
- `gemini-code-assist[bot]` — automated code review (the consumer version of Gemini Code Assist on GitHub was sunset in 2026; its comments are just banner noise)
- `coderabbitai[bot]` — automated code review
- `copy-pr-bot[bot]` — NVIDIA-runner validation gating on `ai-dynamo/dynamo`
- `dependabot[bot]` — dependency bump PRs
- `mergify[bot]` — merge queue events, often `needs-rebase` close reasons

### Batch-deep-dive N PRs across one repo

```bash
for num in 3252 3240 3269; do
  echo "=== Mooncake #$num ==="
  gh pr view "$num" --repo kvcache-ai/Mooncake \
    --json title,body,state,closedAt,mergedAt,author,labels \
    --template '{{.title}} [{{.state}}{{ if .mergedAt }} M{{ end }}] @{{.author.login}}
{{ .body }}
---' 2>&1
  echo
done
```

A `for` loop with `gh pr view` is the cleanest batched deep-dive — each call is a separate process so one failure doesn't break the others. Add `2>/dev/null` if you want to suppress transport errors and let the call's `state` field signal "not found" instead.

### Recursive cross-reference: "follow-up to #X" / "superseded by #Y"

When a megafic body says "this is a follow-up to #47621" or "superseded by #50000", call `gh pr view` on the *referenced* PR to confirm the chain. The follow-up link in the body is the tip of an iceberg; the full chain often reveals a 3–4 PR series you can compress into one cross-repo megafic.

```bash
# If #33521 body says "reopen at #33623", confirm:
gh pr view 33623 --repo sgl-project/sglang --json state,title,body --template '{{.state}}: {{.title}}
{{.body}}'
```

## Reject-hypothesis evidence hierarchy

When the goal is to write a one-line reject reason for a closed-not-merged PR, weight the candidate sources from most to least decisive. State the strongest source in the report and back off to weaker sources only if it isn't available.

1. **Author's own "Superseded by #X" / "Covered in #X" / "Reopened as #X" comment** — tier-1, almost always final. State as a direct quote. Example: Mooncake #3252 author comment "Superseded by #3285 (same branch tip `221e6ec9`; this PR could not be reopened after a force-push)".

2. **Maintainer comment "please rebase to main" + `needs-rebase` label** + `mergify[bot]` close with "merge conflicts" reason → process-level hold, not design. State the label name. Example: vLLM #51090 `needs-rebase` + mergify "Please rebase the PR".

3. **`copy-pr-bot[bot]` on NVIDIA-runner repos** — "This pull request requires additional validation before any workflows can run on NVIDIA's runners." Recurring pattern on `ai-dynamo/dynamo` and `NVIDIA/TensorRT-LLM` for external-contributor PRs. Means: NVIDIA vetter process gate, NOT a code design reject. Example: Dynamo #12617, #12346.

4. **"Stale" / "waiver removal" close** + the underlying bug is already fixed in HEAD → the PR's purpose is void. Example: TRT-LLM #17150 — waiver removal PR after the V2 SSM pool fix landed in commit `7f7dccf991`. Stating "underlying fix already in HEAD, waiver no longer needed" is the most accurate reason.

5. **Design-level rejection by a maintainer** with substantive concern — quote the maintainer verbatim, name them. Rare. When present, the rejection is interview-grade signal because it tells you what the maintainers consider out-of-scope right now.

6. **Only bot comments, no human comments** — either (a) author abandoned, (b) low-priority fix that got closed during repo-wide cleanup. Do NOT fabricate a "design disagreement" reason. Say "low-signal close" or look for the `stale`/`wontfix` label.

If you have only labels and no comments, say so explicitly and stop. Do not invent "design" or "scope" reasons.

## Common recursions worth pre-emptively checking

- **NVIDIA vetter on Dynamo** (pattern #3): if the day has any external-contributor PR on `ai-dynamo/dynamo` or `NVIDIA/TensorRT-LLM`, expect the `copy-pr-bot[bot]` comment. The visible close reason is "additional validation required" — that's the bot, not a human maintainer rejecting the design.

- **Reopen as new PR** (pattern #1): the comment "reopen at #X" or "replaced by #X" plus the new PR's existence is a one-line supersede chain. Don't write both the closed PR and the new PR as separate megafics; write one chain entry.

- **`needs-rebase` from mergify** (pattern #2): the `mergify[bot]` close reason is mechanical and often the only comment. Combine with the `needs-rebase` label to state "process-level hold, awaiting rebase from author".

- **Dependabot test PRs on real repos** (observed: TRT-LLM #1 — Bump onnx 1.12.0 → 1.13.0): these are dependabot noise from a previous test setup. The "[bot]" suffix is the tell. State as "test-repo artifact, not a real PR" and move on.

## Limits

- `gh pr view` does NOT include reactions, review comments, or inline code review comments. For those, use `gh api repos/{owner}/{repo}/pulls/{num}/comments` (review thread) or `gh api repos/{owner}/{repo}/issues/{num}/reactions`. These are uncommon in the daily-report flow.
- `gh pr view` does NOT include `mergeable_state`, merge commit SHA, or behind/ahead count. For those use the REST endpoint.
- The `--template` flag does not support conditional blocks like `{{ if .labels }}` — it does support `{{ if .mergedAt }}` because `mergedAt` is a top-level field. For label iteration use `{{ range .labels }}{{ .name }} {{ end }}`.
