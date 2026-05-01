import { analyzeScenario } from "./analyze";
import { checkLinearizability } from "./linearizability";
import { runAdversarialSearch } from "./search";
import { simulateScenario } from "./simulator";
import type {
  AnalysisResult,
  LinearizabilityWitness,
  NodeId,
  OperationScenarioStep,
  ProtocolName,
  Scenario,
  ScenarioStep,
} from "./types";

export interface ExhaustiveConfig {
  nodeCount: number;
  clientCount: number;
  maxOperations: number;
  maxTopologyChanges: number;
  includeConcurrent: boolean;
  seed: number;
}

export interface ExhaustiveCoverage {
  prefixesExplored: number;
  prunedPrefixes: number;
  terminalHistories: number;
  uniqueScenarios: number;
  concurrentSchedules: number;
  partitionShapes: Record<string, number>;
  operationPatterns: Record<string, number>;
}

export interface ExhaustiveViolation {
  caseId: string;
  scenarioHash: string;
  scenario: Scenario;
  analysis: AnalysisResult;
  minimized?: AnalysisResult["minimizedFailure"];
  witness?: LinearizabilityWitness;
  reproductionCommand: string;
}

export interface ExhaustiveProtocolSummary {
  protocol: ProtocolName;
  terminalHistories: number;
  violations: number;
  staleReadViolations: number;
  unavailableOperations: number;
  firstViolation?: ExhaustiveViolation;
}

export interface ExhaustiveCaseEvaluation {
  caseId: string;
  scenarioHash: string;
  scenario: Scenario;
  unsafe: {
    violation: boolean;
    witness?: LinearizabilityWitness;
    unavailableOperations: number;
  };
  quorum: {
    violation: boolean;
    witness?: LinearizabilityWitness;
    unavailableOperations: number;
  };
}

export interface ExhaustiveSearchComparison {
  seeds: number;
  unsafeViolations: number;
  quorumViolations: number;
  firstFailureSeed?: number;
  sameWitnessClass: boolean;
  note: string;
}

export interface ExhaustiveResult {
  config: ExhaustiveConfig;
  cases: ExhaustiveCaseEvaluation[];
  coverage: ExhaustiveCoverage;
  unsafe: ExhaustiveProtocolSummary;
  quorum: ExhaustiveProtocolSummary;
  searchComparison: ExhaustiveSearchComparison;
  elapsedMs: number;
  claim: string;
}

interface ExplorerState {
  steps: ScenarioStep[];
  topology: TopologyState;
  operations: number;
  writes: number;
  topologyChanges: number;
  concurrentUsed: boolean;
}

type TopologyState =
  | {
      kind: "healed";
    }
  | {
      kind: "partition";
      groups: NodeId[][];
      shape: string;
    };

export const defaultExhaustiveConfig: ExhaustiveConfig = {
  nodeCount: 3,
  clientCount: 2,
  maxOperations: 3,
  maxTopologyChanges: 2,
  includeConcurrent: true,
  seed: 7001,
};

