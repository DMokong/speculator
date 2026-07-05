// SPEC-053 AC1-AC3, AC5-AC7(extract side) — multi-language extraction pins.
//
// Expected tables are EMPIRICALLY PINNED: they were produced by running the
// extractor against the committed fixtures and hand-verifying every row
// against the source (ids, kinds, spans, exported flags per each language's
// visibility rule). If a grammar or adapter changes behavior, these tables
// are the tripwire — re-pin only after hand-verifying the new output.
//
// TS byte-identity (AC4) is additionally guarded by the pre-existing golden
// fixture-repo manifests in this suite's sibling tests, and was proven
// against a real repo (r2mcp: old-vs-new extractor byte-identical) in the
// SPEC-053 evidence.

import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { extractGraph, listSourceFiles } from "../src/extract";
import { adapterForFile, SUPPORTED_LANGUAGES } from "../src/lang";
import type { GraphManifest } from "../src/manifest";

const FIXTURES = new URL("./fixtures/lang", import.meta.url).pathname;

/** Stage a fixture tree into a fresh git repo (uncommitted — headSha's deterministic fallback). */
function stage(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `lang-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  execFileSync("git", ["-C", dir, "init", "-q"]);
  execFileSync("git", ["-C", dir, "add", "-A"]);
  return dir;
}

function rows(m: GraphManifest) {
  return m.symbols.map((s) => ({ id: s.id, kind: s.kind, span: s.span, exported: s.exported }));
}

function edgeRows(m: GraphManifest) {
  return m.edges.map((e) => ({ from: e.from, toName: e.toName, resolved: e.resolved }));
}

const GO_SYMBOLS = [
  { id: "svc.go#Handler", kind: "interface", span: [11, 13], exported: true },
  { id: "svc.go#MaxConn", kind: "const", span: [3, 3], exported: true },
  { id: "svc.go#NewServer", kind: "function", span: [15, 20], exported: true },
  { id: "svc.go#Server", kind: "class", span: [7, 9], exported: true },
  { id: "svc.go#Server.Start", kind: "method", span: [22, 24], exported: true },
  { id: "svc.go#debugMode", kind: "const", span: [5, 5], exported: false },
  { id: "svc.go#validate", kind: "function", span: [26, 28], exported: false },
  { id: "util.go#Helper", kind: "function", span: [3, 6], exported: true },
];
const GO_EDGES = [
  { from: "svc.go#NewServer", toName: "validate", resolved: "svc.go#validate" },
  { from: "svc.go#Server.Start", toName: "validate", resolved: "svc.go#validate" },
  { from: "util.go#Helper", toName: "inner", resolved: null },
];

const JAVA_SYMBOLS = [
  { id: "App.java#Api", kind: "interface", span: [23, 25], exported: false },
  { id: "App.java#Api.serve", kind: "method", span: [24, 24], exported: false },
  { id: "App.java#App", kind: "class", span: [3, 17], exported: true },
  { id: "App.java#App.App", kind: "method", span: [6, 8], exported: true },
  { id: "App.java#App.helper", kind: "method", span: [14, 16], exported: false },
  { id: "App.java#App.start", kind: "method", span: [10, 12], exported: true },
  { id: "App.java#Internal", kind: "class", span: [19, 21], exported: false },
  { id: "App.java#Internal.run", kind: "method", span: [20, 20], exported: false },
];
const JAVA_EDGES = [{ from: "App.java#App.start", toName: "helper", resolved: "App.java#App.helper" }];

const PY_SYMBOLS = [
  { id: "tool.py#Client", kind: "class", span: [6, 14], exported: true },
  { id: "tool.py#Client.__init__", kind: "method", span: [7, 8], exported: false },
  { id: "tool.py#Client._internal", kind: "method", span: [13, 14], exported: false },
  { id: "tool.py#Client.fetch", kind: "method", span: [10, 11], exported: true },
  { id: "tool.py#_norm", kind: "function", span: [17, 18], exported: false },
  { id: "tool.py#public_fn", kind: "function", span: [21, 24], exported: true },
];
const PY_EDGES = [
  { from: "tool.py#Client.fetch", toName: "_norm", resolved: "tool.py#_norm" },
  { from: "tool.py#public_fn", toName: "_norm", resolved: "tool.py#_norm" },
  { from: "tool.py#public_fn", toName: "local", resolved: null },
];

describe("SPEC-053 AC1 — Go extraction", () => {
  test("pinned symbol table and edges", async () => {
    const m = await extractGraph(stage("go"));
    expect(rows(m)).toEqual(GO_SYMBOLS);
    expect(edgeRows(m)).toEqual(GO_EDGES);
  });
});

describe("SPEC-053 AC2 — Java extraction", () => {
  test("pinned symbol table and edges", async () => {
    const m = await extractGraph(stage("java"));
    expect(rows(m)).toEqual(JAVA_SYMBOLS);
    expect(edgeRows(m)).toEqual(JAVA_EDGES);
  });
});

describe("SPEC-053 AC3 — Python extraction", () => {
  test("pinned symbol table and edges", async () => {
    const m = await extractGraph(stage("python"));
    expect(rows(m)).toEqual(PY_SYMBOLS);
    expect(edgeRows(m)).toEqual(PY_EDGES);
  });
});

describe("SPEC-053 AC5 — mixed-language union", () => {
  test("one manifest, per-file slices equal the single-language pins", async () => {
    const m = await extractGraph(stage("mixed"));
    const byFile = (f: string) => rows(m).filter((r) => r.id.startsWith(`${f}#`));
    expect(byFile("svc.go")).toEqual(GO_SYMBOLS.filter((r) => r.id.startsWith("svc.go#")));
    expect(byFile("App.java")).toEqual(JAVA_SYMBOLS);
    expect(byFile("tool.py")).toEqual(PY_SYMBOLS);
    expect(byFile("web.ts")).toEqual([
      { id: "web.ts#render", kind: "function", span: [1, 3], exported: true },
    ]);
    // No file claimed twice, none dropped.
    const files = new Set(m.symbols.map((s) => s.file));
    expect([...files].sort()).toEqual(["App.java", "svc.go", "tool.py", "web.ts"]);
  });

  test("adapter routing is by extension and total for the supported set", () => {
    expect(adapterForFile("a/b.go")?.name).toBe("go");
    expect(adapterForFile("a/b.java")?.name).toBe("java");
    expect(adapterForFile("a/b.py")?.name).toBe("python");
    expect(adapterForFile("a/b.ts")?.name).toBe("typescript");
    expect(adapterForFile("a/b.rb")).toBeNull();
    expect(adapterForFile("Makefile")).toBeNull();
    expect(SUPPORTED_LANGUAGES).toEqual(["typescript", "go", "java", "python"]);
  });
});

