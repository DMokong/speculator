// claw-efne / SPEC-004 T06: viz.ts productization + Cytoscape-engine
// coverage. Builds a synthetic bundle + manifest and asserts the visualize
// sheet's core contracts: self-contained output (vendor regions byte-equal
// to asbuilt/vendor/, AC3), parseable embedded data (including the
// cytoscape `elements` block), correct edge collapsing, path-derived
// grouping with frontmatter-driven test classification (AC1, superseding
// claw-wsit's SPATIAL rule), script-breakout escaping, and byte-identical
// determinism.
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CLI_USAGE, buildViz } from "../src/viz";

const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;

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
        { id: "src/tools/x.test.ts#t1", file: "src/tools/x.test.ts" },
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
    // AC6 hardening (round 2 — survivor: `.sort()` dropped from `meta.folds`'
    // computation). "src/alpha.md" (from: SPEC-001) walks before "src/beta.md"
    // alphabetically, so insertion order is ["SPEC-001", "SPEC-000"] — the
    // OPPOSITE of codepoint-sorted ["SPEC-000", "SPEC-001"]. Every prior
    // fixture had ≤1 distinct `from` value, making sorted-vs-insertion-order
    // unobservable; this makes it observable.
    from: ["SPEC-000"],
    explains: [],
    stale: false,
  });
  // co-located test file, sitting inside its source directory (src/tools) --
  // classified Test by frontmatter, never by path shape (SPEC-004 AC1).
  writeConcept(bundleDir, "src/tools/x.test.md", {
    type: "Test",
    title: "src/tools/x.test.ts",
    description: "co-located test",
    resource: "src/tools/x.test.ts",
    tags: ["tools", "test"],
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
  });
  // resource-less files must be skipped (index/log)
  writeFileSync(join(bundleDir, "index.md"), "---\ntitle: index\n---\n\n# Index\n");

  return target;
}

interface EmbeddedNode {
  id: string;
  group: string;
  test: boolean;
  enrichment: string;
  explanation: string;
  decisions: string[];
}

interface EmbeddedElement {
  data: {
    id: string;
    parent?: string;
    source?: string;
    target?: string;
  };
}

interface EmbeddedData {
  meta: { concepts: number; audited: number; target_commit: string; date: string; folds: string[] };
  nodes: EmbeddedNode[];
  links: { source: string; target: string; w: number }[];
  elements: EmbeddedElement[];
}

function embeddedData(html: string): EmbeddedData {
  // Anchored on the `elements` key (the last field `buildViz` embeds, SPEC-004
  // T04) so the match reaches the true end of the object rather than
  // stopping at the old `links`-terminal shape.
  const m = html.match(/(\{"meta":.*"elements":\[.*\]\})/s);
  return JSON.parse(m?.[1] ?? "{}") as EmbeddedData;
}

const VENDOR_FILES: [name: string, file: string][] = [
  ["layout-base", "layout-base.js"],
  ["cose-base", "cose-base.js"],
  ["cytoscape", "cytoscape.min.js"],
  ["fcose", "cytoscape-fcose.js"],
];

/** Splits the built HTML on the `/*VENDOR:name:start|end*\/` markers
 * `inlineVendor` wraps each vendored file in (AC3), returning each vendor
 * region's content plus the remainder of the document with every vendor
 * region removed. The remainder gets the pre-existing self-containment
 * checks; the vendor regions get a byte-equality check against
 * `asbuilt/vendor/` instead (license-comment URLs inside vendor code are
 * covered by that byte-equality, not the URL allowlist). */
function splitVendorRegions(html: string): { nonVendor: string; regions: Map<string, string> } {
  let nonVendor = html;
  const regions = new Map<string, string>();
  for (const [name] of VENDOR_FILES) {
    const start = `/*VENDOR:${name}:start*/`;
    const end = `/*VENDOR:${name}:end*/`;
    const s = nonVendor.indexOf(start);
    const e = nonVendor.indexOf(end, s + start.length);
    if (s === -1 || e === -1) continue;
    regions.set(name, nonVendor.slice(s + start.length, e));
    nonVendor = nonVendor.slice(0, s) + nonVendor.slice(e + end.length);
  }
  return { nonVendor, regions };
}

