import { readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute, normalize, resolve } from "node:path";
import { analyzeScenario } from "./analyze";
import { summarizeWitness } from "./explanations";
import { assertValidScenario, validateScenario } from "./scenarioValidation";
import type { AnalysisResult, ProtocolName, Scenario } from "./types";

export const corpusManifestFileName = "corpus.manifest.json";

export type ExpectedVerdict = "linearizable" | "violation";
export type ExpectedViolationKind = "stale-read" | "no-sequentialization";

export interface CorpusProtocolExpectation {
  verdict: ExpectedVerdict;
  violationKind?: ExpectedViolationKind;
  unavailableOperations?: number;
  finalValue?: string;
}

export type CorpusIssueCode =
  | "fixture.validation"
  | "fixture.coverage"
  | "expectation.verdict"
  | "expectation.violation-kind"
  | "expectation.unavailable-operations"
  | "expectation.final-value";

export interface CorpusIssue {
  code: CorpusIssueCode;
  fixtureId: string;
  fixture: string;
  message: string;
  protocol?: ProtocolName;
  expected?: string | number;
  actual?: string | number;
}

export interface CorpusManifestEntry {
  id: string;
  title: string;
  fixture: string;
  scenarioType: string;
  protocols: ProtocolName[];
  expected: Partial<Record<ProtocolName, CorpusProtocolExpectation>>;
  notes?: string;
  tags: string[];
}

export interface CorpusManifest {
  version: 1;
  fixtures: CorpusManifestEntry[];
}

export interface CorpusProtocolResult {
  protocol: ProtocolName;
  expected: CorpusProtocolExpectation;
  verdict: ExpectedVerdict;
  violationKind?: ExpectedViolationKind;
  unavailableOperations: number;
  finalValue?: string;
  witnessSummary?: string;
  minimizedSteps?: number;
  mismatches: string[];
  issues: CorpusIssue[];
  analysis: AnalysisResult;
}

export interface CorpusFixtureResult {
  entry: CorpusManifestEntry;
  scenario: Scenario;
  scenarioHash: string;
  results: CorpusProtocolResult[];
  validationErrors: string[];
  issues: CorpusIssue[];
  ok: boolean;
}

export interface CorpusSummary {
  fixtures: number;
  expectedMatched: number;
  unsafeViolations: number;
  quorumViolations: number;
  quorumUnavailableOperations: number;
  mismatches: number;
}

export interface CorpusRunResult {
  manifestPath?: string;
  baseDir: string;
  manifest: CorpusManifest;
  fixtures: CorpusFixtureResult[];
  summary: CorpusSummary;
  claim: string;
  ok: boolean;
}

export interface RunCorpusOptions {
  manifestPath?: string;
  manifest?: CorpusManifest;
  baseDir?: string;
  checkFileCoverage?: boolean;
}

export function defaultCorpusManifestPath(): string {
  return resolve(process.cwd(), "examples", corpusManifestFileName);
}

export function loadCorpusManifest(manifestPath = defaultCorpusManifestPath()): CorpusManifest {
  const parsed = JSON.parse(readFileSync(manifestPath, "utf-8")) as unknown;
  assertValidCorpusManifest(parsed, manifestPath);
  return parsed;
}

export function validateCorpusManifest(value: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!isRecord(value)) {
    return { ok: false, errors: ["manifest must be an object"] };
  }
  if (value.version !== 1) {
    errors.push("manifest.version must be 1");
  }
  if (!Array.isArray(value.fixtures) || value.fixtures.length === 0) {
    errors.push("manifest.fixtures must be a non-empty array");
    return { ok: errors.length === 0, errors };
  }

  const seenIds = new Set<string>();
  const seenFixtures = new Set<string>();
  for (const [index, fixture] of value.fixtures.entries()) {
    const path = `manifest.fixtures[${index}]`;
    if (!isRecord(fixture)) {
      errors.push(`${path} must be an object`);
      continue;
    }
    const id = requireString(fixture, "id", path, errors);
    requireString(fixture, "title", path, errors);
    const file = requireString(fixture, "fixture", path, errors);
    requireString(fixture, "scenarioType", path, errors);
    validateStringArray(fixture.tags, `${path}.tags`, errors);
    if (typeof fixture.notes !== "undefined" && typeof fixture.notes !== "string") {
      errors.push(`${path}.notes must be a string when present`);
    }
    if (id) {
      if (seenIds.has(id)) {
        errors.push(`${path}.id duplicates ${id}`);
      }
      seenIds.add(id);
    }
    if (file) {
      if (isAbsolute(file) || normalize(file).startsWith("..")) {
        errors.push(`${path}.fixture must stay inside examples/`);
      }
      if (seenFixtures.has(file)) {
        errors.push(`${path}.fixture duplicates ${file}`);
      }
      seenFixtures.add(file);
    }

    const protocols = validateProtocols(fixture.protocols, `${path}.protocols`, errors);
    validateExpectations(fixture.expected, protocols, `${path}.expected`, errors);
  }

  return { ok: errors.length === 0, errors };
}

