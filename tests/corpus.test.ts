import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzeScenario } from "../src/core";
import type { Scenario } from "../src/core";

const fixtureDir = resolve(process.cwd(), "examples");
const fixtures = readdirSync(fixtureDir)
  .filter((file) => file.endsWith(".json"))
  .sort((a, b) => a.localeCompare(b));

describe("regression corpus", () => {
  it("keeps public replay fixtures valid and deterministic", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(2);

    for (const file of fixtures) {
      const scenario = loadScenario(file);
      const first = analyzeScenario(scenario, "unsafe");
      const second = analyzeScenario(scenario, "unsafe");

      expect(second.operations).toEqual(first.operations);
      expect(second.events).toEqual(first.events);
    }
  });

  it("preserves first-ack stale-read counterexamples as replay fixtures", () => {
    for (const file of fixtures) {
      const scenario = loadScenario(file);
      const unsafe = analyzeScenario(scenario, "unsafe");

      expect(unsafe.verdict.ok, file).toBe(false);
      expect(unsafe.verdict.witness?.type, file).toBe("stale-read");
    }
  });

  it("reports quorum safety-vs-availability tradeoff for the same corpus", () => {
    let unavailable = 0;
    for (const file of fixtures) {
      const scenario = loadScenario(file);
      const quorum = analyzeScenario(scenario, "quorum");

      expect(quorum.verdict.ok, file).toBe(true);
      unavailable += quorum.metrics.unavailableOperations;
    }

    expect(unavailable).toBeGreaterThan(0);
  });
});

function loadScenario(file: string): Scenario {
  return JSON.parse(readFileSync(join(fixtureDir, file), "utf-8")) as Scenario;
}