describe("buildViz (claw-efne productization, SPEC-004 T06)", () => {
  const target = makeSandbox();
  const result = buildViz(target, "2026-07-11");

  test("self-containment (AC3): vendor regions are byte-equal to asbuilt/vendor/, and the non-vendor remainder has no external resource references", () => {
    const { nonVendor, regions } = splitVendorRegions(result.html);
    expect(regions.size).toBe(VENDOR_FILES.length);
    for (const [name, file] of VENDOR_FILES) {
      const expected = readFileSync(new URL(`../vendor/${file}`, import.meta.url), "utf8");
      expect(regions.get(name)).toBe(expected);
    }
    expect(nonVendor).not.toMatch(/<script[^>]+src=/i);
    expect(nonVendor).not.toMatch(/<link[^>]+href=/i);
    expect(nonVendor).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|@import/);
    // The only URLs allowed outside vendor regions are XML/SVG namespace
    // identifiers (createElementNS requires them verbatim; never fetched).
    const urls = nonVendor.match(/https?:\/\/[^\s"'<>]+/g) ?? [];
    expect(urls.every((u) => u.startsWith("http://www.w3.org/"))).toBe(true);
  });

  test("embeds the bundle data as parseable JSON with correct counts", () => {
    expect(result.html).not.toContain("__ASBUILT_DATA__"); // placeholder replaced
    const data = embeddedData(result.html);
    expect(data.meta.concepts).toBe(3); // index.md (no resource) skipped
    expect(data.meta.audited).toBe(1);
    expect(data.meta.target_commit).toBe("abc1234");
    expect(data.meta.date).toBe("2026-07-11");
    // AC6: folds must be codepoint-sorted, not insertion-order. alpha.md
    // (SPEC-001) walks before beta.md (SPEC-000) alphabetically, so a
    // dropped `.sort()` on this computation would yield ["SPEC-001",
    // "SPEC-000"] instead — this fixture makes that distinction observable
    // (hardening round 2).
    expect(data.meta.folds).toEqual(["SPEC-000", "SPEC-001"]);
  });

  test("collapses resolved cross-file edges to file links; same-file and unresolved edges never link", () => {
    expect(result.fileLinks).toBe(1);
    expect(result.resolvedEdges).toBe(2); // the same-file edge is resolved, just not a link
    const data = embeddedData(result.html);
    expect(data.links).toEqual([{ source: "src/beta.ts", target: "src/alpha.ts", w: 1 }]);
  });

  // SPEC-004 supersedes claw-wsit's SPATIAL rule: classification stays
  // frontmatter-driven (test flag), grouping is path-derived — tests live
  // with their source directory.
  test("grouping supersession (AC1): a co-located test concept groups with its source directory, never a spatial tests bucket", () => {
    const data = embeddedData(result.html);
    const testNode = data.nodes.find((n) => n.id === "src/tools/x.test.ts");
    expect(testNode?.group).toBe("src/tools");
    expect(testNode?.test).toBe(true);
    expect(data.nodes.some((n) => n.group === "tests")).toBe(false);
  });

  test("elements presence: embedded cytoscape elements reconcile with nodes/links counts", () => {
    const data = embeddedData(result.html);
    const parents = data.elements.filter((el) => el.data.parent === undefined && el.data.source === undefined);
    const children = data.elements.filter((el) => el.data.parent !== undefined);
    const edges = data.elements.filter((el) => el.data.source !== undefined);
    const groups = new Set(data.nodes.map((n) => n.group));
    expect(parents.length).toBe(groups.size);
    expect(children.length).toBe(data.nodes.length);
    expect(edges.length).toBe(data.links.length);
  });

  test("explanation and decisions sections are extracted; </ is escaped against script breakout", () => {
    const data = embeddedData(result.html);
    const alpha = data.nodes.find((n) => n.id === "src/alpha.ts");
    expect(alpha?.explanation).toContain("Alpha explains");
    expect(alpha?.decisions).toEqual(["kept it simple", "stayed deterministic"]);
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

// AC7 hardening (round 2): `bun test asbuilt/tests/` never executes viz.ts's
// `if (import.meta.main)` entry guard when the module is only ever imported
// (import.meta.main is false on import) -- every prior test in this suite
// imports buildViz/toElements/etc. directly. These tests run the real CLI as
// a subprocess (matching graphify-check.test.ts's/check.test.ts's existing
// `Bun.spawnSync` pattern) so the guard's own validation/default-path logic
// is actually exercised, closing two named survivors: (1) `--date`'s
// requiredness silently dropped, (2) the default `--out` path changed away
// from `docs/asbuilt/viz.html`.
describe("CLI: bun src/viz.ts (AC7 entry-guard behavior)", () => {
  test("exits 1 with usage when --target is missing", () => {
    const result = Bun.spawnSync(["bun", "src/viz.ts", "--date", "2026-07-16"], { cwd: ASBUILT_ROOT });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString("utf8")).toContain(CLI_USAGE);
  });

  test("exits 1 with usage when --date is missing (regression: --date must stay a required flag)", () => {
    const target = makeSandbox();
    try {
      const result = Bun.spawnSync(["bun", "src/viz.ts", "--target", target], { cwd: ASBUILT_ROOT });
      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString("utf8")).toContain(CLI_USAGE);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("writes to the default docs/asbuilt/viz.html path when --out is omitted", () => {
    const target = makeSandbox();
    try {
      const result = Bun.spawnSync(["bun", "src/viz.ts", "--target", target, "--date", "2026-07-16"], {
        cwd: ASBUILT_ROOT,
      });
      expect(result.exitCode).toBe(0);
      const defaultOut = join(target, "docs/asbuilt/viz.html");
      expect(existsSync(defaultOut)).toBe(true);
      const html = readFileSync(defaultOut, "utf8");
      expect(html).not.toContain("__ASBUILT_DATA__"); // placeholder replaced -- a real build, not an empty file
      expect(html.length).toBeGreaterThan(0);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  test("writes to an explicit --out path instead of the default when one is provided", () => {
    const target = makeSandbox();
    const outDir = mkdtempSync(join(tmpdir(), "viz-cli-out-"));
    try {
      const customOut = join(outDir, "custom.html");
      const result = Bun.spawnSync(
        ["bun", "src/viz.ts", "--target", target, "--date", "2026-07-16", "--out", customOut],
        { cwd: ASBUILT_ROOT },
      );
      expect(result.exitCode).toBe(0);
      expect(existsSync(customOut)).toBe(true);
      expect(existsSync(join(target, "docs/asbuilt/viz.html"))).toBe(false); // default path untouched
    } finally {
      rmSync(target, { recursive: true, force: true });
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
