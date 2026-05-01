# QuorumScope

QuorumScope is a deterministic fault lab for a single replicated register. It replays the same network partition schedule against two protocols, records the operation history, and checks whether every successful read is linearizable.

## Technical Thesis

Network partitions create histories that can look locally successful while violating global correctness. QuorumScope makes that failure inspectable: the unsafe protocol accepts a write on the majority side, then returns a stale successful read from the minority side. The quorum protocol runs the same schedule and stays linearizable by making the minority read unavailable.

## Why This Is Hard

The hard part is not drawing nodes. The engine must model replica state, partition reachability, message timing, protocol acknowledgement thresholds, operation histories, and a register specification. The checker then searches for a legal sequential order that preserves real-time operation order. If none exists, it reports a concrete witness.

## What The Demo Shows

1. Load the `split-brain-stale-read` fixture.
2. Replay the **First-ack** protocol.
3. See `op2` write `v1` and `op3` later read stale `v0`.
4. Switch to **Quorum** on the same schedule.
5. See the minority read become unavailable instead of returning stale data.
6. Inspect the event trace, minimized counterexample, operation timeline, and benchmark summary.

## Architecture

- `src/core/simulator.ts`: deterministic event simulator for partitions, reads, writes, acknowledgements, commits, and aborts.
- `src/core/protocols.ts`: unsafe first-ack register and quorum-commit register.
- `src/core/linearizability.ts`: backtracking single-register linearizability checker using `BigInt` state masks.
- `src/core/shrinker.ts`: greedy counterexample reducer over scenario steps.
- `src/core/benchmark.ts`: deterministic seeded benchmark generator for 2/3 partition stale-read probes.
- `src/cli`: CLI proof and benchmark commands.
- `src/App.tsx`: Vite React trace workbench over the core engine output.
- `examples/split-brain-stale-read.json`: runnable scenario fixture.

## Core Algorithm

The checker filters successful operations, builds real-time predecessor constraints, and performs DFS over candidate sequential orders. Writes update the abstract register value; reads are legal only when their observed value matches the current abstract value. The search memoizes `(placed operations, current value)` states with `BigInt` masks, so histories above 31 operations do not alias.

## Run

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Test

```bash
npm test
npm run typecheck
npm run build
```

## CLI Demo

```bash
npm run demo
npm run demo -- examples/split-brain-stale-read.json
```

Expected core result:

- First-ack: `NOT LINEARIZABLE`; witness says `op3` returned `v0` after `op2` completed with `v1`.
- Quorum: `LINEARIZABLE`; the same minority read is `unavailable`.

## Benchmark

```bash
npm run bench
```

Current local output for 50 seeded variants of the same 2/3 partition probe:

| Protocol | Violations | Stale-read witnesses | Unavailable ops |
| --- | ---: | ---: | ---: |
| First-ack | 50 | 50 | 0 |
| Quorum | 0 | 0 | 50 |

This benchmark is a deterministic regression harness, not evidence of broad distributed-system coverage.

## Browser Demo Path

1. Start `npm run dev`.
2. Keep **First-ack** selected and press **Replay**.
3. Use **Violation** to jump to the stale read.
4. Press **Quorum** to jump to the same operation under quorum semantics.
5. Compare the operation timeline, checker verdict, and benchmark panel.

## Limitations

- Single-key register only.
- Five-node fixture layout in the UI.
- No full Raft, Paxos, leader election, retries, anti-entropy, read repair, durable storage, message loss, or real networking.
- Scenarios are serialized; the checker supports concurrent histories, but the included simulator fixtures do not generate arbitrary overlapping client operations yet.
- Benchmark scenarios are seeded variants of one failure shape.
- The UI is a trace workbench for the included fixture, not a generic distributed-systems playground.

## Future Work

- Add a real adversarial schedule searcher.
- Add scenario JSON validation and a scenario picker.
- Add message drops, delayed commits, overlapping clients, and read repair.
- Add checker performance benchmarks over increasing history sizes.
- Add exportable proof/trace artifacts.

## What Makes This Technically Interesting

QuorumScope builds and verifies the failure instead of describing it. The same deterministic fixture feeds the simulator, CLI, tests, benchmark, shrinker, and browser replay. A reviewer can inspect the stale-read witness, rerun the scenario locally, and see exactly where availability and safety diverge.
