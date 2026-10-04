# Server-side format-policy wiring (artifact-hub repo)

Session of record: 2026-08-30. Context: 5 articles had been published as full-page HTML against 정혁's standing preference. The client-side skill was patched, but any *other* agent connecting to the MCP server would repeat the mistake — so the policy was encoded at the server.

## Core pattern: policy lives in one constant, surfaces through four channels

Repo: `~/workspaces/sharosoo/artifact-hub` (Cloudflare Workers, D1+R2).

`src/lib/docs/conventions.ts` exports three constants:

- `FORMAT_POLICY` — the full policy sentence ("Publish articles and reports as Markdown (format: md)… never for an article").
- `NATIVE_BLOCKS` — the list of what Markdown natively supports (callouts, `[!code ++]` markers, mermaid, `chart` preset, `:::` components). This is the anti-drift device: agents defect to full-page HTML when they believe Markdown "can't express" the component, so the server must hand them the alternatives list.
- `FORMAT_GUIDANCE` — policy + one-sentence alternatives summary, sized for tool descriptions.

Surfaces that interpolate these (all four were verified by `tests/worker/format-policy.test.ts`):

1. `llmsTxt()` — llms.txt gets a `## Format policy` section (entrypoint; agents that only read llms.txt still see the rule).
2. `llmsFullTxt()` — llms-full.txt `## Format` → `### What Markdown already supports`.
3. `skillMd()` — Rules item 6.
4. `src/resource-routes/mcp.ts` — MCP `initialize` response `instructions:` leads with `Format: ${FORMAT_GUIDANCE}`. This channel reaches every client automatically at connection time without requiring the agent to read any doc. Per-user instructions don't exist in MCP; server-global text is the practical slot.
5. `src/lib/mcp/tools.ts` — `publish_artifact` description + `format`/`content` param descriptions carry the short guidance; `tools/list` is always exposed, so this covers clients that ignore instructions.

Rationale to preserve: patching the client skill alone fixes one agent; patching the server fixes all of them. If a user states a standing format preference for the hub, wire it into conventions.ts first, then the skill.

## Taste-level rules are warns, never 400s

`src/lib/lint.ts` → `lintHtmlDocument()`: fires `article-as-html` warn when prose ≥ `ARTICLE_AS_HTML_MIN_PROSE_CHARS` (800) chars and interactive elements (`script|canvas|svg|iframe|form|input|button`) < 3. Wired into the publish path in `src/lib/artifacts.ts` (`format === 'md' ? lintMarkdown(body) : lintHtmlDocument(body)`).

Design lessons:

- Format choice is taste, not correctness → warn level. Hard errors stay reserved for `no-raw-html` etc.
- Heuristic: **total prose-char count, not paragraph counting**. The first draft (3+ paragraphs × 200 chars) failed on Korean prose (paragraphs under threshold). Strip `<script>/<style>`, drop tags, collapse whitespace, measure total. Dashboards/slides pass because they are label/caption-heavy and script-heavy.

## Test recipe (vitest workers pool)

- Unit + publish-integration tests follow the existing pattern: `applyMigrations()` + `seedUsers(env.DB)` in `beforeAll`, `publish(makeSession(owner), …)` for the lint-on-publish path.
- For the MCP route (`POST` from `src/resource-routes/mcp.ts`), auth is required: insert an `api_tokens` row for the seeded owner — `sha256Hex(RPC_TOKEN)` hash, `["artifact:read","artifact:write"]` scopes — then send `Authorization: Bearer <token>`.
- The initialize response may come back as SSE (`data: {json}`) or plain JSON depending on `responseMode`; accept both (split on the `data: ` prefix).
- Plain `tsx`/Node execution of repo modules fails on the `cloudflare:workers` import (pulled in via env.ts). For quick doc-output smoke checks, esbuild-bundle with an alias stub: `npx esbuild tmp/check.ts --bundle --platform=node --format=cjs --alias:cloudflare:workers=./tmp/cfw-stub.cjs` where the stub just exports `{}`. Delete the tmp files afterwards.

## Deploy + live verification

- `npm run deploy` (package.json: `build && wrangler deploy`; older notes said `pnpm run deploy` — check package.json scripts first, the repo has moved to npm).
- Verify live: `curl -s https://artifact.sharosoo.com/llms.txt` — unauthenticated and shows the Format policy section immediately.
- The MCP initialize channel is auth-walled anonymously (`-32001`), so live curl can't verify it; rely on the vitest initialize test for that channel instead.
- Commit style follows the repo log: `feat(mcp):` / `fix(ui):` + lowercase Korean summary, body explains why→what. Do not commit unrelated untracked tool litter (e.g. `.commandcode/`).
