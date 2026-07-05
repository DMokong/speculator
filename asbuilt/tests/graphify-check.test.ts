import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import { graphifyCheck } from "../src/graphify-check";
import { saveManifest } from "../src/manifest";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
const GOLDEN_PATH = new URL(
  "fixtures/expected-symbols/graphify-interop-fixture.json",
  import.meta.url,
).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** mkdtemp copy of the seeded fixture repo (including its .git), isolated per test. */
function freshRepoCopy(): string {
  const dir = makeTmpDir("asbuilt-graphify-repo-");
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Builds+saves the real manifest (via extractGraph) into <dir>/docs/asbuilt/.graph-manifest.json. */
async function buildManifest(dir: string) {
  const manifest = await extractGraph(dir);
  saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), manifest);
  return manifest;
}

/**
 * Writes a fake `graphify` executable that ignores whatever tree it's
 * pointed at and always answers `--version` with `version` and always
 * writes `graphJson` to `<scanned-dir>/graphify-out/graph.json` — full
 * control over the graphify side of the comparison, independent of
 * whether the real pinned tool is installed on this machine.
 */
function writeFakeGraphify(version: string, graphJson: unknown): string {
  const dir = makeTmpDir("asbuilt-fake-graphify-");
  const binPath = join(dir, "graphify");
  const json = JSON.stringify(graphJson);
  writeFileSync(
    binPath,
    `#!/bin/bash
set -e
if [ "$1" = "--version" ]; then
  echo "${version}"
  exit 0
fi
mkdir -p "$1/graphify-out"
cat > "$1/graphify-out/graph.json" << 'JSONEOF'
${json}
JSONEOF
`,
  );
  chmodSync(binPath, 0o755);
  return binPath;
}

describe("AC6: unavailable path (always runs, no env dependency)", () => {
  test("unresolvable --graphify-bin -> graphify_unavailable report with zero counts and empty arrays", () => {
    const dir = freshRepoCopy();
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: "/nonexistent/definitely-missing" });
    expect(report).toEqual({
      graphify_version: null,
      pinned_expected: "0.9.6",
      graphify_unavailable: true,
      files_compared: 0,
      symbols_matched: 0,
      symbols_manifest_only: [],
      types_not_compared: 0,
      nodes_graphify_only: [],
      calls_matched: 0,
      calls_unmatched: [],
      ambiguous_skipped: 0,
    });
  });

  test("unavailable path never requires a manifest on disk (short-circuits before loading one)", () => {
    const dir = makeTmpDir("asbuilt-graphify-nomanifest-"); // no docs/asbuilt/.graph-manifest.json here at all
    expect(() => graphifyCheck({ targetRepo: dir, graphifyBin: "/nonexistent/definitely-missing" })).not.toThrow();
  });

  describe("CLI: bun src/graphify-check.ts", () => {
    test("exits 1 with usage when --target is missing", () => {
      const result = Bun.spawnSync(["bun", "src/graphify-check.ts"], { cwd: ASBUILT_ROOT });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString("utf8")).toContain("bun asbuilt/src/graphify-check.ts");
    });

    test("forced-unavailable run prints the loud stdout line, the JSON report, and exits 0", () => {
      const dir = freshRepoCopy();
      const result = Bun.spawnSync(
        ["bun", "src/graphify-check.ts", "--target", dir, "--graphify-bin", "/nonexistent/definitely-missing"],
        { cwd: ASBUILT_ROOT },
      );
      expect(result.exitCode).toBe(0);
      const stdout = result.stdout.toString("utf8");
      expect(stdout).toContain("graphify-check: graphifyy not installed — cross-validation skipped (loudly)");
      const jsonStart = stdout.indexOf("{");
      const report = JSON.parse(stdout.slice(jsonStart));
      expect(report.graphify_unavailable).toBe(true);
    });
  });
});

/**
 * Temporarily overrides env vars for `fn`, restoring exact prior state
 * afterward (a key that was unset stays unset — using `Reflect.deleteProperty`
 * rather than the `delete` operator only for biome's noDelete rule; a plain
 * `process.env.KEY = undefined` assignment would coerce to the *string*
 * "undefined" per Node's process.env semantics, which is not the same as
 * "unset" and would break restoration).
 */
function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) Reflect.deleteProperty(process.env, key);
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}

