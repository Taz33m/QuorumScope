import { describe, expect, it } from "vitest";
import { checkLinearizability } from "../src/core";
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

describe("linearizability checker", () => {
  it("accepts a sequential write followed by a matching read", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 1, end: 2, input: "v1", output: "ok" },
      { ...base, id: "r1", kind: "read", start: 3, end: 4, output: "v1" },
    ];

    expect(checkLinearizability(history, "v0")).toMatchObject({
      ok: true,
      legalOrder: ["w1", "r1"],
      finalValue: "v1",
    });
    const verdict = checkLinearizability(history, "v0");
    expect(verdict.diagnostics.realTimePredecessors).toEqual({
      w1: [],
      r1: ["w1"],
    });
    expect(verdict.diagnostics.steps[0]?.candidates).toEqual([
      expect.objectContaining({ operationId: "w1", status: "ready" }),
      expect.objectContaining({ operationId: "r1", status: "blocked", blockers: ["w1"] }),
    ]);
  });

  it("rejects a stale read after a completed write", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 1, end: 2, input: "v1", output: "ok" },
      { ...base, id: "r1", kind: "read", start: 3, end: 4, output: "v0" },
    ];

    const verdict = checkLinearizability(history, "v0");

    expect(verdict.ok).toBe(false);
    expect(verdict.witness).toMatchObject({
      type: "stale-read",
      observed: "v0",
      expected: "v1",
    });
    expect(
      verdict.diagnostics.steps.some((step) =>
        step.candidates.some(
          (candidate) =>
            candidate.operationId === "r1" &&
            candidate.status === "rejected-read" &&
            candidate.expectedValue === "v1" &&
            candidate.observedValue === "v0",
        ),
      ),
    ).toBe(true);
  });

  it("allows a read concurrent with a write to see the old value", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 2, end: 8, input: "v1", output: "ok" },
      { ...base, id: "r1", kind: "read", start: 3, end: 4, output: "v0" },
    ];

    expect(checkLinearizability(history, "v0")).toMatchObject({
      ok: true,
      finalValue: "v1",
    });
    const verdict = checkLinearizability(history, "v0");
    expect(verdict.diagnostics.realTimePredecessors).toEqual({
      w1: [],
      r1: [],
    });
  });

  it("records unavailable operations without checking them", () => {
    const history: OperationRecord[] = [
      { ...base, id: "w1", kind: "write", start: 1, end: 2, input: "v1", output: "ok" },
      {
        ...base,
        id: "r-unavailable",
        kind: "read",
        start: 3,
        end: 4,
        status: "unavailable",
        output: undefined,
      },
    ];

    const verdict = checkLinearizability(history, "v0");

    expect(verdict.ok).toBe(true);
    expect(verdict.checkedOperations).toBe(1);
    expect(verdict.diagnostics.successfulOperations).toEqual(["w1"]);
    expect(verdict.diagnostics.unavailableOperations).toEqual(["r-unavailable"]);
  });

  it("handles more than 31 completed operations without bitmask aliasing", () => {
    const history: OperationRecord[] = [];
    for (let index = 1; index <= 33; index += 1) {
      history.push({
        ...base,
        id: `w${index}`,
        kind: "write",
        start: index * 2,
        end: index * 2 + 1,
        input: `v${index}`,
        output: "ok",
      });
    }
    history.push({
      ...base,
      id: "r-final",
      kind: "read",
      start: 90,
      end: 91,
      output: "v33",
    });

    expect(checkLinearizability(history, "v0")).toMatchObject({
      ok: true,
      legalOrder: [...Array.from({ length: 33 }, (_, index) => `w${index + 1}`), "r-final"],
    });
  });
});
