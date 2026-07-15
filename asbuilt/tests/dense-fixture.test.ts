// SPEC-004 R7: dense-bundle fixture generator regression coverage (task
// 02-dense-fixture). The fixture reproduces the sdlc-clients field-failure
// shape — cmd/cli: 54 source + 42 co-located test concepts; internal/model 6;
// internal/util 4; internal/cli 4; root main.go 1 -> 111 concepts total — for
// use by the spike (T03) and the future regression suite (T06). These tests
// pin the fixture's observable shape and prove the generator itself has no
// randomness or clock reads, ahead of any consumer relying on it.
//
// Grouping note: viz.ts is pre-T04 today, so test concepts are classified
// into a single global "tests" bucket by frontmatter (claw-wsit), never by
// path. Once SPEC-004 T04 lands path-grouping, cmd/cli's 42 co-located tests
// join their source directory's compound and `cmd/cli` becomes 96 (spec.md
// AC1) — T06 flips the assertion below; this task only leaves the comment.
import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildViz } from "../src/viz";
import { makeDenseSandbox } from "./helpers/dense-fixture";

interface EmbeddedNode {
  id: string;
  group: string;
  enrichment: string;
}

interface EmbeddedData {
  meta: { concepts: number; audited: number };
  nodes: EmbeddedNode[];
  links: { source: string; target: string; w: number }[];
}

interface Manifest {
  target_commit: string;
  symbols: { id: string; file: string }[];
  edges: { from: string; toName: string; resolved: string | null }[];
}

function embeddedData(html: string): EmbeddedData {
  const m = html.match(/(\{"meta":.*"links":\[.*\]\})/s);
  return JSON.parse(m?.[1] ?? "{}") as EmbeddedData;
}

