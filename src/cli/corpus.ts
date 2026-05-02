import {
  collectCorpusIssues,
  fixtureDisplayName,
  runCorpus,
  type CorpusFixtureResult,
  type CorpusProtocolResult,
} from "../core/corpus";

if (process.argv.includes("--help")) {
  printHelpAndExit();
}

const manifestPath = parseManifestPath(process.argv.slice(2));
const json = process.argv.includes("--json");
const result = runCorpus({ manifestPath });

if (json) {
  console.log(
    JSON.stringify(
      {
        schemaVersion: 1,
        ok: result.ok,
        manifest: {
          path: result.manifestPath,
          version: result.manifest.version,
          fixtureCount: result.manifest.fixtures.length,
        },
        summary: result.summary,
        issues: collectCorpusIssues(result),
        fixtures: result.fixtures.map((fixture) => ({
          id: fixture.entry.id,
          title: fixture.entry.title,
          fixture: fixture.entry.fixture,
          scenarioType: fixture.entry.scenarioType,
          tags: fixture.entry.tags,
          scenarioHash: fixture.scenarioHash,
          ok: fixture.ok,
          validationErrors: fixture.validationErrors,
          issues: fixture.issues,
          results: fixture.results.map((protocol) => ({
            protocol: protocol.protocol,
            verdict: protocol.verdict,
            violationKind: protocol.violationKind,
            unavailableOperations: protocol.unavailableOperations,
            finalValue: protocol.finalValue,
            minimizedSteps: protocol.minimizedSteps,
            mismatches: protocol.mismatches,
            issues: protocol.issues,
          })),
        })),
        claim: result.claim,
      },
      null,
      2,
    ),
  );
  process.exit(result.ok ? 0 : 1);
}

console.log("QuorumScope regression corpus");
console.log(`Manifest: ${result.manifestPath ?? "provided manifest"}`);
console.log(`Fixtures: ${result.summary.fixtures}`);

for (const fixture of result.fixtures) {
  printFixture(fixture);
}

console.log("");
console.log("Summary:");
console.log(`Expected outcomes matched: ${result.summary.expectedMatched}`);
console.log(`First-ack violations: ${result.summary.unsafeViolations}/${result.summary.fixtures}`);
console.log(`Quorum violations: ${result.summary.quorumViolations}/${result.summary.fixtures}`);
console.log(`Quorum unavailable operations: ${result.summary.quorumUnavailableOperations}`);
console.log(`Mismatches: ${result.summary.mismatches}`);
console.log(`Claim: ${result.claim}`);

if (!result.ok) {
  process.exitCode = 1;
}

function printFixture(fixture: CorpusFixtureResult): void {
  console.log("");
  console.log(`${fixtureDisplayName(fixture.entry)} [${fixture.scenarioHash || "invalid"}]`);
  if (fixture.validationErrors.length > 0) {
    for (const error of fixture.validationErrors) {
      console.log(`  validation error: ${error}`);
    }
    return;
  }
  for (const protocol of fixture.results) {
    console.log(`  ${protocolLabel(protocol.protocol)}: ${protocolSummary(protocol)}`);
    for (const mismatch of protocol.mismatches) {
      console.log(`    mismatch: ${mismatch}`);
    }
  }
}

function protocolSummary(result: CorpusProtocolResult): string {
  const parts = [
    result.verdict === "linearizable" ? "LINEARIZABLE" : "NOT LINEARIZABLE",
    `unavailable=${result.unavailableOperations}`,
  ];
  if (result.witnessSummary) {
    parts.push(result.witnessSummary);
  }
  if (result.finalValue) {
    parts.push(`final=${result.finalValue}`);
  }
  if (typeof result.minimizedSteps === "number") {
    parts.push(`minimizedSteps=${result.minimizedSteps}`);
  }
  return parts.join("; ");
}

function protocolLabel(protocol: string): string {
  return protocol === "unsafe" ? "First-ack" : "Quorum";
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run corpus -- [options]

Options:
  --manifest <path>  Corpus manifest path, default examples/corpus.manifest.json
  --json     Print machine-readable corpus replay results
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
