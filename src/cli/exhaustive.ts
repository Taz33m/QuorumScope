import {
  defaultExhaustiveConfig,
  findExhaustiveCase,
  runBoundedExhaustive,
  summarizeWitness,
  type ExhaustiveConfig,
  type ExhaustiveProtocolSummary,
} from "../core";

const { config, json, showCase } = parseArgs(process.argv.slice(2));
const result = runBoundedExhaustive(config);

if (json) {
  console.log(
    JSON.stringify(
      {
        config: result.config,
        coverage: result.coverage,
        unsafe: summarizeProtocol(result.unsafe),
        quorum: summarizeProtocol(result.quorum),
        searchComparison: result.searchComparison,
        elapsedMs: result.elapsedMs,
        claim: result.claim,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

console.log("QuorumScope bounded exhaustive explorer");
console.log(
  `Model: ${result.config.nodeCount} replicas, ${result.config.clientCount} clients, single key`,
);
console.log(
  `Bounds: maxOperations=${result.config.maxOperations} maxTopologyChanges=${result.config.maxTopologyChanges} includeConcurrent=${result.config.includeConcurrent}`,
);
console.log("Topologies: healed plus canonical 1/2 partitions");
console.log("Timing: deterministic simulator timing per enumerated case; message timings are not exhaustively enumerated");
console.log("Protocols: first-ack, quorum");
console.log("");

printProtocol(result.unsafe);
console.log("");
printProtocol(result.quorum);

console.log("");
console.log("Coverage:");
console.log(`- prefixes explored: ${result.coverage.prefixesExplored}`);
console.log(`- terminal histories checked: ${result.coverage.terminalHistories}`);
console.log(`- unique scenarios: ${result.coverage.uniqueScenarios}`);
console.log(`- pruned prefixes: ${result.coverage.prunedPrefixes}`);
console.log(`- concurrent schedules: ${result.coverage.concurrentSchedules}`);
console.log(`- partition shapes: ${formatRecord(result.coverage.partitionShapes)}`);
console.log(`- operation patterns: ${Object.keys(result.coverage.operationPatterns).length}`);

console.log("");
console.log("Adversarial comparison:");
console.log(
  `- default search: seeds=${result.searchComparison.seeds}, first-ack violations=${result.searchComparison.unsafeViolations}, quorum violations=${result.searchComparison.quorumViolations}, first failure seed=${result.searchComparison.firstFailureSeed ?? "none"}`,
);
console.log(`- same witness class: ${result.searchComparison.sameWitnessClass}`);
console.log(`- ${result.searchComparison.note}`);

console.log("");
console.log("Bounded claim:");
console.log(result.claim);

if (showCase) {
  const found = findExhaustiveCase(showCase, result.config);
  console.log("");
  console.log(`Case ${showCase}:`);
  if (!found) {
    console.log("not found under these bounds");
  } else {
    console.log(JSON.stringify(found.scenario, null, 2));
  }
}

function printProtocol(summary: ExhaustiveProtocolSummary): void {
  const label = summary.protocol === "unsafe" ? "First-ack" : "Quorum";
  console.log(`${label}:`);
  console.log(`- terminal histories checked: ${summary.terminalHistories}`);
  console.log(`- violations: ${summary.violations}`);
  console.log(`- stale-read witnesses: ${summary.staleReadViolations}`);
  console.log(`- unavailable operations: ${summary.unavailableOperations}`);
  if (summary.firstViolation) {
    const witness = summary.firstViolation.witness;
    if (witness?.type === "stale-read") {
      console.log(`- first reported stale-read: ${summary.firstViolation.caseId}`);
    } else if (witness) {
      console.log(`- first violation: ${summary.firstViolation.caseId}`);
    }
    console.log(`- witness: ${summarizeWitness(witness) ?? "none"}`);
    console.log(
      `- minimized steps: ${
        summary.firstViolation.minimized?.scenario.steps.length ??
        summary.firstViolation.scenario.steps.length
      }`,
    );
    console.log(`- reproduce: ${summary.firstViolation.reproductionCommand}`);
  }
}

function summarizeProtocol(summary: ExhaustiveProtocolSummary) {
  return {
    protocol: summary.protocol,
    terminalHistories: summary.terminalHistories,
    violations: summary.violations,
    staleReadViolations: summary.staleReadViolations,
    unavailableOperations: summary.unavailableOperations,
    firstViolation: summary.firstViolation
      ? {
          caseId: summary.firstViolation.caseId,
          scenarioHash: summary.firstViolation.scenarioHash,
          witness: summary.firstViolation.witness,
          minimizedSteps:
            summary.firstViolation.minimized?.scenario.steps.length ??
            summary.firstViolation.scenario.steps.length,
          reproductionCommand: summary.firstViolation.reproductionCommand,
        }
      : undefined,
  };
}

function parseArgs(args: string[]) {
  const config: Partial<ExhaustiveConfig> = {};
  let json = false;
  let showCase: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--max-ops" && next) {
      config.maxOperations = parseIntStrict(next, "max-ops");
      index += 1;
    } else if (arg === "--topology" && next) {
      config.maxTopologyChanges = parseIntStrict(next, "topology");
      index += 1;
    } else if (arg === "--clients" && next) {
      config.clientCount = parseIntStrict(next, "clients");
      index += 1;
    } else if (arg === "--seed" && next) {
      config.seed = parseIntStrict(next, "seed");
      index += 1;
    } else if (arg === "--no-concurrency") {
      config.includeConcurrent = false;
    } else if (arg === "--json") {
      json = true;
    } else if (arg === "--case" && next) {
      showCase = next;
      index += 1;
    } else if (arg === "--show") {
      // paired with --case; retained for readable reproduction commands.
    } else if (arg === "--help") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }

  return { config, json, showCase };
}

function parseIntStrict(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

function formatRecord(record: Record<string, number>): string {
  return Object.entries(record)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run exhaustive -- [options]

Options:
  --max-ops <n>       Max returned operations, default ${defaultExhaustiveConfig.maxOperations}
  --topology <n>      Max topology changes, default ${defaultExhaustiveConfig.maxTopologyChanges}
  --clients <n>       Client count, default ${defaultExhaustiveConfig.clientCount}
  --seed <n>          Base deterministic simulator seed, default ${defaultExhaustiveConfig.seed}
  --no-concurrency    Disable one bounded overlapping operation batch
  --case <id> --show  Print a reproducible enumerated scenario
  --json              Print machine-readable summary
  --help              Show this help
`);
  process.exit(0);
}
