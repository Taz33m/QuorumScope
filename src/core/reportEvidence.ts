import {
  collectCorpusIssues,
  type CorpusFixtureProvenance,
  type CorpusFixtureResult,
  type CorpusIssue,
  type CorpusRunResult,
} from "./corpus";
import type { ExhaustiveResult } from "./exhaustive";
import { detailWitness, summarizeWitness } from "./explanations";
import type { AdversarialSearchResult, Scenario } from "./types";

export interface ProductReportEvidenceInput {
  corpus: CorpusRunResult;
  search: AdversarialSearchResult;
  exhaustive: ExhaustiveResult;
  boundedClaim: string;
  reproduce: string[];
}

export interface CorpusFixtureReference {
  id: string;
  title: string;
  fixture: string;
  scenarioType: string;
  scenarioHash: string;
  provenance?: FixtureProvenanceEvidence;
  tags: string[];
}

export type FixtureProvenanceStatus = "verified" | "not-declared" | "mismatch";

export interface FixtureProvenanceEvidence {
  source?: CorpusFixtureProvenance["source"];
  scenarioHash?: string;
  reproductionCommand?: string;
  status: FixtureProvenanceStatus;
}

export interface CorpusProvenanceSummary {
  verified: number;
  notDeclared: number;
  mismatched: number;
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
    provenance: CorpusProvenanceSummary;
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
    corpusFixture?: CorpusFixtureReference;
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
    corpusFixture?: CorpusFixtureReference;
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
  const searchScenario =
    input.search.firstFailure?.unsafe.minimized?.scenario ?? input.search.firstFailure?.scenario;
  const exhaustiveScenario = input.exhaustive.unsafe.firstViolation?.scenario;
  const corpusIssues = collectCorpusIssues(input.corpus);
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
      issues: corpusIssues,
      provenance: summarizeCorpusProvenance(input.corpus.fixtures),
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
      corpusFixture: findCorpusFixture(input.corpus, searchScenario),
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
      corpusFixture: findCorpusFixture(input.corpus, exhaustiveScenario),
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
    `- provenance hashes: ${evidence.corpus.provenance.verified} verified, ${evidence.corpus.provenance.notDeclared} not declared, ${evidence.corpus.provenance.mismatched} mismatched`,
    ...formatCorpusIssues(evidence.corpus.issues),
    "",
    "Adversarial search:",
    `- seeds explored: ${evidence.search.seedsExplored}`,
    `- first failing seed: ${evidence.search.firstFailingSeed ?? "none"}`,
    `- first-ack violations: ${evidence.search.unsafeViolations}/${evidence.search.seedsExplored}`,
    `- quorum violations: ${evidence.search.quorumViolations}/${evidence.search.seedsExplored}`,
    `- quorum unavailable operations: ${evidence.search.quorumUnavailableOperations}`,
    `- minimized steps: ${evidence.search.minimizedSteps ?? "n/a"}`,
    `- first failure witness: ${evidence.search.witnessSummary ?? "none"}`,
    `- corpus fixture: ${formatFixtureReference(evidence.search.corpusFixture)}`,
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
    `- corpus fixture: ${formatFixtureReference(evidence.exhaustive.corpusFixture)}`,
    "",
    "Bounded claim:",
    evidence.boundedClaim,
    "",
    "Reproduce:",
    ...evidence.reproduce.map((command) => `- ${command}`),
  ].join("\n");
}

function findCorpusFixture(
  corpus: CorpusRunResult,
  scenario: Scenario | undefined,
): CorpusFixtureReference | undefined {
  if (!scenario) {
    return undefined;
  }
  const targetKey = scenarioBehaviorKey(scenario);
  const fixture = corpus.fixtures.find(
    (candidate) =>
      candidate.ok &&
      candidate.scenarioHash.length > 0 &&
      scenarioBehaviorKey(candidate.scenario) === targetKey,
  );
  return fixture ? toFixtureReference(fixture) : undefined;
}

function toFixtureReference(fixture: CorpusFixtureResult): CorpusFixtureReference {
  return {
    id: fixture.entry.id,
    title: fixture.entry.title,
    fixture: fixture.entry.fixture,
    scenarioType: fixture.entry.scenarioType,
    scenarioHash: fixture.scenarioHash,
    provenance: fixtureProvenanceEvidence(fixture),
    tags: fixture.entry.tags,
  };
}

function summarizeCorpusProvenance(
  fixtures: readonly CorpusFixtureResult[],
): CorpusProvenanceSummary {
  const summary: CorpusProvenanceSummary = {
    verified: 0,
    notDeclared: 0,
    mismatched: 0,
  };
  for (const fixture of fixtures) {
    const status = fixtureProvenanceEvidence(fixture).status;
    if (status === "verified") {
      summary.verified += 1;
    } else if (status === "mismatch") {
      summary.mismatched += 1;
    } else {
      summary.notDeclared += 1;
    }
  }
  return summary;
}

function fixtureProvenanceEvidence(fixture: CorpusFixtureResult): FixtureProvenanceEvidence {
  const provenance = fixture.entry.provenance;
  const hasMismatch = fixture.issues.some((issue) => issue.code === "fixture.provenance-hash");
  if (!provenance?.scenarioHash) {
    return {
      source: provenance?.source,
      reproductionCommand: provenance?.reproductionCommand,
      status: "not-declared",
    };
  }
  return {
    source: provenance.source,
    scenarioHash: provenance.scenarioHash,
    reproductionCommand: provenance.reproductionCommand,
    status: hasMismatch ? "mismatch" : "verified",
  };
}

function scenarioBehaviorKey(scenario: Scenario): string {
  return JSON.stringify({
    initialValue: scenario.initialValue,
    nodes: scenario.nodes,
    steps: scenario.steps,
  });
}

function formatFixtureReference(fixture: CorpusFixtureReference | undefined): string {
  if (!fixture) {
    return "not saved in corpus";
  }
  return `${fixture.id} (${fixture.fixture}, hash ${fixture.scenarioHash}, provenance ${fixture.provenance?.status ?? "not-declared"})`;
}

function formatCorpusIssues(issues: readonly CorpusIssue[]): string[] {
  if (issues.length === 0) {
    return [];
  }
  return [
    "- corpus issues:",
    ...issues.map((issue) => `  - ${formatCorpusIssue(issue)}`),
  ];
}

function formatCorpusIssue(issue: CorpusIssue): string {
  const protocol = issue.protocol ? ` ${issue.protocol}` : "";
  const expectedActual =
    typeof issue.expected !== "undefined" || typeof issue.actual !== "undefined"
      ? ` (expected ${issue.expected ?? "n/a"}, actual ${issue.actual ?? "n/a"})`
      : "";
  return `${issue.fixtureId}${protocol} [${issue.code}]: ${issue.message}${expectedActual}`;
}
