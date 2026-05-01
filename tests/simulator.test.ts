import { describe, expect, it } from "vitest";
import { analyzeScenario, simulateScenario, splitBrainStaleReadScenario } from "../src/core";
import type { Scenario } from "../src/core";

describe("distributed register simulator", () => {
  it("makes the unsafe protocol return a stale successful read under partition", () => {
    const result = analyzeScenario(splitBrainStaleReadScenario, "unsafe");

    expect(result.verdict.ok).toBe(false);
    expect(result.verdict.witness?.type).toBe("stale-read");
    expect(result.operations.some((operation) => operation.status === "unavailable")).toBe(false);
  });

  it("keeps the quorum protocol linearizable by refusing the minority read", () => {
    const result = analyzeScenario(splitBrainStaleReadScenario, "quorum");

    expect(result.verdict.ok).toBe(true);
    expect(result.metrics.unavailableOperations).toBeGreaterThan(0);
    expect(result.operations.find((operation) => operation.label?.includes("minority"))?.status).toBe(
      "unavailable",
    );
  });

  it("is deterministic for the same seed and scenario", () => {
    const first = simulateScenario(splitBrainStaleReadScenario, "unsafe");
    const second = simulateScenario(splitBrainStaleReadScenario, "unsafe");

    expect(second.operations).toEqual(first.operations);
    expect(second.events).toEqual(first.events);
  });

  it("rejects partitions that are not an exact cover of scenario nodes", () => {
    const badScenario: Scenario = {
      ...splitBrainStaleReadScenario,
      steps: [
        {
          type: "partition",
          groups: [
            ["n1", "n2"],
            ["n3", "n4"],
          ],
        },
      ],
    };

    expect(() => simulateScenario(badScenario, "unsafe")).toThrow(/missing node/i);
  });

  it("commits successful full-network quorum writes to every contacted replica", () => {
    const scenario: Scenario = {
      id: "full-quorum-write",
      name: "Full quorum write",
      description: "All nodes are reachable.",
      seed: 12,
      initialValue: "v0",
      nodes: ["n1", "n2", "n3", "n4", "n5"],
      steps: [{ type: "write", client: "writer", zone: 0, value: "v9" }],
    };

    const result = simulateScenario(scenario, "quorum");

    expect(result.operations[0]?.status).toBe("ok");
    expect(result.finalNodes.every((node) => node.committed.value === "v9")).toBe(true);
    expect(result.finalNodes.every((node) => node.prepared === undefined)).toBe(true);
  });
});