export function assertValidCorpusManifest(value: unknown, context = "manifest"): asserts value is CorpusManifest {
  const validation = validateCorpusManifest(value);
  if (!validation.ok) {
    throw new Error(`${context} is invalid:\n- ${validation.errors.join("\n- ")}`);
  }
}

export function runCorpus(options: RunCorpusOptions = {}): CorpusRunResult {
  const manifestPath = options.manifestPath ?? (options.manifest ? undefined : defaultCorpusManifestPath());
  const manifest = options.manifest ?? loadCorpusManifest(manifestPath);
  assertValidCorpusManifest(manifest, manifestPath ?? "provided manifest");
  const baseDir = options.baseDir ?? (manifestPath ? dirname(manifestPath) : resolve(process.cwd(), "examples"));
  const coverageErrors =
    options.checkFileCoverage === false ? [] : validateManifestFileCoverage(manifest, baseDir);

  const fixtures = manifest.fixtures.map((entry) => runCorpusEntry(entry, baseDir));
  if (coverageErrors.length > 0) {
    fixtures.push({
      entry: {
        id: "__manifest_coverage__",
        title: "Manifest coverage",
        fixture: corpusManifestFileName,
        scenarioType: "manifest",
        protocols: [],
        expected: {},
        notes: "Every public scenario JSON must be listed in the corpus manifest.",
        tags: ["manifest"],
      },
      scenario: emptyScenario(),
      scenarioHash: "",
      results: [],
      validationErrors: coverageErrors,
      issues: coverageErrors.map((message) =>
        makeIssue("fixture.coverage", "__manifest_coverage__", corpusManifestFileName, message),
      ),
      ok: false,
    });
  }

  const summary = summarizeCorpus(fixtures);
  return {
    manifestPath,
    baseDir,
    manifest,
    fixtures,
    summary,
    ok: summary.mismatches === 0 && fixtures.every((fixture) => fixture.validationErrors.length === 0),
    claim:
      "Corpus replay checks declared fixture expectations under the modeled assumptions; it is not exhaustive proof.",
  };
}

export function runCorpusEntry(entry: CorpusManifestEntry, baseDir = resolve(process.cwd(), "examples")): CorpusFixtureResult {
  const fixturePath = resolve(baseDir, entry.fixture);
  const parsed = JSON.parse(readFileSync(fixturePath, "utf-8")) as unknown;
  const validation = validateScenario(parsed);
  if (!validation.ok) {
    return {
      entry,
      scenario: emptyScenario(entry.id),
      scenarioHash: "",
      results: [],
      validationErrors: validation.errors,
      issues: validation.errors.map((message) =>
        makeIssue("fixture.validation", entry.id, entry.fixture, message),
      ),
      ok: false,
    };
  }
  assertValidScenario(parsed, entry.fixture);
  const scenario = parsed;
  const results = entry.protocols.map((protocol) =>
    evaluateProtocolExpectation(entry, protocol, scenario, mustGetExpectation(entry, protocol)),
  );
  return {
    entry,
    scenario,
    scenarioHash: hashScenario(scenario),
    results,
    validationErrors: [],
    issues: [],
    ok: results.every((result) => result.mismatches.length === 0),
  };
}

export function collectCorpusIssues(result: CorpusRunResult): CorpusIssue[] {
  return result.fixtures.flatMap((fixture) => [
    ...fixture.issues,
    ...fixture.results.flatMap((protocol) => protocol.issues),
  ]);
}

