import { buildProductReport } from "../core/report";
import { buildProductReportJsonContract } from "../core/jsonContracts";

if (process.argv.includes("--help")) {
  printHelpAndExit();
}

const manifestPath = parseManifestPath(process.argv.slice(2));
const json = process.argv.includes("--json");
const report = buildProductReport({ corpus: { manifestPath } });

if (json) {
  console.log(
    JSON.stringify(
      buildProductReportJsonContract(report),
      null,
      2,
    ),
  );
  process.exit(report.corpus.ok ? 0 : 1);
}

console.log("QuorumScope product report");
console.log("");
console.log("Protocols:");
console.log("- First-ack: unsafe under modeled partitions; accepts the first reachable replica response.");
console.log("- Quorum: no violations found in declared bounded corpora; availability tradeoff is counted.");

console.log("");
console.log("Corpus:");
console.log(`- fixtures: ${report.corpus.summary.fixtures}`);
console.log(`- expected outcomes matched: ${report.corpus.summary.expectedMatched}`);
console.log(`- first-ack violations: ${report.corpus.summary.unsafeViolations}`);
console.log(`- quorum violations: ${report.corpus.summary.quorumViolations}`);
console.log(`- quorum unavailable operations: ${report.corpus.summary.quorumUnavailableOperations}`);

console.log("");
console.log("Adversarial search:");
console.log(`- seeds explored: ${report.search.summary.attempts}`);
console.log(`- first failing seed: ${report.search.firstFailure?.seed ?? "none"}`);
console.log(`- first-ack violations: ${report.search.summary.unsafeViolations}/${report.search.summary.attempts}`);
console.log(`- quorum violations: ${report.search.summary.quorumViolations}/${report.search.summary.attempts}`);
console.log(`- quorum unavailable operations: ${report.search.summary.quorumUnavailableOperations}`);
console.log(
  `- minimized steps: ${
    report.search.firstFailure?.unsafe.minimized?.scenario.steps.length ??
    report.search.firstFailure?.scenario.steps.length ??
    "n/a"
  }`,
);

console.log("");
console.log("Tiny exhaustive model:");
console.log(`- terminal histories checked: ${report.exhaustive.coverage.terminalHistories}`);
console.log(`- prefixes explored: ${report.exhaustive.coverage.prefixesExplored}`);
console.log(`- first-ack violations: ${report.exhaustive.unsafe.violations}`);
console.log(`- first-ack stale-read witnesses: ${report.exhaustive.unsafe.staleReadViolations}`);
console.log(`- quorum violations: ${report.exhaustive.quorum.violations}`);
console.log(`- quorum unavailable operations: ${report.exhaustive.quorum.unavailableOperations}`);
console.log(`- first exhaustive violation: ${report.exhaustive.unsafe.firstViolation?.caseId ?? "none"}`);

console.log("");
console.log("Bounded claim:");
console.log(report.boundedClaim);

console.log("");
console.log("Reproduce:");
for (const command of report.reproduce) {
  console.log(`- ${command}`);
}

if (!report.corpus.ok) {
  process.exitCode = 1;
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run report -- [options]

Options:
  --manifest <path>  Corpus manifest path, default examples/corpus.manifest.json
  --json     Print machine-readable product report
  --help     Show this help
`);
  process.exit(0);
}

function parseManifestPath(args: readonly string[]): string | undefined {
  const index = args.indexOf("--manifest");
  if (index === -1) {
    return undefined;
  }
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new Error("--manifest requires a path.");
  }
  return value;
}
