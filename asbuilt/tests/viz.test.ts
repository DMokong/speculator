// claw-efne: viz.ts productization coverage. Builds a synthetic bundle +
// manifest and asserts the visualize sheet's core contracts: self-contained
// output, parseable embedded data, correct edge collapsing, test
// classification by frontmatter (never path shape, claw-wsit), script-breakout
// escaping, and byte-identical determinism.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildViz } from "../src/viz";

function writeConcept(
  bundleDir: string,
  relPath: string,
  fm: Record<string, unknown>,
  body = "# Structure\n\nmachine content\n",
) {
  const full = join(bundleDir, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  const fmText = Object.entries(fm)
    .map(([k, v]) => (Array.isArray(v) ? (v.length ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: []`) : `${k}: ${v}`))
    .join("\n");
  writeFileSync(full, `---\n${fmText}\n---\n\n${body}`);
}

function makeSandbox(): string {
  const target = mkdtempSync(join(tmpdir(), "viz-test-"));
  const bundleDir = join(target, "docs", "asbuilt");
  mkdirSync(bundleDir, { recursive: true });

  writeFileSync(
    join(bundleDir, ".graph-manifest.json"),
    JSON.stringify({
      target_commit: "abc1234",
      symbols: [
        { id: "src/alpha.ts#run", file: "src/alpha.ts" },
        { id: "src/alpha.ts#helper", file: "src/alpha.ts" },
        { id: "src/beta.ts#consume", file: "src/beta.ts" },
        { id: "tests/alpha.test.ts#t1", file: "tests/alpha.test.ts" },
      ],
      edges: [
        { from: "src/beta.ts#consume", toName: "run", resolved: "src/alpha.ts#run" },
        { from: "src/alpha.ts#run", toName: "helper", resolved: "src/alpha.ts#helper" }, // same-file: no link
        { from: "src/beta.ts#consume", toName: "ghost", resolved: null }, // unresolved: no link
      ],
    }),
  );

  writeConcept(
    bundleDir,
    "src/alpha.md",
    { type: "Module", title: "src/alpha.ts", description: "alpha", resource: "src/alpha.ts", tags: ["src", "module"], enrichment: "fully-audited", from: ["SPEC-001"], explains: [], stale: false },
    "# Structure\n\nstuff\n\n# Explanation\n\nAlpha explains </script> escaping too.\n\n# Decisions\n\n- kept it simple\n- stayed deterministic\n",
  );
  writeConcept(bundleDir, "src/beta.md", {
    type: "Module",
    title: "src/beta.ts",
    description: "beta",
    resource: "src/beta.ts",
    tags: ["src", "module"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  // co-located test file — classified Test by frontmatter, path says nothing
  writeConcept(bundleDir, "tests/alpha.test.md", {
    type: "Test",
    title: "tests/alpha.test.ts",
    description: "alpha tests",
    resource: "tests/alpha.test.ts",
    tags: ["tests", "test"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  // resource-less files must be skipped (index/log)
  writeFileSync(join(bundleDir, "index.md"), "---\ntitle: index\n---\n\n# Index\n");

  return target;
}

describe("buildViz (claw-efne productization)", () => {
  const target = makeSandbox();
  const result = buildViz(target, "2026-07-11");

  test("output is a single self-contained document with no external resource references", () => {
    expect(result.html).not.toMatch(/<script[^>]+src=/i);
    expect(result.html).not.toMatch(/<link[^>]+href=/i);
    expect(result.html).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|@import/);
    // The only URL allowed is the SVG namespace identifier (createElementNS
    // requires it verbatim; it is never fetched).
    const urls = result.html.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.every((u) => u.startsWith("http://www.w3.org/"))).toBe(true);
  });

  test("embeds the bundle data as parseable JSON with correct counts", () => {
    const m = result.html.match(/__ASBUILT_DATA__|(\{"meta":.*"links":\[.*\]\})/s);
    expect(result.html).not.toContain("__ASBUILT_DATA__"); // placeholder replaced
    const data = JSON.parse(m?.[1] ?? "{}");
    expect(data.meta.concepts).toBe(3); // index.md (no resource) skipped
    expect(data.meta.audited).toBe(1);
    expect(data.meta.target_commit).toBe("abc1234");
    expect(data.meta.date).toBe("2026-07-11");
    expect(data.meta.folds).toEqual(["SPEC-001"]);
  });

  test("collapses resolved cross-file edges to file links; same-file and unresolved edges never link", () => {
    expect(result.fileLinks).toBe(1);
    expect(result.resolvedEdges).toBe(2); // the same-file edge is resolved, just not a link
    const data = JSON.parse(result.html.match(/(\{"meta":.*"links":\[.*\]\})/s)?.[1] ?? "{}");
    expect(data.links).toEqual([{ source: "src/beta.ts", target: "src/alpha.ts", w: 1 }]);
  });

  test("test concepts group as 'tests' by classification, not path (claw-wsit)", () => {
    const data = JSON.parse(result.html.match(/(\{"meta":.*"links":\[.*\]\})/s)?.[1] ?? "{}");
    const testNode = data.nodes.find((n: { id: string }) => n.id === "tests/alpha.test.ts");
    expect(testNode.group).toBe("tests");
  });

  test("explanation and decisions sections are extracted; </ is escaped against script breakout", () => {
    const data = JSON.parse(result.html.match(/(\{"meta":.*"links":\[.*\]\})/s)?.[1] ?? "{}");
    const alpha = data.nodes.find((n: { id: string }) => n.id === "src/alpha.ts");
    expect(alpha.explanation).toContain("Alpha explains");
    expect(alpha.decisions).toEqual(["kept it simple", "stayed deterministic"]);
    expect(result.html).not.toContain("</script> escaping"); // raw close-tag never lands in the embedded JSON
  });

  test("deterministic: two builds of the same bundle are byte-identical", () => {
    const again = buildViz(target, "2026-07-11");
    expect(again.html).toBe(result.html);
  });

  test("cleanup", () => {
    rmSync(target, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});
