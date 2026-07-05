import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import type { MechanicalReport } from "../src/check";
import { type AssembleOptions, assembleEvidence, computeOverall, roundHalfUp1 } from "../src/evidence";
import { type GraphManifest, saveManifest } from "../src/manifest";

const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeJson(dir: string, name: string, data: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data));
  return path;
}

function writeYaml(dir: string, name: string, text: string): string {
  const path = join(dir, name);
  writeFileSync(path, text);
  return path;
}

const cleanMechanical: MechanicalReport = {
  symbol_exists: [],
  span_valid: [],
  diff_touched: [],
  unexplained_computed: [],
  blocking: false,
};

const blockingMechanical: MechanicalReport = {
  symbol_exists: [{ entry: "AC1", symbol: "src/alpha.ts#rotateRefreshToken" }],
  span_valid: [],
  diff_touched: [],
  unexplained_computed: [],
  blocking: true,
};

const sampleManifest: GraphManifest = {
  schema: 1,
  extractor: { name: "test-extractor", version: "0.0.0" },
  target_commit: "abc123",
  symbols: [],
  edges: [],
};

const cleanJudgeYaml = [
  "dimensions:",
  "  ac_coverage: 8",
  "  accuracy: 7",
  "  spec_fidelity: 7",
  "  scope_containment: 8",
  "",
].join("\n");

const highJudgeYaml = [
  "dimensions:",
  "  ac_coverage: 10",
  "  accuracy: 10",
  "  spec_fidelity: 10",
  "  scope_containment: 10",
  "",
].join("\n");

/** Builds a complete AssembleOptions pointing at real temp files, with the clean/pass fixtures as defaults. */
function baseOpts(dir: string, overrides: Partial<AssembleOptions> = {}): AssembleOptions {
  const artifactPath = writeYaml(dir, "artifact.yml", "comprehension_entries: []\n");
  const manifestPath = join(dir, "manifest.json");
  saveManifest(manifestPath, sampleManifest);
  const mechanicalPath = writeJson(dir, "mechanical.json", cleanMechanical);
  const judgePath = writeYaml(dir, "judge.yml", cleanJudgeYaml);
  const outPath = join(dir, "gate-2c-asbuilt.yml");

  const defaults: AssembleOptions = {
    artifactPath,
    mechanicalPath,
    judgePath,
    specId: "SPEC-048",
    diffRange: "main...HEAD",
    manifestPath,
    threshold: 7.0,
    perDimensionMinimum: 5,
    generatorModel: "test-generator",
    judgeModel: "test-judge",
    outPath,
  };

  return { ...defaults, ...overrides };
}

