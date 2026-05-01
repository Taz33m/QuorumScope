import type { NodeId } from "./types";

export class NetworkPartition {
  private readonly expected: Set<NodeId>;
  private groups: NodeId[][];

  constructor(nodes: readonly NodeId[]) {
    if (nodes.length === 0) {
      throw new Error("Network requires at least one node.");
    }
    this.expected = new Set(nodes);
    this.groups = [Array.from(nodes)];
  }

  partition(groups: NodeId[][]): void {
    if (groups.length === 0) {
      throw new Error("Partition must contain at least one group.");
    }
    const seen = new Set<NodeId>();
    for (const group of groups) {
      if (group.length === 0) {
        throw new Error("Partition groups cannot be empty.");
      }
      for (const node of group) {
        if (!this.expected.has(node)) {
          throw new Error(`Unknown node ${node} in partition.`);
        }
        if (seen.has(node)) {
          throw new Error(`Node ${node} appears in multiple partition groups.`);
        }
        seen.add(node);
      }
    }
    const missing = [...this.expected].filter((node) => !seen.has(node));
    if (missing.length > 0) {
      throw new Error(`Partition is missing node(s): ${missing.join(", ")}.`);
    }
    this.groups = groups.map((group) => [...group]);
  }

  heal(nodes: readonly NodeId[]): void {
    this.groups = [Array.from(nodes)];
  }

  reachableFromZone(zone: number): NodeId[] {
    const group = this.groups[zone];
    if (!group) {
      return [];
    }
    return [...group];
  }

  snapshot(): NodeId[][] {
    return this.groups.map((group) => [...group]);
  }
}
