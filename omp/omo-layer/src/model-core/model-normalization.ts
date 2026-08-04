// Ported from @oh-my-opencode/model-core (model-normalization.ts, trimmed).
// OMP exposes models already keyed by their concrete provider/id, so the
// provider-specific id transforms OMO applies are a no-op here; we keep only
// the name normalization used by the fuzzy matcher.

import { normalizeModelName } from "./model-availability";

// normalizeModel: trim + lowercase + version-dot normalization. Matches the
// observable contract OMO's normalizeModel uses at the resolution boundary.
export function normalizeModel(value: string | undefined): string | undefined {
	if (value === undefined) return undefined;
	const trimmed = value.trim();
	if (trimmed === "") return undefined;
	return normalizeModelName(trimmed);
}

// OMP models arrive with their real provider-scoped id, so no transform needed.
export function transformModelForProvider(_provider: string, model: string): string {
	return model;
}
