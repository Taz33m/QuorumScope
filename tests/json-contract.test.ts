import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { splitBrainStaleReadScenario } from "../src/core";
import type { CorpusManifest } from "../src/core/corpus";
import { runCorpus } from "../src/core/corpus";
import { buildCorpusJsonContract, buildProductReportJsonContract } from "../src/core/jsonContracts";
import { buildProductReport } from "../src/core/report";

describe("machine-readable CLI contracts", () => {
  it("prints a versioned corpus JSON contract with fixture expectations", () => {
    const json = runJson("src/cli/corpus.ts");
    const expected = JSON.parse(JSON.stringify(buildCorpusJsonContract(runCorpus())));

    expect(json).toEqual(expected);
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
    const expected = JSON.parse(JSON.stringify(buildProductReportJsonContract(buildProductReport())));

    expect(json).toEqual(expected);
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

  it("keeps failing corpus JSON parseable with stable issue payloads", () => {
    const manifestPath = writeFailingCorpusFixture();
    const result = runJsonProcess("src/cli/corpus.ts", ["--manifest", manifestPath, "--json"]);

    expect(result.status).toBe(1);
    const json = JSON.parse(result.stdout) as Record<string, any>;
    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.issues[0]).toMatchObject({
      code: "expectation.verdict",
      fixtureId: "bad-split-brain",
      fixture: "bad-split-brain.json",
      protocol: "unsafe",
      expected: "linearizable",
      actual: "violation",
    });
  });

  it("keeps failing product report JSON parseable with corpus issues", () => {
    const manifestPath = writeFailingCorpusFixture();
    const result = runJsonProcess("src/cli/report.ts", ["--manifest", manifestPath, "--json"]);

    expect(result.status).toBe(1);
    const json = JSON.parse(result.stdout) as Record<string, any>;
    expect(json.schemaVersion).toBe(1);
    expect(json.ok).toBe(false);
    expect(json.corpus.issues[0]).toMatchObject({
      code: "expectation.verdict",
      fixtureId: "bad-split-brain",
      protocol: "unsafe",
    });
    expect(json.search.summary.unsafeViolations).toBe(50);
    expect(json.exhaustive.coverage.terminalHistories).toBe(804);
  });
});

function runJson(script: string): Record<string, any> {
  const output = execFileSync("node", ["--import", "tsx", script, "--json"], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
  return JSON.parse(output) as Record<string, any>;
}

function runJsonProcess(script: string, args: readonly string[]) {
  return spawnSync("node", ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
  });
}

function writeFailingCorpusFixture(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorumscope-json-contract-"));
  writeFileSync(join(dir, "bad-split-brain.json"), JSON.stringify(splitBrainStaleReadScenario));
  const manifest: CorpusManifest = {
    version: 1,
    fixtures: [
      {
        id: "bad-split-brain",
        title: "Bad split-brain expectation",
        fixture: "bad-split-brain.json",
        scenarioType: "test-mismatch",
        protocols: ["unsafe"],
        expected: {
          unsafe: {
            verdict: "linearizable",
            unavailableOperations: 0,
          },
        },
        notes: "Deliberately wrong expectation for JSON contract testing.",
        tags: ["test", "mismatch"],
      },
    ],
  };
  const manifestPath = join(dir, "corpus.manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}
