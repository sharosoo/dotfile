#!/usr/bin/env node
// scaffold-plan.mjs — generate the ulw-plan draft + plan skeleton deterministically.
// Ported from packages/shared-skills/skills/ulw-plan/scripts/scaffold-plan.mjs
// (code-yeongyu/oh-my-openagent). Zero external deps (node builtins only) so it
// runs byte-identically under `node` and `bun`.
//
// OMP adaptation: writes under project-local `plans/` and `drafts/` (OMO used `.omo/`).
// Path-safety confines writes to the workspace root and rejects symlinks/traversal.
//
// Usage:  bun scripts/scaffold-plan.mjs <slug> [--clear|--unclear] [--reset [--force]]

import { lstat, mkdir, writeFile, readFile, realpath } from "node:fs/promises";
import { dirname, join, relative, resolve, isAbsolute } from "node:path";

export const PLAN_SECTION_HEADERS = [
	"## TL;DR (For humans)",
	"## Scope",
	"## Verification strategy",
	"## Execution strategy",
	"## Todos",
	"## Final verification wave",
	"## Commit strategy",
	"## Success criteria",
];

export const FINAL_VERIFICATION_ITEMS = [
	"F1. Plan compliance audit",
	"F2. Code quality review",
	"F3. Real manual QA",
	"F4. Scope fidelity",
];

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{0,79}$/;
const ALLOWED_DIRS = ["plans", "drafts"];

export function parseArgs(argv) {
	const rest = argv.slice(2);
	let slug;
	let intent = "unspecified";
	let force = false;
	let reset = false;
	for (const arg of rest) {
		if (arg === "--clear") intent = "clear";
		else if (arg === "--unclear") intent = "unclear";
		else if (arg === "--reset") reset = true;
		else if (arg === "--force") force = true;
		else if (arg.startsWith("--")) throw new Error(`unknown flag: ${arg}`);
		else if (slug === undefined) slug = arg;
		else throw new Error(`unexpected argument: ${arg}`);
	}
	if (!slug) throw new Error("usage: scaffold-plan.mjs <slug> [--clear|--unclear] [--reset [--force]]");
	if (!SLUG_PATTERN.test(slug)) {
		throw new Error(`invalid slug "${slug}" - use lowercase letters, digits, and hyphens only`);
	}
	return { slug, intent, reset, force };
}

// Confine writes to <workspace>/plans|drafts/<slug>.md — no traversal, no symlinks.
export function resolveSafePath(cwd, relPath) {
	const resolved = resolve(cwd, relPath);
	const rel = relative(cwd, resolved);
	if (rel.startsWith("..") || isAbsolute(rel)) {
		throw new Error(`refused: path escapes the workspace root: ${relPath}`);
	}
	const firstSeg = rel.split(/[/\\]/)[0];
	if (!ALLOWED_DIRS.includes(firstSeg)) {
		throw new Error(`refused: ulw-plan may only write under ${ALLOWED_DIRS.join("/")}: ${relPath}`);
	}
	if (!resolved.toLowerCase().endsWith(".md")) {
		throw new Error(`refused: ulw-plan may only write .md files: ${relPath}`);
	}
	return resolved;
}

function assertContainedPath(parent, child, message) {
	const rel = relative(parent, child);
	if (rel.startsWith("..") || isAbsolute(rel)) throw new Error(message);
}

async function mkdirWithoutSymlinks(dir, stopAt) {
	if (dir === stopAt) return;
	const parent = dirname(dir);
	if (parent === dir || relative(stopAt, dir).startsWith("..") || isAbsolute(relative(stopAt, dir))) {
		throw new Error(`refused: path escapes the workspace root: ${dir}`);
	}
	await mkdirWithoutSymlinks(parent, stopAt);
	const stat = await lstat(dir).catch((err) => {
		if (err && err.code === "ENOENT") return null;
		throw err;
	});
	if (stat) {
		if (stat.isSymbolicLink()) throw new Error(`refused: path component is a symlink: ${dir}`);
		if (!stat.isDirectory()) throw new Error(`refused: path component is not a directory: ${dir}`);
		return;
	}
	await mkdir(dir);
}

async function assertSafeWriteParent(cwd, target) {
	const workspaceReal = await realpath(cwd);
	const workspaceRoot = resolve(cwd);
	const parent = dirname(target);
	assertContainedPath(workspaceRoot, parent, `refused: path escapes the workspace root: ${target}`);
	await mkdirWithoutSymlinks(parent, workspaceRoot);
	const parentReal = await realpath(parent);
	assertContainedPath(workspaceReal, parentReal, `refused: path escapes the workspace root through symlinks: ${target}`);
}

async function assertSafeWriteTarget(target) {
	const stat = await lstat(target).catch((err) => {
		if (err && err.code === "ENOENT") return null;
		throw err;
	});
	if (stat?.isSymbolicLink()) throw new Error(`refused: target is a symlink: ${target}`);
}

export function isUlwArtifact(content) {
	const isPlan = content.includes("## TL;DR (For humans)") && content.includes("## Final verification wave");
	const isDraft = content.includes("# Draft:") && content.includes("## Approval gate");
	return isPlan || isDraft;
}

