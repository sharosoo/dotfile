# Artifact Hub Publishing for Depth-Mode Daily Reports

When a cron prompt asks to publish the daily LLM-serving (or any depth-mode) report to Artifact Hub, the work is two distinct phases with different failure modes. This file is the playbook that the cron agent follows.

## When this applies

The cron prompt explicitly mentions `artifact.sharosoo.com`, `arthub`, "Artifact Hub", or asks to publish/post a rich artifact. The deliverable is a server-side publication via the `mcp__arthub__*` MCP tools. A local markdown file is a staging artifact, not completion.

## Phase 1: Pre-publish

1. **Search first.** Call `mcp__arthub__list_artifacts` with `project` + a `q` matching the exact title or slug prefix. If a matching document exists, read it via `mcp__arthub__read_artifact` to confirm whether to update vs create.
2. **Use deterministic slugs** (e.g. `llm-serving-daily-report-YYYY-MM-DD`). The Artifact Hub identity is `(project, slug)`, not the returned ID. Re-using a slug appends a new version; using a new slug creates a parallel document.
3. **Set what you can; accept what you can't.** The `mcp-arthub` server's `publish_artifact` currently rejects the `tags` field (the MCP bridge coerces the array as an object, see `references/arthub-mcp-contract.md` "Known limitations" in the parent `artifact-hub-publishing` skill). Set `title`, `slug`, `project`, `format: "md"`, `visibility: "link"`, and `agent_source: "cron:<id>"` explicitly. **Omit `tags`** for the v1 publish — the document is created with `tags: []` and you should accept that and tell the user. Do not loop trying different `tags` shapes — the bridge will keep rejecting. If the user must have tags, document the actual `tags` value in the Discord reply as "intended tags" and note the artifact was published without them.

## Phase 2: Body sanitization (do BEFORE the first publish)

Artifact Hub's lint rejects `no-raw-html` for any raw `<...>` markup that isn't inside a fenced `html render` block. The depth-mode report commonly leaks these from GitHub:

- **Truncated PR descriptions** leak `<!-- ... -->` HTML comments. Strip with `re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)`. **Important caveat**: the daily report fetcher (`scripts/daily_pr_report.py` → `pr_summary()`) truncates each PR body to 280 chars. If an HTML comment opens inside the first 280 chars and would close after, the closing `-->` is sliced off and `<!--...-->` becomes a bare `<!-- ...` fragment that survives the regex. Use a 4-step sanitization in order:
  1. `re.sub(r"<!--.*?-->", "", s, flags=re.DOTALL)` — strip matched pairs on a single line.
  2. `re.sub(r"<!--\s*Thank you for your contribution.*?\|\s*", "", s, flags=re.DOTALL)` and `re.sub(r"<!--\s*Thanks for your contribution.*?\|\s*", "", s, flags=re.DOTALL)` and `re.sub(r"<!--\s*This is an auto-generated comment.*?-->\s*", "", s, flags=re.DOTALL)` and `re.sub(r"<!--\s*codex-pr-description:start\s*-->", "", s, flags=re.DOTALL)` and `re.sub(r"<!--\s*markdownlint-disable\s*-->\s*", "", s, flags=re.DOTALL)` — strip named fragment patterns common in GitHub PR templates, even when truncated.
  3. `re.sub(r"<!--[^|]*", "", s)` — final cleanup: any remaining unclosed `<!--` followed by a `|`-delimited fragment is dropped.
  4. `s.replace("<issue number>", "`&lt;issue number&gt;`")` plus same for `<details>` / `</details>` / `<summary>` / `</summary>` — escape literal angle-bracket placeholders that survived step 3. These appear inside `_italic ... _` body excerpts and need to render as code text, not as raw HTML.
