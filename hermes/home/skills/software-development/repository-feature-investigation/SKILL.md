---
name: repository-feature-investigation
description: "Use when tracing repository features to exact evidence."
version: 1.0.0
author: Hermes Agent
license: MIT
platforms: [linux, macos, windows]
metadata:
  hermes:
    tags: [repository, code-reading, feature-tracing, tests, git-history, evidence]
    related_skills: [codebase-inspection, requesting-code-review, runtime-configuration-integrity]
---

# Repository Feature Investigation

## Overview

Use this skill for evidence-backed repository reconnaissance when the user wants to know whether a capability already exists, where it is implemented, how it behaves across layers, what tests protect it, and when it was introduced. The deliverable is a map of the current implementation, not a proposed design and not a broad grep dump.

The investigation should follow a behavior through its full path: input or surface → domain/application orchestration → persistence/state → provider or infrastructure boundary → tests → relevant commits. Prefer exact file paths, symbols, line ranges, and commit SHAs. Clearly separate current worktree evidence from historical evidence recovered with `git show`.

## When to Use

- User asks whether a feature, behavior, or architectural pattern already exists.
- User asks for exact implementation paths, symbols, tests, or commit history.
- User asks about cross-layer behavior such as persistence, replay, routing, caching, provider affinity, or UI-to-backend context flow.
- User asks to inspect without modifying files.

Do not use this as a generic LOC report; use `github:codebase-inspection` for pygount-based size/language metrics. Do not turn a one-off finding into a narrow skill; add durable technique here or place session-specific evidence in `references/`.

## Investigation Workflow

### 1. Establish scope and repository state

1. Resolve the repository root with `git rev-parse --show-toplevel` and inspect the active branch, `git rev-parse HEAD`, and `git status --short`.
2. Treat the current worktree as the primary source. Do not infer current behavior from commit messages alone.
3. Record a clean/modified status before and after the investigation when the user requested no changes. Completion criterion: the final report can state the exact HEAD/branch and whether the worktree remained unmodified.

### 2. Build a vocabulary before searching

Translate the user’s concepts into implementation terms before searching. Use several synonym families:

| Concept | Search families |
|---|---|
| Reasoning state | `thinking`, `reasoning`, `reasoning_content`, `signature`, `thought_signature`, `encrypted_content`, `native_output` |
| Continuation | `continuation`, `replay`, `restore`, `snapshot`, `previous_response_id`, `conversation_id`, `append_*` |
| Generated outputs | `artifact`, `artifact_id`, `message_type`, `content_blocks`, `output`, `result`, `reference` |
| Affinity/routing | `provider`, `transport`, `binding`, `routing_family`, `profile`, `cache`, `session_id`, `conversation_affinity` |

Search both source and tests. Narrow broad results by path and file type before reading. Completion criterion: each requested concept has at least one candidate implementation path or an explicitly documented absence.

### 3. Trace contracts before adapters

Read the provider-neutral types and ports first. Look for:

- request/result dataclasses and typed envelopes;
- persistence schemas and validation rules;
- neutral message shapes carrying provider-specific metadata;
- domain policies that determine model, provider, or transport selection.

Then follow the call chain into application services, routers, adapters, and provider transports. This prevents confusing a provider-specific helper with the system’s actual continuity contract.

### 4. For state/replay, prove round-trip behavior

When investigating native state, answer these separately:

1. How is the provider output captured?
2. How is it tagged with provider/model/transport identity?
3. How is it serialized and persisted?
4. Under what conditions is it restored or overlaid?
5. What happens on model/provider/wire mismatch?
6. Is the next model call avoided, or is only the prior reasoning state preserved?

Look for exact-match guards, pruning logic, wire envelopes, and provider-specific converters. Do not equate “continuation” with “no new model call.” In tool loops, continuation normally means a new request whose prior assistant/tool topology and native state are replayed.

### 5. For artifact-backed or feature-surface chat, distinguish live context from history

Trace both paths:

- persisted artifact/message references used to reconstruct prior context;
- volatile live context resolved fresh and folded into the current turn.

Check whether a surface uses a context provider, a read tool, a persisted tool result, or a dedicated chat profile. Fresh live state should usually be tested for direct edits between two resolutions. Also check whether dynamic context is kept outside a stable/cacheable system prefix.

