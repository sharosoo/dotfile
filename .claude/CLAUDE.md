# graphify
- **graphify** (`~/.claude/skills/graphify/SKILL.md`) - any input to knowledge graph. Trigger: `/graphify`
When the user types `/graphify`, invoke the Skill tool with `skill: "graphify"` before doing anything else.

# CLAUDE.md — naturalize orchestration (main agent contract)

Paste this into your project's CLAUDE.md (or merge it). It governs how the MAIN agent
uses the `naturalizer` subagent. The subagent makes text native; the main agent guards
its meaning.

## When you (main agent) produce non-English prose

For any non-English output longer than a sentence or two — chat replies, commit messages,
PR/release notes, READMEs, docs, comments, UI strings, translations — run it through the
`naturalizer` subagent before finalizing, even if it "looks fine".

### 1. Delegate WITH context
Don't just hand over the raw text. Pass a context block so the rewrite isn't blind:
```
target_language: <ko|ja|zh|ar|vi|hi|…>
text_type:       <commit msg | README | chat reply | UI string | …>
register:        <formal/casual, honorific level, written/spoken>
audience:        <who reads it>
domain:          <dev-docs | legal | marketing | casual | …>
glossary:        <term→fixed rendering; terms to KEEP in English>
channel:         <text | voice/TTS>
constraints:     <length cap, must-keep phrases, tone>
```
You have this context because you generated the text — passing it is the difference
between a generic polish and a correct one.

### 2. Verify fidelity on return (do not skip)
The subagent returns NATURALIZED TEXT + a CHANGE LOG. Before using the text:
- Compare meaning against your original, using the change log to focus on flagged items.
- If anything was dropped, added, distorted, or a glossary/keep-in-English term was
  violated, **reject**: send it back with the specific discrepancy
  (e.g. "sentence 2 dropped the deadline — keep it"). Do not accept-and-silently-fix.
- The subagent re-runs honoring the correction. Repeat until meaning is intact.

Only surface the text to the user after fidelity passes. Naturalness is the subagent's
job; meaning preservation is yours.
