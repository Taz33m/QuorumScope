import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkLinearizability,
  defaultSearchConfig,
  generateSearchScenario,
  reproductionCommand,
  runAdversarialSearch,
  simulateScenario,
} from "../src/core";

describe("adversarial search", () => {
  it("generates deterministic scenarios for the same seed and config", () => {
    const first = generateSearchScenario(143, 0, { seeds: 5, operationCount: 8 });
    const second = generateSearchScenario(143, 0, { seeds: 5, operationCount: 8 });

    expect(second).toEqual(first);
  });

  it("changes generated scenario structure for different seeds", () => {
    const first = generateSearchScenario(143, 0, { operationCount: 8 });
    const second = generateSearchScenario(144, 0, { operationCount: 8 });

    expect(second.scenario.steps).not.toEqual(first.scenario.steps);
  });

  it("can generate replayable overlapping client operations", () => {
    const generated = generateSearchScenario(143, 0, {
      operationCount: 8,
      concurrentIntensity: 1,
    });

    const concurrentStepIndex = generated.scenario.steps.findIndex((step) => step.type === "concurrent");
    expect(concurrentStepIndex).toBeGreaterThanOrEqual(0);

    const replay = simulateScenario(generated.scenario, "unsafe");
    const overlapped = replay.operations.filter((operation) => operation.stepIndex === concurrentStepIndex);

    expect(overlapped).toHaveLength(2);
    expect(new Set(overlapped.map((operation) => operation.start)).size).toBe(1);
  });

  it("finds a first-ack violation within a small deterministic seed range", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 5, protocol: "unsafe" });

    expect(result.firstFailure).toBeDefined();
    expect(result.firstFailure!.unsafe.violation).toBe(true);
    expect(result.firstFailure!.unsafe.analysis.verdict.witness?.type).toBe("stale-read");
    expect(result.summary.unsafeViolations).toBeGreaterThan(0);
  });

  it("shrinks a generated failing scenario while preserving the failure", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 5, protocol: "unsafe", shrink: true });
    const failure = result.firstFailure!;
    const minimized = failure.unsafe.minimized;

    expect(minimized).toBeDefined();
    expect(minimized!.scenario.steps.length).toBeLessThanOrEqual(failure.scenario.steps.length);

    const replay = simulateScenario(minimized!.scenario, "unsafe");
    const verdict = checkLinearizability(replay.operations, minimized!.scenario.initialValue);

    expect(verdict.ok).toBe(false);
    expect(verdict.witness?.type).toBe("stale-read");
  });

  it("preserves original failing scenarios when shrinking is disabled", () => {
    const result = runAdversarialSearch({
      seed: 143,
      seeds: 1,
      protocol: "unsafe",
      shrink: false,
    });
    const failure = result.firstFailure!;

    expect(failure.unsafe.violation).toBe(true);
    expect(failure.unsafe.minimized).toBeUndefined();
    expect(failure.unsafe.analysis.minimizedFailure).toBeUndefined();

    const replay = simulateScenario(failure.scenario, "unsafe");
    expect(checkLinearizability(replay.operations, failure.scenario.initialValue).ok).toBe(false);
  });

  it("keeps shrink reproduction commands faithful to the requested mode", () => {
    const withShrink = reproductionCommand(143, "compare", {
      ...defaultSearchConfig,
      shrink: true,
    });
    const withoutShrink = reproductionCommand(143, "compare", {
      ...defaultSearchConfig,
      shrink: false,
    });

    expect(withShrink.split(/\s+/)).toContain("--shrink");
    expect(withShrink.split(/\s+/)).not.toContain("--no-shrink");
    expect(withoutShrink.split(/\s+/)).toContain("--no-shrink");
    expect(withoutShrink.split(/\s+/)).not.toContain("--shrink");
  });

  it("CLI can preserve original generated failures with --no-shrink", () => {
    const output = execFileSync(
      "node",
      [
        "--import",
        "tsx",
        "src/cli/search.ts",
        "--seed",
        "143",
        "--seeds",
        "1",
        "--protocol",
        "unsafe",
        "--no-shrink",
      ],
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    expect(output).toContain("Shrink: disabled");
    expect(output).toContain("First violation: seed 143");
    expect(output).toContain("Minimized steps: not requested");
    expect(output).toContain("--no-shrink");
  });

  it("reports quorum availability tradeoff without bounded-search violations", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 10, protocol: "compare" });

    expect(result.summary.quorumViolations).toBe(0);
    expect(result.summary.quorumUnavailableOperations).toBeGreaterThan(0);
    expect(result.claim).toContain("not a general proof");
  });

  it("does not report an unsafe failure as a quorum protocol failure", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 10, protocol: "quorum" });

    expect(result.firstFailure).toBeUndefined();
    expect(result.summary.unsafeViolations).toBeGreaterThan(0);
    expect(result.summary.quorumViolations).toBe(0);
  });

  it("produces replay-compatible generated and minimized counterexamples", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 3, protocol: "compare" });
    const failure = result.firstFailure!;

    const generatedReplay = simulateScenario(failure.scenario, "unsafe");
    expect(checkLinearizability(generatedReplay.operations, failure.scenario.initialValue).ok).toBe(
      false,
    );

    const minimized = failure.unsafe.minimized!.scenario;
    const minimizedReplay = simulateScenario(minimized, "unsafe");
    expect(checkLinearizability(minimizedReplay.operations, minimized.initialValue).ok).toBe(false);
  });

  it("rejects invalid search budgets", () => {
    expect(() => runAdversarialSearch({ seeds: 0 })).toThrow(/between 1 and 1000/);
    expect(() => runAdversarialSearch({ operationCount: 2 })).toThrow(/between 3 and 30/);
  });
});
