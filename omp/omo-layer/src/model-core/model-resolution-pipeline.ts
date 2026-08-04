// Ported faithfully from @oh-my-opencode/model-core (model-resolution-pipeline.ts).
// The 4-step resolution: override → category-default → provider-fallback → system-default.
// Deps are injected; OMP supplies identity transformModelForProvider (models
// arrive already provider-scoped) and the real fuzzyMatchModel.

import { fuzzyMatchModel } from "./model-availability";
import type { FallbackEntry } from "./model-requirement-types";
import { normalizeModel, transformModelForProvider } from "./model-normalization";

export type ModelResolutionRequest = {
	intent?: {
		uiSelectedModel?: string;
		userModel?: string;
		userFallbackModels?: string[];
		categoryDefaultModel?: string;
	};
	constraints: {
		availableModels: Set<string>;
		connectedProviders?: string[] | null;
	};
	policy?: {
		fallbackChain?: FallbackEntry[];
		systemDefaultModel?: string;
	};
};

export type ModelResolutionProvenance =
	| "override"
	| "category-default"
	| "provider-fallback"
	| "system-default";

export type ModelResolutionResult = {
	model: string;
	provenance: ModelResolutionProvenance;
	variant?: string;
	attempted?: string[];
	reason?: string;
};

export type ModelResolutionDeps = {
	fuzzyMatchModel: (
		target: string,
		available: Set<string>,
		providers?: string[],
	) => string | null;
	transformModelForProvider: (provider: string, model: string) => string;
};

const DEFAULT_DEPS: ModelResolutionDeps = {
	fuzzyMatchModel,
	transformModelForProvider,
};

// OMO carries a providerCache for the first-run (empty availableModels) path.
// OMP always has an enumerated model list, so the default no-op cache keeps the
// algorithm shape intact without special-casing.
export type ProviderCache = {
	readConnectedProvidersCache(): string[] | null;
	findProviderModelMetadata(provider: string, model: string): unknown;
};

const NOOP_CACHE: ProviderCache = {
	readConnectedProvidersCache: () => null,
	findProviderModelMetadata: () => undefined,
};

export function resolveModelPipeline(
	request: ModelResolutionRequest,
	providerCache: ProviderCache = NOOP_CACHE,
	deps: ModelResolutionDeps = DEFAULT_DEPS,
): ModelResolutionResult | undefined {
	const attempted: string[] = [];
	const { intent, constraints, policy } = request;
	const availableModels = constraints.availableModels;
	const fallbackChain = policy?.fallbackChain;
	const systemDefaultModel = policy?.systemDefaultModel;

	const normalizedUiModel = normalizeModel(intent?.uiSelectedModel);
	if (normalizedUiModel) {
		return { model: normalizedUiModel, provenance: "override" };
	}

	const normalizedUserModel = normalizeModel(intent?.userModel);
	if (normalizedUserModel) {
		return { model: normalizedUserModel, provenance: "override" };
	}

	const normalizedCategoryDefault = normalizeModel(intent?.categoryDefaultModel);
	if (normalizedCategoryDefault) {
		attempted.push(normalizedCategoryDefault);
		if (availableModels.size > 0) {
			const parts = normalizedCategoryDefault.split("/");
			const providerHint = parts.length >= 2 ? [parts[0]] : undefined;
			const match = deps.fuzzyMatchModel(normalizedCategoryDefault, availableModels, providerHint);
			if (match) {
				return { model: match, provenance: "category-default", attempted };
			}
		} else {
			const connectedProviders =
				constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
			if (connectedProviders === null) {
				return { model: normalizedCategoryDefault, provenance: "category-default", attempted };
			}
			const parts = normalizedCategoryDefault.split("/");
			if (parts.length >= 2) {
				const provider = parts[0];
				if (connectedProviders.includes(provider)) {
					const modelName = parts.slice(1).join("/");
					const transformedModel = `${provider}/${deps.transformModelForProvider(provider, modelName)}`;
					return { model: transformedModel, provenance: "category-default", attempted };
				}
			}
		}
	}

	const userFallbackModels = intent?.userFallbackModels;
	if (userFallbackModels && userFallbackModels.length > 0) {
		if (availableModels.size === 0) {
			const connectedProviders =
				constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
			const connectedSet = connectedProviders ? new Set(connectedProviders) : null;
			if (connectedSet !== null) {
				for (const model of userFallbackModels) {
					attempted.push(model);
					const parts = model.split("/");
					if (parts.length >= 2) {
						const provider = parts[0];
						if (connectedSet.has(provider)) {
							const modelName = parts.slice(1).join("/");
							const transformedModel = `${provider}/${deps.transformModelForProvider(provider, modelName)}`;
							return { model: transformedModel, provenance: "provider-fallback", attempted };
						}
					}
				}
			}
		} else {
			for (const model of userFallbackModels) {
				attempted.push(model);
				const parts = model.split("/");
				const providerHint = parts.length >= 2 ? [parts[0]] : undefined;
				const match = deps.fuzzyMatchModel(model, availableModels, providerHint);
				if (match) {
					return { model: match, provenance: "provider-fallback", attempted };
				}
			}
		}
	}

	if (fallbackChain && fallbackChain.length > 0) {
		if (availableModels.size === 0) {
			const connectedProviders =
				constraints.connectedProviders ?? providerCache.readConnectedProvidersCache();
			const connectedSet = connectedProviders ? new Set(connectedProviders) : null;
			if (connectedSet !== null) {
				for (const entry of fallbackChain) {
					for (const provider of entry.providers) {
						if (connectedSet.has(provider)) {
							const transformedModelId = deps.transformModelForProvider(provider, entry.model);
							const model = `${provider}/${transformedModelId}`;
							return { model, provenance: "provider-fallback", variant: entry.variant, attempted };
						}
					}
				}
			}
		} else {
			for (const entry of fallbackChain) {
				for (const provider of entry.providers) {
					const fullModel = `${provider}/${entry.model}`;
					const match = deps.fuzzyMatchModel(fullModel, availableModels, [provider]);
					if (match) {
						return { model: match, provenance: "provider-fallback", variant: entry.variant, attempted };
					}
				}
			}
		}
	}

	if (systemDefaultModel === undefined) {
		return undefined;
	}
	return { model: systemDefaultModel, provenance: "system-default", attempted };
}
