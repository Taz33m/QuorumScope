import { runCorpus, type CorpusRunResult } from "./corpus";
import { runBoundedExhaustive, type ExhaustiveResult } from "./exhaustive";
import { reproductionCommand, runAdversarialSearch } from "./search";
import type { AdversarialSearchResult } from "./types";

export interface ProductReport {
  corpus: CorpusRunResult;
  search: AdversarialSearchResult;
  exhaustive: ExhaustiveResult;
  boundedClaim: string;
  reproduce: string[];
}

export function buildProductReport(): ProductReport {
  const corpus = runCorpus();
  const search = runAdversarialSearch();
  const exhaustive = runBoundedExhaustive();
  return {
    corpus,
    search,
    exhaustive,
    boundedClaim: buildBoundedClaim(corpus, search, exhaustive),
    reproduce: buildReproductionCommands(search, exhaustive),
  };
}

function buildBoundedClaim(
  corpus: CorpusRunResult,
  search: AdversarialSearchResult,
  exhaustive: ExhaustiveResult,
): string {
  const quorumViolations =
    corpus.summary.quorumViolations + search.summary.quorumViolations + exhaustive.quorum.violations;
  return `No quorum linearizability violations were found in the declared corpus, default adversarial generated corpus, and tiny exhaustive model under current assumptions (${quorumViolations} total quorum violations observed). This is not a general proof.`;
}

function buildReproductionCommands(
  search: AdversarialSearchResult,
  exhaustive: ExhaustiveResult,
): string[] {
  const commands = ["npm run corpus"];
  if (search.firstFailure) {
    commands.push(reproductionCommand(search.firstFailure.seed, "compare", search.config));
  } else {
    commands.push("npm run search:compare");
  }
  if (exhaustive.unsafe.firstViolation) {
    commands.push(exhaustive.unsafe.firstViolation.reproductionCommand);
  } else {
    commands.push("npm run exhaustive");
  }
  return commands;
}