export function runBoundedExhaustive(config: Partial<ExhaustiveConfig> = {}): ExhaustiveResult {
  const normalized = normalizeExhaustiveConfig(config);
  const started = performance.now();
  const scenarios = enumerateScenarios(normalized);
  const cases: ExhaustiveCaseEvaluation[] = [];
  const coverage = initialCoverage();
  coverage.prefixesExplored = scenarios.prefixesExplored;
  coverage.prunedPrefixes = scenarios.prunedPrefixes;
  coverage.terminalHistories = scenarios.terminals.length;
  coverage.uniqueScenarios = scenarios.terminals.length;

  let unsafeSummary = emptyProtocolSummary("unsafe");
  let quorumSummary = emptyProtocolSummary("quorum");

  scenarios.terminals.forEach((scenario, index) => {
    const caseId = caseIdFor(index);
    const scenarioHash = hashScenario(scenario);
    const unsafeSimulation = simulateScenario(scenario, "unsafe");
    const unsafeVerdict = checkLinearizability(unsafeSimulation.operations, scenario.initialValue);
    const quorumSimulation = simulateScenario(scenario, "quorum");
    const quorumVerdict = checkLinearizability(quorumSimulation.operations, scenario.initialValue);
    const unsafeViolation = !unsafeVerdict.ok;
    const quorumViolation = !quorumVerdict.ok;

    updateCoverage(coverage, scenario);
    unsafeSummary = updateProtocolSummary(unsafeSummary, {
      protocol: "unsafe",
      scenario,
      caseId,
      scenarioHash,
      config: normalized,
      violation: unsafeViolation,
      witness: unsafeVerdict.witness,
      unavailableOperations: unsafeSimulation.metrics.unavailableOperations,
    });
    quorumSummary = updateProtocolSummary(quorumSummary, {
      protocol: "quorum",
      scenario,
      caseId,
      scenarioHash,
      config: normalized,
      violation: quorumViolation,
      witness: quorumVerdict.witness,
      unavailableOperations: quorumSimulation.metrics.unavailableOperations,
    });

    cases.push({
      caseId,
      scenarioHash,
      scenario,
      unsafe: {
        violation: unsafeViolation,
        witness: unsafeVerdict.witness,
        unavailableOperations: unsafeSimulation.metrics.unavailableOperations,
      },
      quorum: {
        violation: quorumViolation,
        witness: quorumVerdict.witness,
        unavailableOperations: quorumSimulation.metrics.unavailableOperations,
      },
    });
  });

  const search = runAdversarialSearch({ seed: 143, seeds: 50, protocol: "compare" });
  return {
    config: normalized,
    cases,
    coverage,
    unsafe: unsafeSummary,
    quorum: quorumSummary,
    searchComparison: {
      seeds: search.summary.attempts,
      unsafeViolations: search.summary.unsafeViolations,
      quorumViolations: search.summary.quorumViolations,
      firstFailureSeed: search.firstFailure?.seed,
      sameWitnessClass:
        unsafeSummary.firstViolation?.witness?.type === "stale-read" &&
        search.firstFailure?.unsafe.analysis.verdict.witness?.type === "stale-read",
      note:
        "Adversarial search samples larger biased schedules; exhaustive results cover only the declared tiny finite model. Raw counts are not directly comparable.",
    },
    elapsedMs: round(performance.now() - started),
    claim: `Within the tiny ${normalized.nodeCount}-replica / ${normalized.clientCount}-client / ${normalized.maxOperations}-operation scenario model explored here, quorum produced ${quorumSummary.violations} linearizability violations under the current register and partition assumptions. This is not a proof for arbitrary systems.`,
  };
}

export function normalizeExhaustiveConfig(config: Partial<ExhaustiveConfig> = {}): ExhaustiveConfig {
  const normalized: ExhaustiveConfig = {
    ...defaultExhaustiveConfig,
    ...config,
  };
  if (!Number.isInteger(normalized.nodeCount) || normalized.nodeCount !== 3) {
    throw new Error("Exhaustive explorer currently supports exactly 3 replicas.");
  }
  if (!Number.isInteger(normalized.clientCount) || normalized.clientCount < 1 || normalized.clientCount > 3) {
    throw new Error("Exhaustive client count must be an integer between 1 and 3.");
  }
  if (!Number.isInteger(normalized.maxOperations) || normalized.maxOperations < 1 || normalized.maxOperations > 4) {
    throw new Error("Exhaustive max operations must be an integer between 1 and 4.");
  }
  if (
    !Number.isInteger(normalized.maxTopologyChanges) ||
    normalized.maxTopologyChanges < 0 ||
    normalized.maxTopologyChanges > 3
  ) {
    throw new Error("Exhaustive max topology changes must be an integer between 0 and 3.");
  }
  if (!Number.isInteger(normalized.seed) || normalized.seed < 0) {
    throw new Error("Exhaustive seed must be a non-negative integer.");
  }
  return normalized;
}

export function findExhaustiveCase(
  caseId: string,
  config: Partial<ExhaustiveConfig> = {},
): ExhaustiveCaseEvaluation | undefined {
  return runBoundedExhaustive(config).cases.find((candidate) => candidate.caseId === caseId);
}

function enumerateScenarios(config: ExhaustiveConfig) {
  const nodes = nodesFor(config);
  const initial: ExplorerState = {
    steps: [],
    topology: { kind: "healed" },
    operations: 0,
    writes: 0,
    topologyChanges: 0,
    concurrentUsed: false,
  };
  const queue: ExplorerState[] = [initial];
  const seenPrefixes = new Set<string>([stateKey(initial)]);
  const terminals: Scenario[] = [];
  let prefixesExplored = 0;
  let prunedPrefixes = 0;

  while (queue.length > 0) {
    const state = queue.shift()!;
    prefixesExplored += 1;

    if (state.operations === config.maxOperations) {
      terminals.push(buildScenario(state, config, terminals.length));
      continue;
    }

    for (const next of nextStates(state, config, nodes)) {
      const key = stateKey(next);
      if (seenPrefixes.has(key)) {
        prunedPrefixes += 1;
        continue;
      }
      seenPrefixes.add(key);
      queue.push(next);
    }
  }

  return {
    terminals,
    prefixesExplored,
    prunedPrefixes,
  };
}

