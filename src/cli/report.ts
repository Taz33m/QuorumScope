import { buildProductReport } from "../core/report";
import { buildProductReportJsonContract } from "../core/jsonContracts";
import { formatProductReportEvidence } from "../core/reportEvidence";

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
  if (!report.corpus.ok) {
    process.exitCode = 1;
  }
} else {
  console.log(formatProductReportEvidence(report.evidence));
  if (!report.corpus.ok) {
    process.exitCode = 1;
  }
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