### 6. For affinity, follow all axes

Do not assume a model id uniquely identifies a provider. Inspect:

- logical model id;
- branded/public alias;
- runtime model id;
- provider;
- transport;
- route/SDK model id;
- default and explicit bindings;
- cache stable-prefix key;
- conversation/session affinity key.

Verify whether cache keys include model identity and whether conversation affinity is separate from stable prompt identity. Check whether native payloads are pruned when provider or model changes.

### 7. Read tests as behavioral contracts

Prefer named tests over test-file names alone. Extract the assertion that proves the behavior, especially:

- capture → JSON round-trip → replay;
- provider/model mismatch pruning;
- exact tool-call signature preservation;
- byte-stable prompt/cache topology;
- fresh live-context resolution after an edit;
- branded-model and routing-family mappings.

If tests cannot run, report the exact command and blocker. Never convert a collection/import failure into a test pass or infer results from source inspection.

### 8. Use Git history to explain origin, not to replace current evidence

Use `git log -- <paths>` to find likely commits, then `git show --stat` and `git show <sha> -- <path>` to identify the introducing or corrective change. Include short SHAs and subjects. If a path exists only in an earlier commit, label it historical and say it is absent from the current worktree; do not present it as current implementation.

## Reporting Format

Organize the final answer by the user’s requested concepts. For each finding include:

- **Current behavior:** one or two precise sentences.
- **Implementation:** exact path, symbol, and useful line range.
- **Tests:** exact test path and test function names, with what each proves.
- **History:** relevant commit SHA and subject, if available.
- **Qualification:** current vs historical, fallback behavior, mismatch behavior, or unverified test status.

Close with:

- repository HEAD and branch;
- worktree modification status;
- test execution status, including blockers;
- any important negative finding, such as a token appearing only in an allowlist rather than being used as the actual continuation mechanism.

Avoid dumping hundreds of grep matches. Compress repeated provider details into a table, but retain exact paths and symbols for every material claim.

## Common Pitfalls

1. **Treating search volume as evidence.** Hundreds of matches do not prove a feature exists. Read the contract, call site, persistence path, and tests.
2. **Reporting historical code as current.** Verify every path in the current worktree; use `git show` only when explicitly marking historical behavior.
3. **Calling tool-loop replay “no rethinking.”** A continuation still makes a new provider request. State precisely whether the implementation preserves native state, avoids canonical reconstruction, or actually reuses a provider response id.
4. **Ignoring identity boundaries.** Provider-native state is opaque and often invalid across providers, transports, or model ids. Find and report pruning/mismatch guards.
5. **Confusing display artifacts with LLM context.** A UI card or artifact reference may be flattened, expanded, or excluded differently from a real tool-use/tool-result turn.
6. **Missing cache topology.** Dynamic context can invalidate caches if placed in the stable system prefix. Inspect where it is folded and test whether the stable prefix remains unchanged.
7. **Overstating test status.** If collection fails due to setup, say so exactly. Do not report source-level confidence as executed test evidence.
8. **Modifying the repository during inspection.** Use read-only commands and tools. If a generated file or cache changes unexpectedly, disclose it and re-check `git status`.

## Verification Checklist

- [ ] Repository root, branch, HEAD, and initial/final worktree status recorded.
- [ ] Each requested concept has a traced implementation path or an explicit negative finding.
- [ ] Provider-neutral contracts were read before provider adapters.
- [ ] Persistence, restore/overlay, mismatch pruning, and provider conversion were checked for replay/state investigations.
- [ ] Live feature context was separated from persisted history and UI-only artifact cards.
- [ ] Model, provider, transport, route, and cache/conversation affinity were distinguished.
- [ ] Relevant tests are named individually and their assertions summarized.
- [ ] Tests were run when practical; any collection/runtime blocker is reported verbatim.
- [ ] Historical commits are labeled historical and current paths are not inferred from old commits.
- [ ] No files were modified for a read-only inspection.

## Session-Specific References

- Native reasoning/replay, artifact-backed chat, live feature context, affinity, tests, and commit evidence from a provider-continuity investigation: `references/provider-native-chat-investigation.md`.
