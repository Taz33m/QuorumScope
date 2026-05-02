export type ProtocolName = "unsafe" | "quorum";

export type NodeId = string;
export type ClientId = string;
export type RegisterValue = string;

export interface VersionedValue {
  value: RegisterValue;
  version: number;
  writer?: string;
}

export interface PreparedValue extends VersionedValue {
  opId: string;
}

export interface NodeState {
  id: NodeId;
  committed: VersionedValue;
  prepared?: PreparedValue;
}

export type OperationScenarioStep =
  | {
      type: "write";
      label?: string;
      client: ClientId;
      zone: number;
      value: RegisterValue;
    }
  | {
      type: "read";
      label?: string;
      client: ClientId;
      zone: number;
    };

export type ScenarioStep =
  | {
      type: "partition";
      label?: string;
      groups: NodeId[][];
    }
  | {
      type: "heal";
      label?: string;
    }
  | {
      type: "wait";
      label?: string;
      ms: number;
    }
  | OperationScenarioStep
  | {
      type: "concurrent";
      label?: string;
      operations: OperationScenarioStep[];
    };

export interface Scenario {
  id: string;
  name: string;
  description: string;
  seed: number;
  initialValue: RegisterValue;
  nodes: NodeId[];
  steps: ScenarioStep[];
}

export type OperationKind = "read" | "write";
export type OperationStatus = "ok" | "unavailable";

export interface OperationRecord {
  id: string;
  stepIndex: number;
  label?: string;
  client: ClientId;
  kind: OperationKind;
  zone: number;
  start: number;
  end: number;
  status: OperationStatus;
  input?: RegisterValue;
  output?: RegisterValue;
  contacted: NodeId[];
  quorumRequired: number;
  acknowledgements: NodeId[];
  note: string;
}

export type EventType =
  | "scenario-start"
  | "partition"
  | "heal"
  | "wait"
  | "operation-start"
  | "send"
  | "deliver"
  | "ack"
  | "commit"
  | "abort"
  | "operation-complete";

export interface EventRecord {
  id: number;
  time: number;
  type: EventType;
  opId?: string;
  source?: string;
  target?: string;
  value?: RegisterValue;
  version?: number;
  status?: OperationStatus;
  groups?: NodeId[][];
  note: string;
}

export interface SimulationMetrics {
  operations: number;
  successfulOperations: number;
  unavailableOperations: number;
  events: number;
  finalDivergentNodes: number;
  maxTime: number;
}

export interface SimulationResult {
  scenario: Scenario;
  protocol: ProtocolName;
  operations: OperationRecord[];
  events: EventRecord[];
  finalNodes: NodeState[];
  metrics: SimulationMetrics;
}

export interface StaleReadWitness {
  type: "stale-read";
  read: OperationRecord;
  priorWrite: OperationRecord;
  expected: RegisterValue;
  observed: RegisterValue;
  explanation: string;
}

export interface SearchFailureWitness {
  type: "no-sequentialization";
  checkedOperations: number;
  explanation: string;
}

export type LinearizabilityWitness = StaleReadWitness | SearchFailureWitness;

export type LinearizationCandidateStatus = "ready" | "blocked" | "rejected-read";

export interface LinearizationCandidate {
  operationId: string;
  kind: OperationKind;
  status: LinearizationCandidateStatus;
  blockers: string[];
  reason: string;
  expectedValue?: RegisterValue;
  observedValue?: RegisterValue;
}

export interface LinearizationSearchStep {
  placed: string[];
  currentValue: RegisterValue;
  candidates: LinearizationCandidate[];
  chosenOperationId?: string;
}

export interface LinearizabilityDiagnostics {
  successfulOperations: string[];
  unavailableOperations: string[];
  realTimePredecessors: Record<string, string[]>;
  exploredStates: number;
  memoizedDeadEnds: number;
  maxCapturedSteps: number;
  truncated: boolean;
  steps: LinearizationSearchStep[];
}

export interface LinearizabilityVerdict {
  ok: boolean;
  checkedOperations: number;
  legalOrder: string[];
  finalValue?: RegisterValue;
  explanation: string;
  witness?: LinearizabilityWitness;
  diagnostics: LinearizabilityDiagnostics;
}

export interface AnalysisResult extends SimulationResult {
  verdict: LinearizabilityVerdict;
  minimizedFailure?: {
    scenario: Scenario;
    removedSteps: number;
    operations: OperationRecord[];
    witness?: LinearizabilityWitness;
  };
}

export interface BenchmarkRow {
  protocol: ProtocolName;
  runs: number;
  violations: number;
  unavailableOperations: number;
  staleReadWitnesses: number;
  averageEvents: number;
  averageSuccessfulOps: number;
}

export interface BenchmarkResult {
  seed: number;
  runs: number;
  rows: BenchmarkRow[];
}

export type SearchMode = "first-failure" | "compare";

export interface SearchConfig {
  seed: number;
  seeds: number;
  nodeCount: number;
  operationCount: number;
  clientCount: number;
  readRatio: number;
  partitionIntensity: number;
  concurrentIntensity: number;
  protocol: ProtocolName | "compare";
  shrink: boolean;
}

export interface GeneratedScenario {
  seed: number;
  attempt: number;
  scenario: Scenario;
  partitionShape: string;
}

export interface ProtocolSearchEvaluation {
  protocol: ProtocolName;
  analysis: AnalysisResult;
  violation: boolean;
  unavailableOperations: number;
  minimized?: AnalysisResult["minimizedFailure"];
}

export interface SearchAttempt {
  seed: number;
  attempt: number;
  scenario: Scenario;
  partitionShape: string;
  unsafe: ProtocolSearchEvaluation;
  quorum: ProtocolSearchEvaluation;
}

export interface SearchSummary {
  attempts: number;
  unsafeViolations: number;
  quorumViolations: number;
  quorumUnavailableOperations: number;
  unsafeUnavailableOperations: number;
  concurrentSchedules: number;
}

export interface AdversarialSearchResult {
  config: SearchConfig;
  attempts: SearchAttempt[];
  firstFailure?: SearchAttempt;
  summary: SearchSummary;
  claim: string;
}
