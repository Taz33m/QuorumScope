import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface UiSmokeCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export interface UiSmokeResult {
  distDir: string;
  jsAssets: string[];
  cssAssets: string[];
  checks: UiSmokeCheck[];
}

export function evaluateBuiltUiSmoke(rootDir = process.cwd()): UiSmokeResult {
  const distDir = join(rootDir, "dist");
  const indexPath = join(distDir, "index.html");
  const assetsDir = join(distDir, "assets");
  const indexHtml = existsSync(indexPath) ? readFileSync(indexPath, "utf-8") : "";
  const assets = existsSync(assetsDir) ? readdirSync(assetsDir).sort() : [];
  const jsAssets = assets.filter((asset) => asset.endsWith(".js"));
  const cssAssets = assets.filter((asset) => asset.endsWith(".css"));
  const jsText = jsAssets.map((asset) => readFileSync(join(assetsDir, asset), "utf-8")).join("\n");
  const cssText = cssAssets.map((asset) => readFileSync(join(assetsDir, asset), "utf-8")).join("\n");

  const requiredJsSurfaces = [
    "QuorumScope",
    "Deterministic distributed-systems fault lab",
    "Adversarial Search",
    "Oracle Trace",
    "Protocol comparison",
    "Operations",
    "Trace",
    "Benchmark",
    "Load Failure",
  ];
  const requiredCssSelectors = [
    ".network-map",
    ".search-panel",
    ".oracle-panel",
    ".candidate-chip",
    ".operation-row",
    ".event-row",
  ];

  return {
    distDir,
    jsAssets,
    cssAssets,
    checks: [
      {
        name: "index.html exists",
        ok: indexHtml.length > 0,
        detail: "Vite emitted dist/index.html",
      },
      {
        name: "root mount exists",
        ok: indexHtml.includes('<div id="root"></div>'),
        detail: "React mount point is present",
      },
      {
        name: "title is QuorumScope",
        ok: indexHtml.includes("<title>QuorumScope</title>"),
        detail: "Browser title identifies the workbench",
      },
      {
        name: "javascript bundle exists",
        ok: jsAssets.length > 0,
        detail: `${jsAssets.length} JS asset(s) found`,
      },
      {
        name: "stylesheet bundle exists",
        ok: cssAssets.length > 0,
        detail: `${cssAssets.length} CSS asset(s) found`,
      },
      ...requiredJsSurfaces.map((surface) => ({
        name: `surface: ${surface}`,
        ok: jsText.includes(surface),
        detail: "Built UI bundle exposes this workbench surface",
      })),
      ...requiredCssSelectors.map((selector) => ({
        name: `style: ${selector}`,
        ok: cssText.includes(selector),
        detail: "Built CSS contains expected workbench styling",
      })),
    ],
  };
}

export function summarizeUiSmoke(result: UiSmokeResult): { passed: number; failed: number } {
  const passed = result.checks.filter((check) => check.ok).length;
  return {
    passed,
    failed: result.checks.length - passed,
  };
}
