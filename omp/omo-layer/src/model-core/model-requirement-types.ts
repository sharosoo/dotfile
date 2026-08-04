// Ported verbatim from @oh-my-opencode/model-core (model-requirement-types.ts).
// Faithful 1:1 port for the omo-omp contribution.

export type FallbackEntry = {
	providers: string[];
	model: string;
	variant?: string; // Entry-specific variant (e.g., GPT->high, Opus->max)
	reasoningEffort?: string;
	temperature?: number;
	top_p?: number;
	maxTokens?: number;
	thinking?: { type: "enabled" | "disabled"; budgetTokens?: number };
};

export type ModelRequirement = {
	fallbackChain: FallbackEntry[];
	variant?: string; // Default variant (used when entry doesn't specify one)
	requiresModel?: string; // If set, only activates when this model is available (fuzzy match)
	requiresAnyModel?: boolean; // If true, requires at least ONE model in fallbackChain to be available
	requiresProvider?: string[]; // If set, only activates when any of these providers is connected
};