function nextStates(state: ExplorerState, config: ExhaustiveConfig, nodes: readonly NodeId[]): ExplorerState[] {
  const states: ExplorerState[] = [];

  if (state.topology.kind === "healed" && state.topologyChanges < config.maxTopologyChanges) {
    for (const partition of canonicalPartitions(nodes)) {
      states.push({
        ...state,
        topology: { kind: "partition", groups: partition.groups, shape: partition.shape },
        topologyChanges: state.topologyChanges + 1,
        steps: [
          ...state.steps,
          {
            type: "partition",
            groups: partition.groups,
            label: `exhaustive ${partition.shape} partition`,
          },
        ],
      });
    }
  } else if (state.topology.kind === "partition" && state.topologyChanges < config.maxTopologyChanges) {
    states.push({
      ...state,
      topology: { kind: "healed" },
      topologyChanges: state.topologyChanges + 1,
      steps: [...state.steps, { type: "heal", label: "exhaustive heal" }],
    });
  }

  for (const operation of operationTransitions(state, config)) {
    states.push({
      ...state,
      operations: state.operations + 1,
      writes: operation.type === "write" ? state.writes + 1 : state.writes,
      steps: [...state.steps, operation],
    });
  }

  if (config.includeConcurrent && !state.concurrentUsed && state.operations <= config.maxOperations - 2) {
    for (const concurrent of concurrentTransitions(state, config)) {
      states.push({
        ...state,
        operations: state.operations + concurrent.operations.length,
        writes:
          state.writes +
          concurrent.operations.filter((operation) => operation.type === "write").length,
        concurrentUsed: true,
        steps: [...state.steps, concurrent],
      });
    }
  }

  return states;
}

function operationTransitions(state: ExplorerState, config: ExhaustiveConfig): OperationScenarioStep[] {
  const zones = zonesFor(state.topology);
  const operationIndex = state.operations + 1;
  return zones.flatMap((zone) => [
    {
      type: "read" as const,
      client: clientFor(operationIndex, config),
      zone,
      label: `exhaustive read ${operationIndex} zone ${zone}`,
    },
    {
      type: "write" as const,
      client: clientFor(operationIndex, config),
      zone,
      value: `v${state.writes + 1}`,
      label: `exhaustive write ${operationIndex} zone ${zone}`,
    },
  ]);
}

function concurrentTransitions(
  state: ExplorerState,
  config: ExhaustiveConfig,
): Extract<ScenarioStep, { type: "concurrent" }>[] {
  const zones = zonesFor(state.topology);
  const operationIndex = state.operations + 1;
  const transitions: Extract<ScenarioStep, { type: "concurrent" }>[] = [];
  for (const writeZone of zones) {
    for (const readZone of zones) {
      transitions.push({
        type: "concurrent",
        label: `exhaustive overlap ${operationIndex}`,
        operations: [
          {
            type: "write",
            client: clientFor(operationIndex, config),
            zone: writeZone,
            value: `v${state.writes + 1}`,
            label: `exhaustive overlapping write zone ${writeZone}`,
          },
          {
            type: "read",
            client: clientFor(operationIndex + 1, config),
            zone: readZone,
            label: `exhaustive overlapping read zone ${readZone}`,
          },
        ],
      });
    }
  }
  return transitions;
}

function buildScenario(state: ExplorerState, config: ExhaustiveConfig, index: number): Scenario {
  return {
    id: caseIdFor(index),
    name: `Exhaustive case ${index + 1}`,
    description:
      "Bounded exhaustive scenario over a tiny finite replicated-register model. It enumerates scenario actions, not arbitrary message timings.",
    seed: config.seed + index,
    initialValue: "v0",
    nodes: nodesFor(config),
    steps: state.steps,
  };
}

