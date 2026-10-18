---
name: generative-ui-poc
description: "Use when comparing or prototyping model-generated UI."
version: 1.0.0
metadata:
  hermes:
    tags: [generative-ui, openui, a2ui, design-system, poc, streaming]
---

# Generative UI evaluation and PoC

For questions like "how does a Python agent server produce UI from our React design system, fast, without training the model" (OpenUI, A2UI, json-render, Prefab, ChatKit widgets, MCP Apps). The deliverable is a comparison grounded in evidence plus a PoC that actually ran, not a survey. 정혁 judges frameworks by how little the model has to write and how cleanly state, server calls, and agent calls fit together, so measure that.

## Procedure

1. **Frame with three separate questions.** What the model writes (props only / declarative tree / code), where it runs (host-native components / worker / sandboxed iframe), and how the design system reaches the model (template / catalog / prompt style). Mixing them makes every comparison muddy. Place each case on the Controlled, Declarative, Open-ended spectrum.
2. **Collect sources in this order:** the user's videos (transcripts via `youtube-content`), vendor docs for each framework, then the vendor's own claims about tokens or reliability. Label vendor numbers as self-reported unless you measured them. Treat third-party reverse-engineering (for example of ChatGPT Intelligent UI) as outside observation, not the vendor's statement.
3. **Compare the same eight facts per case:** model output format, where the design system connects, how the model learns the vocabulary, whether the model itself was trained for it, streaming unit, local (no-model) interaction path, path back to the server and to the model, execution boundary. "No training needed" holds for every case except a vendor that trained its own model.
4. **Score interaction on three tiers.** L0 local state and bindings, L1 deterministic server tool, L2 new agent turn. A framework that expresses all three in one syntax is the stronger fit; say which tier each case lacks.
5. **Build the PoC with the real packages** (`references/openui-poc-recipe.md`): catalog of the design system, generated system prompt, real model outputs, parser validation, rendered in a headless browser with interactions driven. A simulation of the format is not a PoC; if only a simulation exists, say so in the report.
6. **Report honestly.** Give sample size, state that parser-valid is not quality-valid, name the rules the model ignored, and name what the stack cannot do for a Python server (validator location, prompt generation location). Put these in the artifact as claim boundaries.

## Always-on rules

- Get PoC model outputs by giving a subagent only the generated prompt file and a request, with instructions not to run code or look at other samples; run each request at least twice. The subagent's model name is usually unknown, so record that.
- Check every figure you cite (sums, discounts, filter results) by reading it from the rendered page, not from the model's text.
- Keep a design-system catalog small (a dozen components for a PoC, 30 to 60 in production), props flat, enums for tokens, and a one-clause description saying when to use each. The same catalog text feeds the prompt and the validator.
- When recommending a stack for a Python server, state where validation runs. A JS-only parser means a Node sidecar, client-side error feedback, or a hosted service; a Python SDK validator changes the recommendation.
- Publish findings to Artifact Hub following `artifact-hub-publishing` (live demo block limits included). When the user asks to add content to a delivered artifact, update that artifact instead of creating a new one.

## Pitfalls

- Create the project directory and `cd` into it in the same command (or pass `workdir`); a failed `cd` makes `npm init` and `npm i` run in the previous working directory and pollute it.
- The terminal guard rejects foreground commands that mention bundler or dev-server names (such as `vite`) as long-lived servers. Use `esbuild` for one-shot bundles, and run installs with `background=true` plus a completion notification.
- React-controlled inputs ignore `el.value = x`. In headless tests set the value through the native prototype setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,v)`) and dispatch a bubbling `input` event (range) or `change` event (select).
- `tiktoken` is not installed by default: `pip install --target /tmp/tk tiktoken` and run with `PYTHONPATH=/tmp/tk`. Report counts as proxy values unless the target model's tokenizer was used.
