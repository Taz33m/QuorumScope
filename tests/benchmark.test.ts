import { describe, expect, it } from "vitest";
import { runBenchmark } from "../src/core";

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
});
