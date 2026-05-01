import { analyzeScenario } from "./analyze";
import { SeededRng } from "./rng";
import type {
  AdversarialSearchResult,
  GeneratedScenario,
  NodeId,
  ProtocolName,
  ProtocolSearchEvaluation,
  Scenario,
  ScenarioStep,
  SearchAttempt,
  SearchConfig,
  SearchSummary,
} from "./types";

export const defaultSearchConfig: SearchConfig = {
  seed: 143,
  seeds: 50,
  nodeCount: 5,
  operationCount: 8,
  clientCount: 3,
  readRatio: 0.55,
  partitionIntensity: 0.75,
  concurrentIntensity: 0.45,
  protocol: "compare",
  shrink: true,
};

export function normalizeSearchConfig(config: Partial<SearchConfig> = {}): SearchConfig {
  const normalized: SearchConfig = {
    ...defaultSearchConfig,
    ...config,
  };
  if (!Number.isInteger(normalized.seed) || normalized.seed < 0) {
    throw new Error("Search seed must be a non-negative integer.");
  }
  if (!Number.isInteger(normalized.seeds) || normalized.seeds < 1 || normalized.seeds > 1000) {
    throw new Error("Search seed count must be an integer between 1 and 1000.");
  }
  if (!Number.isInteger(normalized.nodeCount) || normalized.nodeCount < 3 || normalized.nodeCount > 9) {
    throw new Error("Search node count must be an integer between 3 and 9.");
  }
  if (!Number.isInteger(normalized.operationCount) || normalized.operationCount < 3 || normalized.operationCount > 30) {
    throw new Error("Search operation count must be an integer between 3 and 30.");
  }
  if (!Number.isInteger(normalized.clientCount) || normalized.clientCount < 1 || normalized.clientCount > 12) {
    throw new Error("Search client count must be an integer between 1 and 12.");
  }
  if (normalized.readRatio < 0 || normalized.readRatio > 1) {
    throw new Error("Search read ratio must be between 0 and 1.");
  }
  if (normalized.partitionIntensity < 0 || normalized.partitionIntensity > 1) {
    throw new Error("Search partition intensity must be between 0 and 1.");
  }
  if (normalized.concurrentIntensity < 0 || normalized.concurrentIntensity > 1) {
    throw new Error("Search concurrent intensity must be between 0 and 1.");
  }
  return normalized;
}

export function generateSearchScenario(seed: number, attempt: number, config: Partial<SearchConfig> = {}): GeneratedScenario {
  const normalized = normalizeSearchConfig({ ...config, seed });
  const nodes = Array.from({ length: normalized.nodeCount }, (_, index) => `n${index + 1}`);
  const rng = new SeededRng(seed * 110351 + attempt * 7919 + normalized.operationCount * 97);
  const rotated = rotate(nodes, rng.int(0, nodes.length - 1));
  const minoritySize = chooseMinoritySize(nodes.length, rng, normalized.partitionIntensity);
  const minority = sortedNodes(rotated.slice(0, minoritySize));
  const majority = sortedNodes(rotated.slice(minoritySize));
  const majorityZone = 1;
  const minorityZone = 0;
  const value = `v${seed}-${attempt}`;
  const clients = Array.from({ length: normalized.clientCount }, (_, index) => `c${index + 1}`);
  const useConcurrentProbe = normalized.operationCount >= 4 && rng.next() < normalized.concurrentIntensity;
  const steps: ScenarioStep[] = [
    {
      type: "read",
      client: clients[0] ?? "c1",
      zone: 0,
      label: "generated baseline read",
    },
    {
      type: "wait",
      ms: rng.int(1, 4),
      label: "generated quiet period",
    },
    {
      type: "partition",
      groups: [minority, majority],
      label: `generated ${minority.length}/${majority.length} partition`,
    },
    useConcurrentProbe
      ? {
          type: "concurrent",
          label: "generated overlapping partition probe",
          operations: [
            {
              type: "write",
              client: clients[1 % clients.length] ?? "c2",
              zone: majorityZone,
              value,
              label: "generated majority write probe",
            },
            {
              type: "read",
              client: clients[2 % clients.length] ?? "c3",
              zone: minorityZone,
              label: "generated overlapping minority read probe",
            },
          ],
        }
      : {
          type: "write",
          client: clients[1 % clients.length] ?? "c2",
          zone: majorityZone,
          value,
          label: "generated majority write probe",
        },
    {
      type: "wait",
      ms: rng.int(1, 6),
      label: "generated partition hold",
    },
    {
      type: "read",
      client: clients[2 % clients.length] ?? "c3",
      zone: minorityZone,
      label: "generated minority stale-read probe",
    },
  ];

  const emittedOps = useConcurrentProbe ? 4 : 3;
  const extraOps = Math.max(0, normalized.operationCount - emittedOps);
  for (let index = 0; index < extraOps; index += 1) {
    const client = clients[(index + 3) % clients.length] ?? "c1";
    const roll = rng.next();
    if (roll < 0.18) {
      steps.push({ type: "wait", ms: rng.int(1, 5), label: `generated jitter ${index + 1}` });
    } else if (roll < 0.3) {
      steps.push({ type: "heal", label: `generated heal ${index + 1}` });
    } else if (roll < normalized.readRatio) {
      steps.push({
        type: "read",
        client,
        zone: rng.int(0, 1),
        label: `generated read ${index + 1}`,
      });
    } else {
      steps.push({
        type: "write",
        client,
        zone: rng.int(0, 1),
        value: `${value}-x${index + 1}`,
        label: `generated write ${index + 1}`,
      });
    }
  }

  return {
    seed,
    attempt,
    partitionShape: `${minority.length}/${majority.length}`,
    scenario: {
      id: `search-${seed}-${attempt}`,
      name: `Generated search scenario ${seed}:${attempt}`,
      description:
        "Generated bounded partition schedule for a single-key replicated register. It is intended for deterministic replay, not exhaustive proof.",
      seed: seed + attempt,
      initialValue: "v0",
      nodes,
      steps,
    },
  };
}

