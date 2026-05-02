import { describe, expect, it } from "vitest";
import {
  checkLinearizability,
  findExhaustiveCase,
  runAdversarialSearch,
  simulateScenario,
  type SearchConfig,
} from "../src/core";
import { buildProductReport } from "../src/core/report";

describe("report reproduction commands", () => {
  it("replays the reported adversarial search failure with full search bounds", () => {
    const report = buildProductReport();
    const command = mustFindCommand(report.reproduce, "npm run search");
    const firstFailure = report.search.firstFailure!;

    expect(numberFlag(command, "--seed")).toBe(firstFailure.seed);
    expect(numberFlag(command, "--seeds")).toBe(1);
    expect(numberFlag(command, "--nodes")).toBe(report.search.config.nodeCount);
    expect(numberFlag(command, "--ops")).toBe(report.search.config.operationCount);
    expect(numberFlag(command, "--clients")).toBe(report.search.config.clientCount);
    expect(numberFlag(command, "--read-ratio")).toBe(report.search.config.readRatio);
    expect(numberFlag(command, "--chaos")).toBe(report.search.config.partitionIntensity);
    expect(numberFlag(command, "--concurrency")).toBe(report.search.config.concurrentIntensity);
    expect(stringFlag(command, "--protocol")).toBe("compare");
    expect(hasFlag(command, "--shrink")).toBe(true);

    const replay = runAdversarialSearch(commandToSearchConfig(command));
    expect(replay.firstFailure?.seed).toBe(firstFailure.seed);
    expect(replay.firstFailure?.unsafe.analysis.verdict.witness?.type).toBe("stale-read");
    expect(replay.firstFailure?.unsafe.minimized?.scenario.steps.length).toBe(
      firstFailure.unsafe.minimized?.scenario.steps.length,
    );
    expect(replay.summary.quorumViolations).toBe(0);
  }, 15_000);

  it("replays the reported exhaustive counterexample under matching finite-model bounds", () => {
    const report = buildProductReport();
    const command = mustFindCommand(report.reproduce, "npm run exhaustive");
    const firstViolation = report.exhaustive.unsafe.firstViolation!;

    expect(stringFlag(command, "--case")).toBe(firstViolation.caseId);
    expect(numberFlag(command, "--max-ops")).toBe(report.exhaustive.config.maxOperations);
    expect(numberFlag(command, "--topology")).toBe(report.exhaustive.config.maxTopologyChanges);
    expect(numberFlag(command, "--clients")).toBe(report.exhaustive.config.clientCount);
    expect(numberFlag(command, "--seed")).toBe(report.exhaustive.config.seed);
    expect(hasFlag(command, "--show")).toBe(true);

    const found = findExhaustiveCase(firstViolation.caseId, {
      maxOperations: numberFlag(command, "--max-ops"),
      maxTopologyChanges: numberFlag(command, "--topology"),
      clientCount: numberFlag(command, "--clients"),
      seed: numberFlag(command, "--seed"),
      includeConcurrent: !hasFlag(command, "--no-concurrency"),
    });

    expect(found?.scenarioHash).toBe(firstViolation.scenarioHash);
    const replay = simulateScenario(found!.scenario, "unsafe");
    expect(checkLinearizability(replay.operations, found!.scenario.initialValue).ok).toBe(false);
  }, 15_000);
});

function commandToSearchConfig(command: string): Partial<SearchConfig> {
  return {
    seed: numberFlag(command, "--seed"),
    seeds: numberFlag(command, "--seeds"),
    nodeCount: numberFlag(command, "--nodes"),
    operationCount: numberFlag(command, "--ops"),
    clientCount: numberFlag(command, "--clients"),
    readRatio: numberFlag(command, "--read-ratio"),
    partitionIntensity: numberFlag(command, "--chaos"),
    concurrentIntensity: numberFlag(command, "--concurrency"),
    protocol: stringFlag(command, "--protocol") as SearchConfig["protocol"],
    shrink: hasFlag(command, "--shrink"),
  };
}

function mustFindCommand(commands: readonly string[], prefix: string): string {
  const command = commands.find((candidate) => candidate.startsWith(prefix));
  expect(command).toBeDefined();
  return command!;
}

function numberFlag(command: string, flag: string): number {
  return Number(stringFlag(command, flag));
}

function stringFlag(command: string, flag: string): string {
  const tokens = command.split(/\s+/);
  const index = tokens.indexOf(flag);
  expect(index).toBeGreaterThanOrEqual(0);
  const value = tokens[index + 1];
  expect(value).toBeDefined();
  return value!;
}

function hasFlag(command: string, flag: string): boolean {
  return command.split(/\s+/).includes(flag);
}
