import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  collectCorpusIssues,
  loadCorpusManifest,
  runCorpus,
  validateCorpusManifest,
  validateManifestFileCoverage,
  type CorpusManifest,
} from "../src/core/corpus";
import { validateScenario } from "../src/core/scenarioValidation";
import { splitBrainStaleReadScenario } from "../src/core";

describe("manifest-driven regression corpus", () => {
  it("parses the public corpus manifest and covers every public scenario fixture", () => {
    const manifest = loadCorpusManifest();
    const ids = manifest.fixtures.map((fixture) => fixture.id);

    expect(ids).toEqual([
      "split-brain-stale-read",
      "search-143-minimized",
      "concurrent-safe-overlap",
      "exhaustive-ex-000023",
    ]);
    expect(validateManifestFileCoverage(manifest, join(process.cwd(), "examples"))).toEqual([]);
  });

  it("keeps the default TypeScript fixture aligned with the curated JSON fixture", () => {
    const jsonFixture = JSON.parse(
      readFileSync(join(process.cwd(), "examples", "split-brain-stale-read.json"), "utf-8"),
    );

    expect(splitBrainStaleReadScenario).toEqual(jsonFixture);
  });

  it("validates scenario shape before replay", () => {
    const valid = validateScenario(splitBrainStaleReadScenario);
    expect(valid.ok).toBe(true);

    const invalidPartition = {
      ...splitBrainStaleReadScenario,
      steps: [
        {
          type: "partition",
          groups: [["n1"], ["n2"]],
        },
      ],
    };
    expect(validateScenario(invalidPartition).errors).toContain("split-brain-stale-read.steps[0].groups omits node n3");

    const emptyConcurrent = {
      ...splitBrainStaleReadScenario,
      steps: [
        {
          type: "concurrent",
          operations: [],
        },
      ],
    };
    expect(validateScenario(emptyConcurrent).errors).toContain(
      "split-brain-stale-read.steps[0].operations must be a non-empty operation array",
    );
  });

  it("replays fixtures and checks manifest expectations", () => {
    const result = runCorpus();

    expect(result.ok).toBe(true);
    expect(result.summary.fixtures).toBe(4);
    expect(result.summary.expectedMatched).toBe(8);
    expect(result.summary.unsafeViolations).toBe(3);
    expect(result.summary.quorumViolations).toBe(0);
    expect(result.summary.quorumUnavailableOperations).toBe(4);
    expect(result.claim).toContain("not exhaustive proof");
  });

  it("fails the corpus when an expected outcome drifts", () => {
    const manifest = cloneManifest(loadCorpusManifest());
    manifest.fixtures[0]!.expected.unsafe = {
      verdict: "linearizable",
      unavailableOperations: 0,
    };

    const result = runCorpus({ manifest, checkFileCoverage: false });

    expect(result.ok).toBe(false);
    expect(result.summary.mismatches).toBeGreaterThan(0);
    expect(result.fixtures[0]!.results[0]!.mismatches[0]).toContain("expected linearizable");
    expect(result.fixtures[0]!.results[0]!.issues[0]).toMatchObject({
      code: "expectation.verdict",
      fixtureId: "split-brain-stale-read",
      fixture: "split-brain-stale-read.json",
      protocol: "unsafe",
      expected: "linearizable",
      actual: "violation",
    });
    expect(collectCorpusIssues(result)[0]?.code).toBe("expectation.verdict");
  });

  it("rejects malformed manifests and unmanifested public JSON fixtures", () => {
    expect(validateCorpusManifest({ version: 2, fixtures: [] }).ok).toBe(false);

    const dir = mkdtempSync(join(tmpdir(), "quorumscope-corpus-"));
    writeFileSync(join(dir, "a.json"), JSON.stringify(splitBrainStaleReadScenario));
    writeFileSync(join(dir, "b.json"), JSON.stringify(splitBrainStaleReadScenario));
    const manifest = cloneManifest(loadCorpusManifest());
    manifest.fixtures = [{ ...manifest.fixtures[0]!, fixture: "a.json" }];

    expect(validateManifestFileCoverage(manifest, dir)).toEqual([
      "examples/b.json is not listed in corpus.manifest.json",
    ]);
  });

  it("CLI smoke prints manifest-backed expectations", () => {
    const output = execFileSync("node", ["--import", "tsx", "src/cli/corpus.ts"], {
      cwd: process.cwd(),
      encoding: "utf-8",
    });

    expect(output).toContain("QuorumScope regression corpus");
    expect(output).toContain("Manifest:");
    expect(output).toContain("Expected outcomes matched: 8");
    expect(output).toContain("concurrent-safe-overlap");
    expect(output).toContain("exhaustive-ex-000023");
    expect(output).not.toContain(".;");
  });
});

function cloneManifest(manifest: CorpusManifest): CorpusManifest {
  return JSON.parse(JSON.stringify(manifest)) as CorpusManifest;
}
