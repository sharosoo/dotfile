# OpenUI PoC recipe and findings

Versions used: `@openuidev/react-lang` 1.0.1, `@openuidev/lang-core` 1.0.1, `@openuidev/cli` 0.6.0, zod 4, React 19.

## Build steps

1. `mkdir -p ~/workspaces/<poc> && cd` there; `npm i react react-dom zod @openuidev/react-lang @openuidev/lang-core @openuidev/cli esbuild` (background, with notification).
2. `src/library.tsx`: `defineComponent({name, description, props: z.object({...}), component})` per design-system component; `import { z } from "zod/v4"`; props order is positional argument order (required first, most distinctive prop first). Containers use `z.array(z.union([A.ref, B.ref]))` and `renderNode(props.children)`. Input props that bind to `$variables` are `reactive(z.number().optional())` and the component reads and writes with `useStateField(props.name, props.value)`. Buttons take `action: action().optional()` and call `useTriggerAction()(label, undefined, props.action)`. Custom pure functions use `defineFunction`; export `PromptOptions` (`preamble`, `tools` as ToolSpec, `toolExamples`, `additionalRules`) next to the library so the CLI picks them up.
3. Prompt: `npx openui generate src/library.tsx --no-telemetry --out system-prompt.txt` writes the prompt and `system-prompt.spec.json`. A Python server reads the txt at startup; it cannot call `generateSystemPrompt` (JS only).
4. Validation in Node: bundle `library.tsx` to CJS with esbuild, then `createParser(library.toJSONSchema(), library.root).parse(text)`; errors are in `result.meta.errors` with codes `type-mismatch`, `unknown-component`, `unknown-function`, `missing-required`, `no-root`.
5. Browser: `Renderer` from react-lang with `library`, `response` (growing string), `isStreaming`, `toolProvider` (function map for `Query` and `Mutation`), `onAction` (the `continue_conversation` event carries `params.context` and form state), `onError`. Replaying a sample by appending characters on a timer reproduces progressive rendering.
6. Headless check: bundle the app as IIFE with `process.env.NODE_ENV` defined as production, link the Artifact Hub `tokens.css`, append a test script that drives inputs after the stream finishes, then `chromium --headless=new --no-sandbox --disable-gpu --virtual-time-budget=20000 --dump-dom page.html` and read counters and log text.

## Findings worth remembering

- A custom library's generated prompt still contains boilerplate that names built-in components (`SelectItem`, `FormControl`, `Input`, `Form`, `TextContent`). No option to remove it was found; check whether the model emits those names, and post-process the prompt if so.
- A rule such as "never compute amounts by hand" is followed most of the time but not always (one of six outputs hard-coded a derived number). The parser cannot catch wrong values; verify numbers in rendered output.
- A `Query` whose arguments reference a `$variable` refetches automatically when the variable changes; the tool-call counter rises while the model-call counter stays flat. `@ToAssistant(message, context)` is the only path back to the model.
- The official FastAPI example has the frontend send `systemPrompt` in the request body. For an internal server keep the prompt server-side.
- Bundle size: React, zod, and react-lang minified come to about 800KB. Inside an Artifact Hub Markdown document you do not ship any of this: the native ```openui fence runs the full v0.5 language ($state, @ functions, actions, Query/Mutation via `http_get` and per-document `store_*` tools) with Artifact Hub's own component library and a shared `/_theme/openui.js` runtime (see `artifact-hub-publishing` → `references/rich-markdown-and-charts.md`). Only a PoC that needs your own custom component library or a real tool backend still needs a live block with the jsDelivr `+esm` pattern; react-lang's `+esm` imports react, lang-core, and zod/v4 at pinned versions that your own imports must match.
- Token proxy (o200k): the generated prompt for a 12-component catalog was about 4.2K tokens and a typical model-written screen 440 to 590 tokens.