export function validateManifestFileCoverage(manifest: CorpusManifest, baseDir: string): string[] {
  const scenarioFiles = readdirSync(baseDir)
    .filter((file) => file.endsWith(".json") && file !== corpusManifestFileName)
    .sort((a, b) => a.localeCompare(b));
  const listed = manifest.fixtures.map((entry) => entry.fixture).sort((a, b) => a.localeCompare(b));
  const errors: string[] = [];
  for (const file of scenarioFiles) {
    if (!listed.includes(file)) {
      errors.push(`examples/${file} is not listed in ${corpusManifestFileName}`);
    }
  }
  for (const file of listed) {
    if (!scenarioFiles.includes(file)) {
      errors.push(`${corpusManifestFileName} lists missing fixture ${file}`);
    }
  }
  return errors;
}

function evaluateProtocolExpectation(
  entry: CorpusManifestEntry,
  protocol: ProtocolName,
  scenario: Scenario,
  expected: CorpusProtocolExpectation,
): CorpusProtocolResult {
  const analysis = analyzeScenario(scenario, protocol);
  const verdict: ExpectedVerdict = analysis.verdict.ok ? "linearizable" : "violation";
  const violationKind = analysis.verdict.witness?.type;
  const finalValue = analysis.verdict.finalValue;
  const unavailableOperations = analysis.metrics.unavailableOperations;
  const issues: CorpusIssue[] = [];

  if (expected.verdict !== verdict) {
    issues.push(
      makeIssue(
        "expectation.verdict",
        entry.id,
        entry.fixture,
        `expected ${expected.verdict}, got ${verdict}`,
        protocol,
        expected.verdict,
        verdict,
      ),
    );
  }
  if (expected.violationKind && expected.violationKind !== violationKind) {
    issues.push(
      makeIssue(
        "expectation.violation-kind",
        entry.id,
        entry.fixture,
        `expected ${expected.violationKind} witness, got ${violationKind ?? "none"}`,
        protocol,
        expected.violationKind,
        violationKind ?? "none",
      ),
    );
  }
  if (
    typeof expected.unavailableOperations === "number" &&
    expected.unavailableOperations !== unavailableOperations
  ) {
    issues.push(
      makeIssue(
        "expectation.unavailable-operations",
        entry.id,
        entry.fixture,
        `expected ${expected.unavailableOperations} unavailable operations, got ${unavailableOperations}`,
        protocol,
        expected.unavailableOperations,
        unavailableOperations,
      ),
    );
  }
  if (expected.finalValue && expected.finalValue !== finalValue) {
    issues.push(
      makeIssue(
        "expectation.final-value",
        entry.id,
        entry.fixture,
        `expected final linearized value ${expected.finalValue}, got ${finalValue ?? "none"}`,
        protocol,
        expected.finalValue,
        finalValue ?? "none",
      ),
    );
  }

  return {
    protocol,
    expected,
    verdict,
    violationKind,
    unavailableOperations,
    finalValue,
    witnessSummary: summarizeWitness(analysis.verdict.witness),
    minimizedSteps: analysis.minimizedFailure?.scenario.steps.length,
    mismatches: issues.map((issue) => issue.message),
    issues,
    analysis,
  };
}

function summarizeCorpus(fixtures: readonly CorpusFixtureResult[]): CorpusSummary {
  let unsafeViolations = 0;
  let quorumViolations = 0;
  let quorumUnavailableOperations = 0;
  let mismatches = 0;
  let expectedMatched = 0;

  for (const fixture of fixtures) {
    if (!fixture.ok || fixture.validationErrors.length > 0) {
      mismatches += fixture.validationErrors.length || 1;
    }
    for (const result of fixture.results) {
      mismatches += result.mismatches.length;
      if (result.mismatches.length === 0) {
        expectedMatched += 1;
      }
      if (result.protocol === "unsafe" && result.verdict === "violation") {
        unsafeViolations += 1;
      }
      if (result.protocol === "quorum") {
        if (result.verdict === "violation") {
          quorumViolations += 1;
        }
        quorumUnavailableOperations += result.unavailableOperations;
      }
    }
  }

  return {
    fixtures: fixtures.filter((fixture) => fixture.entry.id !== "__manifest_coverage__").length,
    expectedMatched,
    unsafeViolations,
    quorumViolations,
    quorumUnavailableOperations,
    mismatches,
  };
}

