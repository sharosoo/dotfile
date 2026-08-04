import * as os from "node:os";
import * as path from "node:path";
import { route, AGENT_DEFAULT_ROLE, type Assignment, type PersonaConfig, EMPTY_CONFIG, type Resolver } from "./router";
import { parsePersonaConfig } from "./config";
import {
	createLoopState,
	decideContinue,
	buildNudge,
	stopLoop,
	type LoopState,
} from "./loop";

// ---------------------------------------------------------------------------
// Minimal local view of the OMP extension surfaces this package uses.
// Defined locally so the package type-checks standalone; the real ExtensionAPI
// is a structural superset.
// ---------------------------------------------------------------------------

export interface OmpModelHandle {
	provider: string;
	id: string;
}

export interface OmpModelsFacade {
	// OMP's ctx.models.resolve — returns the opaque Model object (pass it to
	// setModel) or undefined. provider/id extracted for display via guards.
	resolve(spec: string): unknown;
}

export interface OmpUiContext {
	notify(message: string, level?: "info" | "warn" | "error"): void;
}

export interface OmpExtensionContext {
	readonly cwd: string;
	readonly models: OmpModelsFacade;
	readonly ui: OmpUiContext;
}

export interface OmpCommandSpec {
	description: string;
	handler: (args: string, ctx: OmpExtensionContext) => Promise<void> | void;
}

// Matches OMP's SessionStopEventResult exactly (shared-events.ts).
export interface OmpSessionStopResult {
	readonly continue?: boolean;
	readonly additionalContext?: string;
	readonly decision?: "block";
	readonly reason?: string;
}

export type OmpEventHandler = (event: unknown, ctx: OmpExtensionContext) => unknown;

export interface OmpExtensionApi {
	registerCommand(name: string, spec: OmpCommandSpec): void;
	on(event: string, handler: OmpEventHandler): void;
	setLabel?(label: string): void;
	// Send a user message (string content) — starts/queues a turn.
	sendUserMessage?(content: string, options?: { deliverAs?: "steer" | "followUp" }): void;
	// Set the active model. Takes the opaque Model object from ctx.models.resolve.
	// Returns false if no API key is available.
	setModel?(model: unknown): boolean | Promise<boolean>;
}

// Extract a {provider, id} handle from the opaque Model object (no inline cast).
function modelHandle(model: unknown): OmpModelHandle | undefined {
	if (!model || typeof model !== "object") return undefined;
	if (!("provider" in model) || !("id" in model)) return undefined;
	const provider = model.provider;
	const id = model.id;
	if (typeof provider !== "string" || typeof id !== "string") return undefined;
	return { provider, id };
}

function buildResolver(models: OmpModelsFacade): Resolver {
	return (spec: string) => modelHandle(models.resolve(spec));
}

// ---------------------------------------------------------------------------
// Config: read ~/.omp/agent/omo-personas.json if present (JSON, zero deps).
// ---------------------------------------------------------------------------

function configPath(): string {
	return path.join(os.homedir(), ".omp", "agent", "omo-personas.json");
}

async function loadConfig(): Promise<PersonaConfig> {
	try {
		const file = Bun.file(configPath());
		const exists = await file.exists();
		if (!exists) return EMPTY_CONFIG;
		const raw: unknown = await file.json();
		return parsePersonaConfig(raw);
	} catch {
		return EMPTY_CONFIG;
	}
}

async function compute(ctx: OmpExtensionContext): Promise<Assignment[]> {
	const config = await loadConfig();
	return route(buildResolver(ctx.models), config);
}

// ---------------------------------------------------------------------------
// Report formatting (omo-doctor).
// ---------------------------------------------------------------------------

function formatLine(a: Assignment): string {
	const status = a.model
		? `${a.model.provider}/${a.model.id}${a.thinking ? ` [${a.thinking}]` : ""}`
		: "— unassigned —";
	const binding = a.modelRole ? ` (role: ${a.modelRole})` : "";
	const sourceTag = a.source === "role" ? "" : ` <${a.source}>`;
	return `  ${a.persona.padEnd(16)} ${status}${binding}${sourceTag}`;
}