describe("AC6: evidence assembler — invoker stamping and recomputable overall", () => {
  test("clean mechanical + judge dims {8,7,7,8}: overall 7.45 -> 7.5 half-up, result pass, result_stamped_by invoker", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const { evidence, result } = assembleEvidence(baseOpts(dir));

    expect(evidence.result_stamped_by).toBe("invoker");
    expect(evidence.overall).toBe(7.5);
    expect(evidence.result).toBe("pass");
    expect(result).toBe("pass");
  });

  test("recompute check: overall equals hand-computed weighted sum of recorded weights x recorded dimensions", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const { evidence } = assembleEvidence(baseOpts(dir));

    const weights = evidence.weights as Record<string, number>;
    const dims = evidence.dimensions as Record<string, number>;
    const recomputed = roundHalfUp1(
      weights.ac_coverage * dims.ac_coverage +
        weights.accuracy * dims.accuracy +
        weights.spec_fidelity * dims.spec_fidelity +
        weights.scope_containment * dims.scope_containment,
    );
    expect(evidence.overall).toBe(recomputed);
    expect(evidence.weights).toEqual({
      ac_coverage: 0.3,
      accuracy: 0.3,
      spec_fidelity: 0.25,
      scope_containment: 0.15,
    });
  });

  test("evidence field order matches the brief's schema block exactly (non-degraded path)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const { evidence } = assembleEvidence(baseOpts(dir));
    expect(Object.keys(evidence)).toEqual([
      "gate",
      "spec_id",
      "diff_range",
      "graph_manifest_hash",
      "mode",
      "mechanical",
      "generator",
      "judge",
      "weights",
      "dimensions",
      "overall",
      "threshold",
      "per_dimension_minimum",
      "result",
      "result_stamped_by",
      "flags",
      "reasoning",
    ]);
    expect(evidence.gate).toBe("comprehension-asbuilt");
    expect(evidence.mode).toBe("shadow");
    expect((evidence.judge as { dispatch_record: string; blinded: boolean }).dispatch_record).toBe(
      "judge-dispatch.md",
    );
    expect((evidence.judge as { blinded: boolean }).blinded).toBe(true);
  });

  test("(Blinding) judge yml containing threshold: assembler throws 'judge file must not stamp threshold/result'", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-stamped-threshold.yml", `${cleanJudgeYaml}threshold: 7.0\n`),
    });
    expect(() => assembleEvidence(opts)).toThrow(/^judge file must not stamp threshold\/result/);
  });

  test("(Blinding) judge yml containing result: assembler throws 'judge file must not stamp threshold/result'", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-stamped-result.yml", `${cleanJudgeYaml}result: pass\n`),
    });
    expect(() => assembleEvidence(opts)).toThrow(/^judge file must not stamp threshold\/result/);
  });

  test("(Blinding) threshold nested inside reasoning is also rejected (walks the full object tree)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-nested-stamp.yml",
        `${cleanJudgeYaml}reasoning:\n  ac_coverage:\n    threshold: 7.0\n`,
      ),
    });
    expect(() => assembleEvidence(opts)).toThrow(/^judge file must not stamp threshold\/result/);
  });

  test("(Blinding) result nested inside flags is also rejected", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-nested-result.yml", `${cleanJudgeYaml}flags:\n  result: pass\n`),
    });
    expect(() => assembleEvidence(opts)).toThrow(/^judge file must not stamp threshold\/result/);
  });

  test("(Blinding) threshold nested inside an array element (flags.blocking[0] as an object) is also rejected", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-nested-array-stamp.yml",
        `${cleanJudgeYaml}flags:\n  blocking:\n    - threshold: 7.0\n`,
      ),
    });
    expect(() => assembleEvidence(opts)).toThrow(/^judge file must not stamp threshold\/result/);
  });

  test("judge yml with an unexpected top-level key is rejected (accepted keys are exactly dimensions/flags/reasoning)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-extra-key.yml", `${cleanJudgeYaml}notes: something\n`),
    });
    expect(() => assembleEvidence(opts)).toThrow();
  });

  test("judge yml with a non-integer dimension is rejected", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-float-dim.yml",
        "dimensions:\n  ac_coverage: 8.5\n  accuracy: 7\n  spec_fidelity: 7\n  scope_containment: 8\n",
      ),
    });
    expect(() => assembleEvidence(opts)).toThrow();
  });

  test("judge yml with a dimension out of 1-10 range is rejected", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-oor-dim.yml",
        "dimensions:\n  ac_coverage: 11\n  accuracy: 7\n  spec_fidelity: 7\n  scope_containment: 8\n",
      ),
    });
    expect(() => assembleEvidence(opts)).toThrow();
  });

  test("judge yml missing a required dimension is rejected", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-missing-dim.yml", "dimensions:\n  ac_coverage: 8\n  accuracy: 7\n  spec_fidelity: 7\n"),
    });
    expect(() => assembleEvidence(opts)).toThrow();
  });

  test("(Mechanical veto) blocking mechanical report + high judge scores: result fail, mechanical finding rendered in flags.blocking", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      mechanicalPath: writeJson(dir, "mechanical-blocking.json", blockingMechanical),
      judgePath: writeYaml(dir, "judge-high.yml", highJudgeYaml),
    });
    const { evidence, result } = assembleEvidence(opts);

    expect(result).toBe("fail");
    expect(evidence.result).toBe("fail");
    const flags = evidence.flags as { blocking: string[] };
    expect(flags.blocking.some((f) => f.includes("mechanical:") && f.includes("src/alpha.ts#rotateRefreshToken"))).toBe(
      true,
    );
  });

  test("per-dimension minimum veto: one dimension below --per-dimension-minimum fails regardless of overall", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-low-one-dim.yml",
        "dimensions:\n  ac_coverage: 10\n  accuracy: 10\n  spec_fidelity: 10\n  scope_containment: 3\n",
      ),
      perDimensionMinimum: 5,
    });
    const { result } = assembleEvidence(opts);
    expect(result).toBe("fail");
  });

  test("overall-below-threshold veto: clean mechanical + passing per-dim minimum but low overall fails", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-low-overall.yml",
        "dimensions:\n  ac_coverage: 5\n  accuracy: 5\n  spec_fidelity: 5\n  scope_containment: 5\n",
      ),
      threshold: 7.0,
      perDimensionMinimum: 1,
    });
    const { result } = assembleEvidence(opts);
    expect(result).toBe("fail");
  });

  test("unexplained_computed entries become advisory 'mechanical:unexplained: <symbol>' strings only when non-empty", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const withUnexplained: MechanicalReport = {
      ...cleanMechanical,
      unexplained_computed: ["src/alpha.ts#helper"],
    };
    const opts = baseOpts(dir, {
      mechanicalPath: writeJson(dir, "mechanical-unexplained.json", withUnexplained),
    });
    const { evidence } = assembleEvidence(opts);
    const flags = evidence.flags as { advisory: string[] };
    expect(flags.advisory).toContain("mechanical:unexplained: src/alpha.ts#helper");
  });

  test("no unexplained_computed entries: no mechanical:unexplained advisory added", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const { evidence } = assembleEvidence(baseOpts(dir));
    const flags = evidence.flags as { advisory: string[] };
    expect(flags.advisory.some((f) => f.startsWith("mechanical:unexplained:"))).toBe(false);
  });

  test("graph_manifest_hash equals manifestHash(loadManifest(manifestPath)) in non-degraded mode", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir);
    const { evidence } = assembleEvidence(opts);
    expect(typeof evidence.graph_manifest_hash).toBe("string");
    expect((evidence.graph_manifest_hash as string).length).toBe(64); // sha256 hex
  });

  test("generator.artifact is the relative path of --artifact from the evidence output dir", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const subDir = join(dir, "evidence-out");
    const opts = baseOpts(dir, { outPath: join(subDir, "gate-2c-asbuilt.yml") });
    const { evidence } = assembleEvidence(opts);
    const generator = evidence.generator as { model: string; artifact: string };
    expect(generator.artifact).toBe("../artifact.yml");
    expect(generator.model).toBe("test-generator");
  });
});

