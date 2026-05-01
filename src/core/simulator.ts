import { NetworkPartition } from "./network";
import { getProtocol, type ReplicaResponse } from "./protocols";
import { SeededRng } from "./rng";
import type {
  EventRecord,
  NodeState,
  OperationRecord,
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

  const sortedResponses = (
    opId: string,
    kind: "read" | "write",
    contacted: string[],
    value: VersionedValue,
  ): TimedReplicaResponse[] => {
    const requests: TimedReplicaRequest[] = [];
    for (const target of contacted) {
      const deliverAt = now + rng.int(3, 9);
      const ackAt = deliverAt + rng.int(2, 8);
      pushEvent({
        time: now,
        type: "send",
        opId,
        source: "client",
        target,
        value: kind === "write" ? value.value : undefined,
        version: kind === "write" ? value.version : undefined,
        note: `${protocol.requestVerb(kind)} sent to ${target}`,
      });
      requests.push({ nodeId: target, deliverAt, ackAt });
    }

    const responses: TimedReplicaResponse[] = [];
    const deliveryOrder = [...requests].sort(
      (a, b) => a.deliverAt - b.deliverAt || a.nodeId.localeCompare(b.nodeId),
    );
    for (const request of deliveryOrder) {
      const node = mustGetNode(nodes, request.nodeId);
      const response =
        kind === "write"
          ? protocol.applyWriteRequest(node, value, opId)
          : protocol.applyReadRequest(node);
      pushEvent({
        time: request.deliverAt,
        type: "deliver",
        opId,
        source: "client",
        target: request.nodeId,
        value: response.value,
        version: response.version,
        note: `${request.nodeId} handled ${protocol.requestVerb(kind)}`,
      });
      if (kind === "write" && protocol.name === "unsafe") {
        pushEvent({
          time: request.deliverAt,
          type: "commit",
          opId,
          target: request.nodeId,
          value: response.value,
          version: response.version,
          note: `${request.nodeId} committed ${response.value}`,
        });
      }
      responses.push({ ...response, deliverAt: request.deliverAt, ackAt: request.ackAt });
    }
    return responses.sort((a, b) => a.ackAt - b.ackAt || a.nodeId.localeCompare(b.nodeId));
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

    const opId = `op${++opCounter}`;
    const start = now + 1;
    now = start;
    const contacted = network.reachableFromZone(step.zone);
    const quorumRequired = protocol.quorumRequired(scenario.nodes.length);
    const versionedValue: VersionedValue = {
      value: step.type === "write" ? step.value : scenario.initialValue,
      version: opCounter,
      writer: opId,
    };

    pushEvent({
      time: start,
      type: "operation-start",
      opId,
      source: step.client,
      value: step.type === "write" ? step.value : undefined,
      version: step.type === "write" ? versionedValue.version : undefined,
      note: step.label ?? `${step.type} started`,
    });

    const responses = sortedResponses(opId, step.type, contacted, versionedValue);
    const enoughReplicas = responses.length >= quorumRequired;
    const thresholdResponses = responses.slice(0, quorumRequired);
    for (const response of responses) {
      pushEvent({
        time: response.ackAt,
        type: "ack",
        opId,
        source: response.nodeId,
        target: step.client,
        value: response.value,
        version: response.version,
        note: `${response.nodeId} acknowledged ${step.type}`,
      });
    }

    const end =
      enoughReplicas && thresholdResponses.length > 0
        ? thresholdResponses[thresholdResponses.length - 1]!.ackAt
        : now + 10;
    const acknowledgements = enoughReplicas
      ? thresholdResponses.map((response) => response.nodeId)
      : responses.map((response) => response.nodeId);

    let status: "ok" | "unavailable" = enoughReplicas ? "ok" : "unavailable";
    let output: RegisterValue | undefined;
    let note = "operation completed";

    if (step.type === "write") {
      if (status === "ok") {
        if (protocol.name === "quorum") {
          for (const response of responses) {
            const commitTime = Math.max(end, response.ackAt);
            const committed = protocol.commitWrite(mustGetNode(nodes, response.nodeId), opId, versionedValue);
            if (committed) {
              pushEvent({
                time: commitTime,
                type: "commit",
                opId,
                target: response.nodeId,
                value: versionedValue.value,
                version: versionedValue.version,
                note: `${response.nodeId} committed ${versionedValue.value}`,
              });
            }
          }
        }
        output = "ok";
        note =
          protocol.name === "quorum"
            ? `write committed on quorum ${acknowledgements.join(", ")}`
            : `write accepted after first acknowledgement from ${acknowledgements[0] ?? "none"}`;
      } else {
        for (const response of responses) {
          const aborted = protocol.abortWrite(mustGetNode(nodes, response.nodeId), opId);
          if (aborted) {
            pushEvent({
              time: end,
              type: "abort",
              opId,
              target: response.nodeId,
              value: versionedValue.value,
              version: versionedValue.version,
              note: `${response.nodeId} aborted uncommitted write`,
            });
          }
        }
        note = `write unavailable: reached ${responses.length}/${quorumRequired} replicas`;
      }
    } else if (status === "ok") {
      const selected = maxVersion(thresholdResponses);
      output = selected.value;
      note =
        protocol.name === "quorum"
          ? `read returned highest committed value from quorum ${acknowledgements.join(", ")}`
          : `read returned first available replica value from ${acknowledgements[0] ?? "none"}`;
    } else {
      note = `read unavailable: reached ${responses.length}/${quorumRequired} replicas`;
    }

    now = Math.max(end, ...responses.map((response) => response.ackAt), now);
    const operation: OperationRecord = {
      id: opId,
      stepIndex,
      label: step.label,
      client: step.client,
      kind: step.type,
      zone: step.zone,
      start,
      end,
      status,
      input: step.type === "write" ? step.value : undefined,
      output,
      contacted,
      quorumRequired,
      acknowledgements,
      note,
    };
    operations.push(operation);
    pushEvent({
      time: end,
      type: "operation-complete",
      opId,
      source: step.client,
      status,
      value: output,
      note,
    });
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
}

function mustGetNode(nodes: Map<string, NodeState>, id: string): NodeState {
  const node = nodes.get(id);
  if (!node) {
    throw new Error(`Unknown node ${id}.`);
  }
  return node;
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
