import { describe, expect, it } from "bun:test";
import {
	createLoopState,
	decideContinue,
	buildNudge,
	stopLoop,
	ULTRAWORK_MAX_ITERATIONS,
	ULW_LOOP_MAX_ITERATIONS,
} from "./loop";

describe("loop state machine", () => {
	it("ultrawork continues until cap, then stops", () => {
		let state = createLoopState("ultrawork");
		expect(state.maxIterations).toBe(ULTRAWORK_MAX_ITERATIONS);
		for (let i = 1; i <= ULTRAWORK_MAX_ITERATIONS; i++) {
			const d = decideContinue(state, false);
			expect(d.continueLoop).toBe(true);
			state = { ...state, iterations: d.nextIterations };
		}
		const atCap = decideContinue(state, false);
		expect(atCap.continueLoop).toBe(false);
		expect(atCap.reason).toContain("iteration cap");
	});

	it("stops immediately when completion marker is present", () => {
		const state = createLoopState("ulw-loop");
		const d = decideContinue(state, true);
		expect(d.continueLoop).toBe(false);
		expect(d.reason).toContain("completion marker");
	});

	it("ulw-loop has a lower cap than ultrawork", () => {
		expect(ULW_LOOP_MAX_ITERATIONS).toBeLessThan(ULTRAWORK_MAX_ITERATIONS);
	});

	it("stopLoop deactivates", () => {
		const stopped = stopLoop(createLoopState("ultrawork"));
		expect(decideContinue(stopped, false).continueLoop).toBe(false);
	});

	it("buildNudge carries mode + completion promise + strategy", () => {
		const nudge = buildNudge(
			createLoopState("ulw-loop", {
				completionPromise: "all tests green",
				strategy: "reset",
			}),
		);
		expect(nudge).toContain("ulw-loop active");
		expect(nudge).toContain("all tests green");
		expect(nudge).toContain("Strategy: reset");
		expect(nudge).toContain("completion marker");
	});
});
