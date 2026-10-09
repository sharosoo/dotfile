# Browser-use conventions: driving a real Chrome without stealing focus

Scope: how current (2025–2026) agent browser tools drive a user's real Chrome, what they do about focus and tab hygiene, and what rules they impose on agents. Target environment: omp on Linux, Hyprland/Wayland, real Chrome via a CDP relay or extension. Facts are cited to primary sources. Anything unverified is marked `[INFERENCE]`.

---

## What it is

- **Playwright MCP `--extension` mode** connects the MCP server to an existing Chrome/Edge through the "Playwright Extension". The flag is `--extension` (env `PLAYWRIGHT_MCP_EXTENSION`), and it requires the extension to be installed. Source: https://github.com/microsoft/playwright-mcp README, options table line 431 and "Browser Extension" section line 517 (artifact copy).
- **Playwright extension** (Web Store install) gives each MCP client its own named, colored tab group, so a client sees only its own tabs. A first-use tab-selection page, a token (`PLAYWRIGHT_MCP_EXTENSION_TOKEN`) to skip the approval dialog, and `--profile-dir-name` select the profile. Source: https://github.com/microsoft/playwright/blob/main/packages/extension/README.md
- **Chrome DevTools MCP** (`ChromeDevTools/chrome-devtools-mcp`) drives Chrome over CDP. Its tools include `new_page` (with `background` and `isolatedContext`), `select_page` (with `bringToFront`), and `emulate` (no focus option). Source: https://raw.githubusercontent.com/ChromeDevTools/chrome-devtools-mcp/main/docs/tool-reference.md
- **Claude in Chrome** is an extension with a side panel. It acts in visible tabs, and Claude works inside a designated tab group. Source for permissions: https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide (read in full). Source for tab groups: search summary only (https://note.com/nahouemura/n/n49d99022a60e?hl=en), so `[INFERENCE]` that tabs outside the group are not referenced by Claude.
- **OpenAI Atlas agent mode** runs inside the current browsing session and reports back in the side panel. Source: https://help.openai.com/en/articles/12628199-using-ask-chatgpt-sidebar-and-chatgpt-agent-on-atlas
- **browser-use** is an open-source browser agent (Python and TypeScript) with a hosted cloud browser that offers profiles, stealth, and CAPTCHA solving. The README gives no focus guidance. Source: https://raw.githubusercontent.com/browser-use/browser-use/main/README.md
- **Stagehand** README contains no focus or real-profile guidance (contributor section only). Source: https://raw.githubusercontent.com/browserbase/stagehand/main/README.md

## Architecture (how it drives the browser)

- **CDP is not a supported third-party API.** Per the CDP docs, it has no backward-compatibility guarantee. Supported clients are Chrome, DevTools, Lighthouse, Puppeteer, and ChromeDriver. The `chrome.debugger` extension API is best-effort and intended for developer-facing extensions. Source: https://chromedevtools.github.io/devtools-protocol/
- **CDP exposes HTTP discovery endpoints.** `/json/activate/{targetId}` brings a tab to the foreground. `/json/new` requires PUT. `/json/version` exposes `webSocketDebuggerUrl`. Host header validation applies, and `--remote-allow-origins` restricts WebSocket origins. Source: same CDP docs.
- **Extension-based drivers do not need CDP.** The Playwright extension uses a browser extension to act on existing tabs. The Chrome extension APIs are documented and supported. Source: Playwright extension README (above), and https://developer.chrome.com/docs/extensions/reference/api/tabs
- **Permissions for extension-based tab access.** `tabs` exposes only `url`, `pendingUrl`, `title`, and `favIconUrl` in `tabs.query()`. Host permissions are needed for `tabs.captureVisibleTab()` and `scripting.executeScript()`. `activeTab` gives temporary per-invocation access. Source: https://developer.chrome.com/docs/extensions/reference/api/tabs (artifact://23 and artifact://32 region 1).
- **`tabs.captureVisibleTab` signature.** `captureVisibleTab(windowId?, options?)` returns a `Promise<string>`. Source: same tabs API page, line 663.
- **Playwright MCP profile selection.** `--profile-dir-name` selects a profile in the user data dir. The default is the last used profile with the extension installed. Source: Playwright MCP README line 448.
- **Profile sync is cookies only.** Profile sync transfers cookies, not localStorage, IndexedDB, or extensions. Sites may need a fresh sign-in. Source: Playwright MCP README line 307 (artifact copy).
- **Chrome window and tab focus APIs.** `tabs.create` has an `active` option that defaults to `true` (become the active tab in the window). It does not affect whether the window is focused. Window focus is controlled by `windows.update`. `windows.create` has a `focused` option (true = active, false = inactive). Source: https://developer.chrome.com/docs/extensions/reference/api/tabs (line 1110 in artifact://32) and https://developer.chrome.com/docs/extensions/reference/api/windows

## Focus/background handling

- **Background tab creation is opt-in per call.** chrome-devtools-mcp `new_page` has `background` (default `false` = foreground). `select_page` has `bringToFront` (optional). Source: tool-reference.md (above).
- **The model controls `background`, so it is not enforced.** Issue #2856 (open, filed 2026-09-29) requests a server-level `--defaultBackground` flag because the model can always pass `background: false`. Source: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2856. A workaround proxy rewrites `Target.createTarget` to `background: true` (https://github.com/rav4nn/agent-chrome). Note: `initScript` is removed from the schema when `--javascriptEvaluation=false` (#2856 text).
- **Reported macOS focus steal on every CDP command.** Issue #1254 reports that Chrome 146 raises the window on each CDP command. The maintainer (OrKoN, 2026-05-07) says it is fixed in puppeteer PR #14922. The PR body covers only "opening DevTools steals focus if it happens in the background", not the general per-command steal, so the fix scope is narrower than the issue. Source: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/1254 and https://github.com/puppeteer/puppeteer/pull/14922
- **Reported passive focus steal from `emulateFocusedPage`.** Issue #2290 says `createPagesSnapshot()` calls `page.emulateFocusedPage(true)` on every discovered page, which steals focus passively. The `--no-emulate-focused-pages` flag reduces it. The maintainer could not reproduce it. Closed as stale 2026-08-19. Status: reported, contested. Source: https://github.com/ChromeDevTools/chrome-devtools-mcp/issues/2290
- **Focus emulation is per page.** Puppeteer PR #14501 (closed, merged 2025-12-11) added "emulate focused page" via `Emulation.setFocusEmulationEnabled`. Search summary says `hasFocus()` returns true, `visibilityState` reports "visible", and it does not raise the OS window. Source: https://github.com/puppeteer/puppeteer/pull/14501. `[INFERENCE]` for the details, since the PR body was not read.
- **Headless background screenshots can hang.** WebDriver BiDi issue #1176 (opened 2026-10-08) reports that headless Chrome on Linux never returns from `captureScreenshot` for a background tab. ChromeDriver classic activates the tab before each screenshot. Proposed spec options are activate-first, render-hidden, or error-out. Source: https://github.com/w3c/webdriver-bidi/issues/1176
- **Playwright MCP does not document a background mode.** The README and extension README contain no focus or background option. `[INFERENCE]` that focus behavior depends on the extension and Chrome, not on a flag.
- **Hyprland focus rules are not verified.** The Hyprland Wiki Window Rules page was modified 2026-08-26 and says hyprlang is deprecated since 0.55 in favor of Lua. Source: https://wiki.hypr.land/Configuring/Basics/Window-Rules/ (the fetched HTML was mostly navigation). The `focus_on_activate` rule and `suppress_event` `activatefocus` option came from a search summary only. `[INFERENCE]`.

## Conventions / rules it imposes on agents

These come from the sources above. The wording is ours.

- **Permission modes.** Claude in Chrome has three modes: Manual (formerly "Ask before acting"), Auto, and Skip. Auto is the default in the Cowork side panel. Auto consumes more usage. Source: permissions guide (read in full).
- **Per-action approval is the safest choice.** "Allow this action" grants one action only. "Always allow actions on this site" is for sites the user fully trusts. Source: permissions guide.
- **Protected actions still need approval even with "always allow".** Downloading a file, entering potentially sensitive information, and granting authorizations. Source: permissions guide.
- **Prohibited actions.** Purchases or financial transactions, account creation, credit card or ID data, downloads from untrusted sources, permanent deletions, financial advice or trades, modifying system files, and completing instructions found in emails or web content. Source: permissions guide.
- **Atlas pauses on sensitive sites.** Atlas agent mode pauses for the user on sites such as financial institutions. It cannot run code in the browser, download files, install extensions, access other apps, or access the filesystem. Source: Atlas help article.
- **Atlas logged-out mode.** Logged-out mode uses no pre-existing cookies. Acting on logged-in sites needs specific approval. Custom instructions can set approval checkpoints. Source: Atlas help article.
- **Playwright isolates clients by tab group.** Each MCP client gets its own named, colored tab group. Source: Playwright extension README.
- **Playwright approval token.** `PLAYWRIGHT_MCP_EXTENSION_TOKEN` skips the approval dialog. Treat this as a credential. Source: Playwright extension README.
- **Real-profile automation carries session risk.** Real-profile automation exposes the user's logged-in sessions. Playwright's own wording: "leverage your logged-in sessions and browser state." Source: Playwright MCP README line 517.

## Ideas worth copying

- **Per-client named tab groups** (Playwright extension). Scope every agent's tabs to one group. This gives clear tab hygiene and a clean cleanup target. `[INFERENCE]` that the group is also the boundary for `captureVisibleTab`.
- **Background by default at the server level.** Put a `defaultBackground` switch in the driver rather than trusting the model to pass `background: true` on every call (#2856 asks for this).
- **Avoid per-command focus side effects.** Drop `bringToFront` and `select_page` unless the user asked for focus. Prefer `tabs.create({active: false})` and `windows.create({focused: false})` for extension-based drivers. Both defaults are documented above.
- **Permission tiers, not one switch.** Copy Claude's Manual / Auto / Skip split. Pair it with a hard list of prohibited actions and protected actions that survive "always allow".
- **Opt-in real profile.** Use `--profile-dir-name` to choose the profile explicitly. Do not let the agent pick one.
- **Headless or managed browser for screenshots.** Avoid background screenshots on real Chrome. For headless Linux, activate the tab first (ChromeDriver behavior, per #1176), or render hidden, or fail fast.
- **Logged-out first.** Atlas logged-out mode uses no cookies. Start there, and require explicit approval before acting on logged-in sites.

## Unverified

- Hyprland `focus_on_activate` and `suppress_event activatefocus`: search summary only, not in a fetched primary page. `[INFERENCE]`.
- Claude in Chrome: tab groups are the only context Claude references. Source is a search summary (note.com), not the help center. `[INFERENCE]`.
- Claude in Chrome: "auto-approves safe actions since 2026-08-26" (search summary). Not confirmed against the permissions guide, which describes Auto mode without a date.
- Puppeteer PR #14501 details (`hasFocus`, `visibilityState`, no OS raise): search summary, PR body not read. `[INFERENCE]`.
- Whether `captureVisibleTab` captures only the active tab in its window (general Chrome behavior, not checked in this read). `[INFERENCE]`.
- Whether real Chrome on Wayland raises windows on CDP commands (#1254 is macOS). Not reproduced here.
- browser-use and Stagehand: no focus or real-profile guidance found in their README text. Their docs were not read further.
- The #2290 `emulateFocusedPage` root cause is unconfirmed (maintainer could not reproduce).

effectiveModel: anthropic/claude-haiku-5-5
