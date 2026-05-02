import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const commands = [
  { script: "src/cli/demo.ts", expected: "Usage: npm run demo" },
  { script: "src/cli/bench.ts", expected: "Usage: npm run bench" },
  { script: "src/cli/corpus.ts", expected: "Usage: npm run corpus" },
  { script: "src/cli/report.ts", expected: "Usage: npm run report" },
  { script: "src/cli/smokeUi.ts", expected: "Usage: npm run smoke:ui" },
  { script: "src/cli/verifyProduct.ts", expected: "Usage: npm run verify:product" },
  { script: "src/cli/search.ts", expected: "Usage: npm run search" },
  { script: "src/cli/exhaustive.ts", expected: "Usage: npm run exhaustive" },
] as const;

describe("CLI help", () => {
  it.each(commands)("prints help for $script without running the command", ({ script, expected }) => {
    const output = execFileSync("node", ["--import", "tsx", script, "--help"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(output).toContain(expected);
    expect(output).toContain("--help");
  }, 15_000);
});
