import { spawnSync } from "node:child_process";
import { evaluateBuiltUiSmoke, summarizeUiSmoke } from "../core/uiSmoke";

interface Options {
  build: boolean;
  json: boolean;
}

const args = process.argv.slice(2);

if (args.includes("--help")) {
  printHelpAndExit();
}

const options: Options = {
  build: !args.includes("--no-build"),
  json: args.includes("--json"),
};

if (options.build) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const build = spawnSync(npm, ["run", "build"], {
    cwd: process.cwd(),
    stdio: options.json ? "pipe" : "inherit",
    env: process.env,
    encoding: "utf-8",
  });
  if (build.error) {
    console.error(`UI smoke failed to launch build: ${build.error.message}`);
    process.exit(1);
  }
  if (build.status !== 0) {
    if (options.json) {
      console.error(build.stderr);
    }
    console.error(`UI smoke build failed with exit code ${build.status ?? "unknown"}`);
    process.exit(build.status ?? 1);
  }
}

const result = evaluateBuiltUiSmoke();
const summary = summarizeUiSmoke(result);

if (options.json) {
  console.log(JSON.stringify({ ...result, summary }, null, 2));
} else {
  console.log("QuorumScope UI smoke");
  console.log(`Build: ${options.build ? "ran npm run build" : "skipped (--no-build)"}`);
  console.log(`Dist: ${result.distDir}`);
  console.log(`Assets: ${result.jsAssets.length} JS, ${result.cssAssets.length} CSS`);
  console.log("");
  for (const check of result.checks) {
    console.log(`${check.ok ? "PASS" : "FAIL"} ${check.name} - ${check.detail}`);
  }
  console.log("");
  console.log(`Checks: ${summary.passed}/${result.checks.length} passed`);
  console.log(
    "Scope: verifies the built workbench shell and technical surfaces; it is not an interactive browser test.",
  );
}

if (summary.failed > 0) {
  process.exit(1);
}

function printHelpAndExit(): never {
  console.log(`Usage: npm run smoke:ui -- [options]

Builds the Vite app by default, then verifies that the generated UI shell and core technical
workbench surfaces are present in dist/.

Options:
  --no-build  Reuse the existing dist/ output instead of running npm run build
  --json      Print machine-readable smoke results
  --help      Show this help
`);
  process.exit(0);
}
