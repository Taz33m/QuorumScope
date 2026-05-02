import { collectCorpusIssues, type CorpusIssue, type CorpusRunResult } from "./corpus";
import type { ExhaustiveResult } from "./exhaustive";
import { detailWitness, summarizeWitness } from "./explanations";
import type { AdversarialSearchResult } from "./types";

export interface ProductReportEvidenceInput {
  corpus: CorpusRunResult;
  search: AdversarialSearchResult;
  exhaustive: ExhaustiveResult;
  boundedClaim: string;
  reproduce: string[];
}

export interface ProductReportEvidence {
  ok: boolean;
  protocols: {
    firstAck: string;
    quorum: string;
  };
  corpus: {
    fixtures: number;
    expectedMatched: number;
    unsafeViolations: number;
    quorumViolations: number;
    quorumUnavailableOperations: number;
    issues: CorpusIssue[];
    claim: string;
  };
  search: {
    seedsExplored: number;
    firstFailingSeed?: number;
    unsafeViolations: number;
    quorumViolations: number;
    quorumUnavailableOperations: number;
    minimizedSteps?: number;
    witnessSummary?: string;
    witnessDetail?: string;
    reproductionCommand: string;
    claim: string;
  };
  exhaustive: {
    terminalHistories: number;
    prefixesExplored: number;
    unsafeViolations: number;
    staleReadWitnesses: number;
    quorumViolations: number;
    quorumUnavailableOperations: number;
    firstViolationCaseId?: string;
    witnessSummary?: string;
    witnessDetail?: string;
    reproductionCommand: string;
    claim: string;
  };
  boundedClaim: string;
  reproduce: string[];
}

export function buildProductReportEvidence(
  input: ProductReportEvidenceInput,
): ProductReportEvidence {
  const searchWitness = input.search.firstFailure?.unsafe.analysis.verdict.witness;
  const exhaustiveWitness = input.exhaustive.unsafe.firstViolation?.witness;
  return {
    ok: input.corpus.ok,
    protocols: {
      firstAck: "unsafe under modeled partitions; accepts the first reachable replica response.",
      quorum: "no violations found in declared bounded corpora; availability tradeoff is counted.",
    },
    corpus: {
      fixtures: input.corpus.summary.fixtures,
      expectedMatched: input.corpus.summary.expectedMatched,
      unsafeViolations: input.corpus.summary.unsafeViolations,
      quorumViolations: input.corpus.summary.quorumViolations,
      quorumUnavailableOperations: input.corpus.summary.quorumUnavailableOperations,
      issues: collectCorpusIssues(input.corpus),
      claim: input.corpus.claim,
    },
    search: {
      seedsExplored: input.search.summary.attempts,
      firstFailingSeed: input.search.firstFailure?.seed,
      unsafeViolations: input.search.summary.unsafeViolations,
      quorumViolations: input.search.summary.quorumViolations,
      quorumUnavailableOperations: input.search.summary.quorumUnavailableOperations,
      minimizedSteps: input.search.firstFailure
        ? input.search.firstFailure.unsafe.minimized?.scenario.steps.length ??
          input.search.firstFailure.scenario.steps.length
        : undefined,
      witnessSummary: summarizeWitness(searchWitness),
      witnessDetail: detailWitness(searchWitness),
      reproductionCommand: input.reproduce[1] ?? "npm run search:compare",
      claim: input.search.claim,
    },
    exhaustive: {
      terminalHistories: input.exhaustive.coverage.terminalHistories,
      prefixesExplored: input.exhaustive.coverage.prefixesExplored,
      unsafeViolations: input.exhaustive.unsafe.violations,
      staleReadWitnesses: input.exhaustive.unsafe.staleReadViolations,
      quorumViolations: input.exhaustive.quorum.violations,
      quorumUnavailableOperations: input.exhaustive.quorum.unavailableOperations,
      firstViolationCaseId: input.exhaustive.unsafe.firstViolation?.caseId,
      witnessSummary: summarizeWitness(exhaustiveWitness),
      witnessDetail: detailWitness(exhaustiveWitness),
      reproductionCommand:
        input.exhaustive.unsafe.firstViolation?.reproductionCommand ??
        input.reproduce[2] ??
        "npm run exhaustive",
      claim: input.exhaustive.claim,
    },
    boundedClaim: input.boundedClaim,
    reproduce: input.reproduce,
  };
}

export function formatProductReportEvidence(evidence: ProductReportEvidence): string {
  return [
    "QuorumScope product report",
    "",
    "Protocols:",
    `- First-ack: ${evidence.protocols.firstAck}`,
    `- Quorum: ${evidence.protocols.quorum}`,
    "",
    "Corpus:",
    `- fixtures: ${evidence.corpus.fixtures}`,
    `- expected outcomes matched: ${evidence.corpus.expectedMatched}`,
    `- first-ack violations: ${evidence.corpus.unsafeViolations}`,
    `- quorum violations: ${evidence.corpus.quorumViolations}`,
    `- quorum unavailable operations: ${evidence.corpus.quorumUnavailableOperations}`,
    "",
    "Adversarial search:",
    `- seeds explored: ${evidence.search.seedsExplored}`,
    `- first failing seed: ${evidence.search.firstFailingSeed ?? "none"}`,
    `- first-ack violations: ${evidence.search.unsafeViolations}/${evidence.search.seedsExplored}`,
    `- quorum violations: ${evidence.search.quorumViolations}/${evidence.search.seedsExplored}`,
    `- quorum unavailable operations: ${evidence.search.quorumUnavailableOperations}`,
    `- minimized steps: ${evidence.search.minimizedSteps ?? "n/a"}`,
    `- first failure witness: ${evidence.search.witnessSummary ?? "none"}`,
    "",
    "Tiny exhaustive model:",
    `- terminal histories checked: ${evidence.exhaustive.terminalHistories}`,
    `- prefixes explored: ${evidence.exhaustive.prefixesExplored}`,
    `- first-ack violations: ${evidence.exhaustive.unsafeViolations}`,
    `- first-ack stale-read witnesses: ${evidence.exhaustive.staleReadWitnesses}`,
    `- quorum violations: ${evidence.exhaustive.quorumViolations}`,
    `- quorum unavailable operations: ${evidence.exhaustive.quorumUnavailableOperations}`,
    `- first exhaustive violation: ${evidence.exhaustive.firstViolationCaseId ?? "none"}`,
    `- first exhaustive witness: ${evidence.exhaustive.witnessSummary ?? "none"}`,
    "",
    "Bounded claim:",
    evidence.boundedClaim,
    "",
    "Reproduce:",
    ...evidence.reproduce.map((command) => `- ${command}`),
  ].join("\n");
}
