# QuorumScope

QuorumScope is a deterministic consistency-testing workbench for a replicated single-key register under network partitions. It compares an intentionally unsafe first-ack protocol with a majority quorum protocol, then makes the resulting histories inspectable through a simulator, linearizability checker, counterexample shrinker, regression corpus, tiny exhaustive explorer, CLI report, and React trace workbench.

- Demo video: [youtu.be/8FtiTD_bMTE](https://youtu.be/8FtiTD_bMTE)
- Technical report: [paper/quorumscope.pdf](paper/quorumscope.pdf)
- Report source: [paper/quorumscope.tex](paper/quorumscope.tex)

## Technical Thesis

A replicated register can look healthy from a local client while violating global consistency. Under a partition, first-ack can accept a majority-side write and later return a stale successful read from a minority-side replica. QuorumScope reproduces that failure, checks it against linearizability, minimizes the counterexample, and compares the same schedule against quorum, where the minority-side operation becomes unavailable instead of stale.

The bounded claim is deliberately narrow: quorum produced zero linearizability violations in the declared corpora under the implemented single-register partition model. This is not a proof for arbitrary distributed systems.

## What Is Implemented

- Deterministic partition simulator for replica state, reachability, operation timing, commits, aborts, and unavailable operations.
- Two register protocols: unsafe first-ack and simplified majority quorum.
- Backtracking single-register linearizability checker with real-time precedence constraints, legal-order witnesses, stale-read witnesses, and oracle diagnostics.
- Seeded adversarial search over bounded partition schedules, including overlapping operation batches.
- Greedy counterexample shrinker that preserves checker failure.
- Manifest-driven regression corpus with fixture validation, expected outcomes, provenance hashes, and reproduction commands.
- Tiny bounded exhaustive explorer for a declared finite scenario grammar.
- Unified product report for corpus, search, exhaustive coverage, protocol comparison, and bounded claims.
- Vite/React workbench for replaying traces, inspecting oracle diagnostics, loading minimized failures, and comparing protocols.

## Why This Is Technically Interesting

The project builds the consistency failure rather than describing it. The same scenario model feeds the simulator, checker, shrinker, corpus, CLI, benchmark, exhaustive explorer, and browser workbench. A reviewer can rerun the exact seed or fixture, inspect the stale-read witness, and see where safety and availability diverge.

The hard part is the evidence pipeline:

1. Generate or load a bounded partition schedule.
2. Execute the same schedule under first-ack and quorum.
3. Convert successful operations into a history.
4. Check whether any sequential register order preserves real-time order.
5. Return a legal witness for safe histories or a stale-read witness for unsafe ones.
6. Shrink failures into minimal replayable counterexamples.
7. Preserve important cases in a regression corpus.
8. Report exactly what was checked and what was not.

## Current Results

These numbers are produced by the local commands documented below.

| Evidence surface | Cases | First-ack violations | Quorum violations | Quorum unavailable |
| --- | ---: | ---: | ---: | ---: |
| Regression corpus | 4 fixtures | 3/4 | 0/4 | 4 |
| Adversarial search | 50 seeds | 50/50 | 0/50 | 155 |
| Benchmark probe | 50 runs | 50/50 | 0/50 | 50 |
| Tiny exhaustive model | 1000 histories | 144 | 0 | 1064 |

The exhaustive result is exhaustive only for the declared tiny model: 3 replicas, 2 clients, one key, up to 3 returned operations, up to 2 topology changes, healed topology plus canonical 1/2 partitions, deterministic simulator timing, and optional overlapping operation batches.

## Quick Start

```bash
npm ci
npm run verify:product
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Core Commands

```bash
npm test
npm run typecheck
npm run build
npm run verify:product
npm run report
npm run demo
npm run corpus
npm run search
npm run search:compare
npm run exhaustive
npm run bench
npm run smoke:ui
```

`npm run verify:product` runs the main trust checks: tests, typecheck, production build, UI smoke, curated demo, corpus replay, search comparison, exhaustive explorer, and product report.

## Reproducing The Main Failure

The default adversarial search starts at seed `143` and finds a first-ack stale-read counterexample.

```bash
npm run search -- --seed 143 --seeds 1 --protocol compare --nodes 5 --ops 8 --clients 3 --read-ratio 0.55 --chaos 0.75 --concurrency 0.45 --shrink
```

Expected result:

- first-ack: `NOT LINEARIZABLE`
- witness: a read returns `v0` after a completed write to a newer value
- shrinker: generated failure reduces from 11 steps to 3
- quorum comparison: zero violations, with unavailable minority-side operations reported

The first stale-read witness from the tiny exhaustive explorer is reproducible with:

```bash
npm run exhaustive -- --case ex-000043 --max-ops 3 --topology 2 --clients 2 --seed 7001 --show
```

## Repository Layout

```text
src/core/        simulator, protocols, checker, search, shrinker, corpus, report
src/cli/         demo, search, corpus, exhaustive, benchmark, report, verification CLIs
src/App.tsx      React trace workbench
examples/        replayable scenarios and corpus manifest
tests/           deterministic unit, corpus, CLI, report, search, exhaustive, and smoke tests
paper/           artifact technical report and compiled PDF
```

Important modules:

- `src/core/simulator.ts`: deterministic event simulator.
- `src/core/protocols.ts`: first-ack and quorum register protocols.
- `src/core/linearizability.ts`: DFS-based checker with `BigInt` state masks.
- `src/core/search.ts`: seeded scenario generator, runner, shrink integration, and protocol comparison.
- `src/core/exhaustive.ts`: tiny bounded exhaustive explorer.
- `src/core/corpus.ts`: manifest validation and expected-outcome checking.
- `src/core/report.ts`: unified product report.

## Workbench Demo Path

1. Run `npm run dev`.
2. Open `http://127.0.0.1:5173/`.
3. Run adversarial search from the workbench.
4. Inspect the first failing seed, minimized steps, reproduction command, and quorum comparison.
5. Load the minimized failure into the trace replay.
6. Jump to the violation and inspect the oracle diagnostics.
7. Switch to quorum to see the same minority-side read become unavailable.

## Model Assumptions

- The object is a single-key register.
- Partitions are modeled as reachability groups, not a real network stack.
- Successful operations are checked for linearizability; unavailable operations are reported separately.
- Quorum is a simplified majority register protocol, not Raft, Paxos, or a production consensus system.
- The exhaustive explorer enumerates a tiny declared scenario grammar, not all possible distributed executions.

## Limitations

- Single-key register only.
- Simplified network and timing model.
- No real networking, storage, durability, crash recovery, retries, read repair, leader election, Byzantine faults, Raft, or Paxos.
- Search is bounded and adversarially biased.
- Exhaustive exploration is complete only within the tiny declared finite model.
- No claim of universal quorum correctness or formal verification of arbitrary systems.
- The UI is a technical trace workbench, not a general distributed-systems playground.

## License

MIT License. See [LICENSE](LICENSE).
