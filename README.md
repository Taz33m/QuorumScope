# QuorumScope

QuorumScope is a deterministic consistency-testing workbench for a single replicated register. It can replay curated counterexamples, generate bounded adversarial partition schedules, exhaustively enumerate a tiny finite scenario model, shrink discovered failures, validate a regression corpus, and check whether every successful read is linearizable.

See `paper/quorumscope.tex` for the artifact technical report.

## Technical Thesis

Network partitions create histories that can look locally successful while violating global correctness. QuorumScope makes that failure inspectable: first-ack replication can accept a write on one partition and later return a stale successful read from another. The quorum protocol runs the same generated schedule and, under this model, avoids the stale read by making minority operations unavailable.

## Why This Is Hard

The hard part is not drawing nodes. The engine must model replica state, partition reachability, message timing, protocol acknowledgement thresholds, operation histories, and a register specification. The checker then searches for a legal sequential order that preserves real-time operation order. If none exists, it reports a concrete witness.

## What The Demo Shows

The default UI shows both paths:

1. The curated `split-brain-stale-read` replay.
2. The adversarial search panel, which explores seeded schedules and finds a first-ack stale-read counterexample.
3. The minimized failing scenario loaded into the same trace workbench.
4. A quorum comparison over the same generated scenario.

The CLI adds a bounded exhaustive explorer for a much smaller model. It is intentionally separate from the UI because its main artifact is coverage accounting, not animation.

For a single plain-text summary of the verification surface, run:

```bash
npm run report
```

## Architecture

- `src/core/simulator.ts`: deterministic event simulator for partitions, concurrent operation batches, reads, writes, acknowledgements, commits, and aborts.
- `src/core/protocols.ts`: unsafe first-ack register and quorum-commit register.
- `src/core/linearizability.ts`: backtracking single-register linearizability checker using `BigInt` state masks.
- `src/core/shrinker.ts`: greedy counterexample reducer over scenario steps.
- `src/core/search.ts`: seeded adversarial scenario generator, search runner, shrink integration, and protocol comparison.
- `src/core/exhaustive.ts`: tiny bounded scenario-space explorer with coverage reporting.
- `src/core/corpus.ts`: manifest-driven regression corpus loader, scenario validation, and expected-outcome checking.
- `src/core/report.ts`: unified product report over corpus, adversarial search, and exhaustive exploration.
- `src/core/benchmark.ts`: deterministic seeded benchmark generator for 2/3 partition stale-read probes.
- `src/cli`: CLI demo, manifest corpus replay, report, product verification, exhaustive explorer, search, and benchmark commands.
- `src/App.tsx`: Vite React trace workbench over the core engine output.
- `examples/`: runnable scenario fixtures plus `corpus.manifest.json` expectations.

## Core Algorithm

The checker filters successful operations, builds real-time predecessor constraints, and performs DFS over candidate sequential orders. Writes update the abstract register value; reads are legal only when their observed value matches the current abstract value. Safe histories return a legal sequential witness and final register value. The search memoizes `(placed operations, current value)` states with `BigInt` masks, so histories above 31 operations do not alias.

## Adversarial Search

The search engine uses a seeded generator to produce ordinary `Scenario` objects. Each scenario is small and replayable: exact-cover partitions, bounded operations, deterministic waits, optional overlapping client batches, majority-side writes, minority-side reads, and a few extra read/write/heal steps. The runner executes the same scenario under first-ack and quorum, checks both histories, and shrinks any failing first-ack counterexample with the same simulator/checker oracle used by the tests.

The current generator is adversarially biased toward quorum-boundary split-brain schedules. It is a bounded search/regression harness, not an exhaustive model checker.

## Tiny Exhaustive Explorer

```bash
npm run exhaustive
```

The exhaustive command enumerates every scenario inside a deliberately tiny finite model:

- 3 replicas
- 2 clients
- one key
- `v0` initial value and bounded generated writes
- healed topology plus canonical 1/2 partitions
- up to 3 returned operations
- up to 2 topology changes
- optional one overlapping read/read, read/write, or write/write batch
- deterministic simulator timing per enumerated case

Current local output for the default model:

| Protocol | Terminal histories | Violations | Stale-read witnesses | Unavailable ops |
| --- | ---: | ---: | ---: | ---: |
| First-ack | 1000 | 144 | 126 | 0 |
| Quorum | 1000 | 0 | 0 | 1064 |

This is exhaustive only over the declared scenario grammar and bounds. It does not enumerate arbitrary message timings, arbitrary client schedules, real network behavior, or larger systems.

