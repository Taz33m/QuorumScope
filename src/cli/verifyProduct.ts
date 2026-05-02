import { spawnSync } from "node:child_process";

if (process.argv.includes("--help")) {
  printHelpAndExit();
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["test"],
  ["run", "typecheck"],
  ["run", "build"],
  ["run", "smoke:ui", "--", "--no-build"],
  ["run", "demo"],
  ["run", "corpus"],
  ["run", "search:compare"],
  ["run", "exhaustive"],
  ["run", "report"],
] as const;

console.log("QuorumScope product verification");

for (const args of checks) {
  const label = `npm ${args.join(" ")}`;
  console.log("");
  console.log(`== ${label} ==`);
  const result = spawnSync(npm, args, {
    cwd: process.cwd(),
    stdio: "inherit",
    env: process.env,
  });

  if (result.error) {
    console.error(`${label} failed to launch: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`${label} failed with exit code ${result.status ?? "unknown"}`);
    process.exit(result.status ?? 1);
  }
}

console.log("");
console.log("Product verification passed.");

function printHelpAndExit(): never {
  console.log(`Usage: npm run verify:product -- [options]

Runs the local product trust path: tests, typecheck, build, UI smoke, demo, corpus, search comparison, exhaustive explorer, and report.

Options:
  --help     Show this help
`);
  process.exit(0);
}