function formatReport(assignments: readonly Assignment[]): string {
	const header = "OMO persona router — effective resolution";
	const body = assignments.map(formatLine).join("\n");
	const warnings = assignments
		.filter((a) => a.warnings.length > 0)
		.flatMap((a) => a.warnings.map((w) => `  ⚠ ${a.persona}: ${w}`));
	const tail =
		warnings.length > 0 ? `\nWarnings:\n${warnings.join("\n")}` : "\nNo warnings.";
	return `${header}\n${"-".repeat(header.length)}\n${body}${tail}`;
}

// ---------------------------------------------------------------------------
// Apply: write each persona agent's model:/thinkingLevel: frontmatter and,
// when a model-family variant body exists under variants/<agent>/<family>.md,
// swap the prompt body too.
// ---------------------------------------------------------------------------

function packageRoot(): string {
	return path.resolve(import.meta.dir, "..");
}

function agentsDir(): string {
	return path.join(packageRoot(), "agents");
}

function variantsDir(): string {
	return path.join(packageRoot(), "variants");
}

function replaceFrontmatterField(
	frontmatter: string,
	key: string,
	value: string | null,
): string {
	const lines = frontmatter.split("\n");
	const without = lines.filter((line) => !line.startsWith(`${key}:`));
	if (value === null) return without.join("\n");
	return [...without, `${key}: ${value}`].join("\n");
}

async function readAgentFile(name: string): Promise<{ fm: string; body: string } | null> {
	const file = path.join(agentsDir(), `${name}.md`);
	const raw = await Bun.file(file).text();
	const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!match) return null;
	return { fm: match[1], body: match[2] };
}

function variantFamily(modelId: string): string | null {
	const id = modelId.toLowerCase();
	if (/fable/.test(id)) return "claude-fable-5";
	if (/opus-?4-?8/.test(id)) return "claude-opus-4-8";
	if (/opus-?4-?7/.test(id)) return "claude-opus-4-7";
	if (/sonnet|opus|haiku/.test(id)) return "claude";
	if (/k2\.?7|k2-?7/.test(id)) return "kimi-k2-7";
	if (/kimi.*k2/.test(id)) return "kimi-k2-6";
	if (/gpt-?5[.-]?5/.test(id)) return "gpt-5-5";
	if (/gpt-?5[.-]?4/.test(id)) return "gpt-5-4";
	if (/glm-?5[.-]?2/.test(id)) return "glm-5-2";
	if (/glm/.test(id)) return "glm";
	if (/gemini/.test(id)) return "gemini";
	return null;
}

async function variantBodyFor(
	agentName: string,
	modelId: string,
): Promise<string | null> {
	const family = variantFamily(modelId);
	if (!family) return null;
	const file = path.join(variantsDir(), agentName, `${family}.md`);
	try {
		const exists = await Bun.file(file).exists();
		if (!exists) return null;
		return await Bun.file(file).text();
	} catch {
		return null;
	}
}

async function rewriteAgent(
	name: string,
	model: { provider: string; id: string } | null,
	thinking: string | null,
): Promise<{ written: boolean; variantSwapped: boolean }> {
	const agent = await readAgentFile(name);
	if (!agent) return { written: false, variantSwapped: false };
	// model line always; thinkingLevel only when explicitly set (pin), else omit
	// so OMP's model-default / role thinking applies.
	const nextFm = replaceFrontmatterField(
		replaceFrontmatterField(agent.fm, "thinkingLevel", thinking),
		"model",
		model ? `${model.provider}/${model.id}` : null,
	);
	let nextBody = agent.body;
	let variantSwapped = false;
	if (model) {
		const vbody = await variantBodyFor(name, model.id);
		if (vbody !== null) {
			nextBody = `\n${vbody}\n`;
			variantSwapped = true;
		}
	}
	const next = `---\n${nextFm}\n---\n${nextBody}`;
	await Bun.write(path.join(agentsDir(), `${name}.md`), next);
	return { written: true, variantSwapped };
}

