import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import { manifestHash, requirePin, saveManifest } from "../src/manifest";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

describe("AC1: deterministic extraction", () => {
  test("AC1: two successive extractions are byte-identical", async () => {
    const a = await extractGraph(FIXTURE);
    const b = await extractGraph(FIXTURE);
    // Per-test tmp dir (not a hardcoded /tmp/ path) so parallel test runs
    // never collide on the same file (test isolation, SPEC-049 Task 1).
    const dir = mkdtempSync(join(tmpdir(), "asbuilt-"));
    try {
      const aPath = join(dir, "a.json");
      const bPath = join(dir, "b.json");
      saveManifest(aPath, a);
      saveManifest(bPath, b);
      expect(readFileSync(aPath)).toEqual(readFileSync(bPath));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    expect(manifestHash(a)).toBe(manifestHash(b));
  });

  test("AC1: fixture golden inventory matches exactly", async () => {
    const m = await extractGraph(FIXTURE);
    const golden = JSON.parse(
      readFileSync(new URL("fixtures/expected-symbols/fixture-repo.json", import.meta.url).pathname, "utf8"),
    );
    const got = m.symbols.map(({ id, kind, file, span, exported }) => ({ id, kind, file, span, exported }));
    expect(got).toEqual(golden.symbols);
  });

  test("call edges resolve within the repo", async () => {
    const m = await extractGraph(FIXTURE);
    const edge = m.edges.find((e) => e.from === "src/alpha.ts#AlphaService.run" && e.toName === "helper");
    expect(edge?.resolved).toBe("src/alpha.ts#helper");
    const cross = m.edges.find((e) => e.from === "src/alpha.ts#alphaMain" && e.toName === "gamma");
    expect(cross?.resolved).toBe("src/util/gamma.ts#gamma");
  });

  test("AC1: r2mcp golden sample (env-gated)", async () => {
    const R2 = `${process.env.HOME}/projects/r2mcp`;
    const goldenPath = new URL("fixtures/expected-symbols/r2mcp-sample.json", import.meta.url).pathname;
    if (!existsSync(R2) || !existsSync(goldenPath)) return; // env-gated: skip silently off-machine
    const golden = JSON.parse(readFileSync(goldenPath, "utf8"));
    const pinned = execSync(`git -C ${R2} rev-parse HEAD`).toString().trim();
    if (pinned !== golden.target_commit) return; // r2mcp moved past the pin; sample re-baselined in Phase 3 refresh work
    const m = await extractGraph(R2);
    for (const sym of golden.symbols) {
      const found = m.symbols.find((s) => s.id === sym.id);
      expect(found).toBeDefined();
      expect(found).toMatchObject(sym);
    }
  });
});

describe("AC8 hardening: requirePin loud missing-pin guard", () => {
  test("throws when web-tree-sitter is absent from a present dependencies object", () => {
    expect(() => requirePin({ dependencies: {} })).toThrow(
      "web-tree-sitter pin missing from asbuilt/package.json dependencies",
    );
  });

  test("throws when dependencies itself is absent", () => {
    expect(() => requirePin({})).toThrow("web-tree-sitter pin missing from asbuilt/package.json dependencies");
  });

  test("throws when web-tree-sitter is present but an empty string", () => {
    expect(() => requirePin({ dependencies: { "web-tree-sitter": "" } })).toThrow(
      "web-tree-sitter pin missing from asbuilt/package.json dependencies",
    );
  });

  test("throws when web-tree-sitter is present but not a string", () => {
    expect(() => requirePin({ dependencies: { "web-tree-sitter": 24 } })).toThrow(
      "web-tree-sitter pin missing from asbuilt/package.json dependencies",
    );
  });

  test("returns the exact version string when the pin is present and non-empty", () => {
    expect(requirePin({ dependencies: { "web-tree-sitter": "0.24.5" } })).toBe("0.24.5");
  });

  test("extractGraph itself resolves the real pinned version onto the manifest (integration, not just the unit guard)", async () => {
    const m = await extractGraph(FIXTURE);
    expect(m.extractor.version).toBe("0.24.5");
  });
});
