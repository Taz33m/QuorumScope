import { describe, expect, it } from "vitest";
import { checkLinearizability, minimizeFailingScenario, simulateScenario, splitBrainStaleReadScenario } from "../src/core";

describe("counterexample shrinker", () => {
  it("removes irrelevant steps while preserving the unsafe stale-read failure", () => {
    const minimized = minimizeFailingScenario(splitBrainStaleReadScenario, "unsafe");

    expect(minimized).toBeDefined();
    expect(minimized!.steps.length).toBeLessThan(splitBrainStaleReadScenario.steps.length);

    const replay = simulateScenario(minimized!, "unsafe");
    const verdict = checkLinearizability(replay.operations, minimized!.initialValue);

    expect(verdict.ok).toBe(false);
    expect(verdict.witness?.type).toBe("stale-read");
  });
});