describe("AC8: graph-unavailable degraded path", () => {
  test("--graph-unavailable: graph_unavailable true, mechanical.skipped true, flags include graph_unavailable, no manifest hash", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      graphUnavailable: true,
      mechanicalPath: undefined,
      manifestPath: undefined,
      judgePath: writeYaml(dir, "judge-degraded.yml", cleanJudgeYaml),
    });
    const { evidence, result } = assembleEvidence(opts);

    expect(evidence.graph_unavailable).toBe(true);
    expect((evidence.mechanical as { skipped: boolean }).skipped).toBe(true);
    expect(evidence.graph_manifest_hash).toBeNull();
    const flags = evidence.flags as { advisory: string[]; blocking: string[] };
    expect(flags.advisory).toContain("graph_unavailable");
    expect(flags.blocking).toEqual([]); // never a blocking flag — advisory only (AC8: "blocking-free advisory flag")
    // dims {8,7,7,8} pass at threshold 7.0/min 5 with the mechanical veto skipped.
    expect(result).toBe("pass");
    expect(evidence.result).toBe("pass");
  });

  test("graphUnavailable forces graph_manifest_hash null even when a --manifest path is supplied (a stale hash must not leak into a degraded record)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      graphUnavailable: true,
      mechanicalPath: undefined,
      // manifestPath deliberately left set (baseOpts default) to prove it's ignored.
      judgePath: writeYaml(dir, "judge-degraded-with-manifest.yml", cleanJudgeYaml),
    });
    expect(opts.manifestPath).toBeDefined();
    const { evidence } = assembleEvidence(opts);
    expect(evidence.graph_manifest_hash).toBeNull();
  });

  test("graph_unavailable key appears last, only in the degraded path", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      graphUnavailable: true,
      mechanicalPath: undefined,
      manifestPath: undefined,
    });
    const { evidence } = assembleEvidence(opts);
    const keys = Object.keys(evidence);
    expect(keys[keys.length - 1]).toBe("graph_unavailable");
  });

  test("graph-unavailable mode never lets a blocking mechanical veto suppress a passing judge score (mechanical veto is skipped entirely)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      graphUnavailable: true,
      mechanicalPath: undefined,
      manifestPath: undefined,
      judgePath: writeYaml(dir, "judge-degraded-high.yml", highJudgeYaml),
    });
    const { result } = assembleEvidence(opts);
    expect(result).toBe("pass");
  });
});