Adversarial search and exhaustive exploration answer different questions. Search samples larger biased schedules and quickly finds a known failure class. The exhaustive explorer checks every case in a tiny finite model and reports the denominator.

## Run

```bash
npm ci
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Test

```bash
npm test
npm run verify:product
npm run report
npm run smoke:ui
npm run typecheck
npm run build
npm run corpus
npm run exhaustive
```

`npm run verify:product` runs the main trust checks locally: unit tests, typecheck, production build, UI smoke, demo, corpus, search comparison, exhaustive explorer, and report. `npm run smoke:ui` verifies the built workbench shell and core technical surfaces; it is not a replacement for interactive browser QA.

## CLI Demo

```bash
npm run demo
npm run corpus
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
npm run search -- --seed 143 --seeds 1 --protocol compare --nodes 5 --ops 8 --clients 3 --read-ratio 0.55 --chaos 0.75 --concurrency 0.45 --shrink
npm run exhaustive
npm run exhaustive -- --case ex-000043 --max-ops 3 --topology 2 --clients 2 --seed 7001 --show
```

Search output includes:

- search config
- seeds explored
- how many generated schedules included overlapping operations
- first failing seed
- original and minimized step count
- stale-read witness
- reproduction command
- quorum comparison
- bounded-search disclaimer

Exhaustive output includes:

- finite model bounds
- prefixes explored
- terminal histories checked
- coverage buckets
- first reported stale-read counterexample
- minimized step count
- reproduction command
- bounded-claim disclaimer

Example reproduction command:

```bash
npm run search -- --seed 143 --seeds 1 --protocol compare --nodes 5 --ops 8 --clients 3 --read-ratio 0.55 --chaos 0.75 --concurrency 0.45 --shrink
```

## Regression Corpus

```bash
npm run corpus
```

The corpus command reads `examples/corpus.manifest.json`, validates every listed scenario, verifies that all public scenario JSON files are listed, runs each fixture under the declared protocols, and checks actual outcomes against expected outcomes.

Current corpus fixtures:

| Fixture | Purpose |
| --- | --- |
| `split-brain-stale-read.json` | curated first-ack stale-read counterexample |
| `search-143-minimized.json` | minimized counterexample saved from adversarial search |
| `concurrent-safe-overlap.json` | overlapping read/write history that remains linearizable |
| `exhaustive-ex-000043.json` | first stale-read witness from the default tiny exhaustive model |

The expected bounded result is first-ack stale-read violations in the counterexample fixtures, zero quorum violations, and quorum unavailability reported where it prevents stale reads.

## Product Report

```bash
npm run report
```

The report command is the quickest way to inspect the finished product surface. It aggregates:

- manifest corpus replay and expectation matching
- default adversarial search results
- tiny exhaustive model coverage
- protocol comparison
- quorum unavailable-operation counts
- reproduction commands for the saved corpus, first generated failure, and first exhaustive failure
- one bounded-claim statement

Current local report summary:

| Surface | First-ack violations | Quorum violations | Quorum unavailable ops |
| --- | ---: | ---: | ---: |
| Corpus | 3/4 fixtures | 0/4 fixtures | 4 |
| Adversarial search | 50/50 schedules | 0/50 schedules | 155 |
| Tiny exhaustive model | 144/1000 histories | 0/1000 histories | 1064 |

Bounded claim: no quorum linearizability violations were found in the declared corpus, default adversarial generated corpus, and tiny exhaustive model under current assumptions. This is not a general proof.

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
- The quorum protocol is a simplified prepare/commit register, not a production consensus protocol.
- Scenarios can include overlapping operation batches, but QuorumScope does not exhaustively enumerate all possible concurrent schedules.
- Search scenarios are bounded and adversarially biased; this is not exhaustive model checking.
- The exhaustive explorer is exhaustive only inside the tiny declared scenario model; it does not enumerate arbitrary message timings or all possible distributed executions.
- Quorum results mean “zero violations in the stated bounded corpus/model under the modeled assumptions,” not universal correctness.
- The UI is a trace/search workbench, not a generic distributed-systems playground.

## Future Work

- Add message drops, delayed commits, finer-grained schedule exploration, and read repair.
- Add checker performance benchmarks over increasing history sizes.
- Add exportable proof/trace artifacts.

## What Makes This Technically Interesting

QuorumScope builds and verifies the failure instead of describing it. The same deterministic scenarios feed the generator, simulator, CLI, tests, benchmark, shrinker, and browser replay. A reviewer can inspect the stale-read witness, rerun the seed locally, and see exactly where availability and safety diverge.
