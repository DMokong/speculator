// Shadow evidence assembler for the As-Built Knowledge System (SPEC-048, AC6/AC8).
//
// Deterministically merges the generator artifact + mechanical report
// (check.ts, Task 6) + blinded judge scores into gate-2c-asbuilt.yml. This is
// where the blinding contract is mechanically enforced: the judge's YAML
// input may not carry a `threshold` or `result` key anywhere in its object
// tree, and the final pass/fail decision is always stamped
// `result_stamped_by: invoker` — never self-stamped by the judge — with an
// `overall` that anyone can reproduce from the recorded weights and
// dimension scores (AC6).
//
// Also implements the graph-unavailable degraded path (AC8): when the graph
// extraction that produces the mechanical report failed, the mechanical
// veto is skipped rather than silently treated as passed, the report body
// becomes `{ skipped: true }`, and a `graph_unavailable` advisory flag is
// added so the degradation is visible on the evidence artifact itself.
//
// No LLM anywhere in this module: it only reads its own inputs (the
// generator artifact's path, a mechanical-report JSON file, a judge YAML
// file, and the graph manifest) and writes YAML — no model-vendor client,
// no outbound network call of any kind.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { parse, stringify } from "yaml";
import type { MechanicalReport } from "./check";
import { argValue, hasFlag } from "./cli";
import { loadManifest, manifestHash } from "./manifest";

const WEIGHTS = {
  ac_coverage: 0.3,
  accuracy: 0.3,
  spec_fidelity: 0.25,
  scope_containment: 0.15,
} as const;

const DIMENSION_KEYS = ["ac_coverage", "accuracy", "spec_fidelity", "scope_containment"] as const;
type DimensionKey = (typeof DIMENSION_KEYS)[number];
type Dimensions = Record<DimensionKey, number>;

const JUDGE_TOP_LEVEL_KEYS = new Set(["dimensions", "flags", "reasoning"]);
const JUDGE_FLAGS_KEYS = new Set(["blocking", "recommended", "advisory"]);

export interface AssembleOptions {
  artifactPath: string;
  mechanicalPath?: string;
  graphUnavailable?: true;
  judgePath: string;
  specId: string;
  diffRange: string;
  manifestPath?: string;
  threshold: number;
  perDimensionMinimum: number;
  generatorModel: string;
  judgeModel: string;
  outPath: string;
}

interface JudgeFlags {
  blocking: string[];
  recommended: string[];
  advisory: string[];
}

interface ParsedJudge {
  dimensions: Dimensions;
  flags: JudgeFlags;
  reasoning: Record<string, unknown>;
}

/**
 * Rounds `x` to 1 decimal place, half-up (7.45 -> 7.5, never banker's
 * rounding): `Math.floor(x * 10 + 0.5) / 10`. This is exact when `x` is a
 * plain decimal value handed to it directly (as in the unit tests below),
 * but it is NOT safe to feed it the raw result of summing several
 * `weight * dimension` float products — that sum can itself land a hair off
 * the true value (e.g. 2.4499999999999997 instead of the exact 2.45), and
 * the `+ 0.5` fudge does not reliably absorb that noise; it can still round
 * the wrong way across a `.5` boundary. The `overall` score is computed via
 * `computeOverall`, which never goes through float summation at all — see
 * its docstring.
 */
export function roundHalfUp1(x: number): number {
  return Math.floor(x * 10 + 0.5) / 10;
}

/**
 * Integer form of `WEIGHTS`, scaled by 100 (30, 30, 25, 15). Asserted equal
 * to `WEIGHTS * 100` immediately below at module load, so the two
 * representations of the weights can never silently drift apart.
 */
const WEIGHTS_X100: Record<DimensionKey, number> = {
  ac_coverage: 30,
  accuracy: 30,
  spec_fidelity: 25,
  scope_containment: 15,
};

for (const key of DIMENSION_KEYS) {
  if (WEIGHTS_X100[key] !== WEIGHTS[key] * 100) {
    throw new Error(
      `WEIGHTS_X100.${key} (${WEIGHTS_X100[key]}) does not match WEIGHTS.${key} * 100 (${WEIGHTS[key] * 100})`,
    );
  }
}

