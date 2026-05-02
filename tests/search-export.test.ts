import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  checkLinearizability,
  runAdversarialSearch,
  simulateScenario,
} from "../src/core";
import { buildSearchFixtureExport, type SearchFixtureExport } from "../src/core/searchExport";

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
    expect(exported.promotionCheck).toMatchObject({
      ok: true,
      checkedProtocols: ["unsafe", "quorum"],
      issues: [],
    });
    expect(exported.manifestEntry).toMatchObject({
      id: "search-143-minimized",
      fixture: "search-143-minimized.json",
      scenarioType: "generated-minimized-counterexample",
      provenance: {
        source: "adversarial-search",
        scenarioHash: "97bd97918ce8",
      },
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
  }, 15_000);

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
    expect(exported.promotionCheck.ok).toBe(true);

    const unsafe = simulateScenario(exported.scenario, "unsafe");
    const quorum = simulateScenario(exported.scenario, "quorum");
    expect(checkLinearizability(unsafe.operations, exported.scenario.initialValue).ok).toBe(false);
    expect(checkLinearizability(quorum.operations, exported.scenario.initialValue).ok).toBe(true);
  }, 15_000);

  it("exports a minimized fixture even when the source search preserved originals", () => {
    const result = runAdversarialSearch({
      seed: 143,
      seeds: 1,
      protocol: "compare",
      shrink: false,
    });
    const failure = result.firstFailure!;
    const exported = buildSearchFixtureExport(result)!;

    expect(failure.unsafe.minimized).toBeUndefined();
    expect(exported.source.originalSteps).toBe(11);
    expect(exported.source.minimizedSteps).toBe(3);
    expect(exported.source.reproductionCommand.split(/\s+/)).toContain("--shrink");
    expect(exported.scenario.steps).toHaveLength(3);

    const unsafe = simulateScenario(exported.scenario, "unsafe");
    expect(checkLinearizability(unsafe.operations, exported.scenario.initialValue).ok).toBe(false);
  }, 15_000);
});
