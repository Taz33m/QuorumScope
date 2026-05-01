# QuorumScope

QuorumScope is a deterministic fault lab for a single replicated register. It can replay a curated split-brain fixture, generate bounded adversarial partition schedules, shrink discovered failures, and check whether every successful read is linearizable.

## Technical Thesis

Network partitions create histories that can look locally successful while violating global correctness. QuorumScope makes that failure inspectable: first-ack replication can accept a write on one partition and later return a stale successful read from another. The quorum protocol runs the same generated schedule and, under this model, preserves safety by making minority operations unavailable.

## Why This Is Hard

The hard part is not drawing nodes. The engine must model replica state, partition reachability, message timing, protocol acknowledgement thresholds, operation histories, and a register specification. The checker then searches for a legal sequential order that preserves real-time operation order. If none exists, it reports a concrete witness.

## What The Demo Shows

The default UI shows both paths:

1. The curated `split-brain-stale-read` replay.
2. The adversarial search panel, which explores seeded schedules and finds a first-ack stale-read counterexample.
3. The minimized failing scenario loaded into the same trace workbench.
4. A quorum comparison over the same generated scenario.

## Architecture

- `src/core/simulator.ts`: deterministic event simulator for partitions, reads, writes, acknowledgements, commits, and aborts.
- `src/core/protocols.ts`: unsafe first-ack register and quorum-commit register.
- `src/core/linearizability.ts`: backtracking single-register linearizability checker using `BigInt` state masks.
- `src/core/shrinker.ts`: greedy counterexample reducer over scenario steps.
- `src/core/search.ts`: seeded adversarial scenario generator, search runner, shrink integration, and protocol comparison.
- `src/core/benchmark.ts`: deterministic seeded benchmark generator for 2/3 partition stale-read probes.
- `src/cli`: CLI demo, search, and benchmark commands.
- `src/App.tsx`: Vite React trace workbench over the core engine output.
- `examples/split-brain-stale-read.json`: runnable scenario fixture.

## Core Algorithm

The checker filters successful operations, builds real-time predecessor constraints, and performs DFS over candidate sequential orders. Writes update the abstract register value; reads are legal only when their observed value matches the current abstract value. The search memoizes `(placed operations, current value)` states with `BigInt` masks, so histories above 31 operations do not alias.

## Adversarial Search

The search engine uses a seeded generator to produce ordinary `Scenario` objects. Each scenario is small and replayable: exact-cover partitions, bounded operations, deterministic waits, majority-side writes, minority-side reads, and a few extra read/write/heal steps. The runner executes the same scenario under first-ack and quorum, checks both histories, and shrinks any failing first-ack counterexample with the same simulator/checker oracle used by the tests.

The current generator is adversarially biased toward quorum-boundary split-brain schedules. It is a bounded search/regression harness, not an exhaustive model checker.

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
npm run bench -- 5
```

The benchmark includes the original deterministic 2/3 probe and the adversarial search corpus. Current local output for 50 seeded variants:

| Protocol | Violations | Stale-read witnesses | Unavailable ops |
| --- | ---: | ---: | ---: |
| First-ack | 50 | 50 | 0 |
| Quorum | 0 | 0 | 50 |

The adversarial search corpus for seed `143`, 50 schedules currently finds first-ack violations and quorum unavailability with zero quorum violations under the modeled assumptions. This is not a general proof.

## Search CLI

```bash
npm run search
npm run search:first-ack
npm run search:compare
npm run search -- --seed 143 --seeds 1 --protocol compare --shrink
```

Search output includes:

- search config
- seeds explored
- first failing seed
- original and minimized step count
- stale-read witness
- reproduction command
- quorum comparison
- bounded-search disclaimer

Example reproduction command:

```bash
npm run search -- --seed 143 --seeds 1 --protocol compare --shrink
```

## Browser Demo Path

1. Start `npm run dev`.
2. Use **Run Search** in the adversarial search panel.
3. Inspect the first failing seed, minimized steps, reproduction command, and quorum comparison.
4. Press **Load Failure** to replay the minimized counterexample in the existing workbench.
5. Use **Violation** to jump to the stale read, then **Quorum** to compare the same operation under quorum semantics.

## Limitations

- Single-key register only.
- Five-node fixture layout in the UI.
- No full Raft, Paxos, leader election, retries, anti-entropy, read repair, durable storage, message loss, or real networking.
- Scenarios are serialized; the checker supports concurrent histories, but the included simulator fixtures do not generate arbitrary overlapping client operations yet.
- Search scenarios are bounded and adversarially biased; this is not exhaustive model checking.
- Quorum results mean “zero violations in this bounded generated corpus under the modeled assumptions,” not universal correctness.
- The UI is a trace/search workbench, not a generic distributed-systems playground.

## Future Work

- Add scenario JSON validation and a scenario picker.
- Add message drops, delayed commits, overlapping clients, and read repair.
- Add checker performance benchmarks over increasing history sizes.
- Add exportable proof/trace artifacts.

## What Makes This Technically Interesting

QuorumScope builds and verifies the failure instead of describing it. The same deterministic scenarios feed the generator, simulator, CLI, tests, benchmark, shrinker, and browser replay. A reviewer can inspect the stale-read witness, rerun the seed locally, and see exactly where availability and safety diverge.
