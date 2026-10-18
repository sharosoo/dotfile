# Embedding an agent harness in a product

Use when a product (not a dev tool) must run an agent over user data and the runtime is being chosen. Verify versions with the project's own docs before relying on any row.

## Two classes

| Class | Examples | You get | You build |
| --- | --- | --- | --- |
| Harness (process + filesystem) | oh-my-pi (omp), Pi, opencode, Claude Agent SDK, Codex app-server | agent loop, file tools, sessions, context compaction, often subagents and MCP | a runner process, sandboxing, a bridge to the browser |
| Library / framework | Vercel AI SDK (`ToolLoopAgent`, `toolApproval`, loop control), Mastra, OpenAI Agents SDK (TS) | loop, tool calling, approvals or workflows | tools, session storage, compaction; runs serverless |

Cloudflare's agent layer is itself built on the AI SDK, so the AI SDK is a plausible serverless choice for document Q&A plus approvals. Choose a harness when the work is long, multi-step, drives other CLIs or MCP servers, or needs subagents. Mastra wraps the AI SDK and adds workflows (suspend/resume for human approval), memory, MCP, evals and a Cloudflare Worker deployer with a D1 store (no observability domain on D1); it is Apache-2.0 except `ee/` directories under an enterprise license, and its memory/storage overlaps with a product that already persists history itself. Starting on the AI SDK keeps Mastra addable later.

## Embed surfaces

| Runtime | Surface | Notes |
| --- | --- | --- |
| omp | `omp --mode rpc` JSONL over stdio; SDK `createAgentSession` | host tools (`set_host_tools` then `host_tool_call`/`host_tool_result`), host URI schemes (virtual files; the edit tool cannot target them, use write), subagent list/steer/cancel, event filter, extension UI requests for approvals, `restrictToolNames` for locked-down sessions, tool approval levels read/write/exec, MCP client, file-backed sessions |
| Pi | SDK and RPC | minimal harness; subagents and plan mode not built in |
| opencode | `opencode serve` headless HTTP, OpenAPI 3.1, generated SDK | the TUI is just a client of the same server |
| Claude Agent SDK | Python/TS library | custom tools through an in-process MCP server; check model/provider scope and the third-party billing note in SKILL.md |
| Codex app-server | open-source protocol | auth, history, approvals, streamed events; check provider scope |

## Runner pattern for a serverless front

- Harnesses need a process and disk, so run them in a runner outside the serverless platform; this is a declared exception.
- The runner dials an outbound WebSocket to a gateway Durable Object; the gateway relays browser messages and stores display history. No inbound port on the runner.
- One RPC child process per work session. Pin the harness version in the image (a self-updating launcher mixes versions).
- Give the agent a read-only markdown mirror of the user's documents so its native read/search tools explore freely; writes go through host tools that create proposals, never direct edits.
- Execute host tools with a short-lived token of the calling user; never mirror documents the user cannot read.
- Disable shell, arbitrary file writes, and browser tools; map the harness's approval frames to a browser approval dialog.
- Wake the runner from Cron/Queue/mail events rather than keeping it always on.
- With a single author, start the runner on the author's machine or a personal server and move to containers when users multiply; isolation and cost work can wait for that point.
- Expose the platform tools as a remote MCP server as well as runtime-specific host tools, so swapping the harness does not mean rewriting the tools.

## Not verified when this was written

Whether the harness's search tools traverse host-owned virtual paths; per-runner capacity with many concurrent sessions; how far a coding-oriented system prompt can be reshaped for non-coding work; provider breadth of opencode, Claude Agent SDK, and Codex app-server; whether a given container platform suits the runner.
