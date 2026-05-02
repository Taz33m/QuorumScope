import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildSearchFixtureExport,
  checkLinearizability,
  runAdversarialSearch,
  simulateScenario,
  type SearchFixtureExport,
} from "../src/core";

describe("search fixture export", () => {
  it("builds a corpus-ready minimized fixture from the default search failure", () => {
    const result = runAdversarialSearch({ seed: 143, seeds: 1, protocol: "compare" });
    const exported = buildSearchFixtureExport(result)!;
    const saved = JSON.parse(
      readFileSync(join(process.cwd(), "examples", "search-143-minimized.json"), "utf-8"),
    );

    expect(exported.source).toMatchObject({
      seed: 143,
      attempt: 0,
      originalSteps: 11,
      minimizedSteps: 3,
    });
    expect(exported.source.reproductionCommand).toContain("--seed 143");
    expect(exported.scenario).toEqual(saved);
    expect(exported.manifestEntry).toMatchObject({
      id: "search-143-minimized",
      fixture: "search-143-minimized.json",
      scenarioType: "generated-minimized-counterexample",
      protocols: ["unsafe", "quorum"],
      expected: {
        unsafe: {
          verdict: "violation",
          violationKind: "stale-read",
          unavailableOperations: 0,
        },
        quorum: {
          verdict: "linearizable",
          unavailableOperations: 1,
          finalValue: "v143-0-x1",
        },
      },
    });
    expect(exported.witnessSummary).toBe(
      "op2 read returned v0 after op1 write completed with v143-0-x1.",
    );
  });

  it("exports replayable fixture JSON from the search CLI", () => {
    const output = execFileSync(
      "node",
      [
        "--import",
        "tsx",
        "src/cli/search.ts",
        "--seed",
        "143",
        "--seeds",
        "1",
        "--protocol",
        "compare",
        "--export-fixture",
      ],
      { cwd: process.cwd(), encoding: "utf-8" },
    );
    const exported = JSON.parse(output) as SearchFixtureExport & { ok: boolean };

    expect(exported.ok).toBe(true);
    expect(exported.manifestEntry.fixture).toBe("search-143-minimized.json");

    const unsafe = simulateScenario(exported.scenario, "unsafe");
    const quorum = simulateScenario(exported.scenario, "quorum");
    expect(checkLinearizability(unsafe.operations, exported.scenario.initialValue).ok).toBe(false);
    expect(checkLinearizability(quorum.operations, exported.scenario.initialValue).ok).toBe(true);
  });
});
