import { describe, expect, it } from "bun:test";
import { route, EMPTY_CONFIG, type Assignment, type PersonaConfig, type Resolver } from "./router";
import { parsePersonaConfig } from "./config";

// Mock resolver simulating OMP's ctx.models.resolve against a configured role map.
function makeResolver(
	roles: Record<string, { provider: string; id: string }>,
	exact: Record<string, { provider: string; id: string }> = {},
): Resolver {
	return (spec: string) => {
		if (spec.startsWith("pi/")) return roles[spec.slice(3)];
		return exact[spec];
	};
}

const USER_ROLES: Record<string, { provider: string; id: string }> = {
	default: { provider: "zai", id: "glm-5.2" },
	plan: { provider: "openai-codex", id: "gpt-5.5" },
	task: { provider: "openai-codex", id: "gpt-5.5" },
	advisor: { provider: "openai-codex", id: "gpt-5.5" },
	smol: { provider: "openai-codex", id: "gpt-5.4-mini" },
	vision: { provider: "openai-codex", id: "gpt-5.4-mini" },
};

const EXACT: Record<string, { provider: string; id: string }> = {
	"zai/glm-5.2": { provider: "zai", id: "glm-5.2" },
	"openai-codex/gpt-5.5": { provider: "openai-codex", id: "gpt-5.5" },
	"opencode-go/minimax-m3": { provider: "opencode-go", id: "minimax-m3" },
};

function byPersona(list: readonly Assignment[], name: string): Assignment {
	const found = list.find((a) => a.persona === name);
	if (!found) throw new Error(`no assignment for ${name}`);
	return found;
}

describe("route — role-based defaults (no config)", () => {
	const result = route(makeResolver(USER_ROLES), EMPTY_CONFIG);

	it("sisyphus → default role → glm-5.2", () => {
		const a = byPersona(result, "sisyphus");
		expect(a.model?.id).toBe("glm-5.2");
		expect(a.source).toBe("role");
		expect(a.modelRole).toBe("default");
	});

	it("prometheus → default role → glm-5.2", () => {
		const a = byPersona(result, "prometheus");
		expect(a.model?.id).toBe("glm-5.2");
		expect(a.modelRole).toBe("default");
	});

	it("atlas → task role → gpt-5.5", () => {
		const a = byPersona(result, "atlas");
		expect(a.modelRole).toBe("task");
		expect(a.model?.id).toBe("gpt-5.5");
	});

	it("momus/oracle → advisor role", () => {
		expect(byPersona(result, "momus").modelRole).toBe("advisor");
		expect(byPersona(result, "oracle").modelRole).toBe("advisor");
	});

	it("librarian/explore → smol role → gpt-5.4-mini", () => {
		expect(byPersona(result, "librarian").model?.id).toBe("gpt-5.4-mini");
		expect(byPersona(result, "explore").modelRole).toBe("smol");
	});

	it("multimodal-looker → vision role", () => {
		expect(byPersona(result, "multimodal-looker").modelRole).toBe("vision");
	});
});

describe("route — pin override beats role", () => {
	// Pins that achieve the user's exact desired setup where the role default differs.
	const config: PersonaConfig = {
		pins: {
			prometheus: "zai/glm-5.2:high",
			hephaestus: "openai-codex/gpt-5.5:high",
			librarian: "opencode-go/minimax-m3",
			explore: "openai-codex/gpt-5.5:low",
			"sisyphus-junior": "openai-codex/gpt-5.5:high",
		},
		disable: [],
	};
	const result = route(makeResolver(USER_ROLES, EXACT), config);

	it("prometheus pinned to glm-5.2 (beats plan→gpt-5.5)", () => {
		const a = byPersona(result, "prometheus");
		expect(a.source).toBe("pin");
		expect(a.model?.id).toBe("glm-5.2");
		expect(a.thinking).toBe("high");
	});

	it("hephaestus pinned to gpt-5.5 (beats default→glm-5.2)", () => {
		const a = byPersona(result, "hephaestus");
		expect(a.source).toBe("pin");
		expect(a.model?.id).toBe("gpt-5.5");
		expect(a.thinking).toBe("high");
	});

	it("librarian pinned to minimax-m3", () => {
		expect(byPersona(result, "librarian").model?.id).toBe("minimax-m3");
	});

	it("explore pinned to gpt-5.5 with low thinking", () => {
		const a = byPersona(result, "explore");
		expect(a.model?.id).toBe("gpt-5.5");
		expect(a.thinking).toBe("low");
	});

	it("unpinned agents still use roles", () => {
		expect(byPersona(result, "sisyphus").source).toBe("role");
		expect(byPersona(result, "atlas").model?.id).toBe("gpt-5.5");
	});
});

describe("route — unassigned when role not configured", () => {
	const result = route(makeResolver({ default: { provider: "zai", id: "glm-5.2" } }), EMPTY_CONFIG);

	it("task role unset → atlas unassigned with hint", () => {
		const a = byPersona(result, "atlas");
		expect(a.source).toBe("unassigned");
		expect(a.warnings.some((w) => w.includes("set the task role"))).toBe(true);
	});
});

describe("route — disable", () => {
	const config: PersonaConfig = { pins: {}, disable: ["hephaestus"] };
	const result = route(makeResolver(USER_ROLES), config);

	it("disabled agent reports disabled", () => {
		const a = byPersona(result, "hephaestus");
		expect(a.source).toBe("disabled");
		expect(a.model).toBeNull();
	});
});

describe("parsePersonaConfig — boundary safety", () => {
	it("null → empty config", () => {
		expect(parsePersonaConfig(null)).toEqual(EMPTY_CONFIG);
	});

	it("garbage → empty config", () => {
		expect(parsePersonaConfig("nope")).toEqual(EMPTY_CONFIG);
	});

	it("well-formed object parses; underscore keys ignored", () => {
		const parsed = parsePersonaConfig({
			pins: { _readme: "skip", hephaestus: "openai-codex/gpt-5.5:high" },
			disable: ["metis"],
		});
		expect(parsed.pins._readme).toBeUndefined();
		expect(parsed.pins.hephaestus).toBe("openai-codex/gpt-5.5:high");
		expect(parsed.disable).toEqual(["metis"]);
	});
});
