import { describe, expect, it } from "vitest";

import {
  checkLinearizability,
  detailWitness,
  summarizeVerdict,
  summarizeWitness,
} from "../src/core";
import type { OperationRecord } from "../src/core";

const base = {
  stepIndex: 0,
  client: "c",
  zone: 0,
  status: "ok" as const,
  contacted: ["n1"],
  quorumRequired: 1,
  acknowledgements: ["n1"],
  note: "test",
};

describe("checker explanation helpers", () => {
  it("explains stale reads with operation identity, values, and real-time order", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 1, end: 2, input: "v1", output: "ok" },
      { ...base, id: "r1", kind: "read", start: 5, end: 6, output: "v0" },
    ];

    const verdict = checkLinearizability(history, "v0");

    expect(summarizeWitness(verdict.witness)).toBe(
      "r1 read returned v0 after w1 write completed with v1.",
    );
    expect(detailWitness(verdict.witness)).toBe(
      "w1 write completed at t=2 before r1 read started at t=5, so any legal linearization must place the write before the read. The read observed v0 instead of v1.",
    );
  });

  it("explains valid histories with a legal order and final value", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 1, end: 2, input: "v1", output: "ok" },
      { ...base, id: "r1", kind: "read", start: 5, end: 6, output: "v1" },
    ];

    const verdict = checkLinearizability(history, "v0");

    expect(summarizeVerdict(verdict, "v0")).toBe("Legal order w1 -> r1; final value v1.");
  });

  it("explains reads that observe a value before any completed write made it visible", () => {
    const history: OperationRecord[] = [
      { ...base, id: "r1", kind: "read", start: 5, end: 6, output: "v2" },
    ];

    const verdict = checkLinearizability(history, "v0");

    expect(summarizeWitness(verdict.witness)).toBe(
      "r1 read returned v2, but no completed write made that value visible; expected initial value v0.",
    );
    expect(detailWitness(verdict.witness)).toContain("With no completed prior write");
  });
});
