import { NetworkPartition } from "./network";
import { getProtocol, type ReplicaResponse } from "./protocols";
import { SeededRng } from "./rng";
import type {
  EventRecord,
  NodeState,
  OperationRecord,
  OperationScenarioStep,
  OperationStatus,
  ProtocolName,
  RegisterValue,
  Scenario,
  SimulationMetrics,
  SimulationResult,
  VersionedValue,
} from "./types";

interface TimedReplicaRequest {
  nodeId: string;
  deliverAt: number;
  ackAt: number;
}

interface TimedReplicaResponse extends ReplicaResponse, TimedReplicaRequest {}

interface PendingOperation {
  opId: string;
  stepIndex: number;
  command: OperationScenarioStep;
  start: number;
  end: number;
  status: OperationStatus;
  contacted: string[];
  quorumRequired: number;
  versionedValue: VersionedValue;
  requests: TimedReplicaRequest[];
  responses: TimedReplicaResponse[];
}

type BatchAction =
  | {
      kind: "deliver";
      time: number;
      order: number;
      pending: PendingOperation;
      request: TimedReplicaRequest;
    }
  | {
      kind: "ack";
      time: number;
      order: number;
      pending: PendingOperation;
      request: TimedReplicaRequest;
    }
  | {
      kind: "commit";
      time: number;
      order: number;
      pending: PendingOperation;
      request: TimedReplicaRequest;
    }
  | {
      kind: "abort";
      time: number;
      order: number;
      pending: PendingOperation;
      request: TimedReplicaRequest;
    }
  | {
      kind: "complete";
      time: number;
      order: number;
      pending: PendingOperation;
    };

