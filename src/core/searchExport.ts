import { analyzeScenario } from "./analyze";
import { summarizeWitness } from "./explanations";
import { reproductionCommand } from "./search";
import { validateCorpusFixtureCandidate } from "./corpus";
import type {
  AdversarialSearchResult,
  ProtocolName,
  Scenario,
  SearchAttempt,
} from "./types";
import type {
  CorpusFixtureCandidateValidation,
  CorpusManifestEntry,
  CorpusProtocolExpectation,
} from "./corpus";

export interface SearchFixtureExport {
  source: {
    seed: number;
    attempt: number;
    reproductionCommand: string;
    originalSteps: number;
    minimizedSteps: number;
  };
  scenario: Scenario;
  manifestEntry: CorpusManifestEntry;
  promotionCheck: CorpusFixtureCandidateValidation;
  witnessSummary?: string;
}

export function buildSearchFixtureExport(
  result: AdversarialSearchResult,
): SearchFixtureExport | undefined {
  const failure = firstUnsafeFailure(result);
  if (!failure) {
    return undefined;
  }

  const minimized =
    failure.unsafe.minimized?.scenario ??
    analyzeScenario(failure.scenario, "unsafe", { shrink: true }).minimizedFailure?.scenario ??
    failure.scenario;
  const unsafe = analyzeScenario(minimized, "unsafe");
  const quorum = analyzeScenario(minimized, "quorum");
  const fixtureId =
    failure.attempt === 0
      ? `search-${failure.seed}-minimized`
      : `search-${failure.seed}-${failure.attempt}-minimized`;
  const fixture = `${fixtureId}.json`;
  const scenario: Scenario = {
    ...minimized,
    description:
      "Minimized first-ack stale-read counterexample discovered by the bounded adversarial search. This is a replay fixture, not an exhaustive proof.",
  };
  const source = {
    seed: failure.seed,
    attempt: failure.attempt,
    reproductionCommand: reproductionCommand(failure.seed, "compare", {
      ...result.config,
      shrink: true,
    }),
    originalSteps: failure.scenario.steps.length,
    minimizedSteps: minimized.steps.length,
  };
  let manifestEntry: CorpusManifestEntry = {
    id: fixtureId,
    title: `Minimized adversarial search failure ${failure.seed}:${failure.attempt}`,
    fixture,
    scenarioType: "generated-minimized-counterexample",
    protocols: ["unsafe", "quorum"],
    expected: {
      unsafe: expectedFor("unsafe", unsafe),
      quorum: expectedFor("quorum", quorum),
    },
    notes:
      "Exported from adversarial search. Save scenario as the fixture path and add this entry to examples/corpus.manifest.json to promote it into the replay corpus.",
    tags: ["generated", "minimized", "stale-read", "partition", "counterexample"],
  };
  const initialPromotionCheck = validateCorpusFixtureCandidate(manifestEntry, scenario);
  manifestEntry = {
    ...manifestEntry,
    provenance: {
      source: "adversarial-search",
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

function firstUnsafeFailure(result: AdversarialSearchResult): SearchAttempt | undefined {
  return result.attempts.find((attempt) => attempt.unsafe.violation);
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
