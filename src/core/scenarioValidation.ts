import type { OperationScenarioStep, Scenario, ScenarioStep } from "./types";

export interface ScenarioValidationResult {
  ok: boolean;
  errors: string[];
}

const scenarioKeys = new Set(["id", "name", "description", "seed", "initialValue", "nodes", "steps"]);
const commonStepKeys = new Set(["type", "label"]);
const operationKeys = new Set(["type", "label", "client", "zone", "value"]);
const partitionKeys = new Set(["type", "label", "groups"]);
const waitKeys = new Set(["type", "label", "ms"]);
const concurrentKeys = new Set(["type", "label", "operations"]);

export function validateScenario(value: unknown): ScenarioValidationResult {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["scenario must be an object"] };
  }

  checkKnownKeys(value, scenarioKeys, "scenario", errors);
  const id = requireString(value, "id", "scenario", errors);
  requireString(value, "name", "scenario", errors);
  requireString(value, "description", "scenario", errors);
  const seed = value.seed;
  if (!Number.isInteger(seed) || (seed as number) < 0) {
    errors.push("scenario.seed must be a non-negative integer");
  }
  requireString(value, "initialValue", "scenario", errors);

  const nodesValue = value.nodes;
  const nodes: string[] = [];
  if (!Array.isArray(nodesValue) || nodesValue.length === 0) {
    errors.push("scenario.nodes must be a non-empty string array");
  } else {
    for (const [index, node] of nodesValue.entries()) {
      if (typeof node !== "string" || node.length === 0) {
        errors.push(`scenario.nodes[${index}] must be a non-empty string`);
      } else {
        nodes.push(node);
      }
    }
    const uniqueNodes = new Set(nodes);
    if (uniqueNodes.size !== nodes.length) {
      errors.push("scenario.nodes must not contain duplicates");
    }
  }

  const steps = value.steps;
  if (!Array.isArray(steps)) {
    errors.push("scenario.steps must be an array");
  } else {
    let zoneCount = 1;
    for (const [index, step] of steps.entries()) {
      const result = validateStep(step, index, nodes, zoneCount, id ?? "scenario");
      errors.push(...result.errors);
      zoneCount = result.nextZoneCount;
    }
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidScenario(value: unknown, context = "scenario"): asserts value is Scenario {
  const validation = validateScenario(value);
  if (!validation.ok) {
    throw new Error(`${context} is invalid:\n- ${validation.errors.join("\n- ")}`);
  }
}

function validateStep(
  value: unknown,
  index: number,
  nodes: readonly string[],
  zoneCount: number,
  scenarioId: string,
): { errors: string[]; nextZoneCount: number } {
  const errors: string[] = [];
  const path = `${scenarioId}.steps[${index}]`;
  if (!isRecord(value)) {
    return { errors: [`${path} must be an object`], nextZoneCount: zoneCount };
  }

  const type = value.type;
  if (type === "partition") {
    checkKnownKeys(value, partitionKeys, path, errors);
    validatePartition(value.groups, nodes, path, errors);
    return {
      errors,
      nextZoneCount: Array.isArray(value.groups) ? value.groups.length : zoneCount,
    };
  }

  if (type === "heal") {
    checkKnownKeys(value, commonStepKeys, path, errors);
    return { errors, nextZoneCount: 1 };
  }

  if (type === "wait") {
    checkKnownKeys(value, waitKeys, path, errors);
    if (!Number.isInteger(value.ms) || (value.ms as number) < 0) {
      errors.push(`${path}.ms must be a non-negative integer`);
    }
    return { errors, nextZoneCount: zoneCount };
  }

  if (type === "read" || type === "write") {
    checkKnownKeys(value, operationKeys, path, errors);
    validateOperation(value, path, zoneCount, errors);
    return { errors, nextZoneCount: zoneCount };
  }

  if (type === "concurrent") {
    checkKnownKeys(value, concurrentKeys, path, errors);
    if (!Array.isArray(value.operations) || value.operations.length === 0) {
      errors.push(`${path}.operations must be a non-empty operation array`);
    } else {
      for (const [opIndex, operation] of value.operations.entries()) {
        const opPath = `${path}.operations[${opIndex}]`;
        if (!isRecord(operation)) {
          errors.push(`${opPath} must be an object`);
          continue;
        }
        if (operation.type !== "read" && operation.type !== "write") {
          errors.push(`${opPath}.type must be read or write`);
          continue;
        }
        checkKnownKeys(operation, operationKeys, opPath, errors);
        validateOperation(operation, opPath, zoneCount, errors);
      }
    }
    return { errors, nextZoneCount: zoneCount };
  }

  errors.push(`${path}.type must be partition, heal, wait, read, write, or concurrent`);
  return { errors, nextZoneCount: zoneCount };
}

function validatePartition(
  groups: unknown,
  nodes: readonly string[],
  path: string,
  errors: string[],
): void {
  if (!Array.isArray(groups) || groups.length === 0) {
    errors.push(`${path}.groups must be a non-empty array`);
    return;
  }

  const seen = new Set<string>();
  for (const [groupIndex, group] of groups.entries()) {
    if (!Array.isArray(group) || group.length === 0) {
      errors.push(`${path}.groups[${groupIndex}] must be a non-empty node array`);
      continue;
    }
    for (const [nodeIndex, node] of group.entries()) {
      if (typeof node !== "string" || node.length === 0) {
        errors.push(`${path}.groups[${groupIndex}][${nodeIndex}] must be a non-empty node id`);
        continue;
      }
      if (!nodes.includes(node)) {
        errors.push(`${path}.groups[${groupIndex}] references unknown node ${node}`);
      }
      if (seen.has(node)) {
        errors.push(`${path}.groups duplicates node ${node}`);
      }
      seen.add(node);
    }
  }

  for (const node of nodes) {
    if (!seen.has(node)) {
      errors.push(`${path}.groups omits node ${node}`);
    }
  }
}

function validateOperation(
  value: Record<string, unknown>,
  path: string,
  zoneCount: number,
  errors: string[],
): void {
  requireString(value, "client", path, errors);
  if (!Number.isInteger(value.zone) || (value.zone as number) < 0 || (value.zone as number) >= zoneCount) {
    errors.push(`${path}.zone must reference an active partition zone`);
  }
  if (value.type === "write") {
    requireString(value, "value", path, errors);
  }
  if (typeof value.label !== "undefined" && typeof value.label !== "string") {
    errors.push(`${path}.label must be a string when present`);
  }
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string | undefined {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    errors.push(`${path}.${key} must be a non-empty string`);
    return undefined;
  }
  return field;
}

function checkKnownKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
  errors: string[],
): void {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      errors.push(`${path}.${key} is not a known field`);
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function cloneScenario(scenario: Scenario): Scenario {
  return {
    ...scenario,
    nodes: [...scenario.nodes],
    steps: scenario.steps.map(cloneStep),
  };
}

function cloneStep(step: ScenarioStep): ScenarioStep {
  if (step.type === "partition") {
    return { ...step, groups: step.groups.map((group) => [...group]) };
  }
  if (step.type === "concurrent") {
    return { ...step, operations: step.operations.map(cloneOperation) };
  }
  return { ...step };
}

function cloneOperation(operation: OperationScenarioStep): OperationScenarioStep {
  return { ...operation };
}