function mustGetExpectation(
  entry: CorpusManifestEntry,
  protocol: ProtocolName,
): CorpusProtocolExpectation {
  const expectation = entry.expected[protocol];
  if (!expectation) {
    throw new Error(`${entry.id} does not declare expected ${protocol} outcome`);
  }
  return expectation;
}

function validateExpectations(
  value: unknown,
  protocols: readonly ProtocolName[],
  path: string,
  errors: string[],
): void {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return;
  }
  for (const key of Object.keys(value)) {
    if (key !== "unsafe" && key !== "quorum") {
      errors.push(`${path}.${key} is not a supported protocol`);
    }
  }
  for (const protocol of protocols) {
    const expectation = value[protocol];
    const expectationPath = `${path}.${protocol}`;
    if (!isRecord(expectation)) {
      errors.push(`${expectationPath} must be an object`);
      continue;
    }
    if (expectation.verdict !== "linearizable" && expectation.verdict !== "violation") {
      errors.push(`${expectationPath}.verdict must be linearizable or violation`);
    }
    if (
      typeof expectation.violationKind !== "undefined" &&
      expectation.violationKind !== "stale-read" &&
      expectation.violationKind !== "no-sequentialization"
    ) {
      errors.push(`${expectationPath}.violationKind must be stale-read or no-sequentialization`);
    }
    if (expectation.verdict === "linearizable" && typeof expectation.violationKind !== "undefined") {
      errors.push(`${expectationPath}.violationKind is only valid for violation expectations`);
    }
    const unavailableOperations = expectation.unavailableOperations;
    if (
      typeof unavailableOperations !== "undefined" &&
      (!Number.isInteger(unavailableOperations) ||
        typeof unavailableOperations !== "number" ||
        unavailableOperations < 0)
    ) {
      errors.push(`${expectationPath}.unavailableOperations must be a non-negative integer`);
    }
    if (typeof expectation.finalValue !== "undefined" && typeof expectation.finalValue !== "string") {
      errors.push(`${expectationPath}.finalValue must be a string when present`);
    }
  }
}

function validateProtocols(value: unknown, path: string, errors: string[]): ProtocolName[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty protocol array`);
    return [];
  }
  const protocols: ProtocolName[] = [];
  const seen = new Set<string>();
  for (const [index, protocol] of value.entries()) {
    if (protocol !== "unsafe" && protocol !== "quorum") {
      errors.push(`${path}[${index}] must be unsafe or quorum`);
      continue;
    }
    if (seen.has(protocol)) {
      errors.push(`${path} duplicates ${protocol}`);
    }
    seen.add(protocol);
    protocols.push(protocol);
  }
  return protocols;
}

function validateStringArray(value: unknown, path: string, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must be a non-empty string array`);
    return;
  }
  for (const [index, item] of value.entries()) {
    if (typeof item !== "string" || item.length === 0) {
      errors.push(`${path}[${index}] must be a non-empty string`);
    }
  }
}

function requireString(
  value: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
): string | undefined {
  const field = value[key];
  if (typeof field !== "string" || field.length === 0) {
    errors.push(`${path}.${key} must be a non-empty string`);
    return undefined;
  }
  return field;
}

function hashScenario(scenario: Scenario): string {
  return createHash("sha256").update(JSON.stringify(scenario)).digest("hex").slice(0, 12);
}

function emptyScenario(id = "invalid"): Scenario {
  return {
    id,
    name: "Invalid fixture",
    description: "Invalid fixture placeholder",
    seed: 0,
    initialValue: "v0",
    nodes: ["n1"],
    steps: [],
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function makeIssue(
  code: CorpusIssueCode,
  fixtureId: string,
  fixture: string,
  message: string,
  protocol?: ProtocolName,
  expected?: string | number,
  actual?: string | number,
): CorpusIssue {
  return {
    code,
    fixtureId,
    fixture,
    message,
    protocol,
    expected,
    actual,
  };
}

export function fixtureDisplayName(entry: CorpusManifestEntry): string {
  return `${entry.id} :: ${entry.title}`;
}

export function fixtureBasename(entry: CorpusManifestEntry): string {
  return basename(entry.fixture, ".json");
}