export function runAdversarialSearch(config: Partial<SearchConfig> = {}): AdversarialSearchResult {
  const normalized = normalizeSearchConfig(config);
  const attempts: SearchAttempt[] = [];
  let firstFailure: SearchAttempt | undefined;

  for (let attempt = 0; attempt < normalized.seeds; attempt += 1) {
    const generated = generateSearchScenario(normalized.seed + attempt, attempt, normalized);
    const searchAttempt = evaluateGeneratedScenario(generated);
    attempts.push(searchAttempt);
    const selectedEvaluation =
      normalized.protocol === "quorum" ? searchAttempt.quorum : searchAttempt.unsafe;
    if (!firstFailure && selectedEvaluation.violation) {
      firstFailure = searchAttempt;
    }
  }

  const summary = summarizeAttempts(attempts);
  return {
    config: normalized,
    attempts,
    firstFailure,
    summary,
    claim: `Quorum produced ${summary.quorumViolations} violations across this bounded generated corpus under the modeled assumptions; this is not a general proof.`,
  };
}

export function evaluateGeneratedScenario(generated: GeneratedScenario): SearchAttempt {
  const unsafe = evaluateProtocol(generated.scenario, "unsafe");
  const quorum = evaluateProtocol(generated.scenario, "quorum");
  return {
    seed: generated.seed,
    attempt: generated.attempt,
    scenario: generated.scenario,
    partitionShape: generated.partitionShape,
    unsafe,
    quorum,
  };
}

export function reproductionCommand(
  seed: number,
  protocol: ProtocolName | "compare" = "unsafe",
  config: SearchConfig = defaultSearchConfig,
): string {
  const protocolArg = protocol === "compare" ? "compare" : protocol;
  return `npm run search -- --seed ${seed} --seeds 1 --protocol ${protocolArg} --nodes ${config.nodeCount} --ops ${config.operationCount} --clients ${config.clientCount} --read-ratio ${config.readRatio} --chaos ${config.partitionIntensity} --concurrency ${config.concurrentIntensity} --shrink`;
}

function evaluateProtocol(scenario: Scenario, protocol: ProtocolName): ProtocolSearchEvaluation {
  const analysis = analyzeScenario(scenario, protocol);
  return {
    protocol,
    analysis,
    violation: !analysis.verdict.ok,
    unavailableOperations: analysis.metrics.unavailableOperations,
    minimized: analysis.minimizedFailure,
  };
}

function summarizeAttempts(attempts: readonly SearchAttempt[]): SearchSummary {
  return attempts.reduce<SearchSummary>(
    (summary, attempt) => ({
      attempts: summary.attempts + 1,
      unsafeViolations: summary.unsafeViolations + (attempt.unsafe.violation ? 1 : 0),
      quorumViolations: summary.quorumViolations + (attempt.quorum.violation ? 1 : 0),
      quorumUnavailableOperations:
        summary.quorumUnavailableOperations + attempt.quorum.unavailableOperations,
      unsafeUnavailableOperations:
        summary.unsafeUnavailableOperations + attempt.unsafe.unavailableOperations,
      concurrentSchedules:
        summary.concurrentSchedules +
        (attempt.scenario.steps.some((step) => step.type === "concurrent") ? 1 : 0),
    }),
    {
      attempts: 0,
      unsafeViolations: 0,
      quorumViolations: 0,
      quorumUnavailableOperations: 0,
      unsafeUnavailableOperations: 0,
      concurrentSchedules: 0,
    },
  );
}

function chooseMinoritySize(nodeCount: number, rng: SeededRng, intensity: number): number {
  const quorum = Math.floor(nodeCount / 2) + 1;
  if (intensity >= 0.6) {
    return Math.max(1, nodeCount - quorum);
  }
  return Math.max(1, rng.int(1, Math.max(1, nodeCount - quorum)));
}

function rotate<T>(items: readonly T[], offset: number): T[] {
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function sortedNodes(nodes: readonly NodeId[]): NodeId[] {
  return [...nodes].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
}
