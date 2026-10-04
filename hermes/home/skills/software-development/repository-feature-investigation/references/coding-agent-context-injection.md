# Coding-Agent IDE Context Injection — Cross-Tool Evidence Bank

Condensed findings from a cross-tool investigation (2026-09) tracing what VS Code-based
coding agents (Cline, Roo-Code, Cursor, Void) receive from the IDE automatically, and how
each implements it. Use as evidence vocabulary and prior art when auditing "does tool X
send Y to the model" questions.

## Headline negative finding (verified three ways)

**The user's Search-view keywords are never passed to any agent.** Verified by:
1. `vscode.d.ts` (extension API, v1.136): no API exposes the Search view query/history.
   Extension-visible surface is only `window.tabGroups`, `window.activeTextEditor`,
   `window.visibleTextEditors` — all path-level.
2. Void (a VS Code **fork** that could patch workbench core) also does not read it:
   `src/vs/workbench/contrib/void/common/prompt/prompts.ts` `chat_systemMessage()` sends
   workspace folders, active file URI, open file URIs, directory tree, terminal IDs only.
3. Leaked Cursor agent prompt (2025-09-03, x1xhlol repo): auto-attached state is open
   files, cursor position, recently viewed files, edit history, linter errors. No search query.

The only query→model paths are reverse-direction search services (not context injection):
- VS Code semantic search: `searchService.aiTextSearch()` (QueryType.aiText) sends the raw
  user query to a `aiTextSearchProvider` registered by Copilot Chat (embedding + LLM re-rank).
- Settings search: `settingsEditorSearchServiceImpl.ts` — query → text3small_512 embeddings
  → LLM re-ranks top 25. Setting: `workbench.settings.showAISearchToggle`.
- Agent's own tool calls (`codebase_search`, grep) enter conversation context as normal tool
  turns — the model "sees" only searches the agent itself performed.

## Per-tool implementation map

| Tool | Auto-injected IDE context | Where in source | Key symbols |
|---|---|---|---|
| Roo-Code | `# VSCode Visible Files` (visibleTextEditors), `# VSCode Open Tabs` (tabGroups.all, TabInputText, default 20), running terminals, git status; filtered through rooIgnore | `src/core/environment/getEnvironmentDetails.ts` | `getEnvironmentDetails` |
| Cline | None automatic. `@` mentions expand inline: `@/path` content, `@problems` diagnostics, `@terminal` output, `@git-changes`, `@url`, commit hash | `apps/vscode/src/core/mentions/index.ts` (new SDK layout: `apps/vscode/src/sdk/SdkController.ts` → `resolveContextMentions`) | `parseMentions`, `mentionRegex` (in `shared/context-mentions.ts`) |
| Cline (tabs) | Open tabs used ONLY to fuzzy-rank the @-file picker, not sent to model | `apps/vscode/src/services/search/file-search.ts` | `getActiveFiles()` → `HostProvider.window.getOpenTabs` |
| Cursor | "recently viewed files" (paths + line counts, no content) + git_status snapshot auto-attached to first user message; not configurable, sits below rules in prompt | leaked prompts: `x1xhlol/system-prompts-and-models-of-ai-tools` / `Cursor Prompts/` | — |
| Void | System message: active URI, open URIs, workspace folders, dir tree | `src/vs/workbench/contrib/void/browser/convertToLLMMessageService.ts` `_generateChatMessagesSystemMessage` | `chat_systemMessage` |
| Windsurf | Cascade tracks file edits, terminal commands/output, cursor navigation as "flow" signals; RAG retrieval over session activity + persistent Memories | closed source; docs (devin.ai/windsurf) + secondary analysis | — |

## Hostbridge pattern (Cline)

Cline routes all VS Code API access through a gRPC "hostbridge" with per-call modules —
useful prior art for separating IDE surface from agent core:

```
apps/vscode/proto/host/window.proto   rpc getOpenTabs / getVisibleTabs / getActiveEditor
apps/vscode/src/hosts/vscode/hostbridge/window/*.ts
  getOpenTabs.ts    → window.tabGroups.all → flatMap(tabs) → TabInputText uri.fsPath
  getVisibleTabs.ts → same across groups; getActiveEditor.ts → activeTextEditor?.document.uri.fsPath
```

Note the naming trap: `getOpenTabs` (TabInputText only) vs `getVisibleTabs` (visible in
groups) are distinct RPCs with different semantics — search-code sometimes confuses them.

## Vocabulary table (for auditing "what does the model see")

| Question | Where to look |
|---|---|
| What IDE state auto-enters prompts? | search for `visibleTextEditors`, `tabGroups.all`, `activeTextEditor` in extension source; trace into prompt/system-message builders |
| What is the prompt assembly entrypoint? | fork: `chat_systemMessage`-style builders in `common/prompt/`; extension: `getEnvironmentDetails`-style per-turn builders |
| Is open-file data used for retrieval or injected? | check whether tab lists feed a fuzzy picker (`file-search.ts` pattern) vs a prompt builder |
| Are user search queries forwarded? | extension API first (`vscode.d.ts` surface), then fork workbench patches, then leaked prompts |
| Query→LLM search services (not injection)? | `aiTextSearch`, `semanticSearchBehavior`, `keywordSuggestions` settings; provider registration of search result providers |

## Investigation workflow notes (what worked here)

- Clone only what is needed: `git clone --depth 1 --filter=blob:none` then sparse-checkout
  for monorepos (vscode). If `git-lfs` is missing, checkouts fail — tarball fallback
  (`codeload.github.com/<org>/<repo>/tar.gz/refs/heads/main`) is faster than fixing lfs.
- Read the leaked-prompt corpus at `x1xhlol/system-prompts-and-models-of-ai-tools` for
  closed-source tools (Cursor, Windsurf, Kiro, Trae, Amp, Devin, v0 …); grep for
  "automatically attach", "recently viewed", "open files".
- Check `@types/vscode` (npm) instead of cloning vscode for the extension API surface:
  `curl https://registry.npmjs.org/@types/vscode/-/vscode-<ver>.tgz` → `vscode/index.d.ts`.
  raw.githubusercontent 404s on some paths for the vscode repo; codeload/raw of specific
  files under `src/vs/workbench/...` may need a UA header and sometimes still 404s — retry
  with the refs/heads URL form.
