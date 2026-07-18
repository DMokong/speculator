// SPEC-004 T04: viz.ts data-model contract — path-derived grouping + the
// classification-only `test` flag (AC1), the `toElements()` cytoscape mapping,
// and `inlineVendor`'s split/join vendor-inlining plumbing (AC3/AC9).
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type VizConceptNode, type VizLink, buildViz, inlineVendor, toElements } from "../src/viz";

// Copied from viz.test.ts's makeSandbox/writeConcept conventions (tasks may be
// read out of order — see T04 brief).
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
  const target = mkdtempSync(join(tmpdir(), "viz-elements-test-"));
  const bundleDir = join(target, "docs", "asbuilt");
  mkdirSync(bundleDir, { recursive: true });

  writeFileSync(
    join(bundleDir, ".graph-manifest.json"),
    JSON.stringify({
      target_commit: "def5678",
      symbols: [
        { id: "src/tools/x.ts#run", file: "src/tools/x.ts" },
        { id: "src/tools/x.test.ts#t1", file: "src/tools/x.test.ts" },
      ],
      edges: [],
    }),
  );

  writeConcept(bundleDir, "src/tools/x.md", {
    type: "Module",
    title: "src/tools/x.ts",
    description: "x",
    resource: "src/tools/x.ts",
    tags: ["src", "module"],
    enrichment: "fully-audited",
    from: [],
    explains: [],
    stale: false,
  });
  // co-located test concept — classified Test by frontmatter; path lives WITH
  // its source directory, not under a "tests" spatial bucket (claw-wsit's
  // surviving classification half, SPEC-004's grouping half).
  writeConcept(bundleDir, "src/tools/x.test.md", {
    type: "Test",
    title: "src/tools/x.test.ts",
    description: "x tests",
    resource: "src/tools/x.test.ts",
    tags: ["src", "test"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  // genuinely two-segment "tests/*" file: groupOf gives it the root "src"
  // bucket (same as any other root-adjacent 2-segment path) — it must never
  // land in a bare "tests" group either.
  writeConcept(bundleDir, "tests/smoke.md", {
    type: "Test",
    title: "tests/smoke.ts",
    description: "top-level smoke test",
    resource: "tests/smoke.ts",
    tags: ["test"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  // Asymmetric classification signals (hardening round 2 — survivor: AC1's
  // isTestConcept relaxed to drop the `fm.type === "Test"` disjunct, keeping
  // only the tag check). Every other fixture in this suite sets BOTH `type:
  // Test` AND a `test` tag together, so dropping either OR-branch was
  // invisible. These two concepts exercise each signal alone.
  writeConcept(bundleDir, "src/tools/typeonly.md", {
    type: "Test", // type-only signal: no "test" tag present
    title: "src/tools/typeonly.ts",
    description: "classified test by type alone",
    resource: "src/tools/typeonly.ts",
    tags: ["src"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  writeConcept(bundleDir, "src/tools/tagonly.md", {
    type: "Module", // tag-only signal: type is NOT "Test"
    title: "src/tools/tagonly.ts",
    description: "classified test by tag alone",
    resource: "src/tools/tagonly.ts",
    tags: ["src", "test"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });

  return target;
}

describe("path grouping + test flag (SPEC-004 AC1)", () => {
  const target = makeSandbox();
  const result = buildViz(target, "2026-07-16");
  const data = JSON.parse(result.html.match(/(\{"meta":.*"elements":\[.*\]\})/s)?.[1] ?? "{}");

  test("co-located test concept: group is path-derived (src/tools), test flag true", () => {
    const n = data.nodes.find((x: { id: string }) => x.id === "src/tools/x.test.ts");
    expect(n.group).toBe("src/tools");
    expect(n.test).toBe(true);
  });

  test("sibling source concept in the same group is not flagged test", () => {
    const n = data.nodes.find((x: { id: string }) => x.id === "src/tools/x.ts");
    expect(n.group).toBe("src/tools");
    expect(n.test).toBe(false);
  });

  test("no node is ever grouped bare 'tests' — the hardcoded spatial bucket is gone", () => {
    for (const n of data.nodes as { id: string; group: string }[]) {
      expect(n.group).not.toBe("tests");
    }
    // the genuinely-two-segment tests/smoke.ts file groups to the root "src"
    // bucket under groupOf, same as any other 2-segment path — not "tests".
    const smoke = data.nodes.find((x: { id: string }) => x.id === "tests/smoke.ts");
    expect(smoke.group).toBe("src");
  });

  // AC1 (hardening round 2): each classification signal must independently
  // suffice — dropping either OR-branch of isTestConcept is a real, plausible
  // regression (survivor: "isTestConcept relaxed to drop `fm.type ===
  // \"Test\"`, keeping only the `test` tag check") that every other fixture
  // in this file was blind to, since they always set both signals together.
  test("type-only test classification: type: Test with no 'test' tag is still classified test", () => {
    const n = data.nodes.find((x: { id: string }) => x.id === "src/tools/typeonly.ts");
    expect(n.test).toBe(true);
  });

  test("tag-only test classification: a 'test' tag with type !== Test is still classified test", () => {
    const n = data.nodes.find((x: { id: string }) => x.id === "src/tools/tagonly.ts");
    expect(n.test).toBe(true);
  });

  test("cleanup", () => {
    rmSync(target, { recursive: true, force: true });
    expect(true).toBe(true);
  });
});

// Pure toElements() tests — hand-built node/link fixtures, no filesystem.
function makeNode(overrides: Partial<VizConceptNode> & Pick<VizConceptNode, "id" | "group">): VizConceptNode {
  return {
    concept: `${overrides.id}.md`,
    title: overrides.id,
    type: "Module",
    description: "",
    tags: [],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
    symbols: 1,
    exports: [],
    explanation: "",
    decisions: [],
    test: false,
    ...overrides,
  };
}

describe("toElements() mapping", () => {
  // Deliberately out-of-order groups/ids/edges to prove the function sorts,
  // not the caller.
  const nodes: VizConceptNode[] = [
    makeNode({ id: "b/two.ts", group: "b", symbols: 4, enrichment: "fully-audited" }),
    makeNode({ id: "a/one.ts", group: "a", symbols: 1, enrichment: "none" }),
    makeNode({ id: "a/one.test.ts", group: "a", symbols: 2, enrichment: "accuracy-audited", test: true, type: "Test" }),
  ];
  const links: VizLink[] = [{ source: "a/one.ts", target: "b/two.ts", w: 3 }];

  test("one parent element per group, id dir:<group>, codepoint-sorted", () => {
    const els = toElements(nodes, links);
    const parents = els.filter((e) => e.data.id.startsWith("dir:"));
    expect(parents.map((p) => p.data.id)).toEqual(["dir:a", "dir:b"]);
    expect(parents.map((p) => p.data.label)).toEqual(["a", "b"]);
    for (const p of parents) expect(p.classes).toBeUndefined();
  });

  test("every child node wires parent to dir:<its own group>", () => {
    const els = toElements(nodes, links);
    const children = els.filter((e) => e.data.parent !== undefined);
    expect(children).toHaveLength(3);
    for (const c of children) {
      const src = nodes.find((n) => n.id === c.data.id);
      expect(c.data.parent).toBe(`dir:${src?.group}`);
    }
  });

  test("child nodes sorted by id; label is basename; diameter + state class + test suffix", () => {
    const els = toElements(nodes, links);
    const children = els.filter((e) => e.data.parent !== undefined);
    expect(children.map((c) => c.data.id)).toEqual(["a/one.test.ts", "a/one.ts", "b/two.ts"]);

    const test1 = children.find((c) => c.data.id === "a/one.test.ts");
    expect(test1?.data.label).toBe("one.test.ts");
    expect(test1?.data.test).toBe(true);
    expect(test1?.data.d).toBeCloseTo(2 * (4 + 2.3 * Math.sqrt(2)));
    expect(test1?.classes).toBe("accuracy test");

    const one = children.find((c) => c.data.id === "a/one.ts");
    expect(one?.data.test).toBe(false);
    expect(one?.data.d).toBeCloseTo(2 * (4 + 2.3 * Math.sqrt(1)));
    expect(one?.classes).toBe("skeleton");

    const two = children.find((c) => c.data.id === "b/two.ts");
    expect(two?.data.d).toBeCloseTo(2 * (4 + 2.3 * Math.sqrt(4)));
    expect(two?.classes).toBe("full");
  });

  test("edges: id source->target, weight carried, sorted source then target", () => {
    const twoLinks: VizLink[] = [
      { source: "b/two.ts", target: "a/one.ts", w: 1 },
      { source: "a/one.ts", target: "b/two.ts", w: 3 },
      { source: "a/one.ts", target: "a/one.test.ts", w: 2 },
    ];
    const els = toElements(nodes, twoLinks);
    const edges = els.filter((e) => e.data.source !== undefined);
    expect(edges.map((e) => e.data.id)).toEqual([
      "a/one.ts->a/one.test.ts",
      "a/one.ts->b/two.ts",
      "b/two.ts->a/one.ts",
    ]);
    const w = edges.find((e) => e.data.id === "a/one.ts->b/two.ts");
    expect(w?.data.source).toBe("a/one.ts");
    expect(w?.data.target).toBe("b/two.ts");
    expect(w?.data.w).toBe(3);
  });

  test("deterministic: two calls over the same (unmutated) inputs deep-equal", () => {
    const first = toElements(nodes, links);
    const second = toElements(nodes, links);
    expect(second).toEqual(first);
    // inputs are not mutated by toElements (order-independence check)
    expect(nodes.map((n) => n.id)).toEqual(["b/two.ts", "a/one.ts", "a/one.test.ts"]);
  });
});

describe("inlineVendor() (SPEC-004 AC3/AC9 plumbing)", () => {
  const vendorDir = new URL("../vendor/", import.meta.url);
  const layoutBase = readFileSync(new URL("layout-base.js", vendorDir), "utf8");
  const coseBase = readFileSync(new URL("cose-base.js", vendorDir), "utf8");
  const cytoscape = readFileSync(new URL("cytoscape.min.js", vendorDir), "utf8");
  const fcose = readFileSync(new URL("cytoscape-fcose.js", vendorDir), "utf8");

  test("regression pin: at least one shipped vendor file contains a literal $& (String.replace corruption trigger)", () => {
    // If inlineVendor ever regressed to String.replace(placeholder, content),
    // a "$&" inside content would be interpreted as the special "insert
    // matched substring" replacement pattern and corrupt the inlined bytes.
    expect(cytoscape).toContain("$&");
  });

  test("round-trips all four placeholders byte-exact, wrapped in start/end markers", () => {
    const template = [
      "<script>__VENDOR_LAYOUT_BASE__</script>",
      "<script>__VENDOR_COSE_BASE__</script>",
      "<script>__VENDOR_CYTOSCAPE__</script>",
      "<script>__VENDOR_FCOSE__</script>",
    ].join("\n");

    const out = inlineVendor(template);

    expect(out).toContain(`/*VENDOR:layout-base:start*/${layoutBase}/*VENDOR:layout-base:end*/`);
    expect(out).toContain(`/*VENDOR:cose-base:start*/${coseBase}/*VENDOR:cose-base:end*/`);
    expect(out).toContain(`/*VENDOR:cytoscape:start*/${cytoscape}/*VENDOR:cytoscape:end*/`);
    expect(out).toContain(`/*VENDOR:fcose:start*/${fcose}/*VENDOR:fcose:end*/`);
    expect(out).not.toContain("__VENDOR_"); // every placeholder was replaced
  });

  test("no-op on a synthetic template without placeholders", () => {
    const template = "<html><body>no vendor slots here at all</body></html>";
    expect(inlineVendor(template)).toBe(template);
  });

  // T05 (commit 69e3a82) shipped the real template's vendor slots as bare
  // `__VENDOR_*__` placeholders (see viz.ts:199's own doc comment: "a no-op
  // ... until T05 lands"). This test originally pinned the pre-T05,
  // placeholder-free state; it now pins the post-T05 contract instead —
  // inlineVendor must actually inline all four vendor files into the real
  // shipped template, wrapped in start/end markers, with no placeholder
  // left behind (mirrors the synthetic round-trip test above, against the
  // real template instead of a hand-built one; T06/viz.test.ts separately
  // byte-compares these regions end-to-end via buildViz's output).
  test("inlines all four vendor placeholders in the real (post-T05) viz-template.html, wrapped in start/end markers", () => {
    const realTemplate = readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8");
    const out = inlineVendor(realTemplate);
    expect(out).toContain(`/*VENDOR:layout-base:start*/${layoutBase}/*VENDOR:layout-base:end*/`);
    expect(out).toContain(`/*VENDOR:cose-base:start*/${coseBase}/*VENDOR:cose-base:end*/`);
    expect(out).toContain(`/*VENDOR:cytoscape:start*/${cytoscape}/*VENDOR:cytoscape:end*/`);
    expect(out).toContain(`/*VENDOR:fcose:start*/${fcose}/*VENDOR:fcose:end*/`);
    expect(out).not.toContain("__VENDOR_"); // every placeholder was replaced
  });
});