describe("SPEC-053 — unsupported-only repo names the supported set", () => {
  test("empty discovery, and the CLI says so instead of failing silently", () => {
    const dir = mkdtempSync(join(tmpdir(), "lang-none-"));
    writeFileSync(join(dir, "main.rb"), "puts 1\n");
    mkdirSync(join(dir, "docs"), { recursive: true });
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "add", "-A"]);
    expect(listSourceFiles(dir)).toEqual([]);
    const res = execFileSync(
      "bun",
      [new URL("../src/extract.ts", import.meta.url).pathname, "--target", dir, "--out", join(dir, "m.json")],
      { encoding: "utf8", env: process.env, stdio: ["ignore", "pipe", "pipe"] },
    );
    // stdout still reports the deterministic (empty) manifest…
    expect(res).toContain("symbols=0");
  });

  test("…and stderr carries the supported-set note", () => {
    const dir = mkdtempSync(join(tmpdir(), "lang-none2-"));
    writeFileSync(join(dir, "main.rb"), "puts 1\n");
    execFileSync("git", ["-C", dir, "init", "-q"]);
    execFileSync("git", ["-C", dir, "add", "-A"]);
    const proc = Bun.spawnSync(
      ["bun", new URL("../src/extract.ts", import.meta.url).pathname, "--target", dir, "--out", join(dir, "m.json")],
      { env: process.env },
    );
    const stderr = proc.stderr.toString();
    expect(stderr).toContain("no supported-language sources");
    expect(stderr).toContain("typescript, go, java, python");
    expect(stderr).toContain("judge-only");
  });
});
