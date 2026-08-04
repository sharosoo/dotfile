import type { PersonaConfig } from "./router";

function isString(value: unknown): value is string {
	return typeof value === "string";
}

function isStringArray(value: unknown): readonly string[] {
	return Array.isArray(value) ? value.filter(isString) : [];
}

function parsePins(raw: unknown): Partial<Record<string, string>> {
	if (raw === null || typeof raw !== "object") return {};
	const source = raw as Record<string, unknown>;
	const pins: Record<string, string> = {};
	for (const [key, value] of Object.entries(source)) {
		if (key.startsWith("_")) continue;
		if (isString(value)) pins[key] = value;
	}
	return pins;
}

// Boundary parser: untrusted parsed-JSON object → typed PersonaConfig.
// Unknown shapes collapse to safe defaults rather than throwing, so a typo in
// the config file degrades gracefully instead of breaking the router.
export function parsePersonaConfig(input: unknown): PersonaConfig {
	if (input === null || typeof input !== "object") {
		return { pins: {}, disable: [] };
	}
	const root = input as Record<string, unknown>;
	return {
		pins: parsePins(root.pins),
		disable: isStringArray(root.disable).filter((name) => !name.startsWith("_")),
	};
}
