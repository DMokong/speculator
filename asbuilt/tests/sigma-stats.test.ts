// Tests for sigma-stats.ts (SPEC-050 Task 1, R4/AC4). Hand-computed
// population-sigma fixtures per the task brief, plus a CLI round-trip
// verifying the printed YAML block rounds display values to 3 decimals
// while sigmaStats() itself stays unrounded.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { computeOverall } from "../src/evidence";
import { CLI_USAGE, type RunsFile, sigmaStats } from "../src/sigma-stats";

const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeYaml(dir: string, name: string, text: string): string {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

/** Builds a RunsFile from a list of per-run dimension maps. */
function runsFileWith(dims: Record<string, number>[]): RunsFile {
  return { runs: dims.map((dimensions) => ({ dimensions })) };
}

describe("sigmaStats: population sigma (divide by N)", () => {
  test("brief's hand-computed example: accuracy [8,8,7,8,9] -> mean 8.0, sigma sqrt(0.4) ~= 0.632", () => {
    // ac_coverage/spec_fidelity/scope_containment held constant across the
    // five runs so this fixture isolates the accuracy column against the
    // brief's normative worked example; each is independently zero-variance.
    const runs = runsFileWith([
      { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 },
      { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 },
      { ac_coverage: 8, accuracy: 7, spec_fidelity: 7, scope_containment: 8 },
      { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 },
      { ac_coverage: 8, accuracy: 9, spec_fidelity: 7, scope_containment: 8 },
    ]);

    const stats = sigmaStats(runs);

    expect(stats.per_dimension.accuracy.scores).toEqual([8, 8, 7, 8, 9]);
    expect(stats.per_dimension.accuracy.mean).toBe(8);
    // sqrt(((0)+(0)+(1)+(0)+(1))/5) = sqrt(0.4) -- the brief's normative value.
    expect(stats.per_dimension.accuracy.sigma).toBeCloseTo(Math.sqrt(0.4), 12);
    expect(stats.per_dimension.accuracy.sigma).toBeCloseTo(0.6324555320336759, 12);

    expect(stats.per_dimension.ac_coverage.sigma).toBe(0);
    expect(stats.per_dimension.spec_fidelity.sigma).toBe(0);
    expect(stats.per_dimension.scope_containment.sigma).toBe(0);
  });

  test("4-dim 5-run fixture: hand-derived per-dimension and overall mean/sigma", () => {
    const runs = runsFileWith([
      { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 },
      { ac_coverage: 7, accuracy: 6, spec_fidelity: 8, scope_containment: 9 },
      { ac_coverage: 9, accuracy: 10, spec_fidelity: 6, scope_containment: 7 },
      { ac_coverage: 6, accuracy: 7, spec_fidelity: 9, scope_containment: 8 },
      { ac_coverage: 10, accuracy: 9, spec_fidelity: 5, scope_containment: 8 },
    ]);

    const stats = sigmaStats(runs);

    // Each column: mean 8/8/7/8, deviations {0,-1,1,-2,2} up to relabeling for
    // ac_coverage/accuracy/spec_fidelity (squared-deviation sum 10, mean-sq-dev
    // 2.0, sigma sqrt(2)); scope_containment deviations {0,1,-1,0,0} (squared
    // sum 2, mean-sq-dev 0.4, sigma sqrt(0.4)).
    expect(stats.per_dimension.ac_coverage.mean).toBe(8);
    expect(stats.per_dimension.ac_coverage.sigma).toBeCloseTo(Math.sqrt(2), 12);
    expect(stats.per_dimension.accuracy.mean).toBe(8);
    expect(stats.per_dimension.accuracy.sigma).toBeCloseTo(Math.sqrt(2), 12);
    expect(stats.per_dimension.spec_fidelity.mean).toBe(7);
    expect(stats.per_dimension.spec_fidelity.sigma).toBeCloseTo(Math.sqrt(2), 12);
    expect(stats.per_dimension.scope_containment.mean).toBe(8);
    expect(stats.per_dimension.scope_containment.sigma).toBeCloseTo(Math.sqrt(0.4), 12);

    // Overall per run via computeOverall (exact integer path, weights
    // 30/30/25/15):
    //   run0: 30*8+30*8+25*7+15*8=775 -> tenths floor(780/10)=78 -> 7.8
    //   run1: 30*7+30*6+25*8+15*9=725 -> floor(730/10)=73 -> 7.3
    //   run2: 30*9+30*10+25*6+15*7=825 -> floor(830/10)=83 -> 8.3
    //   run3: 30*6+30*7+25*9+15*8=735 -> floor(740/10)=74 -> 7.4
    //   run4: 30*10+30*9+25*5+15*8=815 -> floor(820/10)=82 -> 8.2
    // mean = 39.0/5 = 7.8; deviations {0,-0.5,0.5,-0.4,0.4}, squared sum 0.82,
    // mean-sq-dev 0.164, sigma sqrt(0.164).
    const expectedOverall = [7.8, 7.3, 8.3, 7.4, 8.2];
    expect(stats.overall.values).toEqual(expectedOverall);
    expect(stats.overall.values).toEqual(
      runs.runs.map((r) =>
        computeOverall(
          r.dimensions as Record<"ac_coverage" | "accuracy" | "spec_fidelity" | "scope_containment", number>,
        ),
      ),
    );
    expect(stats.overall.mean).toBeCloseTo(7.8, 12);
    expect(stats.overall.sigma).toBeCloseTo(Math.sqrt(0.164), 12);
  });

  test("zero-variance run set: identical dimensions across all runs -> sigma 0 everywhere", () => {
    const identical = { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 };
    const runs = runsFileWith([identical, identical, identical, identical, identical]);

    const stats = sigmaStats(runs);

    for (const key of ["ac_coverage", "accuracy", "spec_fidelity", "scope_containment"] as const) {
      expect(stats.per_dimension[key].sigma).toBe(0);
      expect(stats.per_dimension[key].mean).toBe(identical[key]);
    }
    expect(stats.overall.sigma).toBe(0);
    expect(stats.overall.values).toEqual([7.8, 7.8, 7.8, 7.8, 7.8]);
    expect(stats.overall.mean).toBe(computeOverall(identical));
  });

  test("errors clearly when a run is missing a required dimension", () => {
    const runs: RunsFile = {
      runs: [
        { dimensions: { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 } },
        { dimensions: { ac_coverage: 8, accuracy: 8, spec_fidelity: 7 } }, // missing scope_containment
      ],
    };

    expect(() => sigmaStats(runs)).toThrow(/run 1 is missing dimension\(s\): scope_containment/);
  });

  test("errors naming every missing dimension when more than one is absent", () => {
    const runs: RunsFile = { runs: [{ dimensions: { ac_coverage: 8, accuracy: 8 } }] };

    expect(() => sigmaStats(runs)).toThrow(/spec_fidelity, scope_containment/);
  });
});

describe("CLI: bun src/sigma-stats.ts", () => {
  function spawn(args: string[]) {
    return Bun.spawnSync(["bun", "src/sigma-stats.ts", ...args], { cwd: ASBUILT_ROOT });
  }

  test("prints a YAML stats block to stdout, values rounded to 3 decimals for display", () => {
    const dir = makeTmpDir("asbuilt-sigma-stats-cli-");
    const runsYaml = [
      "runs:",
      "  - dimensions: { ac_coverage: 8, accuracy: 8, spec_fidelity: 7, scope_containment: 8 }",
      "  - dimensions: { ac_coverage: 7, accuracy: 6, spec_fidelity: 8, scope_containment: 9 }",
      "  - dimensions: { ac_coverage: 9, accuracy: 10, spec_fidelity: 6, scope_containment: 7 }",
      "  - dimensions: { ac_coverage: 6, accuracy: 7, spec_fidelity: 9, scope_containment: 8 }",
      "  - dimensions: { ac_coverage: 10, accuracy: 9, spec_fidelity: 5, scope_containment: 8 }",
      "",
    ].join("\n");
    const runsPath = writeYaml(dir, "runs.yml", runsYaml);

    const result = spawn(["--runs", runsPath]);

    expect(result.exitCode).toBe(0);
    const printed = parse(result.stdout.toString("utf8"));
    // sqrt(2) rounded to 3dp for display -- coincidentally close to
    // Math.SQRT2, but it is NOT that constant: it's the CLI's rounded
    // *display* value, and asserting the full-precision constant here would
    // fail (the CLI always rounds to 3 decimals before printing).
    // biome-ignore lint/suspicious/noApproximativeNumericConstant: see comment above -- this is a rounded display value, not an approximation of Math.SQRT2.
    const sqrt2Rounded = 1.414;
    expect(printed.per_dimension.ac_coverage.sigma).toBe(sqrt2Rounded);
    expect(printed.per_dimension.accuracy.sigma).toBe(sqrt2Rounded);
    expect(printed.per_dimension.spec_fidelity.sigma).toBe(sqrt2Rounded);
    expect(printed.per_dimension.scope_containment.sigma).toBe(0.632);
    expect(printed.overall.mean).toBe(7.8);
    expect(printed.overall.sigma).toBe(0.405);
    // Display rounding never touches the raw per-run scores/values.
    expect(printed.overall.values).toEqual([7.8, 7.3, 8.3, 7.4, 8.2]);
  });

  test("missing --runs flag prints CLI_USAGE to stderr and exits non-zero", () => {
    const result = spawn([]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString("utf8")).toContain(CLI_USAGE);
  });

  test("a run missing a dimension exits non-zero with a clear stderr message", () => {
    const dir = makeTmpDir("asbuilt-sigma-stats-cli-bad-");
    const runsPath = writeYaml(
      dir,
      "runs.yml",
      ["runs:", "  - dimensions: { ac_coverage: 8, accuracy: 8, spec_fidelity: 7 }", ""].join("\n"),
    );

    const result = spawn(["--runs", runsPath]);

    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.toString("utf8")).toContain("scope_containment");
  });
});

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
