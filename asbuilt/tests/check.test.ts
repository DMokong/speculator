import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runChecks } from "../src/check";
import { extractGraph } from "../src/extract";
import { type GraphManifest, saveManifest } from "../src/manifest";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
const ARTIFACTS = new URL("fixtures/artifacts", import.meta.url).pathname;
const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

/** seed.sh's default branch may be "main" or "master" depending on git config; detect which exists. */
function defaultBranch(): string {
  try {
    execSync(`git -C ${FIXTURE} rev-parse --verify main`, { stdio: "ignore" });
    return "main";
  } catch {
    return "master";
  }
}

/** Extracts the manifest at the `change` branch's state, then restores the fixture's original checkout. */
async function extractAtChange(defaultBr: string): Promise<GraphManifest> {
  execSync(`git -C ${FIXTURE} checkout -q change`);
  try {
    return await extractGraph(FIXTURE);
  } finally {
    execSync(`git -C ${FIXTURE} checkout -q ${defaultBr}`);
  }
}

const branch = defaultBranch();
const manifest = await extractAtChange(branch);
const diffRange = `${branch}...change`;

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

function writeManifestFile(): string {
  const dir = makeTmpDir("asbuilt-check-manifest-");
  const path = join(dir, "manifest.json");
  saveManifest(path, manifest);
  return path;
}

function artifact(name: string): string {
  return join(ARTIFACTS, name);
}