describe("AC6: bin discovery order (self-contained fake bins, no env dependency)", () => {
  test("--graphify-bin flag wins over GRAPHIFY_BIN env var", async () => {
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const flagBin = writeFakeGraphify("graphify 1.1.1-flag", { nodes: [], links: [] });
    const envBin = writeFakeGraphify("graphify 2.2.2-env", { nodes: [], links: [] });
    withEnv({ GRAPHIFY_BIN: envBin }, () => {
      const report = graphifyCheck({ targetRepo: dir, graphifyBin: flagBin });
      expect(report.graphify_version).toBe("graphify 1.1.1-flag");
    });
  });

  test("GRAPHIFY_BIN env var wins over `which` (PATH) discovery when no flag is passed", async () => {
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const pathBin = writeFakeGraphify("graphify 3.3.3-path", { nodes: [], links: [] }); // named "graphify", sits in its own tmp dir
    const envBin = writeFakeGraphify("graphify 4.4.4-env", { nodes: [], links: [] });
    withEnv(
      { GRAPHIFY_BIN: envBin, PATH: `${join(pathBin, "..")}:${process.env.PATH}` }, // pathBin's dir also has a "graphify" on PATH — env must still win
      () => {
        const report = graphifyCheck({ targetRepo: dir });
        expect(report.graphify_version).toBe("graphify 4.4.4-env");
      },
    );
  });

  test("falls back to `which graphify` on PATH when neither flag nor env var is set", async () => {
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const pathDir = makeTmpDir("asbuilt-fake-graphify-path-");
    const binPath = join(pathDir, "graphify");
    writeFileSync(
      binPath,
      `#!/bin/bash
set -e
if [ "$1" = "--version" ]; then
  echo "graphify 5.5.5-which"
  exit 0
fi
mkdir -p "$1/graphify-out"
echo '{"nodes":[],"links":[]}' > "$1/graphify-out/graph.json"
`,
    );
    chmodSync(binPath, 0o755);
    withEnv({ GRAPHIFY_BIN: undefined, PATH: `${pathDir}:${process.env.PATH}` }, () => {
      const report = graphifyCheck({ targetRepo: dir });
      expect(report.graphify_version).toBe("graphify 5.5.5-which");
    });
  });
});

describe("AC6: version reporting", () => {
  test("version_mismatch is set when --version doesn't contain the pinned 0.9.6", async () => {
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const bin = writeFakeGraphify("graphify 0.1.0-fake", { nodes: [], links: [] });
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: bin });
    expect(report.graphify_version).toBe("graphify 0.1.0-fake");
    expect(report.version_mismatch).toBe(true);
  });

  test("version_mismatch is absent (not just false) when the version line contains 0.9.6", async () => {
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const bin = writeFakeGraphify("graphify 0.9.6", { nodes: [], links: [] });
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: bin });
    expect("version_mismatch" in report).toBe(false);
  });
});

