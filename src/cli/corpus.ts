import { readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { analyzeScenario } from "../core";
import type { AnalysisResult, Scenario } from "../core";

const fixtureDir = resolve(process.cwd(), "examples");
const fixtureFiles = readdirSync(fixtureDir)
  .filter((file) => file.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b));

let unsafeViolations = 0;
let quorumViolations = 0;
let quorumUnavailable = 0;

console.log("QuorumScope regression corpus");
console.log(`Fixtures: ${fixtureFiles.length}`);

for (const file of fixtureFiles) {
  const scenario = loadScenario(join(fixtureDir, file));
  const unsafe = analyzeScenario(scenario, "unsafe");
  const quorum = analyzeScenario(scenario, "quorum");
  unsafeViolations += unsafe.verdict.ok ? 0 : 1;
  quorumViolations += quorum.verdict.ok ? 0 : 1;
  quorumUnavailable += quorum.metrics.unavailableOperations;

  console.log("");
  console.log(`${basename(file, ".json")} :: ${scenario.name}`);
  console.log(`  unsafe: ${verdictLabel(unsafe)}${witnessSummary(unsafe)}`);
  console.log(
    `  quorum: ${verdictLabel(quorum)}; unavailable=${quorum.metrics.unavailableOperations}; final=${quorum.verdict.finalValue ?? scenario.initialValue}`,
  );
}

console.log("");
console.log("Summary:");
console.log(`Unsafe violations: ${unsafeViolations}/${fixtureFiles.length}`);
console.log(`Quorum violations: ${quorumViolations}/${fixtureFiles.length}`);
console.log(`Quorum unavailable operations: ${quorumUnavailable}`);
console.log("Claim: corpus replay only; this is not an exhaustive proof.");

function loadScenario(path: string): Scenario {
  return JSON.parse(readFileSync(path, "utf-8")) as Scenario;
}

function verdictLabel(result: AnalysisResult): string {
  return result.verdict.ok ? "LINEARIZABLE" : "NOT LINEARIZABLE";
}

function witnessSummary(result: AnalysisResult): string {
  const witness = result.verdict.witness;
  if (witness?.type === "stale-read") {
    return `; ${witness.read.id} returned ${witness.observed} after ${witness.priorWrite.id} wrote ${witness.expected}`;
  }
  return "";
}