/**
 * Computes the recorded `overall` score from the four judge dimensions using
 * exact integer arithmetic — never IEEE754 float summation. Every weight is
 * an exact multiple of 0.05, so scaling the whole expression by 100 turns
 * the weighted sum into a plain integer: `S = 30*ac_coverage +
 * 30*accuracy + 25*spec_fidelity + 15*scope_containment`, always a whole
 * number in [100, 1000] for dimensions in [1,10]. Rounding `S / 10` to one
 * decimal place, half-up, is then just integer arithmetic:
 * `tenths = Math.floor((S + 5) / 10)`, `overall = tenths / 10`. This
 * sidesteps the float-summation bug where `WEIGHTS.key * dims.key` terms
 * summed as floats can land a hair below the true value (e.g.
 * 2.4499999999999997 instead of the exact 2.45) and get rounded down across
 * a `.5` threshold boundary — dims `{1,2,5,2}` is the canonical repro: the
 * exact weighted sum is 2.45 (rounds to 2.5), but naive float summation
 * yields 2.4499999999999997 (rounds to 2.4).
 */
export function computeOverall(dims: Dimensions): number {
  const scaled =
    WEIGHTS_X100.ac_coverage * dims.ac_coverage +
    WEIGHTS_X100.accuracy * dims.accuracy +
    WEIGHTS_X100.spec_fidelity * dims.spec_fidelity +
    WEIGHTS_X100.scope_containment * dims.scope_containment;
  const tenths = Math.floor((scaled + 5) / 10);
  return tenths / 10;
}

/**
 * Walks `value`'s full object tree (including arrays and nested objects),
 * throwing the blinding-contract error the moment a key literally named
 * `threshold` or `result` is found at ANY nesting level — not just the top
 * level. This is what makes blinding mechanical rather than a matter of
 * trusting the judge not to peek: a judge file that stamps either key,
 * anywhere, is rejected outright (AC6).
 */
function assertNoStampedKeys(value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    value.forEach((item, i) => assertNoStampedKeys(item, `${path}[${i}]`));
    return;
  }
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    if (key === "threshold" || key === "result") {
      throw new Error(`judge file must not stamp threshold/result (found key "${key}" at ${path}.${key})`);
    }
    assertNoStampedKeys(val, `${path}.${key}`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parses and validates the judge YAML file at `judgePath` against the exact
 * accepted contract: top-level keys are EXACTLY `dimensions` (4 integers
 * 1-10), `flags` (optional; blocking/recommended/advisory arrays, missing ->
 * empty), and `reasoning` (optional; free-form object, missing -> empty).
 * Throws a clear error for any contract violation, including the blinding
 * check performed first via `assertNoStampedKeys`.
 */
function parseJudgeFile(judgePath: string): ParsedJudge {
  const text = readFileSync(judgePath, "utf8");
  const parsed: unknown = parse(text);

  if (!isPlainObject(parsed)) {
    throw new Error(`judge file at ${judgePath} must parse to a YAML mapping`);
  }

  // Blinding contract first, before anything else: a stamped file is
  // rejected outright regardless of what else it contains.
  assertNoStampedKeys(parsed, "judge");

  const extraTopLevelKeys = Object.keys(parsed).filter((k) => !JUDGE_TOP_LEVEL_KEYS.has(k));
  if (extraTopLevelKeys.length > 0) {
    throw new Error(
      `judge file has unexpected top-level key(s): ${extraTopLevelKeys.join(", ")} (accepted: dimensions, flags, reasoning)`,
    );
  }

  const dimensionsRaw = parsed.dimensions;
  if (!isPlainObject(dimensionsRaw)) {
    throw new Error("judge file must have a 'dimensions' object");
  }
  const dimensionKeys = Object.keys(dimensionsRaw);
  const missingDims = DIMENSION_KEYS.filter((k) => !(k in dimensionsRaw));
  const extraDims = dimensionKeys.filter((k) => !(DIMENSION_KEYS as readonly string[]).includes(k));
  if (missingDims.length > 0 || extraDims.length > 0) {
    throw new Error(
      `judge file dimensions must have exactly ${DIMENSION_KEYS.join(", ")} (missing: ${
        missingDims.join(", ") || "none"
      }; extra: ${extraDims.join(", ") || "none"})`,
    );
  }
  const dimensions = {} as Dimensions;
  for (const key of DIMENSION_KEYS) {
    const value = dimensionsRaw[key];
    if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 10) {
      throw new Error(`judge file dimension '${key}' must be an integer 1-10 (got: ${JSON.stringify(value)})`);
    }
    dimensions[key] = value;
  }

  const flagsRaw = parsed.flags;
  const flags: JudgeFlags = { blocking: [], recommended: [], advisory: [] };
  if (flagsRaw !== undefined) {
    if (!isPlainObject(flagsRaw)) {
      throw new Error("judge file 'flags' must be an object");
    }
    const flagsExtraKeys = Object.keys(flagsRaw).filter((k) => !JUDGE_FLAGS_KEYS.has(k));
    if (flagsExtraKeys.length > 0) {
      throw new Error(`judge file 'flags' has unexpected key(s): ${flagsExtraKeys.join(", ")}`);
    }
    for (const key of ["blocking", "recommended", "advisory"] as const) {
      const value = flagsRaw[key];
      if (value === undefined) continue;
      if (!Array.isArray(value)) {
        throw new Error(`judge file 'flags.${key}' must be an array`);
      }
      flags[key] = value as string[];
    }
  }

  const reasoningRaw = parsed.reasoning;
  const reasoning: Record<string, unknown> = reasoningRaw === undefined ? {} : isPlainObject(reasoningRaw) ? reasoningRaw : (() => {
    throw new Error("judge file 'reasoning' must be an object");
  })();

  return { dimensions, flags, reasoning };
}