describe("AC3/AC4/AC5: mechanical comprehension checks", () => {
  test("fabricated-symbol: symbol_exists names the fabricated symbol and the citing entry only; blocking true", () => {
    const report = runChecks(manifest, artifact("fabricated-symbol.yml"), FIXTURE, diffRange);
    expect(report.symbol_exists).toEqual([{ entry: "AC1", symbol: "src/alpha.ts#rotateRefreshToken" }]);
    expect(report.span_valid).toEqual([]);
    expect(report.blocking).toBe(true);
  });

  test("bad-span: span_valid names the cited range and the symbol's actual span; blocking true", () => {
    const report = runChecks(manifest, artifact("bad-span.yml"), FIXTURE, diffRange);
    expect(report.symbol_exists).toEqual([]);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/alpha.ts#helper", cited: "40-55", actual: "13-15" },
    ]);
    expect(report.blocking).toBe(true);
  });

  test("subset-cited: unexplained_computed equals exactly the uncited touched symbols (set equality); advisory recorded; not blocking", () => {
    const report = runChecks(manifest, artifact("subset-cited.yml"), FIXTURE, diffRange);
    const expectedUncited = new Set(["src/alpha.ts#helper"]);
    expect(new Set(report.unexplained_computed)).toEqual(expectedUncited);
    expect(report.unexplained_computed).toEqual(["src/alpha.ts#helper"]);
    expect(report.diff_touched).toEqual([{ entry: "AC1", symbol: "src/alpha.ts#AlphaService.run" }]);
    expect(report.symbol_exists).toEqual([]);
    expect(report.span_valid).toEqual([]);
    expect(report.blocking).toBe(false);
  });

  test("clean: no failures, no advisories, blocking false", () => {
    const report = runChecks(manifest, artifact("clean.yml"), FIXTURE, diffRange);
    expect(report.symbol_exists).toEqual([]);
    expect(report.span_valid).toEqual([]);
    expect(report.diff_touched).toEqual([]);
    expect(report.unexplained_computed).toEqual([]);
    expect(report.blocking).toBe(false);
  });

  test("reversed span '15-13': span_valid failure naming the literal cited string and the symbol's actual span; blocking true", () => {
    const report = runChecks(manifest, artifact("reversed-span-15-13.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/alpha.ts#helper", cited: "15-13", actual: "13-15" },
    ]);
    expect(report.symbol_exists).toEqual([]);
    expect(report.blocking).toBe(true);
  });

  test("reversed span '20-1': span_valid failure; blocking true", () => {
    const report = runChecks(manifest, artifact("reversed-span-20-1.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/alpha.ts#helper", cited: "20-1", actual: "13-15" },
    ]);
    expect(report.blocking).toBe(true);
  });

  test("unparseable lines 'abc': span_valid failure naming the literal cited string; blocking true (not silently skipped)", () => {
    const report = runChecks(manifest, artifact("unparseable-lines-abc.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/alpha.ts#helper", cited: "abc", actual: "13-15" },
    ]);
    expect(report.blocking).toBe(true);
  });

  test("unparseable lines '-5-15': span_valid failure; blocking true (not silently skipped)", () => {
    const report = runChecks(manifest, artifact("unparseable-lines-malformed.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/alpha.ts#helper", cited: "-5-15", actual: "13-15" },
    ]);
    expect(report.blocking).toBe(true);
  });

  test("single number '14' inside the symbol's span is accepted as shorthand for [14,14]: no failure", () => {
    const report = runChecks(manifest, artifact("single-line-inside-span.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([]);
    expect(report.blocking).toBe(false);
  });

  test("single number '14' outside the symbol's span: span_valid failure naming the symbol's actual span", () => {
    const report = runChecks(manifest, artifact("single-line-outside-span.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([
      { entry: "AC1", symbol: "src/beta.ts#BetaResult", cited: "14", actual: "9-9" },
    ]);
    expect(report.blocking).toBe(true);
  });

  test("absent lines field is still skipped (no span_valid failure) — subset-cited.yml's AlphaService.run citation omits lines entirely", () => {
    const report = runChecks(manifest, artifact("subset-cited.yml"), FIXTURE, diffRange);
    expect(report.span_valid).toEqual([]);
  });

  test("excluded suppresses a touched-but-uncited symbol from unexplained_computed", () => {
    const report = runChecks(manifest, artifact("subset-cited.yml"), FIXTURE, diffRange, [
      "src/alpha.ts#helper",
    ]);
    expect(report.unexplained_computed).toEqual([]);
  });

  test("no-LLM static check: check.ts and slice.ts source contain no model-vendor or network-call strings", () => {
    const checkSrc = readFileSync(new URL("../src/check.ts", import.meta.url), "utf8");
    const sliceSrc = readFileSync(new URL("../src/slice.ts", import.meta.url), "utf8");
    const forbidden = /anthropic|openai|fetch\(|https?:\/\//i;
    expect(forbidden.test(checkSrc)).toBe(false);
    expect(forbidden.test(sliceSrc)).toBe(false);
  });

  describe("CLI: bun src/check.ts", () => {
    function run(artifactName: string, extraArgs: string[] = []) {
      const manifestPath = writeManifestFile();
      return Bun.spawnSync(
        [
          "bun",
          "src/check.ts",
          "--manifest",
          manifestPath,
          "--artifact",
          artifact(artifactName),
          "--target",
          FIXTURE,
          "--diff-range",
          diffRange,
          ...extraArgs,
        ],
        { cwd: ASBUILT_ROOT },
      );
    }

    test("fabricated-symbol exits 1", () => {
      const result = run("fabricated-symbol.yml");
      expect(result.exitCode).toBe(1);
    });

    test("bad-span exits 1", () => {
      const result = run("bad-span.yml");
      expect(result.exitCode).toBe(1);
    });

    test("reversed span '15-13' exits 1", () => {
      const result = run("reversed-span-15-13.yml");
      expect(result.exitCode).toBe(1);
    });

    test("reversed span '20-1' exits 1", () => {
      const result = run("reversed-span-20-1.yml");
      expect(result.exitCode).toBe(1);
    });

    test("unparseable lines 'abc' exits 1", () => {
      const result = run("unparseable-lines-abc.yml");
      expect(result.exitCode).toBe(1);
    });

    test("unparseable lines '-5-15' exits 1", () => {
      const result = run("unparseable-lines-malformed.yml");
      expect(result.exitCode).toBe(1);
    });

    test("single number '14' inside span exits 0", () => {
      const result = run("single-line-inside-span.yml");
      expect(result.exitCode).toBe(0);
    });

    test("single number '14' outside span exits 1", () => {
      const result = run("single-line-outside-span.yml");
      expect(result.exitCode).toBe(1);
    });

    test("clean exits 0", () => {
      const result = run("clean.yml");
      expect(result.exitCode).toBe(0);
    });

    test("subset-cited exits 0 (advisories only, nothing blocking)", () => {
      const result = run("subset-cited.yml");
      expect(result.exitCode).toBe(0);
    });

    test("--exclude JSON file suppresses unexplained_computed entries in the emitted report", () => {
      const dir = makeTmpDir("asbuilt-check-exclude-");
      const excludePath = join(dir, "exclude.json");
      writeFileSync(excludePath, JSON.stringify({ symbols: ["src/alpha.ts#helper"] }));

      const result = run("subset-cited.yml", ["--exclude", excludePath]);
      expect(result.exitCode).toBe(0);
      const report = JSON.parse(result.stdout.toString("utf8"));
      expect(report.unexplained_computed).toEqual([]);
    });
  });
});

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
