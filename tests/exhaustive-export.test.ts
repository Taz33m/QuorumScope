import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkLinearizability,
  runBoundedExhaustive,
  simulateScenario,
} from "../src/core";
import {
  buildExhaustiveFixtureExport,
  type ExhaustiveFixtureExport,
} from "../src/core/exhaustiveExport";

describe("exhaustive fixture export", () => {
  it("builds a corpus-ready fixture from the default first violation", () => {
    const result = runBoundedExhaustive();
    const exported = buildExhaustiveFixtureExport(result)!;
    const saved = JSON.parse(
      readFileSync(join(process.cwd(), "examples", "exhaustive-ex-000043.json"), "utf-8"),
    );

    expect(exported.source).toMatchObject({
      caseId: "ex-000043",
      maxOperations: 3,
      maxTopologyChanges: 2,
      clientCount: 2,
      seed: 7001,
      includeConcurrent: true,
    });
    expect(exported.source.reproductionCommand).toBe(
      "npm run exhaustive -- --case ex-000043 --max-ops 3 --topology 2 --clients 2 --seed 7001 --show",
    );
    expect(exported.scenario).toEqual(saved);
    expect(exported.promotionCheck).toMatchObject({
      ok: true,
      checkedProtocols: ["unsafe", "quorum"],
      issues: [],
    });
    expect(exported.manifestEntry).toMatchObject({
      id: "exhaustive-ex-000043",
      fixture: "exhaustive-ex-000043.json",
      scenarioType: "exhaustive-counterexample",
      provenance: {
        source: "bounded-exhaustive",
        scenarioHash: "bde7f1573ff1",
      },
      expected: {
        unsafe: {
          verdict: "violation",
          violationKind: "stale-read",
          unavailableOperations: 0,
        },
        quorum: {
          verdict: "linearizable",
          unavailableOperations: 2,
          finalValue: "v0",
        },
      },
    });
    expect(exported.witnessSummary).toBe(
      "op3 read returned v0 after op1 write completed with v1.",
    );
  });

  it("exports arbitrary safe cases with coherent expected outcomes", () => {
    const exported = buildExhaustiveFixtureExport(runBoundedExhaustive(), "ex-000001")!;

    expect(exported.manifestEntry).toMatchObject({
      id: "exhaustive-ex-000001",
      fixture: "exhaustive-ex-000001.json",
      scenarioType: "exhaustive-safe-history",
      provenance: {
        source: "bounded-exhaustive",
      },
      expected: {
        unsafe: {
          verdict: "linearizable",
          unavailableOperations: 0,
          finalValue: "v1",
        },
        quorum: {
          verdict: "linearizable",
          unavailableOperations: 0,
          finalValue: "v1",
        },
      },
    });
    expect(exported.manifestEntry.tags).toContain("safe");
    expect(exported.witnessSummary).toBeUndefined();
  });

  it("exports replayable fixture JSON from the exhaustive CLI", () => {
    const output = execFileSync(
      "node",
      [
        "--import",
        "tsx",
        "src/cli/exhaustive.ts",
        "--case",
        "ex-000043",
        "--export-fixture",
      ],
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    const exported = JSON.parse(output) as ExhaustiveFixtureExport & { ok: boolean };

    expect(exported.ok).toBe(true);
    expect(exported.manifestEntry.fixture).toBe("exhaustive-ex-000043.json");
    expect(exported.promotionCheck.ok).toBe(true);

    const unsafe = simulateScenario(exported.scenario, "unsafe");
    const quorum = simulateScenario(exported.scenario, "quorum");
    expect(checkLinearizability(unsafe.operations, exported.scenario.initialValue).ok).toBe(false);
    expect(checkLinearizability(quorum.operations, exported.scenario.initialValue).ok).toBe(true);
  });

  it("returns a parseable export failure for unknown cases", () => {
    const result = spawnSync(
      "node",
      [
        "--import",
        "tsx",
        "src/cli/exhaustive.ts",
        "--case",
        "ex-missing",
        "--export-fixture",
      ],
      { cwd: process.cwd(), encoding: "utf-8" },
    );

    expect(result.status).toBe(1);
    const payload = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(payload).toMatchObject({
      ok: false,
      error: "Exhaustive case ex-missing was not found under these bounds.",
    });
  });
});
