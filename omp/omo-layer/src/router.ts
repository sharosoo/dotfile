// Role-based persona router for OMP.
// Each agent binds to an OMP model ROLE (default/plan/task/advisor/smol/vision/...).
// The role is resolved to a concrete model via OMP's own ctx.models.resolve(),
// so assignments track whatever the user configures in /model — no provider-name
// mismatch, no hardcoded chains to maintain.
//
// Override: an explicit pin in omo-personas.json beats the role.
//
// (The faithful OMO model-core port — chain-based resolution — lives in
// ./model-core and remains available; OMP's role system is the better native fit.)

export type Resolver = (spec: string) => { provider: string; id: string } | undefined;

export interface PersonaConfig {
	// Per-agent explicit pin, e.g. "openai-codex/gpt-5.5:high" or "opencode-go/minimax-m3".
	// Beats the role. Format: "provider/model" or "provider/model:thinking".
	readonly pins: Partial<Record<string, string>>;
	readonly disable: readonly string[];
}

export const EMPTY_CONFIG: PersonaConfig = { pins: {}, disable: [] };

export type AssignmentSource = "pin" | "role" | "unassigned" | "disabled";

export interface Assignment {
	readonly persona: string;
	readonly role: string;
	readonly modelRole: string | null;
	readonly model: { provider: string; id: string } | null;
	readonly thinking: string | null;
	readonly source: AssignmentSource;
	readonly reason: string;
	readonly warnings: readonly string[];
}

// Canonical order: primary core agents first, then the rest.
const AGENT_ORDER: readonly string[] = [
	"sisyphus",
	"hephaestus",
	"prometheus",
	"atlas",
	"oracle",
	"librarian",
	"explore",
	"multimodal-looker",
	"metis",
	"momus",
	"sisyphus-junior",
];

// Default role binding per agent. Roles are OMP model roles (/model). Picked so
// each agent lands on the right model with ZERO config given a typical /model
// (glm-5.2=default; gpt-5.5=task/slow/advisor; gpt-5.4-mini=smol/vision).
// Override per-agent with a pin in omo-personas.json.
export const AGENT_DEFAULT_ROLE: Record<string, string> = {
	sisyphus: "default",
	prometheus: "default",
	metis: "default",
	atlas: "task",
	hephaestus: "slow",
	momus: "advisor",
	oracle: "advisor",
	"sisyphus-junior": "slow",
	librarian: "smol",
	explore: "smol",
	"multimodal-looker": "vision",
};

const AGENT_ROLE_LABEL: Record<string, string> = {
	sisyphus: "Main orchestrator",
	hephaestus: "Autonomous deep worker",
	prometheus: "Strategic planner",
	atlas: "Plan executor (Boulder)",
	oracle: "Architecture consultant (read-only)",
	librarian: "Docs/code search",
	explore: "Codebase grep",
	"multimodal-looker": "Vision/screenshots",
	metis: "Pre-planning consultant",
	momus: "Reviewer",
	"sisyphus-junior": "Focused executor",
};

const VALID_THINKING: readonly string[] = [
	"off",
	"minimal",
	"low",
	"medium",
	"high",
	"xhigh",
];

// Split a pin like "openai-codex/gpt-5.5:high" into spec + thinking.
function splitThinking(pin: string): { spec: string; thinking: string | null } {
	const idx = pin.lastIndexOf(":");
	if (idx > 0 && pin.slice(0, idx).includes("/")) {
		const suffix = pin.slice(idx + 1);
		const thinking = (VALID_THINKING as readonly string[]).includes(suffix) ? suffix : null;
		return { spec: pin.slice(0, idx), thinking };
	}
	return { spec: pin, thinking: null };
}

export function route(resolve: Resolver, config: PersonaConfig): Assignment[] {
	return AGENT_ORDER.map((name): Assignment => {
		const label = AGENT_ROLE_LABEL[name] ?? name;
		const role = AGENT_DEFAULT_ROLE[name] ?? "default";

		if (config.disable.includes(name)) {
			return {
				persona: name,
				role: label,
				modelRole: null,
				model: null,
				thinking: null,
				source: "disabled",
				reason: "disabled by config",
				warnings: [],
			};
		}

		const pin = config.pins[name];
		if (pin !== undefined) {
			const { spec, thinking } = splitThinking(pin);
			const model = resolve(spec);
			if (model) {
				return {
					persona: name,
					role: label,
					modelRole: role,
					model,
					thinking,
					source: "pin",
					reason: `pinned: ${spec}`,
					warnings: [],
				};
			}
			return {
				persona: name,
				role: label,
				modelRole: role,
				model: null,
				thinking,
				source: "pin",
				reason: `pin "${pin}" did not resolve to a model`,
				warnings: [`pin "${pin}" did not resolve — check the provider/model id`],
			};
		}

		const model = resolve(`pi/${role}`);
		if (model) {
			return {
				persona: name,
				role: label,
				modelRole: role,
				model,
				thinking: null,
				source: "role",
				reason: `role: ${role} (configure via /model)`,
				warnings: [],
			};
		}
		return {
			persona: name,
			role: label,
			modelRole: role,
			model: null,
			thinking: null,
			source: "unassigned",
			reason: `role pi/${role} did not resolve — set the ${role} role in /model`,
			warnings: [`role pi/${role} did not resolve — set the ${role} role in /model`],
		};
	});
}
