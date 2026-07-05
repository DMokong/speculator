// Sigma (population standard deviation) statistics for the SPEC-050
// validation campaign (Task 1, R4/AC4). Given a `--runs` YAML file recording
// the judge dimension scores from N repeated shadow-gate runs of the same
// diff/spec, `sigmaStats` computes per-dimension mean/sigma plus the
// overall-score mean/sigma across those runs — the noise characterization
// the campaign's later studies (T2-T5) consume to judge whether an observed
// score delta is signal or scoring jitter.
//
// `overall` per run is always the existing `computeOverall` (the exact
// integer path, weights 30/30/25/15) imported from ./evidence — never a
// float re-derivation of the same weights.
//
// No LLM anywhere in this module: it only reads a YAML file and computes
// arithmetic — no model-vendor client, no outbound network call of any kind.

import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { argValue } from "./cli";
import { computeOverall } from "./evidence";

export interface RunsFile {
  runs: { dimensions: Record<string, number> }[];
}

const DIMENSION_KEYS = ["ac_coverage", "accuracy", "spec_fidelity", "scope_containment"] as const;
type DimensionKey = (typeof DIMENSION_KEYS)[number];

interface DimensionStats {
  scores: number[];
  mean: number;
  sigma: number;
}

interface OverallStats {
  values: number[];
  mean: number;
  sigma: number;
}

/**
 * Population mean and standard deviation (divide by N, not N-1) of `values`.
 * `sigma = sqrt(mean of squared deviations from the mean)` — the population
 * form, not the sample form (which would divide by N-1). Every study this
 * feeds treats a fixed set of repeated runs as the whole population under
 * test, not a sample drawn from a larger one.
 */
function meanAndSigma(values: number[]): { mean: number; sigma: number } {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const meanSquaredDeviation = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, sigma: Math.sqrt(meanSquaredDeviation) };
}

/**
 * Computes per-dimension and overall population mean/sigma across
 * `runsFile.runs`. Every run must carry exactly the four dimension keys
 * `ac_coverage`, `accuracy`, `spec_fidelity`, `scope_containment` — a run
 * missing any of them throws a clear error naming the run's index (0-based)
 * and the missing key(s), rather than silently computing statistics over a
 * partial or misaligned set of runs.
 *
 * Returns unrounded numbers throughout; rounding for display is the CLI's
 * job (see `round3Deep` below), not this function's.
 */
export function sigmaStats(runsFile: RunsFile): {
  per_dimension: Record<string, DimensionStats>;
  overall: OverallStats;
} {
  const dimsPerRun = runsFile.runs.map((run, i) => {
    const missing = DIMENSION_KEYS.filter((k) => !(k in run.dimensions));
    if (missing.length > 0) {
      throw new Error(
        `sigmaStats: run ${i} is missing dimension(s): ${missing.join(", ")} (every run must carry exactly ${DIMENSION_KEYS.join(", ")})`,
      );
    }
    const dims = {} as Record<DimensionKey, number>;
    for (const key of DIMENSION_KEYS) dims[key] = run.dimensions[key];
    return dims;
  });

  const per_dimension: Record<string, DimensionStats> = {};
  for (const key of DIMENSION_KEYS) {
    const scores = dimsPerRun.map((dims) => dims[key]);
    const { mean, sigma } = meanAndSigma(scores);
    per_dimension[key] = { scores, mean, sigma };
  }

  const values = dimsPerRun.map((dims) => computeOverall(dims));
  const { mean, sigma } = meanAndSigma(values);

  return { per_dimension, overall: { values, mean, sigma } };
}

/**
 * Recursively rounds every number leaf in `value` to 3 decimal places.
 * Display only: `sigmaStats` itself always returns unrounded numbers (see
 * its doc comment above) — this is what turns those into the CLI's printed
 * YAML block, and nothing else in this module ever calls it.
 */
function round3Deep(value: unknown): unknown {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(round3Deep);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, round3Deep(v)]));
  }
  return value;
}

export const CLI_USAGE = "bun asbuilt/src/sigma-stats.ts --runs <runs.yml>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const runsPath = argValue("--runs");

  if (!runsPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }

  try {
    const runsFile = parse(readFileSync(runsPath, "utf8")) as RunsFile;
    const stats = sigmaStats(runsFile);
    console.log(stringify(round3Deep(stats)));
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