describe("AC6: synthetic comparison logic (hand-built manifest + graph.json, exercises every report field)", () => {
  /**
   * A fully self-contained manifest, independent of the fixture repo or
   * extractGraph — lets us exercise symbols_manifest_only, nodes_graphify_only,
   * types_not_compared, calls_matched, both calls_unmatched sides, and
   * ambiguous_skipped in a single deliberately-constructed scenario.
   */
  function syntheticManifest() {
    return {
      schema: 1 as const,
      extractor: { name: "web-tree-sitter", version: "0.24.5" },
      target_commit: "TESTCOMMIT",
      symbols: [
        { id: "src/a.ts#Foo", kind: "class" as const, file: "src/a.ts", span: [1, 5] as [number, number], content_hash: "h1", exported: true },
        { id: "src/a.ts#Foo.bar", kind: "method" as const, file: "src/a.ts", span: [2, 4] as [number, number], content_hash: "h2", exported: true },
        { id: "src/a.ts#baz", kind: "function" as const, file: "src/a.ts", span: [6, 8] as [number, number], content_hash: "h3", exported: false },
        { id: "src/a.ts#Qux", kind: "interface" as const, file: "src/a.ts", span: [9, 11] as [number, number], content_hash: "h4", exported: true },
        { id: "src/b.ts#missingFn", kind: "function" as const, file: "src/b.ts", span: [1, 3] as [number, number], content_hash: "h5", exported: true },
      ],
      edges: [
        { from: "src/a.ts#Foo.bar", toName: "baz", resolved: "src/a.ts#baz" },
        { from: "src/a.ts#baz", toName: "missingFn", resolved: "src/b.ts#missingFn" },
        { from: "src/a.ts#Foo.bar", toName: "unresolvedThing", resolved: null },
        { from: "src/a.ts#baz", toName: "phantomCall", resolved: "src/a.ts#Foo.bar" },
      ],
    };
  }

  function syntheticGraph() {
    return {
      nodes: [
        { id: "src_a", label: "a.ts", source_file: "src/a.ts" },
        { id: "src_b", label: "b.ts", source_file: "src/b.ts" },
        { id: "src_a_foo", label: "Foo", source_file: "src/a.ts" },
        { id: "src_a_foo_bar", label: ".bar()", source_file: "src/a.ts" },
        { id: "src_a_baz", label: "baz()", source_file: "src/a.ts" },
        { id: "src_a_qux", label: "Qux", source_file: "src/a.ts" },
        { id: "src_a_extra", label: "extra()", source_file: "src/a.ts" }, // no manifest counterpart at all
      ],
      links: [
        { relation: "contains", source: "src_a", target: "src_a_foo" },
        { relation: "contains", source: "src_a", target: "src_a_baz" },
        { relation: "contains", source: "src_a", target: "src_a_qux" },
        { relation: "contains", source: "src_a", target: "src_a_extra" },
        { relation: "method", source: "src_a_foo", target: "src_a_foo_bar" },
        { relation: "calls", source: "src_a_foo_bar", target: "src_a_baz" }, // matches manifest Foo.bar->baz
        { relation: "calls", source: "src_a_foo_bar", target: "src_a_extra" }, // target never matched -> silently skipped
      ],
    };
  }

  function runSynthetic(): ReturnType<typeof graphifyCheck> {
    const dir = freshRepoCopy();
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), syntheticManifest());
    const bin = writeFakeGraphify("graphify 0.9.6", syntheticGraph());
    return graphifyCheck({ targetRepo: dir, graphifyBin: bin });
  }

  test("every field matches hand-computed expectations", () => {
    const report = runSynthetic();
    expect(report.graphify_version).toBe("graphify 0.9.6");
    expect(report.version_mismatch).toBeUndefined();
    expect(report.files_compared).toBe(4); // fixture-repo's 4 tracked .ts files, unrelated to the synthetic graph content
    expect(report.symbols_matched).toBe(3); // Foo, Foo.bar, baz
    expect(report.symbols_manifest_only).toEqual([{ id: "src/b.ts#missingFn" }]);
    expect(report.types_not_compared).toBe(1); // Qux (interface)
    expect(report.nodes_graphify_only).toEqual([{ id: "src_a_extra", file: "src/a.ts" }]);
    expect(report.calls_matched).toBe(1); // Foo.bar -> baz
    expect(report.calls_unmatched).toEqual([
      { from: "src/a.ts#Foo", toName: "src/a.ts#Foo.bar", side: "graphify" }, // class "method"-contains-method has no manifest calls-edge analogue
      { from: "src/a.ts#baz", toName: "src/a.ts#Foo.bar", side: "manifest" }, // manifest says baz calls Foo.bar; graphify has no such edge
    ]);
    expect(report.ambiguous_skipped).toBe(1); // Foo.bar -> unresolvedThing (resolved: null)
  });

  test("the baz->missingFn edge (resolved, but missingFn never matched a graphify node) is silently absent from calls_unmatched", () => {
    const report = runSynthetic();
    const involvesMissingFn = report.calls_unmatched.some(
      (e) => e.from === "src/a.ts#baz" && e.toName === "missingFn",
    );
    expect(involvesMissingFn).toBe(false);
  });

  test("determinism: two runs against the same inputs are deep-equal", () => {
    const dir = freshRepoCopy();
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), syntheticManifest());
    const bin = writeFakeGraphify("graphify 0.9.6", syntheticGraph());
    const r1 = graphifyCheck({ targetRepo: dir, graphifyBin: bin });
    const r2 = graphifyCheck({ targetRepo: dir, graphifyBin: bin });
    expect(r1).toEqual(r2);
  });
});

describe("AC6: missing manifest refuses loudly (available-bin path only)", () => {
  test("throws a clear error when docs/asbuilt/.graph-manifest.json has never been saved", () => {
    const dir = freshRepoCopy(); // no buildManifest() call — no manifest on disk
    const bin = writeFakeGraphify("graphify 0.9.6", { nodes: [], links: [] });
    expect(() => graphifyCheck({ targetRepo: dir, graphifyBin: bin })).toThrow(/No graph manifest found/);
  });
});

