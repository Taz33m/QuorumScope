import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { buildProductReport } from "../src/core/report";
import { formatProductReportEvidence } from "../src/core/reportEvidence";

describe("product report", () => {
  it("aggregates corpus, adversarial search, and tiny exhaustive evidence", () => {
    const report = buildProductReport();

    expect(report.corpus.ok).toBe(true);
    expect(report.corpus.summary.fixtures).toBe(3);
    expect(report.search.summary.unsafeViolations).toBe(50);
    expect(report.search.summary.quorumViolations).toBe(0);
    expect(report.exhaustive.coverage.terminalHistories).toBe(804);
    expect(report.exhaustive.unsafe.violations).toBe(134);
    expect(report.exhaustive.quorum.violations).toBe(0);
    expect(report.boundedClaim).toContain("not a general proof");
    expect(report.reproduce.some((command) => command.includes("npm run search"))).toBe(true);
    expect(report.reproduce.some((command) => command.includes("npm run exhaustive"))).toBe(true);
    expect(report.evidence.search.witnessSummary).toContain("read returned");
    expect(report.evidence.exhaustive.witnessSummary).toContain("read returned");
    expect(report.evidence.boundedClaim).toBe(report.boundedClaim);
    expect(report.evidence.reproduce).toEqual(report.reproduce);
  }, 15_000);

  it("CLI smoke prints a unified product report", () => {
    const output = execFileSync("node", ["--import", "tsx", "src/cli/report.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(output).toContain("QuorumScope product report");
    expect(output.trimEnd()).toBe(formatProductReportEvidence(buildProductReport().evidence));
    expect(output).toContain("Corpus:");
    expect(output).toContain("Adversarial search:");
    expect(output).toContain("Tiny exhaustive model:");
    expect(output).toContain("Bounded claim:");
    expect(output).toContain("Reproduce:");
  }, 15_000);
});
