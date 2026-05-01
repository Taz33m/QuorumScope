import { checkLinearizability } from "./linearizability";
import { SeededRng } from "./rng";
import { simulateScenario } from "./simulator";
import type { BenchmarkResult, BenchmarkRow, ProtocolName, Scenario } from "./types";

export function buildBenchmarkScenario(seed: number, index: number): Scenario {
  const rng = new SeededRng(seed + index * 7919);
  const nodes = ["n1", "n2", "n3", "n4", "n5"];
  const offset = rng.int(0, nodes.length - 1);
  const rotated = [...nodes.slice(offset), ...nodes.slice(0, offset)];
  const minority = rotated.slice(0, 2);
  const majority = rotated.slice(2);
  const value = `v${seed}-${index}`;
  return {
    id: `bench-${seed}-${index}`,
    name: `Benchmark scenario ${index}`,
    description: "Generated 2/3 partition with a write on the majority side and a read on the minority side.",
    seed: seed + index,
    initialValue: "v0",
    nodes,
    steps: [
      { type: "read", client: "baseline", zone: 0, label: "baseline" },
      { type: "partition", groups: [minority, majority], label: "generated partition" },
      { type: "write", client: "majority-client", zone: 1, value, label: "generated write" },
      { type: "wait", ms: rng.int(1, 7), label: "generated wait" },
      { type: "read", client: "minority-client", zone: 0, label: "generated stale-read probe" },
    ],
  };
}

export function runBenchmark(runs = 50, seed = 4310): BenchmarkResult {
  if (!Number.isInteger(runs) || runs < 1 || runs > 500) {
    throw new Error("Benchmark runs must be an integer between 1 and 500.");
  }
  const protocols: ProtocolName[] = ["unsafe", "quorum"];
  const rows: BenchmarkRow[] = protocols.map((protocol) => {
    let violations = 0;
    let unavailableOperations = 0;
    let staleReadWitnesses = 0;
    let events = 0;
    let successfulOperations = 0;

    for (let index = 0; index < runs; index += 1) {
      const scenario = buildBenchmarkScenario(seed, index);
      const simulation = simulateScenario(scenario, protocol);
      const verdict = checkLinearizability(simulation.operations, scenario.initialValue);
      if (!verdict.ok) {
        violations += 1;
      }
      if (verdict.witness?.type === "stale-read") {
        staleReadWitnesses += 1;
      }
      unavailableOperations += simulation.metrics.unavailableOperations;
      events += simulation.metrics.events;
      successfulOperations += simulation.metrics.successfulOperations;
    }

    return {
      protocol,
      runs,
      violations,
      unavailableOperations,
      staleReadWitnesses,
      averageEvents: round(events / runs),
      averageSuccessfulOps: round(successfulOperations / runs),
    };
  });

  return { seed, runs, rows };
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
