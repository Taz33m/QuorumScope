import type { Scenario } from "./types";

export const splitBrainStaleReadScenario: Scenario = {
  id: "split-brain-stale-read",
  name: "Split Brain Stale Read",
  description:
    "A five-replica register is partitioned 2/3. The majority side accepts a write, then the minority side tries to read from replicas that never saw it.",
  seed: 9142,
  initialValue: "v0",
  nodes: ["n1", "n2", "n3", "n4", "n5"],
  steps: [
    {
      type: "read",
      client: "auditor",
      zone: 0,
      label: "baseline read before the fault",
    },
    {
      type: "wait",
      ms: 6,
      label: "quiet period",
    },
    {
      type: "partition",
      groups: [
        ["n1", "n2"],
        ["n3", "n4", "n5"],
      ],
      label: "network splits into minority and majority islands",
    },
    {
      type: "write",
      client: "east-client",
      zone: 1,
      value: "v1",
      label: "majority-side write",
    },
    {
      type: "wait",
      ms: 4,
      label: "partition remains active",
    },
    {
      type: "read",
      client: "west-client",
      zone: 0,
      label: "minority-side read after completed write",
    },
    {
      type: "heal",
      label: "network heals",
    },
    {
      type: "read",
      client: "auditor",
      zone: 0,
      label: "post-heal read",
    },
  ],
};

export const fixtures = [splitBrainStaleReadScenario] as const;
