import {
  defaultSearchConfig,
  reproductionCommand,
  runAdversarialSearch,
  summarizeWitness,
  type ProtocolName,
  type SearchConfig,
} from "../core";

const config = parseArgs(process.argv.slice(2));
const result = runAdversarialSearch(config);
const protocol = result.config.protocol;

console.log("QuorumScope adversarial search");
console.log(`Protocol: ${protocol}`);
console.log(`Seeds: ${result.config.seeds}`);
console.log(
  `Config: seed=${result.config.seed} nodes=${result.config.nodeCount} ops=${result.config.operationCount} clients=${result.config.clientCount} partitionIntensity=${result.config.partitionIntensity} concurrentIntensity=${result.config.concurrentIntensity}`,
);
console.log(`Overlapping schedules: ${result.summary.concurrentSchedules}`);

if (result.firstFailure) {
  const failure = result.firstFailure;
  const selected = protocol === "quorum" ? failure.quorum : failure.unsafe;
  const witness = selected.analysis.verdict.witness;
  console.log(`First violation: seed ${failure.seed}`);
  console.log(`Original steps: ${failure.scenario.steps.length}`);
  console.log(
    `Minimized steps: ${selected.minimized?.scenario.steps.length ?? failure.scenario.steps.length}`,
  );
  if (witness) {
    console.log(`Violation: ${summarizeWitness(witness)}`);
  }
  console.log(`Reproduce: ${reproductionCommand(failure.seed, protocol)}`);
  console.log(
    `Checker verdict: ${selected.analysis.verdict.ok ? "LINEARIZABLE" : "NOT LINEARIZABLE"}`,
  );
} else {
  console.log("First violation: none found");
}

console.log("");
console.log("Quorum comparison:");
console.log(`Protocol: quorum`);
console.log(`Seeds: ${result.summary.attempts}`);
console.log(`Violations: ${result.summary.quorumViolations}`);
console.log(`Unavailable reads/writes: ${result.summary.quorumUnavailableOperations}`);
console.log(`Claim: ${result.claim}`);

console.log("");
console.log("Summary:");
console.log(`First-ack violations: ${result.summary.unsafeViolations}`);
console.log(`First-ack unavailable reads/writes: ${result.summary.unsafeUnavailableOperations}`);

function parseArgs(args: string[]): Partial<SearchConfig> {
  const parsed: Partial<SearchConfig> = {};
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === "--seed" && next) {
      parsed.seed = parseIntStrict(next, "seed");
      index += 1;
    } else if ((arg === "--seeds" || arg === "--budget") && next) {
      parsed.seeds = parseIntStrict(next, "seeds");
      index += 1;
    } else if (arg === "--nodes" && next) {
      parsed.nodeCount = parseIntStrict(next, "nodes");
      index += 1;
    } else if (arg === "--ops" && next) {
      parsed.operationCount = parseIntStrict(next, "ops");
      index += 1;
    } else if (arg === "--clients" && next) {
      parsed.clientCount = parseIntStrict(next, "clients");
      index += 1;
    } else if (arg === "--read-ratio" && next) {
      parsed.readRatio = parseFloatStrict(next, "read-ratio");
      index += 1;
    } else if (arg === "--chaos" && next) {
      parsed.partitionIntensity = parseFloatStrict(next, "chaos");
      index += 1;
    } else if ((arg === "--concurrency" || arg === "--overlap") && next) {
      parsed.concurrentIntensity = parseFloatStrict(next, "concurrency");
      index += 1;
    } else if (arg === "--protocol" && next) {
      parsed.protocol = parseProtocol(next);
      index += 1;
    } else if (arg === "--shrink") {
      parsed.shrink = true;
    } else if (arg === "--help") {
      printHelpAndExit();
    } else {
      throw new Error(`Unknown argument: ${arg ?? ""}`);
    }
  }
  return parsed;
}

function parseProtocol(value: string): ProtocolName | "compare" {
  if (value === "first-ack" || value === "unsafe") {
    return "unsafe";
  }
  if (value === "quorum" || value === "compare") {
    return value;
  }
  throw new Error("Protocol must be first-ack, unsafe, quorum, or compare.");
}

function parseIntStrict(value: string, name: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${name} must be an integer.`);
  }
  return parsed;
}

function parseFloatStrict(value: string, name: string): number {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a finite number.`);
  }
  return parsed;
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run search -- [options]

Options:
  --seed <n>          Starting seed, default ${defaultSearchConfig.seed}
  --seeds <n>         Number of seeds to explore, default ${defaultSearchConfig.seeds}
  --protocol <name>   first-ack | unsafe | quorum | compare
  --nodes <n>         Replica count, default ${defaultSearchConfig.nodeCount}
  --ops <n>           Operation count, default ${defaultSearchConfig.operationCount}
  --clients <n>       Client count, default ${defaultSearchConfig.clientCount}
  --read-ratio <0..1> Read probability, default ${defaultSearchConfig.readRatio}
  --chaos <0..1>      Partition intensity, default ${defaultSearchConfig.partitionIntensity}
  --concurrency <0..1> Overlap intensity, default ${defaultSearchConfig.concurrentIntensity}
  --help              Show this help
`);
  process.exit(0);
}
