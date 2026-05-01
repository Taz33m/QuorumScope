import { spawnSync } from "node:child_process";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const checks = [
  ["test"],
  ["run", "typecheck"],
  ["run", "build"],
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
