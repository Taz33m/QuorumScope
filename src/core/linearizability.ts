import type {
  LinearizationCandidate,
  LinearizationSearchStep,
  LinearizabilityDiagnostics,
  LinearizabilityVerdict,
  OperationRecord,
  RegisterValue,
  StaleReadWitness,
} from "./types";

interface SearchSuccess {
  order: string[];
  finalValue: RegisterValue;
}

interface SearchTrace {
  exploredStates: number;
  memoizedDeadEnds: number;
  maxCapturedSteps: number;
  truncated: boolean;
  steps: LinearizationSearchStep[];
}

const maxCapturedSteps = 32;

export function checkLinearizability(
  history: readonly OperationRecord[],
  initialValue: RegisterValue,
): LinearizabilityVerdict {
  const completed = history.filter((operation) => operation.status === "ok");
  const unavailable = history.filter((operation) => operation.status !== "ok");
  const predecessorMasks = completed.map((operation) =>
    completed.reduce<bigint>((mask, candidate, index) => {
      if (candidate.id === operation.id || candidate.end > operation.start) {
        return mask;
      }
      return mask | bitFor(index);
    }, 0n),
  );
  const memo = new Set<string>();
  const trace: SearchTrace = {
    exploredStates: 0,
    memoizedDeadEnds: 0,
    maxCapturedSteps,
    truncated: false,
    steps: [],
  };
  const search = dfs(completed, predecessorMasks, 0n, initialValue, [], memo, trace);
  const diagnostics = buildDiagnostics(completed, unavailable, predecessorMasks, trace);
  if (search) {
    return {
      ok: true,
      checkedOperations: completed.length,
      legalOrder: search.order,
      finalValue: search.finalValue,
      explanation: `A legal single-register order exists; final value is ${search.finalValue}.`,
      diagnostics,
    };
  }

  const staleRead = findStaleReadWitness(completed, initialValue);
  return {
    ok: false,
    checkedOperations: completed.length,
    legalOrder: [],
    explanation:
      staleRead?.explanation ??
      "No sequential ordering can satisfy the register specification while preserving real-time operation order.",
    witness:
      staleRead ??
      {
        type: "no-sequentialization",
        checkedOperations: completed.length,
        explanation:
          "No sequential ordering can satisfy the register specification while preserving real-time operation order.",
      },
    diagnostics,
  };
}

function dfs(
  operations: readonly OperationRecord[],
  predecessorMasks: readonly bigint[],
  placedMask: bigint,
  currentValue: RegisterValue,
  order: string[],
  memo: Set<string>,
  trace: SearchTrace,
): SearchSuccess | undefined {
  trace.exploredStates += 1;
  if (order.length === operations.length) {
    return {
      order,
      finalValue: currentValue,
    };
  }
  const memoKey = `${placedMask.toString(36)}|${currentValue}`;
  if (memo.has(memoKey)) {
    trace.memoizedDeadEnds += 1;
    return undefined;
  }
  const searchStep = captureStep(operations, predecessorMasks, placedMask, currentValue, order, trace);

  for (let index = 0; index < operations.length; index += 1) {
    const bit = bitFor(index);
    if ((placedMask & bit) !== 0n) {
      continue;
    }
    const predecessorMask = predecessorMasks[index] ?? 0n;
    const ready = (placedMask & predecessorMask) === predecessorMask;
    if (!ready) {
      continue;
    }

    const operation = operations[index]!;
    if (operation.kind === "read" && operation.output !== currentValue) {
      continue;
    }
    if (searchStep && !searchStep.chosenOperationId) {
      searchStep.chosenOperationId = operation.id;
    }

    const nextValue = operation.kind === "write" ? operation.input ?? currentValue : currentValue;
    const found = dfs(
      operations,
      predecessorMasks,
      placedMask | bit,
      nextValue,
      [...order, operation.id],
      memo,
      trace,
    );
    if (found) {
      return found;
    }
  }

  memo.add(memoKey);
  return undefined;
}

function bitFor(index: number): bigint {
  return 1n << BigInt(index);
}

function captureStep(
  operations: readonly OperationRecord[],
  predecessorMasks: readonly bigint[],
  placedMask: bigint,
  currentValue: RegisterValue,
  order: readonly string[],
  trace: SearchTrace,
): LinearizationSearchStep | undefined {
  if (trace.steps.length >= trace.maxCapturedSteps) {
    trace.truncated = true;
    return undefined;
  }
  const step: LinearizationSearchStep = {
    placed: [...order],
    currentValue,
    candidates: candidateDiagnostics(operations, predecessorMasks, placedMask, currentValue),
  };
  trace.steps.push(step);
  return step;
}