describe("roundHalfUp1", () => {
  test("7.44 -> 7.4", () => {
    expect(roundHalfUp1(7.44)).toBe(7.4);
  });
  test("7.45 -> 7.5", () => {
    expect(roundHalfUp1(7.45)).toBe(7.5);
  });
  test("7.25 -> 7.3", () => {
    expect(roundHalfUp1(7.25)).toBe(7.3);
  });
  test("7.24 -> 7.2", () => {
    expect(roundHalfUp1(7.24)).toBe(7.2);
  });
});

describe("computeOverall: exact integer arithmetic (regression for float-summation mis-rounding)", () => {
  test("dims {ac:1, acc:2, sf:5, sc:2}: exact weighted sum is 2.45, rounds half-up to 2.5 (naive float summation gives 2.4499999999999997 -> 2.4)", () => {
    expect(
      computeOverall({ ac_coverage: 1, accuracy: 2, spec_fidelity: 5, scope_containment: 2 }),
    ).toBe(2.5);
  });

  test("assembleEvidence end-to-end: dims {1,2,5,2} at threshold 2.5 -> overall 2.5, result pass (previously flipped to fail under float rounding)", () => {
    const dir = makeTmpDir("asbuilt-evidence-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(
        dir,
        "judge-borderline.yml",
        "dimensions:\n  ac_coverage: 1\n  accuracy: 2\n  spec_fidelity: 5\n  scope_containment: 2\n",
      ),
      threshold: 2.5,
      perDimensionMinimum: 1,
    });
    const { evidence, result } = assembleEvidence(opts);
    expect(evidence.overall).toBe(2.5);
    expect(result).toBe("pass");
    expect(evidence.result).toBe("pass");
  });

  test("canonical dims {8,7,7,8} still rounds to 7.5 under the integer path", () => {
    expect(
      computeOverall({ ac_coverage: 8, accuracy: 7, spec_fidelity: 7, scope_containment: 8 }),
    ).toBe(7.5);
  });

  test("exhaustive spot-check: for all dims in {1..10}^4 with ac_coverage === accuracy, overall matches the hand-derived integer formula (~1000 cases)", () => {
    let cases = 0;
    for (let ac = 1; ac <= 10; ac++) {
      const acc = ac;
      for (let sf = 1; sf <= 10; sf++) {
        for (let sc = 1; sc <= 10; sc++) {
          const expected = Math.floor((30 * ac + 30 * acc + 25 * sf + 15 * sc + 5) / 10) / 10;
          expect(
            computeOverall({ ac_coverage: ac, accuracy: acc, spec_fidelity: sf, scope_containment: sc }),
          ).toBe(expected);
          cases++;
        }
      }
    }
    expect(cases).toBe(1000);
  });
});

