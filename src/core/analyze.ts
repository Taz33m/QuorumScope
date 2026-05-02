import { checkLinearizability } from "./linearizability";
import { minimizeFailingScenario } from "./shrinker";
import { simulateScenario } from "./simulator";
import type { AnalysisResult, ProtocolName, Scenario } from "./types";

export interface AnalyzeScenarioOptions {
  shrink?: boolean;
}

export function analyzeScenario(
  scenario: Scenario,
  protocol: ProtocolName,
  options: AnalyzeScenarioOptions = {},
): AnalysisResult {
  const shrink = options.shrink ?? true;
  const simulation = simulateScenario(scenario, protocol);
  const verdict = checkLinearizability(simulation.operations, scenario.initialValue);
  const minimized = verdict.ok || !shrink ? undefined : minimizeFailingScenario(scenario, protocol);
  const minimizedSimulation = minimized ? simulateScenario(minimized, protocol) : undefined;
  const minimizedVerdict =
    minimized && minimizedSimulation
      ? checkLinearizability(minimizedSimulation.operations, minimized.initialValue)
      : undefined;

  return {
    ...simulation,
    verdict,
    minimizedFailure:
      minimized && minimizedSimulation
        ? {
            scenario: minimized,
            removedSteps: scenario.steps.length - minimized.steps.length,
            operations: minimizedSimulation.operations,
            witness: minimizedVerdict?.witness,
          }
        : undefined,
  };
}
