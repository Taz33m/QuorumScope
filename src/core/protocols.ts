import type { NodeState, OperationKind, ProtocolName, RegisterValue, VersionedValue } from "./types";

export interface ReplicaResponse {
  nodeId: string;
  value: RegisterValue;
  version: number;
}

export interface ProtocolSpec {
  name: ProtocolName;
  quorumRequired(nodeCount: number): number;
  requestVerb(kind: OperationKind): string;
  applyWriteRequest(node: NodeState, value: VersionedValue, opId: string): ReplicaResponse;
  applyReadRequest(node: NodeState): ReplicaResponse;
  commitWrite(node: NodeState, opId: string, value: VersionedValue): boolean;
  abortWrite(node: NodeState, opId: string): boolean;
}

export const unsafeProtocol: ProtocolSpec = {
  name: "unsafe",
  quorumRequired: () => 1,
  requestVerb: (kind) => (kind === "write" ? "write" : "read"),
  applyWriteRequest(node, value) {
    node.committed = { ...value };
    return {
      nodeId: node.id,
      value: node.committed.value,
      version: node.committed.version,
    };
  },
  applyReadRequest(node) {
    return {
      nodeId: node.id,
      value: node.committed.value,
      version: node.committed.version,
    };
  },
  commitWrite() {
    return false;
  },
  abortWrite() {
    return false;
  },
};

export const quorumProtocol: ProtocolSpec = {
  name: "quorum",
  quorumRequired: (nodeCount) => Math.floor(nodeCount / 2) + 1,
  requestVerb: (kind) => (kind === "write" ? "prepare" : "read"),
  applyWriteRequest(node, value, opId) {
    node.prepared = { ...value, opId };
    return {
      nodeId: node.id,
      value: node.prepared.value,
      version: node.prepared.version,
    };
  },
  applyReadRequest(node) {
    return {
      nodeId: node.id,
      value: node.committed.value,
      version: node.committed.version,
    };
  },
  commitWrite(node, opId, value) {
    if (node.prepared?.opId !== opId) {
      return false;
    }
    node.committed = { ...value };
    node.prepared = undefined;
    return true;
  },
  abortWrite(node, opId) {
    if (node.prepared?.opId !== opId) {
      return false;
    }
    node.prepared = undefined;
    return true;
  },
};

export function getProtocol(name: ProtocolName): ProtocolSpec {
  if (name === "unsafe") {
    return unsafeProtocol;
  }
  return quorumProtocol;
}
