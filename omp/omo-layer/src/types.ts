// Shared runtime types for the omo-omp adapter.
// The model-selection data and algorithm live in ./model-core (ported from
// @oh-my-opencode/model-core); this file only holds the OMP-side model handle.

export interface OmpModel {
	provider: string;
	id: string;
}