- **Template placeholders** like `<issue number>`, `<PR number>`, `<123>`. The 4-step sanitization above covers the common cases; the generic `re.sub(r"<([a-zA-Z]+)\s+([a-zA-Z]+)>", r"`&lt;\1 \2&gt;`", s)` form catches `<word word>` patterns. Wrap the escape in backticks so the renderer keeps them as code.
- **LLM thinking-tag tokens** (`<think>`, `</think>`). Even inside backticks some renderers flag them. Pre-emptively wrap any occurrence in backticks: `re.sub(r"(?<!`)<think>(?!`)", "`<think>`", s)`. The PR body for the reasoning-parser-state PR (Dynamo #11563) had two `<think>` mentions that triggered the rejection.
- **Local archive footers** like `📁 노트 위치: ~/workspaces/.../notes/daily_pr/`. Strip — this is internal archive metadata, not reader-facing.
- **Cron prompt / scheduler headers / agent scratch notes**. Strip — only the polished reader-facing body belongs in the artifact.

## Phase 3: Publish

Call `mcp__arthub__publish_artifact` with the sanitized body + all metadata fields. Round-trip is ~3–5 seconds per call.

- **`Created v1` response**: new document. Record the returned `slug` and the `https://artifact.sharosoo.com/a/<id>` detail URL.
- **Convention violation response**: fix the listed findings and retry. Budget 2–3 retry rounds (~1.5–3 min). Common violations: `no-raw-html` (above), `prefer-table` (warning only, not blocking for this report), `empty-section` (add a 1-sentence intro between H2 and the first H3 if the section is otherwise pure PR list).

## Phase 4: Verify from the served URL

`web_extract` the `https://artifact.sharosoo.com/a/<id>` URL. Confirm:

- Title is correct
- Tags are populated (not empty)
- Version is v1 (or v2+ if updated)
- Visibility is "Shared link" (or "link")
- A representative middle section of the body renders correctly (not escaped as raw HTML, not truncated to title only)

Raw link check (`artifact-content.../raw/...`) is insufficient — the lint may have passed but the body may have rendered as escaped text.

## Phase 5: Discord reply

Keep the Discord reply to 3–5 short lines + the detail link. Do NOT paste the body — the user reads the body on Artifact Hub.

## Common false-positive lint warnings

- `prefer-table` (line ~520–530) for `🏷 label1, label2, label3` in per-PR bullets when the labels have NO colon inside them. **Not blocking** — it's a `WARN`, not `ERROR`. Don't rewrite the bullets to tables.
- `prefer-table` on focus / category lines: any `_포커스: Label: a, b, c` line (colon inside the focus text followed by 3+ comma-separated items) reads to the linter as a list of `key: value` bullets. Fix: drop the inner colon (e.g. `_포커스 — TIS 다중 모델 backend, dynamic batching, ensemble, BLS_`) or move the marker off the same line. Iterate one fix per publish, not all at once.
- `prefer-table` from colon-bearing label tokens (`op: moe`, `op: attention`, `op: gemm`, `op: gemm`, `jit-kernel`, `kind/feature`): distinct from the two triggers above. When 3+ adjacent per-PR label bullets like `- 🏷 \`run-ci, op: moe\``, `- 🏷 \`run-ci, op: moe, op: attention\``, `- 🏷 \`run-ci, op: moe\`` accumulate, the linter reads `op: moe` as a `key: value` bullet and fires `prefer-table`. The plain `🏷 label1, label2, label3` pattern without colons is benign — only the **colon inside a label token** triggers it. Fix: replace `:` with `-` in label tokens before publish — `op: moe` → `op-moe`, `op: attention` → `op-attention`, `op: gemm` → `op-gemm`. Observed 2026-08-07: 3 consecutive FlashInfer `op: moe` lines triggered the warning; rewriting tokens to `op-moe` cleared it in one publish. Same root cause for SGLang / vLLM / TRT-LLM label families when 3+ colon-bearing tokens accumulate in adjacent bullets.
- `empty-section` if a repo has zero events in the 24h window. Either omit the section entirely OR add one explanatory sentence before the empty body. Observed with `triton-inference-server/server` having no activity on most days — the safe pattern is to omit the section and add a footer line "10개 레포 중 N개는 24h 내 무활동".

## Linter warning iteration loop

The publish response includes a `warnings[]` field. Treat each warning as its own iteration unit. Do NOT batch all fixes into one patch — partial fixes sometimes surface a new warning that was previously masked. Pattern:

1. Publish v1 (read `warnings[]` from response).
2. For each warning: identify the offending line, apply a 1-line patch, re-publish via `update_artifact(slug, content, base_version)`.
3. Stop when `warnings[]` is `[]`. (Or accept "non-blocking warnings only" as the verification target — `prefer-table` is acceptable to leave.)
4. After the final iteration, run a full read-back via `read_artifact` and curl the raw URL to confirm the body matches the latest source file.

Observed on 2026-08-06 daily report: v1 had 2 warnings (Triton-Inference-Server + FlashInfer focus lines), v2 fixed Triton-Inference-Server → 1 warning, v3 fixed FlashInfer → 0 warnings. Total 3 publishes, ~10 seconds wall-clock. The 2-warning start would have been a single fix if the lines were identical, but the linter is per-line so each focus line is a separate warning that needs its own patch.

## Observed publish-rejection transcripts (2026-08)

1. First publish: `Rejected: 2 convention violation(s). ERROR no-raw-html: Raw HTML is not allowed in the body: <think> ...` — fix was backtick-wrap `<think>` tokens. Second publish: `Created v1` in ~3s.
2. The `prefer-table` warning at line 526 was about `_포커스: JIT attention kernels, CuTeDSL, MoE EP, FP8 fused_` — the comma-separated focus list looked like 3 key:value pairs to the linter. Not blocking.