describe("AC6: --html", () => {
  test("html_generated: false and no file copy when graphify-out/graph.html isn't produced (fake bin mirrors the real 0.9.6 base-run behavior)", () => {
    const dir = freshRepoCopy();
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), { symbols: [], edges: [], schema: 1, extractor: { name: "x", version: "0" }, target_commit: "x" });
    const bin = writeFakeGraphify("graphify 0.9.6", { nodes: [], links: [] });
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: bin, html: true });
    expect(report.html_generated).toBe(false);
    expect(existsSync(join(dir, "docs/asbuilt/.graph/graph.html"))).toBe(false);
  });

  test("html_generated is absent when --html wasn't requested", () => {
    const dir = freshRepoCopy();
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), { symbols: [], edges: [], schema: 1, extractor: { name: "x", version: "0" }, target_commit: "x" });
    const bin = writeFakeGraphify("graphify 0.9.6", { nodes: [], links: [] });
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: bin });
    expect("html_generated" in report).toBe(false);
  });

  test("copies graphify-out/graph.html to <target>/docs/asbuilt/.graph/graph.html when the bin does produce one", () => {
    const dir = freshRepoCopy();
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), { symbols: [], edges: [], schema: 1, extractor: { name: "x", version: "0" }, target_commit: "x" });
    const fakeDir = makeTmpDir("asbuilt-fake-graphify-html-");
    const binPath = join(fakeDir, "graphify");
    writeFileSync(
      binPath,
      `#!/bin/bash
set -e
if [ "$1" = "--version" ]; then
  echo "graphify 0.9.6"
  exit 0
fi
mkdir -p "$1/graphify-out"
echo '{"nodes":[],"links":[]}' > "$1/graphify-out/graph.json"
echo '<html>fake</html>' > "$1/graphify-out/graph.html"
`,
    );
    chmodSync(binPath, 0o755);
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: binPath, html: true });
    expect(report.html_generated).toBe(true);
    const copied = readFileSync(join(dir, "docs/asbuilt/.graph/graph.html"), "utf8");
    expect(copied).toBe("<html>fake</html>\n");
  });
});

describe("AC6: no-LLM static check", () => {
  test("graphify-check.ts source contains no model-vendor or network-call strings", () => {
    const src = readFileSync(new URL("../src/graphify-check.ts", import.meta.url), "utf8");
    const forbidden = /anthropic|openai|fetch\(|https?:\/\//i;
    expect(forbidden.test(src)).toBe(false);
  });
});

describe("AC6: live path (env-gated: only runs when GRAPHIFY_BIN is set and exists — real pinned graphifyy 0.9.6)", () => {
  const LIVE_BIN = process.env.GRAPHIFY_BIN;

  /** env-gated: skip silently off-machine or when GRAPHIFY_BIN isn't set to a real path — mirrors extract.test.ts's r2mcp golden test. */
  function liveAvailable(): boolean {
    return LIVE_BIN !== undefined && existsSync(LIVE_BIN);
  }

  test("calibrated golden: interop report on the seeded fixture repo deep-equals the hand-reviewed golden", async () => {
    if (!liveAvailable()) return;
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN });
    const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8"));
    expect(report).toEqual(golden);
  });

  test("zero symbols_manifest_only for participating kinds against the real tool", async () => {
    if (!liveAvailable()) return;
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN });
    expect(report.symbols_manifest_only).toEqual([]);
  });

  /**
   * mkdtemp git repo containing a hyphenated-filename source file with an
   * exported function and a caller — regression fixture for the T7 live
   * r2mcp interop finding: graphify collapses hyphens (and other
   * punctuation runs) in path segments to a single "_", but the pre-fix
   * expectedGraphifyId formula left the hyphen intact, so every hyphenated
   * file in a target repo spuriously showed up as symbols_manifest_only /
   * nodes_graphify_only (97 + 135 of them, respectively, in the real r2mcp
   * repo — see task-7-report.md "Fix 2").
   */
  function freshHyphenRepo(): string {
    const dir = makeTmpDir("asbuilt-graphify-hyphen-");
    mkdirSync(join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "src/multi-word-name.ts"), "export function someFunc(): number {\n  return 1;\n}\n");
    writeFileSync(
      join(dir, "src/caller.ts"),
      'import { someFunc } from "./multi-word-name";\n\nexport function callIt(): number {\n  return someFunc();\n}\n',
    );
    execSync("git init -q && git add -A && git -c user.email=fixture@local -c user.name=fixture commit -qm seed", {
      cwd: dir,
    });
    return dir;
  }

  test("regression (T7 live interop find): hyphenated filename maps to graphify's underscore-normalized node id — symbols_matched >= 1, zero symbols_manifest_only", async () => {
    if (!liveAvailable()) return;
    const dir = freshHyphenRepo();
    await buildManifest(dir);
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN });
    expect(report.symbols_matched).toBeGreaterThanOrEqual(1);
    expect(report.symbols_manifest_only).toEqual([]);
  });

  test("determinism against the real tool: two runs deep-equal", async () => {
    if (!liveAvailable()) return;
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const r1 = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN });
    const r2 = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN });
    expect(r1).toEqual(r2);
  });

  test("real 0.9.6 base run does not produce graph.html (calibrated reality, not a spec guess)", async () => {
    if (!liveAvailable()) return;
    const dir = freshRepoCopy();
    await buildManifest(dir);
    const report = graphifyCheck({ targetRepo: dir, graphifyBin: LIVE_BIN, html: true });
    expect(report.html_generated).toBe(false);
    expect(existsSync(join(dir, "docs/asbuilt/.graph/graph.html"))).toBe(false);
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