export function buildDraft(slug, intent) {
	const assumptionsNote =
		intent === "unclear"
			? "Intent is UNCLEAR: research resolves ambiguity, defaults are adopted (not asked), and each is surfaced in the plan's human TL;DR for veto."
			: "Record any default you adopt instead of asking, so the user can veto it at the gate.";
	return `---
slug: ${slug}
status: drafting
intent: ${intent}
pending-action: write plans/${slug}.md
approach: <fill: the approach you intend to plan>
---

# Draft: ${slug}

## Components (topology ledger)
<!-- Lock the SHAPE before depth. One row per top-level component that can succeed or fail independently. -->
<!-- id | outcome (one line) | status: active|deferred | evidence path -->

## Open assumptions (announced defaults)
<!-- ${assumptionsNote} -->
<!-- assumption | adopted default | rationale | reversible? -->

## Findings (cited - path:lines)

## Decisions (with rationale)

## Scope IN

## Scope OUT (Must NOT have)

## Open questions

## Approval gate
status: drafting
<!-- When exploration is exhausted and unknowns are answered, set status: awaiting-approval. -->
<!-- That durable record is the loop guard: on a later turn read it and resume at the gate instead of re-running exploration. -->
`;
}

export function buildPlanSkeleton(slug, intent) {
	const decisionsLine =
		intent === "unclear"
			? "**Decisions I made for you:** <fill last - the best-practice defaults you adopted; the user vetoes any here>"
			: "**Decisions to sanity-check:** <fill last - the few choices worth a human glance>";
	return `# ${slug} - Work Plan

## TL;DR (For humans)
<!-- Fill this LAST, after the detailed plan below is written, so it summarizes the REAL plan. -->
<!-- Plain English for a non-engineer: NO file paths, NO todo numbers, NO wave/agent/tool names. -->

**What you'll get:** <fill last - deliverables in human terms, 1-2 sentences>

**Why this approach:** <fill last - the one or two load-bearing decisions and why>

**What it will NOT do:** <fill last - 1-3 plain lines mirroring Must NOT have>

**Effort:** <Quick | Short | Medium | Large | XL>
**Risk:** <Low | Medium | High> - <one-line driver>
${decisionsLine}

Your next move: <fill - e.g. approve, or run a high-accuracy review>. Full execution detail follows below.

---

> TL;DR (machine): <1 line - effort, risk, deliverables>

## Scope
### Must have
### Must NOT have (guardrails, anti-slop, scope boundaries)

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: <TDD | tests-after | none> + framework
- Evidence: evidence/task-<N>-${slug}.<ext>

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |

## Todos
> Implementation + Test = ONE todo. Never separate.
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit - never rewrite the headers above. -->
- [ ] 1. <title>
  What to do / Must NOT do: <...>
  Parallelization: Wave <N> | Blocked by: <...> | Blocks: <...>
  References (executor has NO interview context - be exhaustive): <src/path:lines>
  Acceptance criteria (agent-executable): <exact command or assertion>
  QA scenarios (name the exact tool + invocation): happy + failure, Evidence evidence/task-1-${slug}.<ext>
  Commit: <Y/N> | <type>(<scope>): <summary>

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
${FINAL_VERIFICATION_ITEMS.map((item) => `- [ ] ${item}`).join("\n")}

## Commit strategy

## Success criteria
`;
}

// Resume-safe write: plain re-run on an existing ulw-plan artifact is a no-op
// success; --reset overwrites but refuses to discard a hand-edited file unless
// --force is also passed.
export async function writeGuarded(cwd, relPath, content, { reset = false, force = false } = {}) {
	const target = resolveSafePath(cwd, relPath);
	await assertSafeWriteParent(cwd, target);
	await assertSafeWriteTarget(target);
	const existing = await readFile(target, "utf8").catch(() => null);
	if (existing && existing.trim() !== "") {
		if (!reset) {
			if (isUlwArtifact(existing)) return { relPath, status: "exists" };
			throw new Error(`refused: ${relPath} exists and is not a ulw-plan artifact (pass --reset to overwrite)`);
		}
		if (existing.trim() !== content.trim() && !force) {
			throw new Error(`refused: ${relPath} has edits that differ from a fresh skeleton; pass --reset --force to discard them`);
		}
	}
	await writeFile(target, content, "utf8");
	return { relPath, status: existing ? "reset" : "created" };
}

export async function scaffold(cwd, { slug, intent, reset = false, force = false }) {
	const draftRel = join("drafts", `${slug}.md`);
	const planRel = join("plans", `${slug}.md`);
	const draft = await writeGuarded(cwd, draftRel, buildDraft(slug, intent), { reset, force });
	const plan = await writeGuarded(cwd, planRel, buildPlanSkeleton(slug, intent), { reset, force });
	return [draft, plan];
}

async function main() {
	const { slug, intent, reset, force } = parseArgs(process.argv);
	const results = await scaffold(process.cwd(), { slug, intent, reset, force });
	for (const r of results) process.stdout.write(`${r.status}: ${r.relPath}\n`);
	const created = results.some((r) => r.status !== "exists");
	process.stdout.write(
		created
			? `next: record findings/decisions in the draft, then APPEND task batches into the "## Todos" region of the plan; fill "## TL;DR (For humans)" LAST.\n`
			: `skeleton already present - left untouched. APPEND task batches into the "## Todos" region; the human "## TL;DR (For humans)" stays on top.\n`,
	);
}

if (import.meta.main) main();