/** Renders every mechanical blocking finding (symbol_exists, span_valid) as a flags.blocking string. */
function renderMechanicalBlockingFlags(report: MechanicalReport): string[] {
  const out: string[] = [];
  for (const f of report.symbol_exists) {
    out.push(`mechanical:symbol_exists: ${f.entry} cites ${f.symbol} (symbol not found in graph manifest)`);
  }
  for (const f of report.span_valid) {
    out.push(`mechanical:span_valid: ${f.entry} cites ${f.symbol} (cited ${f.cited}, actual ${f.actual})`);
  }
  return out;
}

/** Renders unexplained_computed entries as advisory strings — only produces entries when the list is non-empty. */
function renderUnexplainedAdvisories(report: MechanicalReport): string[] {
  return report.unexplained_computed.map((symbol) => `mechanical:unexplained: ${symbol}`);
}

/**
 * Assembles the gate-2c-asbuilt.yml evidence object from the generator
 * artifact, mechanical report (or the AC8 graph-unavailable degraded path),
 * and blinded judge scores. Pure function: no CLI side effects (no
 * `console`, no `process.exit`) — contract violations in the judge file are
 * reported by throwing, so callers (including the CLI entry guard below)
 * decide how to surface them.
 */
export function assembleEvidence(opts: AssembleOptions): {
  evidence: Record<string, unknown>;
  result: "pass" | "fail";
} {
  const judge = parseJudgeFile(opts.judgePath);
  const graphUnavailable = opts.graphUnavailable === true;

  let mechanical: MechanicalReport | { skipped: true };
  let mechanicalBlocking: boolean;
  let mechanicalBlockingFlags: string[];
  let unexplainedAdvisories: string[];

  if (graphUnavailable) {
    mechanical = { skipped: true };
    mechanicalBlocking = false; // AC8: the mechanical veto is skipped entirely, never silently "passed".
    mechanicalBlockingFlags = [];
    unexplainedAdvisories = [];
  } else {
    if (opts.mechanicalPath === undefined) {
      throw new Error("assembleEvidence: mechanicalPath is required unless graphUnavailable is set");
    }
    const report = JSON.parse(readFileSync(opts.mechanicalPath, "utf8")) as MechanicalReport;
    mechanical = report;
    mechanicalBlocking = report.blocking;
    mechanicalBlockingFlags = renderMechanicalBlockingFlags(report);
    unexplainedAdvisories = renderUnexplainedAdvisories(report);
  }

  // AC8: a degraded record must never carry a manifest hash, even if a
  // --manifest path was still supplied (that manifest is necessarily stale —
  // the graph extraction it would have come from is the thing that failed).
  // graphUnavailable therefore forces this to null unconditionally, before
  // opts.manifestPath is even inspected.
  let graphManifestHash: string | null;
  if (graphUnavailable) {
    graphManifestHash = null;
  } else if (opts.manifestPath === undefined) {
    throw new Error("assembleEvidence: manifestPath is required unless graphUnavailable is set");
  } else {
    graphManifestHash = manifestHash(loadManifest(opts.manifestPath));
  }

  const overall = computeOverall(judge.dimensions);

  const anyDimensionBelowMinimum = DIMENSION_KEYS.some((k) => judge.dimensions[k] < opts.perDimensionMinimum);
  const result: "pass" | "fail" =
    mechanicalBlocking || anyDimensionBelowMinimum || overall < opts.threshold ? "fail" : "pass";

  const flags: JudgeFlags = {
    blocking: [...judge.flags.blocking, ...mechanicalBlockingFlags],
    recommended: [...judge.flags.recommended],
    advisory: [...judge.flags.advisory, ...unexplainedAdvisories, ...(graphUnavailable ? ["graph_unavailable"] : [])],
  };

  const generatorArtifact = relative(dirname(opts.outPath), opts.artifactPath);

  const evidence: Record<string, unknown> = {
    gate: "comprehension-asbuilt",
    spec_id: opts.specId,
    diff_range: opts.diffRange,
    graph_manifest_hash: graphManifestHash,
    mode: "shadow",
    mechanical,
    generator: { model: opts.generatorModel, artifact: generatorArtifact },
    judge: { model: opts.judgeModel, dispatch_record: "judge-dispatch.md", blinded: true },
    weights: WEIGHTS,
    dimensions: judge.dimensions,
    overall,
    threshold: opts.threshold,
    per_dimension_minimum: opts.perDimensionMinimum,
    result,
    result_stamped_by: "invoker",
    flags,
    reasoning: judge.reasoning,
  };

  if (graphUnavailable) {
    evidence.graph_unavailable = true;
  }

  return { evidence, result };
}