export function simulateScenario(scenario: Scenario, protocolName: ProtocolName): SimulationResult {
  const protocol = getProtocol(protocolName);
  const rng = new SeededRng(scenario.seed);
  const network = new NetworkPartition(scenario.nodes);
  const nodes = new Map<string, NodeState>(
    scenario.nodes.map((id) => [
      id,
      {
        id,
        committed: { value: scenario.initialValue, version: 0, writer: "initial" },
      },
    ]),
  );

  let now = 0;
  let eventId = 0;
  let opCounter = 0;
  const events: EventRecord[] = [];
  const operations: OperationRecord[] = [];

  const pushEvent = (event: Omit<EventRecord, "id">) => {
    events.push({ ...event, id: ++eventId });
  };

  pushEvent({
    time: now,
    type: "scenario-start",
    note: `${scenario.name} using ${protocolName} protocol`,
  });

  const executeOperationBatch = (
    commands: readonly OperationScenarioStep[],
    stepIndex: number,
    batchLabel?: string,
  ) => {
    if (commands.length === 0) {
      throw new Error("Concurrent scenario step must include at least one operation.");
    }

    const start = now + 1;
    now = start;
    const pendingOperations = commands.map((command) => {
      const opId = `op${++opCounter}`;
      const contacted = network.reachableFromZone(command.zone);
      const quorumRequired = protocol.quorumRequired(scenario.nodes.length);
      const versionedValue: VersionedValue = {
        value: command.type === "write" ? command.value : scenario.initialValue,
        version: opCounter,
        writer: opId,
      };
      const requests: TimedReplicaRequest[] = contacted.map((nodeId) => {
        const deliverAt = start + rng.int(3, 9);
        return {
          nodeId,
          deliverAt,
          ackAt: deliverAt + rng.int(2, 8),
        };
      });
      const orderedRequests = sortRequestsByAck(requests);
      const enoughReplicas = requests.length >= quorumRequired;
      const thresholdRequest = orderedRequests[quorumRequired - 1];
      const end = enoughReplicas && thresholdRequest ? thresholdRequest.ackAt : start + 10;

      pushEvent({
        time: start,
        type: "operation-start",
        opId,
        source: command.client,
        value: command.type === "write" ? command.value : undefined,
        version: command.type === "write" ? versionedValue.version : undefined,
        note: command.label ?? (batchLabel ? `${batchLabel}: ${command.type} started` : `${command.type} started`),
      });

      for (const request of requests) {
        pushEvent({
          time: start,
          type: "send",
          opId,
          source: "client",
          target: request.nodeId,
          value: command.type === "write" ? versionedValue.value : undefined,
          version: command.type === "write" ? versionedValue.version : undefined,
          note: `${protocol.requestVerb(command.type)} sent to ${request.nodeId}`,
        });
      }

      return {
        opId,
        stepIndex,
        command,
        start,
        end,
        status: enoughReplicas ? "ok" : "unavailable",
        contacted,
        quorumRequired,
        versionedValue,
        requests,
        responses: [],
      } satisfies PendingOperation;
    });

    const actions = buildBatchActions(pendingOperations);
    for (const action of actions.sort(compareBatchActions)) {
      if (action.kind === "deliver") {
        const node = mustGetNode(nodes, action.request.nodeId);
        const response =
          action.pending.command.type === "write"
            ? protocol.applyWriteRequest(node, action.pending.versionedValue, action.pending.opId)
            : protocol.applyReadRequest(node);
        action.pending.responses.push({
          ...response,
          deliverAt: action.request.deliverAt,
          ackAt: action.request.ackAt,
        });
        pushEvent({
          time: action.request.deliverAt,
          type: "deliver",
          opId: action.pending.opId,
          source: "client",
          target: action.request.nodeId,
          value: response.value,
          version: response.version,
          note: `${action.request.nodeId} handled ${protocol.requestVerb(action.pending.command.type)}`,
        });
        if (action.pending.command.type === "write" && protocol.name === "unsafe") {
          pushEvent({
            time: action.request.deliverAt,
            type: "commit",
            opId: action.pending.opId,
            target: action.request.nodeId,
            value: response.value,
            version: response.version,
            note: `${action.request.nodeId} committed ${response.value}`,
          });
        }
      } else if (action.kind === "ack") {
        const response = responseFor(action.pending, action.request.nodeId);
        pushEvent({
          time: action.request.ackAt,
          type: "ack",
          opId: action.pending.opId,
          source: response.nodeId,
          target: action.pending.command.client,
          value: response.value,
          version: response.version,
          note: `${response.nodeId} acknowledged ${action.pending.command.type}`,
        });
      } else if (action.kind === "commit") {
        const committed = protocol.commitWrite(
          mustGetNode(nodes, action.request.nodeId),
          action.pending.opId,
          action.pending.versionedValue,
        );
        if (committed) {
          pushEvent({
            time: action.time,
            type: "commit",
            opId: action.pending.opId,
            target: action.request.nodeId,
            value: action.pending.versionedValue.value,
            version: action.pending.versionedValue.version,
            note: `${action.request.nodeId} committed ${action.pending.versionedValue.value}`,
          });
        }
      } else if (action.kind === "abort") {
        const aborted = protocol.abortWrite(mustGetNode(nodes, action.request.nodeId), action.pending.opId);
        if (aborted) {
          pushEvent({
            time: action.time,
            type: "abort",
            opId: action.pending.opId,
            target: action.request.nodeId,
            value: action.pending.versionedValue.value,
            version: action.pending.versionedValue.version,
            note: `${action.request.nodeId} aborted uncommitted write`,
          });
        }
      } else {
        const operation = completeOperation(action.pending);
        operations.push(operation);
        pushEvent({
          time: action.pending.end,
          type: "operation-complete",
          opId: action.pending.opId,
          source: action.pending.command.client,
          status: operation.status,
          value: operation.output,
          note: operation.note,
        });
      }
    }

    now = Math.max(now, ...actions.map((action) => action.time));
  };

  scenario.steps.forEach((step, stepIndex) => {
    if (step.type === "partition") {
      now += 1;
      network.partition(step.groups);
      pushEvent({
        time: now,
        type: "partition",
        groups: network.snapshot(),
        note: step.label ?? "network partition applied",
      });
      return;
    }

    if (step.type === "heal") {
      now += 1;
      network.heal(scenario.nodes);
      pushEvent({
        time: now,
        type: "heal",
        groups: network.snapshot(),
        note: step.label ?? "network healed",
      });
      return;
    }

    if (step.type === "wait") {
      now += step.ms;
      pushEvent({
        time: now,
        type: "wait",
        note: step.label ?? `waited ${step.ms}ms`,
      });
      return;
    }

    if (step.type === "concurrent") {
      executeOperationBatch(step.operations, stepIndex, step.label);
      return;
    }

    executeOperationBatch([step], stepIndex);
  });

  const finalNodes = Array.from(nodes.values()).map((node) => ({
    id: node.id,
    committed: { ...node.committed },
    prepared: node.prepared ? { ...node.prepared } : undefined,
  }));
  const metrics = computeMetrics(operations, events, finalNodes);

  return {
    scenario,
    protocol: protocolName,
    operations,
    events: events.sort((a, b) => a.time - b.time || a.id - b.id),
    finalNodes,
    metrics,
  };

  function buildBatchActions(pendingOperations: readonly PendingOperation[]): BatchAction[] {
    const actions: BatchAction[] = [];
    for (const pending of pendingOperations) {
      for (const request of pending.requests) {
        actions.push({ kind: "deliver", time: request.deliverAt, order: 0, pending, request });
        actions.push({ kind: "ack", time: request.ackAt, order: 1, pending, request });
        if (pending.command.type === "write" && protocol.name === "quorum") {
          if (pending.status === "ok") {
            actions.push({
              kind: "commit",
              time: Math.max(pending.end, request.ackAt),
              order: 2,
              pending,
              request,
            });
          } else {
            actions.push({ kind: "abort", time: pending.end, order: 2, pending, request });
          }
        }
      }
      actions.push({ kind: "complete", time: pending.end, order: 3, pending });
    }
    return actions;
  }

  function completeOperation(pending: PendingOperation): OperationRecord {
    const responses = sortResponsesByAck(pending.responses);
    const thresholdResponses = responses.slice(0, pending.quorumRequired);
    const acknowledgements =
      pending.status === "ok"
        ? thresholdResponses.map((response) => response.nodeId)
        : responses.map((response) => response.nodeId);

    let output: RegisterValue | undefined;
    let note = "operation completed";

    if (pending.command.type === "write") {
      if (pending.status === "ok") {
        output = "ok";
        note =
          protocol.name === "quorum"
            ? `write committed on quorum ${acknowledgements.join(", ")}`
            : `write accepted after first acknowledgement from ${acknowledgements[0] ?? "none"}`;
      } else {
        note = `write unavailable: reached ${responses.length}/${pending.quorumRequired} replicas`;
      }
    } else if (pending.status === "ok") {
      const selected = maxVersion(thresholdResponses);
      output = selected.value;
      note =
        protocol.name === "quorum"
          ? `read returned highest committed value from quorum ${acknowledgements.join(", ")}`
          : `read returned first available replica value from ${acknowledgements[0] ?? "none"}`;
    } else {
      note = `read unavailable: reached ${responses.length}/${pending.quorumRequired} replicas`;
    }

    return {
      id: pending.opId,
      stepIndex: pending.stepIndex,
      label: pending.command.label,
      client: pending.command.client,
      kind: pending.command.type,
      zone: pending.command.zone,
      start: pending.start,
      end: pending.end,
      status: pending.status,
      input: pending.command.type === "write" ? pending.command.value : undefined,
      output,
      contacted: pending.contacted,
      quorumRequired: pending.quorumRequired,
      acknowledgements,
      note,
    };
  }
}

