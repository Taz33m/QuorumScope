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
import { formatProductReportEvidence } from "../src/core/reportEvidence";

describe("human corpus output", () => {
  it("keeps the text summary aligned with the JSON contract", () => {
    const contract = buildCorpusJsonContract(runCorpus());
    const output = execFileSync(
      "node",
      ["--import", "tsx", "src/cli/corpus.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      },
    );

    expect(output).toContain(`Fixtures: ${contract.summary.fixtures}`);
    expect(output).toContain(`Expected outcomes matched: ${contract.summary.expectedMatched}`);
    expect(output).toContain(
      `First-ack violations: ${contract.summary.unsafeViolations}/${contract.summary.fixtures}`,
    );
    expect(output).toContain(
      `Quorum violations: ${contract.summary.quorumViolations}/${contract.summary.fixtures}`,
    );
    expect(output).toContain(
      `Quorum unavailable operations: ${contract.summary.quorumUnavailableOperations}`,
    );
    expect(output).toContain(`Mismatches: ${contract.summary.mismatches}`);
    expect(output).toContain(`Claim: ${contract.claim}`);

    for (const fixture of contract.fixtures) {
      expect(output).toContain(fixture.id);
      expect(output).toContain(fixture.scenarioHash);
      for (const protocol of fixture.results) {
        expect(output).toContain(`unavailable=${protocol.unavailableOperations}`);
        if (typeof protocol.minimizedSteps === "number") {
          expect(output).toContain(`minimizedSteps=${protocol.minimizedSteps}`);
        }
      }
    }
  }, 10_000);
});

describe("human product report", () => {
  it("keeps the text summary aligned with the JSON contract", () => {
    const report = buildProductReport();
    const contract = buildProductReportJsonContract(report);
    const output = execFileSync(
      "node",
      ["--import", "tsx", "src/cli/report.ts"],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
      },
    );

    expect(output.trimEnd()).toBe(formatProductReportEvidence(report.evidence));
    expect(contract.evidence).toEqual(report.evidence);
    expect(output).toContain(`- fixtures: ${contract.corpus.summary.fixtures}`);
    expect(output).toContain(
      `- expected outcomes matched: ${contract.corpus.summary.expectedMatched}`,
    );
    expect(output).toContain(
      `- first-ack violations: ${contract.corpus.summary.unsafeViolations}`,
    );
    expect(output).toContain(
      `- quorum violations: ${contract.corpus.summary.quorumViolations}`,
    );
    expect(output).toContain(
      `- quorum unavailable operations: ${contract.corpus.summary.quorumUnavailableOperations}`,
    );
    expect(output).toContain(
      `- provenance hashes: ${contract.evidence.corpus.provenance.verified} verified, ${contract.evidence.corpus.provenance.notDeclared} not declared, ${contract.evidence.corpus.provenance.mismatched} mismatched`,
    );

    expect(output).toContain(`- seeds explored: ${contract.search.summary.attempts}`);
    expect(output).toContain(
      `- first failing seed: ${contract.search.firstFailure?.seed ?? "none"}`,
    );
    expect(output).toContain(
      `- first-ack violations: ${contract.search.summary.unsafeViolations}/${contract.search.summary.attempts}`,
    );
    expect(output).toContain(
      `- quorum violations: ${contract.search.summary.quorumViolations}/${contract.search.summary.attempts}`,
    );
    expect(output).toContain(
      `- quorum unavailable operations: ${contract.search.summary.quorumUnavailableOperations}`,
    );
    expect(output).toContain(
      `- minimized steps: ${contract.search.firstFailure?.minimizedSteps ?? "n/a"}`,
    );
    expect(output).toContain(`- first failure witness: ${contract.evidence.search.witnessSummary}`);
    expect(output).toContain(
      `- corpus fixture: search-143-minimized (search-143-minimized.json, hash 97bd97918ce8, provenance verified)`,
    );

    expect(output).toContain(
      `- terminal histories checked: ${contract.exhaustive.coverage.terminalHistories}`,
    );
    expect(output).toContain(
      `- prefixes explored: ${contract.exhaustive.coverage.prefixesExplored}`,
    );
    expect(output).toContain(
      `- first-ack violations: ${contract.exhaustive.unsafe.violations}`,
    );
    expect(output).toContain(
      `- first-ack stale-read witnesses: ${contract.exhaustive.unsafe.staleReadViolations}`,
    );
    expect(output).toContain(
      `- quorum violations: ${contract.exhaustive.quorum.violations}`,
    );
    expect(output).toContain(
      `- quorum unavailable operations: ${contract.exhaustive.quorum.unavailableOperations}`,
    );
    expect(output).toContain(
      `- first exhaustive violation: ${contract.exhaustive.unsafe.firstViolation?.caseId ?? "none"}`,
    );
    expect(output).toContain(
      `- first exhaustive witness: ${contract.evidence.exhaustive.witnessSummary}`,
    );
    expect(output).toContain(
      `- corpus fixture: exhaustive-ex-000043 (exhaustive-ex-000043.json, hash bde7f1573ff1, provenance verified)`,
    );

    expect(output).toContain(contract.boundedClaim);
    for (const command of contract.reproduce) {
      expect(output).toContain(`- ${command}`);
    }
  }, 15_000);

  it("prints actionable corpus issues when report verification fails", () => {
    const manifestPath = writeProvenanceMismatchManifest();
    const result = spawnSync(
      "node",
      ["--import", "tsx", "src/cli/report.ts", "--manifest", manifestPath],
      {
        cwd: process.cwd(),
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
      },
    );

    expect(result.status).toBe(1);
    expect(result.stdout).toContain("Corpus:");
    expect(result.stdout).toContain("- provenance hashes: 0 verified, 0 not declared, 1 mismatched");
    expect(result.stdout).toContain("- corpus issues:");
    expect(result.stdout).toContain(
      "bad-provenance [fixture.provenance-hash]: expected fixture hash 000000000000 from provenance, got 6e256cf9b5a0",
    );
    expect(result.stdout).toContain("(expected 000000000000, actual 6e256cf9b5a0)");
    expect(result.stdout).toContain("Bounded claim:");
  }, 15_000);
});

function writeProvenanceMismatchManifest(): string {
  const dir = mkdtempSync(join(tmpdir(), "quorumscope-report-human-"));
  writeFileSync(join(dir, "bad-provenance.json"), JSON.stringify(splitBrainStaleReadScenario));
  const manifest: CorpusManifest = {
    version: 1,
    fixtures: [
      {
        id: "bad-provenance",
        title: "Bad provenance hash",
        fixture: "bad-provenance.json",
        scenarioType: "curated-counterexample",
        protocols: ["unsafe", "quorum"],
        expected: {
          unsafe: {
            verdict: "violation",
            violationKind: "stale-read",
            unavailableOperations: 0,
          },
          quorum: {
            verdict: "linearizable",
            unavailableOperations: 1,
            finalValue: "v1",
          },
        },
        provenance: {
          source: "curated",
          scenarioHash: "000000000000",
        },
        notes: "Deliberately wrong provenance hash for human report testing.",
        tags: ["test", "provenance"],
      },
    ],
  };
  const manifestPath = join(dir, "corpus.manifest.json");
  writeFileSync(manifestPath, JSON.stringify(manifest));
  return manifestPath;
}
