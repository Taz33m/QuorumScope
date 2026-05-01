# Agent Notes

This repo is for technically impressive build work, not generic apps. Favor narrow artifacts with a real algorithmic, systems, simulation, compiler/runtime, tracing, networking, search, security, benchmark, or visualization core.

## Build Priorities

- Build the hard core before the UI.
- Prefer deterministic logic, explicit state, reproducible fixtures, benchmarks, simulations, and rigorous tests.
- Avoid thin AI wrappers, prompt-only products, fake dashboards, fake integrations, fake live systems, and broad product shells with no technical center.
- Keep the operating loop narrow and demoable.
- Make the computation inspectable: traces, explanations, replay logs, or visual state changes should expose what the engine actually did.
- README claims must be honest and supported by local code, fixtures, tests, or benchmarks.

## Repo Hygiene

- Internal research, PRDs, strategy, scratch notes, and demo planning live only under `.codex-work/`.
- Public docs should stay minimal: `README.md`, this file, and only a concise `docs/ARCHITECTURE.md` if the architecture truly needs it.
- Do not expose internal hackathon, judge, sponsor, or scouting strategy language in public-facing files.
- No fake citations, fake data, fake benchmarks, fake users, fake metrics, or fake API integrations.
- Do not add public Markdown sprawl.

## Definition of Done

A task is done only when the repo has:

- A working demo, CLI, or tool.
- A real tested technical core.
- Reproducible fixtures or scenarios.
- A clear README with setup, test, and demo instructions.
- Honest limitations.
- QA evidence from tests, benchmarks, smoke checks, or browser verification.

If a UI exists, browser/demo verification is required before release.

## Engineering Defaults

- Prefer simple, typed modules with crisp boundaries.
- Add tests near the core logic early.
- Keep dependencies justified.
- Do not polish around fake logic.
- Freeze scope once the core demo path is clear; after that, only fix bugs, tighten proof, improve clarity, and remove clutter.