describe("dense fixture (SPEC-004 R7)", () => {
  const target = makeDenseSandbox();
  const result = buildViz(target, "2026-07-15");
  const data = embeddedData(result.html);

  // R7 done-check: "111 total concepts from buildViz"
  test("R7: reproduces the field-shape concept count -- 111 total", () => {
    expect(result.concepts).toBe(111);
    expect(data.nodes.length).toBe(111);
  });

  // R7 done-check: "54 nodes in group cmd/cli + 42 in group tests (the
  // CURRENT pre-T04 grouping...)"
  test("R7: pre-T04 grouping -- 54 source concepts in cmd/cli, 42 co-located tests in the global tests bucket", () => {
    const cli = data.nodes.filter((n) => n.group === "cmd/cli");
    const testsGroup = data.nodes.filter((n) => n.group === "tests");
    expect(cli.length).toBe(54);
    expect(testsGroup.length).toBe(42);
    // flips to 96 in group "cmd/cli" (54 source + 42 test, path-grouped
    // together) once SPEC-004 T04 lands -- see plan.md Task T04, spec.md AC1.
  });

  // R7 shape table: small internal/* groups plus the root file's default
  // "src" grouping (single path segment, no directory).
  test("R7: small internal/* groups and the root file's default 'src' grouping match the shape table", () => {
    const byGroup = (g: string) => data.nodes.filter((n) => n.group === g).length;
    expect(byGroup("internal/model")).toBe(6);
    expect(byGroup("internal/util")).toBe(4);
    expect(byGroup("internal/cli")).toBe(4);
    expect(byGroup("src")).toBe(1); // main.go: root file groups to "src" under current rules
  });

  // Required content: "Enrichment fully-audited on a fixed stride (every 3rd
  // concept, i % 3 === 0), else none." -- computed against the reference
  // implementation's per-group loop index (resets per directory/source-vs-
  // test loop, not a single running counter across all 111 concepts).
  test("R7: enrichment lands on the fixed 1-in-3 stride -- 39 of 111 concepts fully-audited", () => {
    expect(result.audited).toBe(39);
    expect(data.meta.audited).toBe(39);
    expect(data.nodes.filter((n) => n.enrichment === "fully-audited").length).toBe(39);
  });

  // Required content: concept frontmatter conventions + the fixed enrichment
  // stride's effect on concept bodies (audited concepts get "# Explanation").
  test("R7: test concepts carry frontmatter-driven classification; audited concepts get an Explanation section", () => {
    // file000_test.go (i=0): test concept, i % 3 === 0 -> audited.
    const testConcept = readFileSync(join(target, "docs/asbuilt/cmd/cli/file000_test.md"), "utf8");
    expect(testConcept).toContain("type: Test");
    expect(testConcept).toMatch(/tags:[\s\S]*- test/);
    expect(testConcept).toContain("# Explanation");

    // file001.go (i=1): source concept, i % 3 !== 0 -> not audited.
    const unauditedSource = readFileSync(join(target, "docs/asbuilt/cmd/cli/file001.md"), "utf8");
    expect(unauditedSource).toContain("type: Module");
    expect(unauditedSource).not.toContain("# Explanation");
  });

  // Required content: ".graph-manifest.json ... one symbol per concept ...
  // and a deterministic sparse edge web" (source concepts, i % 4 === 1).
  test("R7: manifest has one symbol per concept, the fixed target_commit, and the sparse i%4===1 edge web", () => {
    const manifest = JSON.parse(
      readFileSync(join(target, "docs/asbuilt/.graph-manifest.json"), "utf8"),
    ) as Manifest;
    expect(manifest.target_commit).toBe("f1e1d0c");
    expect(manifest.symbols.length).toBe(111); // one symbol per concept
    expect(manifest.symbols).toContainEqual({ id: "cmd/cli/file000.go#fn0", file: "cmd/cli/file000.go" });
    // 14 (cmd/cli) + 2 (internal/model) + 1 (internal/util) + 1 (internal/cli); main.go's
    // sole index is 0, which never satisfies i % 4 === 1.
    expect(manifest.edges.length).toBe(18);
    expect(manifest.edges).toContainEqual({
      from: "cmd/cli/file001.go#fn1",
      toName: "fn0",
      resolved: "cmd/cli/file000.go#fn0",
    });
  });

  // Downstream of the manifest: buildViz resolves and collapses the sparse
  // edge web to file-level links. No edge is a same-file self-loop (the
  // qualifying source indices, i % 4 === 1, never coincide with the target
  // hub's index 0), so every edge becomes a distinct link.
  test("R7: buildViz resolves and collapses the sparse edge web to 18 distinct file links", () => {
    expect(result.resolvedEdges).toBe(18);
    expect(result.fileLinks).toBe(18);
  });

  // Required content: "NO randomness, NO clock reads anywhere." (done-check
  // phrasing: "two buildViz calls on the same sandbox -> byte-identical html")
  test("R7: deterministic output -- two buildViz calls on the same sandbox are byte-identical", () => {
    const again = buildViz(target, "2026-07-15");
    expect(again.html).toBe(result.html);
  });

  test("cleanup: generator's temp dir is fully removable and leaves nothing behind", () => {
    rmSync(target, { recursive: true, force: true });
    expect(existsSync(target)).toBe(false);
  });
});

describe("dense fixture generator has no randomness or clock reads across independent sandboxes (SPEC-004 R7)", () => {
  test("R7: two independent makeDenseSandbox() calls produce byte-identical bundle content", () => {
    const a = makeDenseSandbox();
    const b = makeDenseSandbox();
    try {
      // Manifest content never embeds the tmp-dir path (resources are
      // bundle-relative), so it must be byte-identical across independently
      // generated sandboxes if the generator is free of randomness/clock reads.
      const manifestA = readFileSync(join(a, "docs/asbuilt/.graph-manifest.json"), "utf8");
      const manifestB = readFileSync(join(b, "docs/asbuilt/.graph-manifest.json"), "utf8");
      expect(manifestA).toBe(manifestB);

      // Spot-check a concept file's content too, not just the manifest.
      const conceptA = readFileSync(join(a, "docs/asbuilt/cmd/cli/file010.md"), "utf8");
      const conceptB = readFileSync(join(b, "docs/asbuilt/cmd/cli/file010.md"), "utf8");
      expect(conceptA).toBe(conceptB);
    } finally {
      rmSync(a, { recursive: true, force: true });
      rmSync(b, { recursive: true, force: true });
    }
  });
});
