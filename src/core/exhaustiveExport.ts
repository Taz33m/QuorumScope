import { analyzeScenario } from "./analyze";
import { summarizeWitness } from "./explanations";
import { validateCorpusFixtureCandidate } from "./corpus";
import type {
  ExhaustiveCaseEvaluation,
  ExhaustiveConfig,
  ExhaustiveResult,
} from "./exhaustive";
import type {
  CorpusFixtureCandidateValidation,
  CorpusManifestEntry,
  CorpusProtocolExpectation,
} from "./corpus";
import type { ProtocolName, Scenario } from "./types";

export interface ExhaustiveFixtureExport {
  source: {
    caseId: string;
    scenarioHash: string;
    reproductionCommand: string;
    maxOperations: number;
    maxTopologyChanges: number;
    clientCount: number;
    seed: number;
    includeConcurrent: boolean;
  };
  scenario: Scenario;
  manifestEntry: CorpusManifestEntry;
  promotionCheck: CorpusFixtureCandidateValidation;
  witnessSummary?: string;
}

export function buildExhaustiveFixtureExport(
  result: ExhaustiveResult,
  caseId = result.unsafe.firstViolation?.caseId,
): ExhaustiveFixtureExport | undefined {
  if (!caseId) {
    return undefined;
  }
  const found = result.cases.find((candidate) => candidate.caseId === caseId);
  if (!found) {
    return undefined;
  }

  const unsafe = analyzeScenario(found.scenario, "unsafe");
  const quorum = analyzeScenario(found.scenario, "quorum");
  const fixtureId = `exhaustive-${found.caseId}`;
  const fixture = `${fixtureId}.json`;
  const scenario: Scenario = {
    ...found.scenario,
    description: found.unsafe.violation
      ? "First stale-read witness discovered by the default tiny bounded exhaustive explorer. This fixture preserves the enumerated case for corpus replay."
      : "Scenario enumerated by the tiny bounded exhaustive explorer. This fixture preserves the enumerated case for corpus replay.",
  };
  const source = {
    caseId: found.caseId,
    scenarioHash: found.scenarioHash,
    reproductionCommand: reproductionCommand(found.caseId, result.config),
    maxOperations: result.config.maxOperations,
    maxTopologyChanges: result.config.maxTopologyChanges,
    clientCount: result.config.clientCount,
    seed: result.config.seed,
    includeConcurrent: result.config.includeConcurrent,
  };
  let manifestEntry: CorpusManifestEntry = {
    id: fixtureId,
    title: found.unsafe.violation
      ? `Exhaustive ${found.caseId} counterexample`
      : `Exhaustive ${found.caseId} replay`,
    fixture,
    scenarioType: found.unsafe.violation
      ? "exhaustive-counterexample"
      : "exhaustive-safe-history",
    protocols: ["unsafe", "quorum"],
    expected: {
      unsafe: expectedFor("unsafe", unsafe),
      quorum: expectedFor("quorum", quorum),
    },
    notes:
      "Exported from the bounded exhaustive explorer. Save scenario as the fixture path and add this entry to examples/corpus.manifest.json to promote it into the replay corpus.",
    tags: tagsFor(found),
  };
  const initialPromotionCheck = validateCorpusFixtureCandidate(manifestEntry, scenario);
  manifestEntry = {
    ...manifestEntry,
    provenance: {
      source: "bounded-exhaustive",
      scenarioHash: initialPromotionCheck.scenarioHash,
      reproductionCommand: source.reproductionCommand,
    },
  };

  return {
    source,
    scenario,
    manifestEntry,
    promotionCheck: validateCorpusFixtureCandidate(manifestEntry, scenario),
    witnessSummary: summarizeWitness(unsafe.verdict.witness),
  };
}

function reproductionCommand(caseId: string, config: ExhaustiveConfig): string {
  const concurrency = config.includeConcurrent ? "" : " --no-concurrency";
  return `npm run exhaustive -- --case ${caseId} --max-ops ${config.maxOperations} --topology ${config.maxTopologyChanges} --clients ${config.clientCount} --seed ${config.seed}${concurrency} --show`;
}

function expectedFor(
  protocol: ProtocolName,
  analysis: ReturnType<typeof analyzeScenario>,
): CorpusProtocolExpectation {
  const expectation: CorpusProtocolExpectation = {
    verdict: analysis.verdict.ok ? "linearizable" : "violation",
    unavailableOperations: analysis.metrics.unavailableOperations,
  };
  if (analysis.verdict.witness?.type) {
    expectation.violationKind = analysis.verdict.witness.type;
  }
  if (analysis.verdict.finalValue) {
    expectation.finalValue = analysis.verdict.finalValue;
  }
  if (protocol === "unsafe" && expectation.verdict === "violation" && !expectation.violationKind) {
    expectation.violationKind = "no-sequentialization";
  }
  return expectation;
}

function tagsFor(found: ExhaustiveCaseEvaluation): string[] {
  const tags = ["exhaustive"];
  if (found.scenario.steps.some((step) => step.type === "concurrent")) {
    tags.push("concurrent");
  }
  if (found.scenario.steps.some((step) => step.type === "partition")) {
    tags.push("partition");
  }
  if (found.unsafe.witness?.type === "stale-read") {
    tags.push("stale-read");
  }
  tags.push(found.unsafe.violation ? "counterexample" : "safe");
  return tags;
}