function mustGetNode(nodes: Map<string, NodeState>, id: string): NodeState {
  const node = nodes.get(id);
  if (!node) {
    throw new Error(`Unknown node ${id}.`);
  }
  return node;
}

function responseFor(pending: PendingOperation, nodeId: string): TimedReplicaResponse {
  const response = pending.responses.find((candidate) => candidate.nodeId === nodeId);
  if (!response) {
    throw new Error(`Missing response from ${nodeId} for ${pending.opId}.`);
  }
  return response;
}

function compareBatchActions(a: BatchAction, b: BatchAction): number {
  const nodeA = "request" in a ? a.request.nodeId : "";
  const nodeB = "request" in b ? b.request.nodeId : "";
  return (
    a.time - b.time ||
    a.order - b.order ||
    a.pending.opId.localeCompare(b.pending.opId) ||
    nodeA.localeCompare(nodeB)
  );
}

function sortRequestsByAck(requests: readonly TimedReplicaRequest[]): TimedReplicaRequest[] {
  return [...requests].sort((a, b) => a.ackAt - b.ackAt || a.nodeId.localeCompare(b.nodeId));
}

function sortResponsesByAck(responses: readonly TimedReplicaResponse[]): TimedReplicaResponse[] {
  return [...responses].sort((a, b) => a.ackAt - b.ackAt || a.nodeId.localeCompare(b.nodeId));
}

function maxVersion(responses: readonly ReplicaResponse[]): ReplicaResponse {
  if (responses.length === 0) {
    throw new Error("Cannot select a value from zero responses.");
  }
  return responses.reduce((best, response) =>
    response.version > best.version ? response : best,
  );
}

function computeMetrics(
  operations: readonly OperationRecord[],
  events: readonly EventRecord[],
  nodes: readonly NodeState[],
): SimulationMetrics {
  const buckets = new Map<string, number>();
  for (const node of nodes) {
    const key = `${node.committed.version}:${node.committed.value}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }
  const largestBucket = Math.max(0, ...buckets.values());
  return {
    operations: operations.length,
    successfulOperations: operations.filter((operation) => operation.status === "ok").length,
    unavailableOperations: operations.filter((operation) => operation.status === "unavailable").length,
    events: events.length,
    finalDivergentNodes: nodes.length - largestBucket,
    maxTime: Math.max(0, ...events.map((event) => event.time)),
  };
}
