import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

import { runCorpus } from "../src/core/corpus";
import { summarizeWitness } from "../src/core/explanations";
import { buildCorpusJsonContract, buildProductReportJsonContract } from "../src/core/jsonContracts";
import { buildProductReport } from "../src/core/report";

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
    expect(output).toContain(
      `- first failure witness: ${summarizeWitness(contract.search.firstFailure?.witness) ?? "none"}`,
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
      `- first exhaustive witness: ${
        summarizeWitness(report.exhaustive.unsafe.firstViolation?.witness) ?? "none"
      }`,
    );

    expect(output).toContain(contract.boundedClaim);
    for (const command of contract.reproduce) {
      expect(output).toContain(`- ${command}`);
    }
  }, 15_000);
});