function updateProtocolSummary(
  summary: ExhaustiveProtocolSummary,
  input: {
    protocol: ProtocolName;
    scenario: Scenario;
    caseId: string;
    scenarioHash: string;
    config: ExhaustiveConfig;
    violation: boolean;
    witness?: LinearizabilityWitness;
    unavailableOperations: number;
  },
): ExhaustiveProtocolSummary {
  const next: ExhaustiveProtocolSummary = {
    ...summary,
    terminalHistories: summary.terminalHistories + 1,
    violations: summary.violations + (input.violation ? 1 : 0),
    staleReadViolations:
      summary.staleReadViolations + (input.witness?.type === "stale-read" ? 1 : 0),
    unavailableOperations: summary.unavailableOperations + input.unavailableOperations,
  };
  const shouldRecordViolation =
    input.violation &&
    (!next.firstViolation ||
      (next.firstViolation.witness?.type !== "stale-read" && input.witness?.type === "stale-read"));
  if (shouldRecordViolation) {
    const analysis = analyzeScenario(input.scenario, input.protocol);
    next.firstViolation = {
      caseId: input.caseId,
      scenarioHash: input.scenarioHash,
      scenario: input.scenario,
      analysis,
      minimized: analysis.minimizedFailure,
      witness: analysis.verdict.witness,
      reproductionCommand: `npm run exhaustive -- --case ${input.caseId} --max-ops ${input.config.maxOperations} --topology ${input.config.maxTopologyChanges} --clients ${input.config.clientCount} --seed ${input.config.seed} ${input.config.includeConcurrent ? "" : "--no-concurrency " }--show`.replace(/\s+/g, " ").trim(),
    };
  }
  return next;
}

function updateCoverage(coverage: ExhaustiveCoverage, scenario: Scenario): void {
  const partitionShape = scenario.steps
    .filter((step) => step.type === "partition")
    .map((step) => step.groups.map((group) => group.length).join("/"))
    .join(",") || "healed-only";
  coverage.partitionShapes[partitionShape] = (coverage.partitionShapes[partitionShape] ?? 0) + 1;

  const operationPattern = scenario.steps
    .flatMap((step) => (step.type === "concurrent" ? ["concurrent"] : step.type))
    .filter((type) => type === "read" || type === "write" || type === "concurrent")
    .join("-");
  coverage.operationPatterns[operationPattern] = (coverage.operationPatterns[operationPattern] ?? 0) + 1;

  if (scenario.steps.some((step) => step.type === "concurrent")) {
    coverage.concurrentSchedules += 1;
  }
}

function initialCoverage(): ExhaustiveCoverage {
  return {
    prefixesExplored: 0,
    prunedPrefixes: 0,
    terminalHistories: 0,
    uniqueScenarios: 0,
    concurrentSchedules: 0,
    partitionShapes: {},
    operationPatterns: {},
  };
}

function emptyProtocolSummary(protocol: ProtocolName): ExhaustiveProtocolSummary {
  return {
    protocol,
    terminalHistories: 0,
    violations: 0,
    staleReadViolations: 0,
    unavailableOperations: 0,
  };
}

function nodesFor(config: ExhaustiveConfig): NodeId[] {
  return Array.from({ length: config.nodeCount }, (_, index) => `n${index + 1}`);
}

function clientFor(operationIndex: number, config: ExhaustiveConfig): string {
  return `c${((operationIndex - 1) % config.clientCount) + 1}`;
}

function zonesFor(topology: TopologyState): number[] {
  return topology.kind === "healed" ? [0] : [0, 1];
}

function canonicalPartitions(nodes: readonly NodeId[]) {
  return nodes.map((node) => {
    const minority = [node];
    const majority = nodes.filter((candidate) => candidate !== node);
    return {
      groups: [minority, majority],
      shape: `${minority.length}/${majority.length}`,
    };
  });
}

function stateKey(state: ExplorerState): string {
  return JSON.stringify({
    topology: state.topology,
    operations: state.operations,
    writes: state.writes,
    topologyChanges: state.topologyChanges,
    concurrentUsed: state.concurrentUsed,
    steps: state.steps,
  });
}

export function hashScenario(scenario: Scenario): string {
  const raw = JSON.stringify({
    initialValue: scenario.initialValue,
    nodes: scenario.nodes.length,
    steps: scenario.steps,
  });
  let hash = 2166136261;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= raw.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function caseIdFor(index: number): string {
  return `ex-${String(index + 1).padStart(6, "0")}`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
