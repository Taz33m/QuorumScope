import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateBuiltUiSmoke, summarizeUiSmoke } from "../src/core/uiSmoke";

const requiredJs = [
  "QuorumScope",
  "Deterministic distributed-systems fault lab",
  "Adversarial Search",
  "Oracle Trace",
  "Protocol comparison",
  "Operations",
  "Trace",
  "Benchmark",
  "Load Failure",
].join("\n");

const requiredCss = [
  ".network-map",
  ".search-panel",
  ".oracle-panel",
  ".candidate-chip",
  ".operation-row",
  ".event-row",
].join("\n");

describe("UI smoke evaluator", () => {
  it("accepts a built workbench shell with required technical surfaces", () => {
    const root = makeDist(requiredJs, requiredCss);
    try {
      const result = evaluateBuiltUiSmoke(root);
      expect(summarizeUiSmoke(result)).toEqual({ passed: result.checks.length, failed: 0 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects a build missing the oracle trace surface", () => {
    const root = makeDist(requiredJs.replace("Oracle Trace", ""), requiredCss);
    try {
      const result = evaluateBuiltUiSmoke(root);
      expect(result.checks).toContainEqual(
        expect.objectContaining({ name: "surface: Oracle Trace", ok: false }),
      );
      expect(summarizeUiSmoke(result).failed).toBeGreaterThan(0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

function makeDist(jsText: string, cssText: string): string {
  const root = mkdtempSync(join(tmpdir(), "quorumscope-ui-smoke-"));
  const dist = join(root, "dist");
  const assets = join(dist, "assets");
  mkdirSync(assets, { recursive: true });
  writeFileSync(
    join(dist, "index.html"),
    '<!doctype html><html><head><title>QuorumScope</title><script type="module" src="/assets/index.js"></script><link rel="stylesheet" href="/assets/index.css"></head><body><div id="root"></div></body></html>',
  );
  writeFileSync(join(assets, "index.js"), jsText);
  writeFileSync(join(assets, "index.css"), cssText);
  return root;
}
