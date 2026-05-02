import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildProductReport } from "../src/core/report";
import {
  buildProductReportEvidence,
  formatProductReportEvidence,
} from "../src/core/reportEvidence";
import { buildSearchFixtureExport } from "../src/core/searchExport";

describe("product report", () => {
  it("aggregates corpus, adversarial search, and tiny exhaustive evidence", () => {
    const report = buildProductReport();

    expect(report.corpus.ok).toBe(true);
    expect(report.corpus.summary.fixtures).toBe(4);
    expect(report.corpus.summary.unsafeViolations).toBe(3);
    expect(report.corpus.summary.quorumUnavailableOperations).toBe(4);
    expect(report.evidence.corpus.provenance).toEqual({
      verified: 2,
      notDeclared: 2,
      mismatched: 0,
    });
    expect(report.search.summary.unsafeViolations).toBe(50);
    expect(report.search.summary.quorumViolations).toBe(0);
    expect(report.exhaustive.coverage.terminalHistories).toBe(1000);
    expect(report.exhaustive.unsafe.violations).toBe(144);
    expect(report.exhaustive.quorum.violations).toBe(0);
    expect(report.boundedClaim).toContain("not a general proof");
    expect(report.reproduce.some((command) => command.includes("npm run search"))).toBe(true);
    expect(report.reproduce.some((command) => command.includes("npm run exhaustive"))).toBe(true);
    const exportedSearch = buildSearchFixtureExport(report.search)!;
    expect(report.evidence.search.witnessSummary).toBe(exportedSearch.witnessSummary);
    expect(report.evidence.search.witnessSummary).toBe(
      "op2 read returned v0 after op1 write completed with v143-0-x1.",
    );
    expect(report.evidence.exhaustive.witnessSummary).toContain("read returned");
    expect(report.evidence.search.corpusFixture?.id).toBe("search-143-minimized");
    expect(report.evidence.search.corpusFixture?.provenance).toMatchObject({
      source: "adversarial-search",
      scenarioHash: "97bd97918ce8",
      status: "verified",
    });
    expect(report.evidence.exhaustive.corpusFixture?.id).toBe("exhaustive-ex-000043");
    expect(report.evidence.exhaustive.corpusFixture?.provenance).toMatchObject({
      source: "bounded-exhaustive",
      scenarioHash: "bde7f1573ff1",
      status: "verified",
    });
    expect(report.evidence.boundedClaim).toBe(report.boundedClaim);
    expect(report.evidence.reproduce).toEqual(report.reproduce);
  }, 15_000);

  it("does not match corpus evidence when deterministic replay seed drifts", () => {
    const report = buildProductReport();
    const driftedCorpus = JSON.parse(JSON.stringify(report.corpus)) as typeof report.corpus;
    const searchFixture = driftedCorpus.fixtures.find(
      (fixture) => fixture.entry.id === "search-143-minimized",
    )!;
    searchFixture.scenario.seed += 1;

    const evidence = buildProductReportEvidence({
      corpus: driftedCorpus,
      search: report.search,
      exhaustive: report.exhaustive,
      boundedClaim: report.boundedClaim,
      reproduce: report.reproduce,
    });

    expect(evidence.search.corpusFixture).toBeUndefined();
  }, 15_000);

  it("CLI smoke prints a unified product report", () => {
    const output = execFileSync("node", ["--import", "tsx", "src/cli/report.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(output).toContain("QuorumScope product report");
    expect(output.trimEnd()).toBe(formatProductReportEvidence(buildProductReport().evidence));
    expect(output).toContain("Corpus:");
    expect(output).toContain("provenance hashes: 2 verified, 2 not declared, 0 mismatched");
    expect(output).toContain("Adversarial search:");
    expect(output).toContain("Tiny exhaustive model:");
    expect(output).toContain("Bounded claim:");
    expect(output).toContain("Reproduce:");
  }, 15_000);
});
