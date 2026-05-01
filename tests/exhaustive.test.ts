import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import {
  checkLinearizability,
  findExhaustiveCase,
  runBoundedExhaustive,
  simulateScenario,
} from "../src/core";

describe("bounded exhaustive explorer", () => {
  it("enumerates the default finite model deterministically", () => {
    const first = runBoundedExhaustive();
    const second = runBoundedExhaustive();

    expect(second.coverage).toEqual(first.coverage);
    expect(second.unsafe.violations).toBe(first.unsafe.violations);
    expect(second.quorum.violations).toBe(first.quorum.violations);
    expect(first.coverage.terminalHistories).toBe(804);
    expect(first.coverage.uniqueScenarios).toBe(804);
    expect(first.coverage.concurrentSchedules).toBeGreaterThan(0);
  });

  it("changes coverage denominator when bounds change", () => {
    const tiny = runBoundedExhaustive({ maxOperations: 2 });
    const defaultResult = runBoundedExhaustive();

    expect(tiny.coverage.terminalHistories).toBeLessThan(defaultResult.coverage.terminalHistories);
    expect(tiny.coverage.terminalHistories).toBeGreaterThan(0);
  });

  it("finds first-ack stale-read violations in the tiny finite model", () => {
    const result = runBoundedExhaustive();

    expect(result.unsafe.violations).toBeGreaterThan(0);
    expect(result.unsafe.staleReadViolations).toBeGreaterThan(0);
    expect(result.unsafe.firstViolation?.witness?.type).toBe("stale-read");
    expect(result.unsafe.firstViolation?.reproductionCommand).toContain("npm run exhaustive");
  });

  it("reports quorum bounded safety with availability tradeoff", () => {
    const result = runBoundedExhaustive();

    expect(result.quorum.violations).toBe(0);
    expect(result.quorum.unavailableOperations).toBeGreaterThan(0);
    expect(result.claim).toContain("not a proof for arbitrary systems");
  });

  it("keeps coverage buckets aligned with terminal histories", () => {
    const result = runBoundedExhaustive();
    const partitionTotal = Object.values(result.coverage.partitionShapes).reduce(
      (sum, count) => sum + count,
      0,
    );
    const patternTotal = Object.values(result.coverage.operationPatterns).reduce(
      (sum, count) => sum + count,
      0,
    );

    expect(partitionTotal).toBe(result.coverage.terminalHistories);
    expect(patternTotal).toBe(result.coverage.terminalHistories);
  });

  it("replays and shrinks the reported first violation", () => {
    const result = runBoundedExhaustive();
    const firstViolation = result.unsafe.firstViolation!;
    const found = findExhaustiveCase(firstViolation.caseId);

    expect(found?.scenarioHash).toBe(firstViolation.scenarioHash);

    const replay = simulateScenario(firstViolation.scenario, "unsafe");
    expect(checkLinearizability(replay.operations, firstViolation.scenario.initialValue).ok).toBe(false);

    const minimized = firstViolation.minimized;
    expect(minimized).toBeDefined();
    const minimizedReplay = simulateScenario(minimized!.scenario, "unsafe");
    expect(checkLinearizability(minimizedReplay.operations, minimized!.scenario.initialValue).ok).toBe(false);
    expect(minimized!.scenario.steps.length).toBeLessThanOrEqual(firstViolation.scenario.steps.length);
  });

  it("compares exhaustive and adversarial search without raw-count overclaiming", () => {
    const result = runBoundedExhaustive();

    expect(result.searchComparison.unsafeViolations).toBeGreaterThan(0);
    expect(result.searchComparison.quorumViolations).toBe(0);
    expect(result.searchComparison.sameWitnessClass).toBe(true);
    expect(result.searchComparison.note).toContain("not directly comparable");
  });

  it("rejects invalid exhaustive bounds", () => {
    expect(() => runBoundedExhaustive({ nodeCount: 5 })).toThrow(/exactly 3 replicas/);
    expect(() => runBoundedExhaustive({ maxOperations: 5 })).toThrow(/between 1 and 4/);
  });

  it("CLI smoke prints bounds and bounded claim", () => {
    const output = execFileSync("node", ["--import", "tsx", "src/cli/exhaustive.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(output).toContain("QuorumScope bounded exhaustive explorer");
    expect(output).toContain("terminal histories checked: 804");
    expect(output).toContain("Bounded claim:");
    expect(output).toContain("not a proof for arbitrary systems");
  });
});
