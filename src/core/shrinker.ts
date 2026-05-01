import { checkLinearizability } from "./linearizability";
import { simulateScenario } from "./simulator";
import type { ProtocolName, Scenario } from "./types";

export function minimizeFailingScenario(scenario: Scenario, protocol: ProtocolName): Scenario | undefined {
  if (!failsLinearizability(scenario, protocol)) {
    return undefined;
  }

  let current: Scenario = cloneScenario(scenario);
  let changed = true;
  while (changed) {
    changed = false;
    for (let index = 0; index < current.steps.length; index += 1) {
      const candidate: Scenario = {
        ...current,
        steps: current.steps.filter((_, stepIndex) => stepIndex !== index),
      };
      if (candidate.steps.length === current.steps.length) {
        continue;
      }
      if (failsLinearizability(candidate, protocol)) {
        current = candidate;
        changed = true;
        break;
      }
    }
  }

  return {
    ...current,
    id: `${scenario.id}-minimized`,
    name: `${scenario.name} (minimized)`,
  };
}

function failsLinearizability(scenario: Scenario, protocol: ProtocolName): boolean {
  const result = simulateScenario(scenario, protocol);
  return !checkLinearizability(result.operations, scenario.initialValue).ok;
}

function cloneScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    nodes: [...scenario.nodes],
    steps: scenario.steps.map((step) => {
      if (step.type === "partition") {
        return { ...step, groups: step.groups.map((group) => [...group]) };
      }
      return { ...step };
    }),
  };
}
