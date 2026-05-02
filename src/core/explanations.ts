import type {
  LinearizabilityVerdict,
  LinearizabilityWitness,
  OperationRecord,
  RegisterValue,
  StaleReadWitness,
} from "./types";

export interface WitnessExplanation {
  title: string;
  summary: string;
  detail: string;
}

export function explainWitness(witness: LinearizabilityWitness): WitnessExplanation {
  if (witness.type === "stale-read") {
    return explainStaleRead(witness);
  }
  return {
    title: "No legal sequential order",
    summary: `No legal single-register order exists for ${witness.checkedOperations} successful operations.`,
    detail: witness.explanation,
  };
}

export function summarizeWitness(witness: LinearizabilityWitness | undefined): string | undefined {
  return witness ? explainWitness(witness).summary : undefined;
}

export function detailWitness(witness: LinearizabilityWitness | undefined): string | undefined {
  return witness ? explainWitness(witness).detail : undefined;
}

export function summarizeVerdict(
  verdict: LinearizabilityVerdict,
  initialValue: RegisterValue,
): string {
  if (verdict.ok) {
    const order = verdict.legalOrder.length > 0 ? verdict.legalOrder.join(" -> ") : "empty history";
    return `Legal order ${order}; final value ${verdict.finalValue ?? initialValue}.`;
  }
  return summarizeWitness(verdict.witness) ?? verdict.explanation;
}

function explainStaleRead(witness: StaleReadWitness): WitnessExplanation {
  const read = describeRead(witness.read);
  if (witness.priorWrite.id === "initial") {
    return {
      title: "Read observed a value with no completed write",
      summary: `${read} returned ${witness.observed}, but no completed write made that value visible; expected initial value ${witness.expected}.`,
      detail: `${read} ran at ${interval(witness.read)}. With no completed prior write, the single-register spec requires the initial value ${witness.expected}; the read observed ${witness.observed}.`,
    };
  }

  const write = describeWrite(witness.priorWrite);
  return {
    title: "Stale read after completed write",
    summary: `${read} returned ${witness.observed} after ${write} completed with ${witness.expected}.`,
    detail: `${write} completed at t=${witness.priorWrite.end} before ${read} started at t=${witness.read.start}, so any legal linearization must place the write before the read. The read observed ${witness.observed} instead of ${witness.expected}.`,
  };
}

function describeRead(operation: OperationRecord): string {
  return `${operation.id} read`;
}

function describeWrite(operation: OperationRecord): string {
  return `${operation.id} write`;
}

function interval(operation: OperationRecord): string {
  return `t=${operation.start}-${operation.end}`;
}
