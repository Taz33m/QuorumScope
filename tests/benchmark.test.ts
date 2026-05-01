import { describe, expect, it } from "vitest";
import { runBenchmark, runSearchBenchmark } from "../src/core";

describe("benchmark harness", () => {
  it("compares unsafe availability with quorum safety over deterministic fault schedules", () => {
    const result = runBenchmark(10, 4310);
    const unsafe = result.rows.find((row) => row.protocol === "unsafe");
    const quorum = result.rows.find((row) => row.protocol === "quorum");

    expect(unsafe?.violations).toBe(10);
    expect(unsafe?.staleReadWitnesses).toBe(10);
    expect(quorum?.violations).toBe(0);
    expect(quorum?.unavailableOperations).toBeGreaterThan(0);
  });

  it("rejects invalid benchmark run counts", () => {
    expect(() => runBenchmark(0)).toThrow(/between 1 and 500/);
    expect(() => runBenchmark(501)).toThrow(/between 1 and 500/);
  });

  it("summarizes adversarial search corpus without broad proof claims", () => {
    const result = runSearchBenchmark(5, 143);

    expect(result.summary.attempts).toBe(5);
    expect(result.summary.unsafeViolations).toBe(5);
    expect(result.summary.quorumViolations).toBe(0);
    expect(result.summary.quorumUnavailableOperations).toBeGreaterThan(0);
    expect(result.claim).toContain("not a general proof");
  });
});
