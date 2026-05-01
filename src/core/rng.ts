export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  next(): number {
    this.state = (1664525 * this.state + 1013904223) >>> 0;
    return this.state / 0x100000000;
  }

  int(minInclusive: number, maxInclusive: number): number {
    const span = maxInclusive - minInclusive + 1;
    return minInclusive + Math.floor(this.next() * span);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("Cannot pick from an empty list.");
    }
    return items[this.int(0, items.length - 1)] as T;
  }
}
