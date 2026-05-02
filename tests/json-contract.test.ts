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
    expect(json.manifest.fixtureCount).toBe(4);
    expect(json.issues).toEqual([]);
    expect(json.summary.expectedMatched).toBe(8);
    expect(json.summary.quorumViolations).toBe(0);
    expect(json.fixtures).toHaveLength(4);
    expect(json.fixtures[0]).toMatchObject({
      id: "split-brain-stale-read",
      scenarioType: "curated-counterexample",
      ok: true,
    });
    expect(json.fixtures.find((fixture: any) => fixture.id === "search-143-minimized"))
      .toMatchObject({
        provenance: {
          source: "adversarial-search",
          scenarioHash: "97bd97918ce8",
        },
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
    expect(json.corpus.summary.fixtures).toBe(4);
    expect(json.corpus.issues).toEqual([]);
    expect(json.search.config.seed).toBe(143);
    expect(json.search.summary.unsafeViolations).toBe(50);
    expect(json.search.firstFailure.seed).toBe(143);
    expect(json.search.firstFailure.minimizedSteps).toBe(3);
    expect(json.search.firstFailure.witness).toMatchObject({
      type: "stale-read",
      read: { id: "op2" },
      priorWrite: { id: "op1" },
      expected: "v143-0-x1",
      observed: "v0",
    });
    expect(json.exhaustive.config.maxOperations).toBe(3);
    expect(json.exhaustive.coverage.terminalHistories).toBe(1000);
    expect(json.exhaustive.unsafe.firstViolation.caseId).toBe("ex-000043");
    expect(json.exhaustive.quorum.violations).toBe(0);
    expect(json.evidence.corpus.provenance).toEqual({
      verified: 2,
      notDeclared: 2,
      mismatched: 0,
    });
    expect(json.evidence.search.witnessSummary).toBe(
      "op2 read returned v0 after op1 write completed with v143-0-x1.",
    );
    expect(json.evidence.search.witnessDetail).toContain("any legal linearization");
    expect(json.evidence.exhaustive.witnessSummary).toBe(
      "op3 read returned v0 after op1 write completed with v1.",
    );
    expect(json.evidence.search.corpusFixture).toMatchObject({
      id: "search-143-minimized",
      fixture: "search-143-minimized.json",
      provenance: {
        status: "verified",
        scenarioHash: "97bd97918ce8",
      },
    });
    expect(json.evidence.exhaustive.corpusFixture).toMatchObject({
      id: "exhaustive-ex-000043",
      fixture: "exhaustive-ex-000043.json",
      provenance: {
        status: "verified",
        scenarioHash: "bde7f1573ff1",
      },
    });
    expect(json.evidence.reproduce).toEqual(json.reproduce);
    expect(json.evidence.search.reproductionCommand).toBe(json.reproduce[1]);
    expect(json.evidence.exhaustive.reproductionCommand).toBe(json.reproduce[2]);
    expect(json.boundedClaim).toContain("not a general proof");
    expect(json.reproduce.some((command: string) => command.includes("npm run exhaustive"))).toBe(true);
  }, 15_000);

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
    expect(json.evidence.ok).toBe(false);
    expect(json.evidence.corpus.issues[0]).toMatchObject({
      code: "expectation.verdict",
      fixtureId: "bad-split-brain",
      protocol: "unsafe",
    });
    expect(json.search.summary.unsafeViolations).toBe(50);
    expect(json.exhaustive.coverage.terminalHistories).toBe(1000);
  }, 15_000);
});

function runJson(script: string): Record<string, any> {
  const output = execFileSync("node", ["--import", "tsx", script, "--json"], {
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
  });
  return JSON.parse(output) as Record<string, any>;
}

function runJsonProcess(script: string, args: readonly string[]) {
  return spawnSync("node", ["--import", "tsx", script, ...args], {
    cwd: process.cwd(),
    encoding: "utf-8",
    maxBuffer: 1024 * 1024,
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
