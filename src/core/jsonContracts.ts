import { collectCorpusIssues, type CorpusIssue, type CorpusRunResult } from "./corpus";
import type {
  ExhaustiveConfig,
  ExhaustiveCoverage,
  ExhaustiveSearchComparison,
} from "./exhaustive";
import type { ProductReport } from "./report";
import type { ProductReportEvidence } from "./reportEvidence";
import type { LinearizabilityWitness, SearchConfig, SearchSummary } from "./types";

export const jsonContractSchemaVersion = 1;

export interface CorpusJsonContract {
  schemaVersion: typeof jsonContractSchemaVersion;
  ok: boolean;
  manifest: {
    path?: string;
    version: 1;
    fixtureCount: number;
  };
  summary: CorpusRunResult["summary"];
  issues: CorpusIssue[];
  fixtures: CorpusFixtureJson[];
  claim: string;
}

export interface CorpusFixtureJson {
  id: string;
  title: string;
  fixture: string;
  scenarioType: string;
  tags: string[];
  scenarioHash: string;
  ok: boolean;
  validationErrors: string[];
  issues: CorpusIssue[];
  results: CorpusProtocolJson[];
}

export interface CorpusProtocolJson {
  protocol: string;
  verdict: string;
  violationKind?: string;
  unavailableOperations: number;
  finalValue?: string;
  minimizedSteps?: number;
  mismatches: string[];
  issues: CorpusIssue[];
}

export interface ProductReportJsonContract {
  schemaVersion: typeof jsonContractSchemaVersion;
  ok: boolean;
  corpus: {
    ok: boolean;
    summary: CorpusRunResult["summary"];
    issues: CorpusIssue[];
    claim: string;
  };
  search: {
    config: SearchConfig;
    summary: SearchSummary;
    firstFailure?: {
      seed: number;
      attempt: number;
      scenarioId: string;
      scenarioSteps: number;
      witness?: LinearizabilityWitness;
      minimizedSteps: number;
    };
    claim: string;
  };
  exhaustive: {
    config: ExhaustiveConfig;
    coverage: ExhaustiveCoverage;
    unsafe: ProtocolSummaryJson;
    quorum: ProtocolSummaryJson;
    searchComparison: ExhaustiveSearchComparison;
    claim: string;
  };
  boundedClaim: string;
  reproduce: string[];
  evidence: ProductReportEvidence;
}

export interface ProtocolSummaryJson {
  terminalHistories: number;
  violations: number;
  staleReadViolations: number;
  unavailableOperations: number;
  firstViolation?: {
    caseId: string;
    scenarioHash: string;
    reproductionCommand: string;
  };
}

export function buildCorpusJsonContract(result: CorpusRunResult): CorpusJsonContract {
  return {
    schemaVersion: jsonContractSchemaVersion,
    ok: result.ok,
    manifest: {
      path: result.manifestPath,
      version: result.manifest.version,
      fixtureCount: result.manifest.fixtures.length,
    },
    summary: result.summary,
    issues: collectCorpusIssues(result),
    fixtures: result.fixtures.map((fixture) => ({
      id: fixture.entry.id,
      title: fixture.entry.title,
      fixture: fixture.entry.fixture,
      scenarioType: fixture.entry.scenarioType,
      tags: fixture.entry.tags,
      scenarioHash: fixture.scenarioHash,
      ok: fixture.ok,
      validationErrors: fixture.validationErrors,
      issues: fixture.issues,
      results: fixture.results.map((protocol) => ({
        protocol: protocol.protocol,
        verdict: protocol.verdict,
        violationKind: protocol.violationKind,
        unavailableOperations: protocol.unavailableOperations,
        finalValue: protocol.finalValue,
        minimizedSteps: protocol.minimizedSteps,
        mismatches: protocol.mismatches,
        issues: protocol.issues,
      })),
    })),
    claim: result.claim,
  };
}

export function buildProductReportJsonContract(report: ProductReport): ProductReportJsonContract {
  return {
    schemaVersion: jsonContractSchemaVersion,
    ok: report.corpus.ok,
    corpus: {
      ok: report.corpus.ok,
      summary: report.corpus.summary,
      issues: collectCorpusIssues(report.corpus),
      claim: report.corpus.claim,
    },
    search: {
      config: report.search.config,
      summary: report.search.summary,
      firstFailure: report.search.firstFailure
        ? {
            seed: report.search.firstFailure.seed,
            attempt: report.search.firstFailure.attempt,
            scenarioId: report.search.firstFailure.scenario.id,
            scenarioSteps: report.search.firstFailure.scenario.steps.length,
            witness: report.search.firstFailure.unsafe.analysis.verdict.witness,
            minimizedSteps:
              report.search.firstFailure.unsafe.minimized?.scenario.steps.length ??
              report.search.firstFailure.scenario.steps.length,
          }
        : undefined,
      claim: report.search.claim,
    },
    exhaustive: {
      config: report.exhaustive.config,
      coverage: report.exhaustive.coverage,
      unsafe: {
        terminalHistories: report.exhaustive.unsafe.terminalHistories,
        violations: report.exhaustive.unsafe.violations,
        staleReadViolations: report.exhaustive.unsafe.staleReadViolations,
        unavailableOperations: report.exhaustive.unsafe.unavailableOperations,
        firstViolation: report.exhaustive.unsafe.firstViolation
          ? {
              caseId: report.exhaustive.unsafe.firstViolation.caseId,
              scenarioHash: report.exhaustive.unsafe.firstViolation.scenarioHash,
              reproductionCommand: report.exhaustive.unsafe.firstViolation.reproductionCommand,
            }
          : undefined,
      },
      quorum: {
        terminalHistories: report.exhaustive.quorum.terminalHistories,
        violations: report.exhaustive.quorum.violations,
        staleReadViolations: report.exhaustive.quorum.staleReadViolations,
        unavailableOperations: report.exhaustive.quorum.unavailableOperations,
      },
      searchComparison: report.exhaustive.searchComparison,
      claim: report.exhaustive.claim,
    },
    boundedClaim: report.boundedClaim,
    reproduce: report.reproduce,
    evidence: report.evidence,
  };
}
