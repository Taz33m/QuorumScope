import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("machine-readable CLI contracts", () => {
  it("prints a versioned corpus JSON contract with fixture expectations", () => {
    const json = runJson("src/cli/corpus.ts");

    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(true);
    expect(json.manifest.version).toBe(1);
    expect(json.manifest.fixtureCount).toBe(3);
    expect(json.issues).toEqual([]);
    expect(json.summary.expectedMatched).toBe(6);
    expect(json.summary.quorumViolations).toBe(0);
    expect(json.fixtures).toHaveLength(3);
    expect(json.fixtures[0]).toMatchObject({
      id: "split-brain-stale-read",
      scenarioType: "curated-counterexample",
      ok: true,
    });
    expect(json.fixtures[0].tags).toContain("stale-read");
    expect(json.fixtures[0].results[0]).toMatchObject({
      protocol: "unsafe",
      verdict: "violation",
      violationKind: "stale-read",
      mismatches: [],
      issues: [],
    });
  });

  it("prints a versioned product report JSON contract with bounded claims", () => {
    const json = runJson("src/cli/report.ts");

    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(true);
    expect(json.corpus.summary.fixtures).toBe(3);
    expect(json.corpus.issues).toEqual([]);
    expect(json.search.config.seed).toBe(143);
    expect(json.search.summary.unsafeViolations).toBe(50);
    expect(json.search.firstFailure.seed).toBe(143);
    expect(json.search.firstFailure.minimizedSteps).toBe(3);
    expect(json.exhaustive.config.maxOperations).toBe(3);
    expect(json.exhaustive.coverage.terminalHistories).toBe(804);
    expect(json.exhaustive.unsafe.firstViolation.caseId).toBe("ex-000023");
    expect(json.exhaustive.quorum.violations).toBe(0);
    expect(json.boundedClaim).toContain("not a general proof");
    expect(json.reproduce.some((command: string) => command.includes("npm run exhaustive"))).toBe(true);
  });
});

function runJson(script: string): Record<string, any> {
  const output = execFileSync("node", ["--import", "tsx", script, "--json"], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  return JSON.parse(output) as Record<string, any>;
}