export const CLI_USAGE =
  "bun asbuilt/src/evidence.ts --artifact <p> (--mechanical <p.json> | --graph-unavailable) --judge <p.yml> --spec-id SPEC-NNN --diff-range <r> [--manifest <p>] --threshold <n> --per-dimension-minimum <n> --generator-model <s> --judge-model <s> --out <p>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const artifactPath = argValue("--artifact");
  const mechanicalPath = argValue("--mechanical");
  const graphUnavailableFlag = hasFlag("--graph-unavailable");
  const judgePath = argValue("--judge");
  const specId = argValue("--spec-id");
  const diffRange = argValue("--diff-range");
  const manifestPath = argValue("--manifest");
  const thresholdRaw = argValue("--threshold");
  const perDimensionMinimumRaw = argValue("--per-dimension-minimum");
  const generatorModel = argValue("--generator-model");
  const judgeModel = argValue("--judge-model");
  const outPath = argValue("--out");

  if (
    !artifactPath ||
    !judgePath ||
    !specId ||
    !diffRange ||
    !thresholdRaw ||
    !perDimensionMinimumRaw ||
    !generatorModel ||
    !judgeModel ||
    !outPath ||
    (!graphUnavailableFlag && !mechanicalPath)
  ) {
    console.error(CLI_USAGE);
    console.error("  Note: --manifest is ignored under --graph-unavailable — graph_manifest_hash is always written null.");
    console.error("  Exit codes: 0 = evidence assembled (see stdout for result=pass|fail); 2 = usage or contract error.");
    process.exit(2);
  }

  const opts: AssembleOptions = {
    artifactPath,
    judgePath,
    specId,
    diffRange,
    threshold: Number(thresholdRaw),
    perDimensionMinimum: Number(perDimensionMinimumRaw),
    generatorModel,
    judgeModel,
    outPath,
    ...(manifestPath !== undefined ? { manifestPath } : {}),
    ...(graphUnavailableFlag ? { graphUnavailable: true as const } : { mechanicalPath }),
  };

  try {
    const { evidence, result } = assembleEvidence(opts);
    mkdirSync(dirname(outPath), { recursive: true });
    const yamlText = stringify(evidence);
    writeFileSync(outPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`);
    // Exit 0 means "evidence was assembled" — pass/fail is a property of the
    // recorded evidence (see stdout), not of the CLI invocation. Only an
    // assembler/contract error (blinding violation, invalid dims, unreadable
    // input) exits non-zero, via the catch below.
    console.log(`Wrote ${outPath} (result=${result})`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