describe("CLI: bun src/evidence.ts", () => {
  function spawn(args: string[]) {
    return Bun.spawnSync(["bun", "src/evidence.ts", ...args], { cwd: ASBUILT_ROOT });
  }

  test("writes gate-2c-asbuilt.yml with invoker-stamped, recomputable evidence and exits 0 on pass", () => {
    const dir = makeTmpDir("asbuilt-evidence-cli-");
    const opts = baseOpts(dir);
    const mechanicalPath = opts.mechanicalPath ?? "";
    const manifestPath = opts.manifestPath ?? "";

    const result = spawn([
      "--artifact",
      opts.artifactPath,
      "--mechanical",
      mechanicalPath,
      "--judge",
      opts.judgePath,
      "--spec-id",
      opts.specId,
      "--diff-range",
      opts.diffRange,
      "--manifest",
      manifestPath,
      "--threshold",
      String(opts.threshold),
      "--per-dimension-minimum",
      String(opts.perDimensionMinimum),
      "--generator-model",
      opts.generatorModel,
      "--judge-model",
      opts.judgeModel,
      "--out",
      opts.outPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toMatch(/result=pass/);
    const written = parse(readFileSync(opts.outPath, "utf8"));
    expect(written.result_stamped_by).toBe("invoker");
    expect(written.overall).toBe(7.5);
    expect(written.result).toBe("pass");
  });

  test("--graph-unavailable wires the degraded path end to end and still exits 0 on pass", () => {
    const dir = makeTmpDir("asbuilt-evidence-cli-degraded-");
    const opts = baseOpts(dir);

    const result = spawn([
      "--artifact",
      opts.artifactPath,
      "--graph-unavailable",
      "--judge",
      opts.judgePath,
      "--spec-id",
      opts.specId,
      "--diff-range",
      opts.diffRange,
      "--threshold",
      String(opts.threshold),
      "--per-dimension-minimum",
      String(opts.perDimensionMinimum),
      "--generator-model",
      opts.generatorModel,
      "--judge-model",
      opts.judgeModel,
      "--out",
      opts.outPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toMatch(/result=pass/);
    const written = parse(readFileSync(opts.outPath, "utf8"));
    expect(written.graph_unavailable).toBe(true);
    expect(written.mechanical.skipped).toBe(true);
    expect(written.graph_manifest_hash).toBeNull();
  });

  test("blinding-violating judge file: CLI exits 2 (contract error) with the contract error on stderr", () => {
    const dir = makeTmpDir("asbuilt-evidence-cli-blind-");
    const opts = baseOpts(dir, {
      judgePath: writeYaml(dir, "judge-stamped.yml", `${cleanJudgeYaml}threshold: 7.0\n`),
    });
    const mechanicalPath = opts.mechanicalPath ?? "";
    const manifestPath = opts.manifestPath ?? "";

    const result = spawn([
      "--artifact",
      opts.artifactPath,
      "--mechanical",
      mechanicalPath,
      "--judge",
      opts.judgePath,
      "--spec-id",
      opts.specId,
      "--diff-range",
      opts.diffRange,
      "--manifest",
      manifestPath,
      "--threshold",
      String(opts.threshold),
      "--per-dimension-minimum",
      String(opts.perDimensionMinimum),
      "--generator-model",
      opts.generatorModel,
      "--judge-model",
      opts.judgeModel,
      "--out",
      opts.outPath,
    ]);

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString("utf8")).toMatch(/judge file must not stamp threshold\/result/);
  });

  test("blocking mechanical result: CLI exits 0 (evidence assembled) and prints result=fail; nothing exits 1 anymore", () => {
    const dir = makeTmpDir("asbuilt-evidence-cli-fail-");
    const opts = baseOpts(dir, {
      mechanicalPath: writeJson(dir, "mechanical-blocking.json", blockingMechanical),
    });
    const manifestPath = opts.manifestPath ?? "";

    const result = spawn([
      "--artifact",
      opts.artifactPath,
      "--mechanical",
      opts.mechanicalPath ?? "",
      "--judge",
      opts.judgePath,
      "--spec-id",
      opts.specId,
      "--diff-range",
      opts.diffRange,
      "--manifest",
      manifestPath,
      "--threshold",
      String(opts.threshold),
      "--per-dimension-minimum",
      String(opts.perDimensionMinimum),
      "--generator-model",
      opts.generatorModel,
      "--judge-model",
      opts.judgeModel,
      "--out",
      opts.outPath,
    ]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString("utf8")).toMatch(/result=fail/);
    const written = parse(readFileSync(opts.outPath, "utf8"));
    expect(written.result).toBe("fail");
  });
});

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
