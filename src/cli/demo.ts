import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { analyzeScenario, splitBrainStaleReadScenario } from "../core";
import type { AnalysisResult, ProtocolName, Scenario } from "../core";

const protocols: ProtocolName[] = ["unsafe", "quorum"];
const scenario = loadScenario(process.argv[2]);

for (const protocol of protocols) {
  const result = analyzeScenario(scenario, protocol);
  printResult(result);
}

function loadScenario(path?: string): Scenario {
  if (!path) {
    return splitBrainStaleReadScenario;
  }
  const absolutePath = resolve(process.cwd(), path);
  return JSON.parse(readFileSync(absolutePath, "utf-8")) as Scenario;
}

function printResult(result: AnalysisResult): void {
  const verdict = result.verdict.ok ? "LINEARIZABLE" : "NOT LINEARIZABLE";
  console.log(`\n=== ${protocolLabel(result.protocol)} :: ${verdict} ===`);
  console.log(result.scenario.description);
  console.log(
    `events=${result.metrics.events} operations=${result.metrics.operations} unavailable=${result.metrics.unavailableOperations}`,
  );

  for (const operation of result.operations) {
    const value =
      operation.kind === "write"
        ? `write ${operation.input}`
        : `read -> ${operation.output ?? operation.status}`;
    console.log(
      `${operation.id.padEnd(4)} ${operation.status.padEnd(11)} t=${operation.start}-${operation.end} ${value} via [${operation.contacted.join(", ")}]`,
    );
  }

  if (result.verdict.witness?.type === "stale-read") {
    const witness = result.verdict.witness;
    console.log(
      `witness: ${witness.read.id} returned ${witness.observed}, but ${witness.priorWrite.id} completed first with ${witness.expected}`,
    );
  } else if (result.verdict.ok) {
    console.log(
      `legal order: ${result.verdict.legalOrder.join(" -> ")}; final value ${result.verdict.finalValue ?? result.scenario.initialValue}`,
    );
  } else if (result.verdict.witness) {
    console.log(`witness: ${result.verdict.witness.explanation}`);
  }

  if (result.minimizedFailure) {
    console.log(
      `minimized failing scenario removed ${result.minimizedFailure.removedSteps} steps (${result.minimizedFailure.scenario.steps.length} steps remain)`,
    );
  }

  console.log("final replicas:");
  for (const node of result.finalNodes) {
    console.log(`  ${node.id}: ${node.committed.value}@${node.committed.version}`);
  }
}

function protocolLabel(protocol: ProtocolName): string {
  return protocol === "unsafe" ? "FIRST-ACK" : "QUORUM";
}
