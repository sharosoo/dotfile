// Ultrawork / ulw-loop state machine — pure logic, testable.
// The actual continuation is driven by the OMP `session_stop` hook, which is
// capped at 8 consecutive `{ continue: true }` returns (per omp://extensions.md).
// This module owns the decision + the nudge text; the extension wires the hook.

export type LoopMode = "ultrawork" | "ulw-loop";

export interface LoopState {
	readonly active: boolean;
	readonly mode: LoopMode;
	readonly iterations: number;
	readonly maxIterations: number;
	readonly completionPromise: string | null;
	readonly strategy: "reset" | "continue";
	readonly startedAt: number;
}

// OMP caps session_stop continuations at 8. Ultrawork is the aggressive mode
// (use the whole budget); ulw-loop is the durable mode (leave headroom).
export const ULTRAWORK_MAX_ITERATIONS = 8;
export const ULW_LOOP_MAX_ITERATIONS = 6;

export function createLoopState(
	mode: LoopMode,
	options?: { completionPromise?: string; strategy?: "reset" | "continue" },
): LoopState {
	return {
		active: true,
		mode,
		iterations: 0,
		maxIterations:
			mode === "ultrawork" ? ULTRAWORK_MAX_ITERATIONS : ULW_LOOP_MAX_ITERATIONS,
		completionPromise: options?.completionPromise ?? null,
		strategy: options?.strategy ?? "continue",
		startedAt: Date.now(),
	};
}

export function stopLoop(state: LoopState): LoopState {
	return { ...state, active: false };
}

// Decision used by the session_stop hook. The hook cannot read the todo list
// directly, so "work complete" is signalled by the model via a local:// marker
// file the loop writes when it finishes; `completedMarker` is that signal.
export interface ContinueDecision {
	readonly continueLoop: boolean;
	readonly reason: string;
	readonly nextIterations: number;
}

export function decideContinue(
	state: LoopState,
	completedMarker: boolean,
): ContinueDecision {
	if (!state.active) {
		return { continueLoop: false, reason: "loop inactive", nextIterations: state.iterations };
	}
	if (completedMarker) {
		return {
			continueLoop: false,
			reason: "completion marker present — verified done",
			nextIterations: state.iterations,
		};
	}
	if (state.iterations >= state.maxIterations) {
		return {
			continueLoop: false,
			reason: `reached iteration cap (${state.maxIterations}) — hand off to user`,
			nextIterations: state.iterations,
		};
	}
	return {
		continueLoop: true,
		reason: `iteration ${state.iterations + 1}/${state.maxIterations}`,
		nextIterations: state.iterations + 1,
	};
}

// The additionalContext injected on each continuation. Mirrors OMO ultrawork's
// "don't stop until verified" pressure: re-check todos, verify, and only set the
// completion marker when truly done.
export function buildNudge(state: LoopState): string {
	const firstActivation = state.iterations === 0;
	const head =
		state.mode === "ultrawork"
			? "ULTRAWORK active — do not stop until the task is verified complete."
			: "ulw-loop active — keep iterating until the completion promise is met.";
	const promise = state.completionPromise
		? `\nCompletion promise: ${state.completionPromise}`
		: "";
	const tail =
		state.strategy === "reset"
			? "\nStrategy: reset — re-read the goal and current state from scratch this iteration."
			: "\nStrategy: continue — pick up where the last iteration left off.";
	const onboarding = firstActivation
		? "\nFirst activation: read `skill://ultrawork` for the full methodology (certainty gate, scenario contract, TDD red→green→surface, manual QA mandate) before proceeding."
		: "";
	return `${head}${promise}${tail}${onboarding}

Before yielding this iteration:
1. Read the todo list (todo tool). If any item is not completed, keep working.
2. Verify changed files (lsp diagnostics, tests, build) — actually run them.
3. Only when every todo is done AND verification passes, write the completion marker via \`write(local://ulw-complete.marker, "done")\` and stop.
Do not yield at a phase boundary. Do not report "done" without verification.`;
}