function candidateDiagnostics(
  operations: readonly OperationRecord[],
  predecessorMasks: readonly bigint[],
  placedMask: bigint,
  currentValue: RegisterValue,
): LinearizationCandidate[] {
  return operations.flatMap<LinearizationCandidate>((operation, index) => {
    const bit = bitFor(index);
    if ((placedMask & bit) !== 0n) {
      return [];
    }
    const blockers = predecessorIds(operations, predecessorMasks[index] ?? 0n, placedMask);
    if (blockers.length > 0) {
      return [
        {
          operationId: operation.id,
          kind: operation.kind,
          status: "blocked",
          blockers,
          reason: `real-time predecessors not placed: ${blockers.join(", ")}`,
        },
      ];
    }
    if (operation.kind === "read" && operation.output !== currentValue) {
      return [
        {
          operationId: operation.id,
          kind: operation.kind,
          status: "rejected-read",
          blockers: [],
          expectedValue: currentValue,
          ...(operation.output === undefined ? {} : { observedValue: operation.output }),
          reason: `read observed ${operation.output ?? "undefined"} while oracle value is ${currentValue}`,
        },
      ];
    }
    return [
      {
        operationId: operation.id,
        kind: operation.kind,
        status: "ready",
        blockers: [],
        reason:
          operation.kind === "write"
            ? `write can set value to ${operation.input ?? currentValue}`
            : `read matches oracle value ${currentValue}`,
      },
    ];
  });
}

function predecessorIds(
  operations: readonly OperationRecord[],
  predecessorMask: bigint,
  placedMask: bigint,
): string[] {
  return operations.flatMap((operation, index) => {
    const bit = bitFor(index);
    return (predecessorMask & bit) !== 0n && (placedMask & bit) === 0n ? [operation.id] : [];
  });
}

function buildDiagnostics(
  completed: readonly OperationRecord[],
  unavailable: readonly OperationRecord[],
  predecessorMasks: readonly bigint[],
  trace: SearchTrace,
): LinearizabilityDiagnostics {
  return {
    successfulOperations: completed.map((operation) => operation.id),
    unavailableOperations: unavailable.map((operation) => operation.id),
    realTimePredecessors: Object.fromEntries(
      completed.map((operation, index) => [
        operation.id,
        predecessorIds(completed, predecessorMasks[index] ?? 0n, 0n),
      ]),
    ),
    exploredStates: trace.exploredStates,
    memoizedDeadEnds: trace.memoizedDeadEnds,
    maxCapturedSteps: trace.maxCapturedSteps,
    truncated: trace.truncated,
    steps: trace.steps,
  };
}

function findStaleReadWitness(
  operations: readonly OperationRecord[],
  initialValue: RegisterValue,
): StaleReadWitness | undefined {
  for (const read of operations) {
    if (read.kind !== "read" || read.output === undefined) {
      continue;
    }
    const priorWrites = operations
      .filter((operation) => operation.kind === "write" && operation.end <= read.start)
      .sort((a, b) => b.end - a.end);
    if (hasOverlappingWrites(priorWrites)) {
      continue;
    }
    const overlappingReadWrites = operations.filter(
      (operation) =>
        operation.kind === "write" &&
        operation.start < read.end &&
        operation.end > read.start,
    );
    if (overlappingReadWrites.length > 0) {
      continue;
    }
    const priorWrite = priorWrites[0];
    const expected = priorWrite?.input ?? initialValue;
    if (read.output !== expected) {
      return {
        type: "stale-read",
        read,
        priorWrite: priorWrite ?? syntheticInitialWrite(initialValue, read.start),
        expected,
        observed: read.output,
        explanation: `Read ${read.id} started after ${
          priorWrite?.id ?? "the initial value"
        } was visible in real time, but returned ${read.output} instead of ${expected}.`,
      };
    }
  }
  return undefined;
}

function hasOverlappingWrites(writes: readonly OperationRecord[]): boolean {
  for (let left = 0; left < writes.length; left += 1) {
    for (let right = left + 1; right < writes.length; right += 1) {
      const a = writes[left]!;
      const b = writes[right]!;
      if (a.start < b.end && b.start < a.end) {
        return true;
      }
    }
  }
  return false;
}

function syntheticInitialWrite(value: RegisterValue, before: number): OperationRecord {
  return {
    id: "initial",
    stepIndex: -1,
    client: "system",
    kind: "write",
    zone: 0,
    start: 0,
    end: Math.max(0, before - 1),
    status: "ok",
    input: value,
    output: "ok",
    contacted: [],
    quorumRequired: 0,
    acknowledgements: [],
    note: "initial register value",
  };
}
