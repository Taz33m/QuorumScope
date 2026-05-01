import type {
  LinearizabilityVerdict,
  OperationRecord,
  RegisterValue,
  StaleReadWitness,
} from "./types";

export function checkLinearizability(
  history: readonly OperationRecord[],
  initialValue: RegisterValue,
): LinearizabilityVerdict {
  const completed = history.filter((operation) => operation.status === "ok");
  const predecessorMasks = completed.map((operation) =>
    completed.reduce<bigint>((mask, candidate, index) => {
      if (candidate.id === operation.id || candidate.end > operation.start) {
        return mask;
      }
      return mask | bitFor(index);
    }, 0n),
  );
  const memo = new Set<string>();
  const search = dfs(completed, predecessorMasks, 0n, initialValue, [], memo);
  if (search) {
    return {
      ok: true,
      checkedOperations: completed.length,
      legalOrder: search,
    };
  }

  const staleRead = findStaleReadWitness(completed, initialValue);
  return {
    ok: false,
    checkedOperations: completed.length,
    legalOrder: [],
    witness:
      staleRead ??
      {
        type: "no-sequentialization",
        checkedOperations: completed.length,
        explanation:
          "No sequential ordering can satisfy the register specification while preserving real-time operation order.",
      },
  };
}

function dfs(
  operations: readonly OperationRecord[],
  predecessorMasks: readonly bigint[],
  placedMask: bigint,
  currentValue: RegisterValue,
  order: string[],
  memo: Set<string>,
): string[] | undefined {
  if (order.length === operations.length) {
    return order;
  }
  const memoKey = `${placedMask.toString(36)}|${currentValue}`;
  if (memo.has(memoKey)) {
    return undefined;
  }

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

    const nextValue = operation.kind === "write" ? operation.input ?? currentValue : currentValue;
    const found = dfs(
      operations,
      predecessorMasks,
      placedMask | bit,
      nextValue,
      [...order, operation.id],
      memo,
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
