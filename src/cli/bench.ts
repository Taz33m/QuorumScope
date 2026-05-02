import { runBenchmark, runSearchBenchmark } from "../core";

if (process.argv.includes("--help")) {
  printHelpAndExit();
}

const runsArg = Number.parseInt(process.argv[2] ?? "", 10);
const runs = Number.isFinite(runsArg) ? runsArg : 50;
if (!Number.isInteger(runs) || runs < 1 || runs > 500) {
  throw new Error("Benchmark runs must be an integer between 1 and 500.");
}
const result = runBenchmark(runs);
const searchResult = runSearchBenchmark(runs);

console.log(`QuorumScope deterministic benchmark`);
console.log(`seed=${result.seed} runs=${result.runs}`);
console.table(
  result.rows.map((row) => ({
    protocol: row.protocol,
    runs: row.runs,
    violations: row.violations,
    staleReadWitnesses: row.staleReadWitnesses,
    unavailableOps: row.unavailableOperations,
    avgEvents: row.averageEvents,
    avgSuccessfulOps: row.averageSuccessfulOps,
  })),
);

console.log("");
console.log("Adversarial search corpus");
console.log(`seed=${searchResult.config.seed} runs=${searchResult.summary.attempts}`);
console.table([
  {
    protocol: "unsafe",
    runs: searchResult.summary.attempts,
    violations: searchResult.summary.unsafeViolations,
    unavailableOps: searchResult.summary.unsafeUnavailableOperations,
  },
  {
    protocol: "quorum",
    runs: searchResult.summary.attempts,
    violations: searchResult.summary.quorumViolations,
    unavailableOps: searchResult.summary.quorumUnavailableOperations,
  },
]);
console.log(searchResult.claim);

function printHelpAndExit(): never {
  console.log(`Usage: npm run bench -- [runs]

Runs deterministic benchmark summaries for the curated partition probe and adversarial search corpus.

Options:
  runs       Number of runs, default 50, max 500
  --help     Show this help
`);
  process.exit(0);
}