async function applyAssignments(
	assignments: readonly Assignment[],
): Promise<{ written: number; variantsSwapped: number }> {
	let written = 0;
	let variantsSwapped = 0;
	for (const a of assignments) {
		if (a.source === "disabled" || !a.model) continue;
		const result = await rewriteAgent(a.persona, a.model, a.thinking);
		if (result.written) written += 1;
		if (result.variantSwapped) variantsSwapped += 1;
	}
	return { written, variantsSwapped };
}

// ---------------------------------------------------------------------------
// Loop engine (ultrawork / ulw-loop) — module-level state, driven by the
// session_stop hook.
// ---------------------------------------------------------------------------

let loopState: LoopState | null = null;

async function completionMarkerPresent(): Promise<boolean> {
	try {
		const file = Bun.file(path.join(os.homedir(), ".omp", "agent", "ulw-complete.marker"));
		return await file.exists();
	} catch {
		return false;
	}
}

async function clearCompletionMarker(): Promise<void> {
	try {
		await Bun.write(path.join(os.homedir(), ".omp", "agent", "ulw-complete.marker"), "");
	} catch {
		// best-effort
	}
}

// ---------------------------------------------------------------------------
// Extension entry point.
// ---------------------------------------------------------------------------

export default function omoLayer(pi: OmpExtensionApi): void {
	pi.setLabel?.("OMO persona + loop layer");

	pi.registerCommand("omo-doctor", {
		description:
			"Report each agent's resolved model (role-based, tracks /model) plus warnings. No writes.",
		handler: async (_args, ctx) => {
			const assignments = await compute(ctx);
			ctx.ui.notify(formatReport(assignments), "info");
		},
	});

	pi.registerCommand("omo-route", {
		description:
			"Materialize resolved models into agents/*.md frontmatter (and swap variant bodies when present). Re-run after changing /model roles or pins.",
		handler: async (_args, ctx) => {
			const assignments = await compute(ctx);
			const { written, variantsSwapped } = await applyAssignments(assignments);
			ctx.ui.notify(
				`${formatReport(assignments)}\n\nMaterialized ${written} agent file(s); ${variantsSwapped} variant swap(s).`,
				"info",
			);
		},
	});

	pi.registerCommand("omo-apply", {
		description: "Alias for /omo-route.",
		handler: async (_args, ctx) => {
			const assignments = await compute(ctx);
			const { written } = await applyAssignments(assignments);
			ctx.ui.notify(`Materialized ${written} agent file(s).`, "info");
		},
	});

	pi.registerCommand("ultrawork", {
		description:
			"Activate ultrawork: keep working across turn boundaries until the task is verified complete (session_stop-driven loop).",
		handler: async (_args, ctx) => {
			await clearCompletionMarker();
			loopState = createLoopState("ultrawork");
			ctx.ui.notify(
				"ultrawork ON — will not stop until the todo list is empty and verification passes.",
				"info",
			);
		},
	});

	pi.registerCommand("ulw-loop", {
		description:
			"Activate ulw-loop: durable loop until the completion promise is met. Args: [\"promise\"] [--strategy=reset|continue]",
		handler: async (args, ctx) => {
			const promiseMatch = args.match(/"([^"]+)"/);
			const strategyMatch = args.match(/--strategy=(reset|continue)/);
			await clearCompletionMarker();
			loopState = createLoopState("ulw-loop", {
				completionPromise: promiseMatch?.[1],
				strategy: strategyMatch?.[1] === "reset" ? "reset" : "continue",
			});
			ctx.ui.notify(`ulw-loop ON — iterating until: ${promiseMatch?.[1] ?? "completion"}.`, "info");
		},
	});

	pi.registerCommand("ulw-stop", {
		description: "Deactivate ultrawork / ulw-loop immediately.",
		handler: async (_args, ctx) => {
			if (loopState) loopState = stopLoop(loopState);
			ctx.ui.notify("Loop deactivated.", "info");
		},
	});

	// --- main-session mode switch: /<agent> (e.g. /hephaestus, /sisyphus) ---
	// Each agent name is its own slash command that switches the MAIN session
	// into that persona: injects the agent's prompt as a system message (context
	// hook) and switches the active model. /default reverts.
	let activePersona: string | null = null;
	let personaBody: string | null = null;

	async function activatePersona(name: string, ctx: OmpExtensionContext): Promise<void> {
		if (!AGENT_DEFAULT_ROLE[name]) {
			ctx.ui.notify(
				`Unknown agent "${name}". Known: ${Object.keys(AGENT_DEFAULT_ROLE).join(", ")}`,
				"warn",
			);
			return;
		}
	const config = await loadConfig();
	const assignments = route(buildResolver(ctx.models), config);
	const assignment = assignments.find((a) => a.persona === name);
	if (!assignment || !assignment.model) {
		ctx.ui.notify(
			`main mode: ${name} — model unassigned. ${assignment?.reason ?? "set a role in /model or a pin in omo-personas.json"}`,
			"warn",
		);
		activePersona = null;
		personaBody = null;
		return;
	}
	const agent = await readAgentFile(name);
	activePersona = name;
	personaBody = agent?.body ?? null;
	// Re-resolve the concrete Model OBJECT — setModel needs the object, not a string.
	const modelObj = ctx.models.resolve(`${assignment.model.provider}/${assignment.model.id}`);
	if (modelObj && pi.setModel) {
		await pi.setModel(modelObj);
		const via = assignment.source === "pin" ? "pin" : `role ${assignment.modelRole}`;
		ctx.ui.notify(
			`main mode: ${name} (model: ${assignment.model.provider}/${assignment.model.id} via ${via})`,
			"info",
		);
	} else {
		ctx.ui.notify(`main mode: ${name} (prompt on; model unchanged — setModel unavailable)`, "info");
	}
	}

	for (const agent of Object.keys(AGENT_DEFAULT_ROLE)) {
		pi.registerCommand(agent, {
			description: `Switch the main session into the ${agent} persona/model, then run the given task in that mode. (Use /default to revert.)`,
			handler: async (args, ctx) => {
				await activatePersona(agent, ctx);
				const task = args.trim();
				if (task && pi.sendUserMessage) {
					// Send the task as a user turn so it actually runs in the new mode/model.
					pi.sendUserMessage(task);
				}
			},
		});
	}

	pi.registerCommand("default", {
		description: "Revert the main session to its default mode (clears the active persona prompt).",
		handler: async (_args, ctx) => {
			activePersona = null;
			personaBody = null;
			ctx.ui.notify("main mode: default", "info");
		},
	});

	// While a persona mode is active, inject the persona prompt into the system
	// message of every LLM call. DEFENSIVE: only acts when event.messages has a
	// first message that is unambiguously a system message with STRING content —
	// appends to it, preserving omp's message shape. If omp's message format
	// differs (array content, system prompt not in this array, etc.) the hook
	// no-ops rather than risk a malformed request that hangs the turn.
	pi.on("context", async (event) => {
		if (!activePersona || !personaBody) return;
		if (!event || typeof event !== "object" || !("messages" in event)) return;
		const msgs = event.messages;
		if (!Array.isArray(msgs) || msgs.length === 0) return;
		const first = msgs[0];
		if (!first || typeof first !== "object") return;
		if (!("role" in first) || first.role !== "system") return;
		if (!("content" in first) || typeof first.content !== "string") return;
		const injected = `[persona: ${activePersona}]\n\n${personaBody}\n\n---\n${first.content}`;
		return { messages: [{ ...first, content: injected }, ...msgs.slice(1)] };
	});

	pi.on("session_stop", async (_event, ctx) => {
		if (!loopState || !loopState.active) return;
		const done = await completionMarkerPresent();
		const decision = decideContinue(loopState, done);
		if (decision.continueLoop) {
			loopState = { ...loopState, iterations: decision.nextIterations };
			return { continue: true, additionalContext: buildNudge(loopState) };
		}
		loopState = stopLoop(loopState);
		ctx.ui.notify(`Loop ended: ${decision.reason}`, "info");
		return;
	});

	pi.on("todo_reminder", async (_event, ctx) => {
		if (loopState?.active) return;
		ctx.ui.notify("Open todos remain — re-engage the task rather than waiting.", "warn");
		return;
	});
}
