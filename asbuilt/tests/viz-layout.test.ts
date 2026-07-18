// SPEC-004 T06: headless layout determinism (AC8) and the packing drift
// anchor (AC10). Runs the REAL vendored fcose stack in-process (no browser,
// no CDN) against elements built by the exact same toElements() pipeline
// viz.ts embeds, seeded by the template's own FNV hash formula -- these
// tests exercise the actual shipped layout invocation, not a stand-in.
import { describe, expect, test } from "bun:test";
import { readFileSync, rmSync } from "node:fs";
import { buildViz } from "../src/viz";
import { makeDenseSandbox } from "./helpers/dense-fixture";
import type { CyCore, CyElementDefinition, CyPosition } from "./helpers/vendor-load";
import { loadCytoscape } from "./helpers/vendor-load";

interface EmbeddedNode {
  id: string;
  group: string;
}

interface EmbeddedData {
  nodes: EmbeddedNode[];
  elements: CyElementDefinition[];
}

function embeddedData(html: string): EmbeddedData {
  const m = html.match(/(\{"meta":.*"elements":\[.*\]\})/s);
  return JSON.parse(m?.[1] ?? "{}") as EmbeddedData;
}

function buildDenseElements(): EmbeddedData {
  const target = makeDenseSandbox();
  try {
    const result = buildViz(target, "2026-07-16");
    return embeddedData(result.html);
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

/** Template's client-side seed-position formula (the FNV `hash()` plus the
 * population-scaled ring-anchor scatter it feeds) -- extracted directly from
 * the SHIPPED `asbuilt/src/viz-template.html` at test time, the same
 * treatment Gate 2b round 1 gave `extractProductionFcoseOptions()` below: a
 * hand-copied duplicate of this block would measure the test's own physics
 * rather than the shipped code, so drift in the template's seed formula
 * would silently stop reaching the AC8/AC10 assertions. Parsing the code
 * straight out of source means any future drift in the production seed
 * formula flows into these tests, exactly like the fcose options below. */
function extractProductionSeedPositions(): (nodes: EmbeddedNode[]) => Map<string, CyPosition> {
  const html = readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8");
  const hashMarker = "function hash(s)";
  const hashStart = html.indexOf(hashMarker);
  if (hashStart === -1) {
    throw new Error(
      "viz-layout.test.ts: could not find 'function hash(s)' in viz-template.html -- has the template's seed block been restructured?",
    );
  }
  const hashBraceStart = html.indexOf("{", hashStart);
  if (hashBraceStart === -1) {
    throw new Error(
      "viz-layout.test.ts: could not find hash()'s opening brace in viz-template.html -- has the template's seed block been restructured?",
    );
  }
  let depth = 0;
  let hashEnd = -1;
  for (let i = hashBraceStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        hashEnd = i;
        break;
      }
    }
  }
  if (hashEnd === -1) {
    throw new Error(
      "viz-layout.test.ts: unbalanced braces while parsing hash() in viz-template.html -- has the template's seed block been restructured?",
    );
  }
  const forMarker = "for (const n of nodes) {";
  const forStart = html.indexOf(forMarker, hashEnd);
  if (forStart === -1) {
    throw new Error(
      "viz-layout.test.ts: could not find the seed-position for-loop after hash() in viz-template.html -- has the template's seed block been restructured?",
    );
  }
  const forBraceStart = forStart + forMarker.length - 1; // index of the opening '{'
  depth = 0;
  let forEnd = -1;
  for (let i = forBraceStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        forEnd = i;
        break;
      }
    }
  }
  if (forEnd === -1) {
    throw new Error(
      "viz-layout.test.ts: unbalanced braces while parsing the seed-position for-loop in viz-template.html -- has the template's seed block been restructured?",
    );
  }
  const snippet = html.slice(hashStart, forEnd + 1);
  // Parses the real, shipped hash()/seed-loop straight out of
  // viz-template.html at test time rather than trusting a hand-copied
  // duplicate -- indirect eval is the load-bearing mechanism here, same
  // rationale as extractProductionFcoseOptions() below and
  // helpers/vendor-load.ts's loader.
  // biome-ignore lint/style/noCommaOperator: required for indirect eval.
  // biome-ignore lint/security/noGlobalEval: this is the whole point -- see comment above.
  return (0, eval)(`(function (nodes) { ${snippet}\nreturn seedPos; })`) as (
    nodes: EmbeddedNode[],
  ) => Map<string, CyPosition>;
}

const seedPositions = extractProductionSeedPositions();

function seededElements(nodes: EmbeddedNode[], elements: CyElementDefinition[]): CyElementDefinition[] {
  const seed = seedPositions(nodes);
  return elements.map((el) => {
    if (el.data.parent === undefined) return el; // parents and edges carry no seed
    const p = el.data.id === undefined ? undefined : seed.get(el.data.id);
    return p ? { ...el, position: { x: p.x, y: p.y } } : el;
  });
}

/** Production fcose options -- extracted directly from the SHIPPED
 * `asbuilt/src/viz-template.html` at test time (hardening round 2: this
 * replaces a hand-copied literal that a prior round proved was a coupling
 * gap -- two survivor variants changed the real template's layout invocation
 * (`packComponents`/`tile` -> false, `tilingPadding` 16 -> 300) and the
 * measured AC10 factor stayed byte-for-byte identical because the old
 * constant was never wired to read the file it claimed to exercise. Parsing
 * the literal straight out of source means any future drift in the
 * production invocation flows into this test's own `cy.layout()` call. */
function extractProductionFcoseOptions(): Record<string, unknown> {
  const html = readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8");
  const marker = "layout: {";
  const start = html.indexOf(marker);
  if (start === -1) {
    throw new Error(
      "viz-layout.test.ts: could not find 'layout: {' in viz-template.html -- has the production fcose invocation been restructured?",
    );
  }
  const braceStart = start + marker.length - 1; // index of the opening '{'
  let depth = 0;
  let end = -1;
  for (let i = braceStart; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}") {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) {
    throw new Error("viz-layout.test.ts: unbalanced braces while parsing the layout options literal");
  }
  const literal = html.slice(braceStart, end + 1);
  // Parses the real, shipped object literal out of viz-template.html at test
  // time rather than trusting a hand-copied duplicate (hardening round 2,
  // AC10 Variant 4/5 survivors) -- indirect eval is the load-bearing
  // mechanism here, same rationale as helpers/vendor-load.ts's loader.
  // biome-ignore lint/style/noCommaOperator: required for indirect eval.
  // biome-ignore lint/security/noGlobalEval: this is the whole point -- see comment above.
  return (0, eval)(`(${literal})`) as Record<string, unknown>;
}

const FCOSE_OPTIONS = extractProductionFcoseOptions();

// AC10 hardening (round 2): a sanity pin that the extraction above actually
// read the real, live production values out of viz-template.html -- not a
// stub, not an empty object, and not silently falling back to some other
// default. This is what makes FCOSE_OPTIONS's later use in
// runFcoseAndReadPositions a genuine read of source rather than a duplicate
// that merely happens to agree with it today.
describe("AC10: production fcose options are read from viz-template.html, not hand-copied", () => {
  test("extracted layout options carry the real shipped values", () => {
    expect(FCOSE_OPTIONS.name).toBe("fcose");
    expect(FCOSE_OPTIONS.quality).toBe("proof");
    expect(FCOSE_OPTIONS.randomize).toBe(false);
    expect(FCOSE_OPTIONS.animate).toBe(false);
    // Variant 5 survivor flipped these to false; Variant 4 survivor changed
    // the padding numbers -- both are direct properties of the extracted
    // object now (not a separately-maintained copy), so either regression
    // shows up here, and (because FCOSE_OPTIONS itself is what actually gets
    // passed to cy.layout() below) also shows up as a factor swing in AC10.
    expect(FCOSE_OPTIONS.packComponents).toBe(true);
    expect(FCOSE_OPTIONS.tile).toBe(true);
    expect(FCOSE_OPTIONS.tilingPaddingVertical).toBe(16);
    expect(FCOSE_OPTIONS.tilingPaddingHorizontal).toBe(16);
  });
});

const HEADLESS_STYLE = [{ selector: "node[d]", style: { width: "data(d)", height: "data(d)" } }];

/** Runs fcose to settlement and returns each child node's final position.
 * `randomize:false, animate:false` completes synchronously; asserts that
 * assumption rather than silently trusting it (a regression to an async
 * layout path would otherwise read positions before they settle). */
function runFcoseAndReadPositions(elements: CyElementDefinition[], cytoscape: (o: Record<string, unknown>) => CyCore): Record<string, CyPosition> {
  const cy = cytoscape({
    headless: true,
    styleEnabled: true,
    style: HEADLESS_STYLE,
    elements: structuredClone(elements),
  });
  let stopped = false;
  cy.one("layoutstop", () => {
    stopped = true;
  });
  cy.layout(FCOSE_OPTIONS).run();
  if (!stopped) throw new Error("fcose did not settle synchronously -- headless determinism assumption violated");
  const positions: Record<string, CyPosition> = {};
  // cytoscape collections expose forEach as their documented iteration
  // method; they are not guaranteed iterable via for...of.
  // biome-ignore lint/complexity/noForEach: see comment above.
  cy.nodes(":child").forEach((n) => {
    const p = n.position();
    positions[n.id()] = { x: p.x, y: p.y };
  });
  cy.destroy();
  return positions;
}

describe("viz layout determinism (SPEC-004 AC8)", () => {
  test("test_ac8_fcose_positions_are_json_identical_across_two_headless_runs", () => {
    const cytoscape = loadCytoscape();
    const { nodes, elements } = buildDenseElements();
    const seeded = seededElements(nodes, elements);

    const posA = runFcoseAndReadPositions(seeded, cytoscape);
    const posB = runFcoseAndReadPositions(seeded, cytoscape);

    expect(Object.keys(posA).length).toBe(111); // dense fixture's 111 concepts
    expect(JSON.stringify(posB)).toBe(JSON.stringify(posA));
  });

  test("test_ac8_no_clock_or_random_calls_in_nonvendor_html_or_viz_ts", () => {
    const target = makeDenseSandbox();
    let html: string;
    try {
      html = buildViz(target, "2026-07-16").html;
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
    // Strip the four inlined vendor regions (third-party code, out of our
    // control) before scanning -- this test is about OUR code only.
    let nonVendor = html;
    for (const name of ["layout-base", "cose-base", "cytoscape", "fcose"]) {
      const start = `/*VENDOR:${name}:start*/`;
      const end = `/*VENDOR:${name}:end*/`;
      const s = nonVendor.indexOf(start);
      const e = nonVendor.indexOf(end, s + start.length);
      if (s === -1 || e === -1) continue;
      nonVendor = nonVendor.slice(0, s) + nonVendor.slice(e + end.length);
    }
    expect(nonVendor).not.toMatch(/Math\.random/);
    expect(nonVendor).not.toMatch(/Date\.now\(/);
    expect(nonVendor).not.toMatch(/new Date\(\s*\)/); // argless new Date()

    const vizSrc = readFileSync(new URL("../src/viz.ts", import.meta.url), "utf8");
    expect(vizSrc).not.toMatch(/Math\.random/);
    expect(vizSrc).not.toMatch(/Date\.now\(/);
    expect(vizSrc).not.toMatch(/new Date\(\s*\)/);
  });
});

describe("viz layout packing drift anchor (SPEC-004 AC10)", () => {
  const PACKING_BOUND = 4.5; // SPEC-004 AC10 drift anchor — spike checkpoint measured 4.116 (2026-07-16); look-gate arbitrates compactness, this guards drift.
  // Reconciliation (Gate 2c cold-read finding): 4.116 was measured with the
  // spike's tilingPadding 4. T05's judgment sweep then shipped padding 16,
  // which measures ~2.6-2.8 on this fixture — the layout got MORE compact
  // after the checkpoint. The anchor stays 4.5: it bounds drift from the
  // approved look; the currently-measured value is logged below each run.

  test("test_ac10_dense_fixture_packing_factor_stays_at_or_below_the_drift_anchor", () => {
    const cytoscape = loadCytoscape();
    const { nodes, elements } = buildDenseElements();
    const seeded = seededElements(nodes, elements);
    const positions = runFcoseAndReadPositions(seeded, cytoscape);

    const diameterById = new Map<string, number>();
    for (const el of elements) if (el.data.d !== undefined) diameterById.set(el.data.id, el.data.d);
    const groupById = new Map<string, string>();
    for (const n of nodes) groupById.set(n.id, n.group);

    // Per-group bbox (centers ± radius from d/2), then global bbox over all
    // nodes; factor = globalArea / Σ groupAreas.
    interface Bbox {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
    const byGroup = new Map<string, Bbox>();
    let gMinX = Number.POSITIVE_INFINITY;
    let gMinY = Number.POSITIVE_INFINITY;
    let gMaxX = Number.NEGATIVE_INFINITY;
    let gMaxY = Number.NEGATIVE_INFINITY;
    for (const [id, pos] of Object.entries(positions)) {
      const radius = (diameterById.get(id) ?? 0) / 2;
      const group = groupById.get(id) ?? "src";
      const b = byGroup.get(group) ?? {
        minX: Number.POSITIVE_INFINITY,
        minY: Number.POSITIVE_INFINITY,
        maxX: Number.NEGATIVE_INFINITY,
        maxY: Number.NEGATIVE_INFINITY,
      };
      b.minX = Math.min(b.minX, pos.x - radius);
      b.minY = Math.min(b.minY, pos.y - radius);
      b.maxX = Math.max(b.maxX, pos.x + radius);
      b.maxY = Math.max(b.maxY, pos.y + radius);
      byGroup.set(group, b);
      gMinX = Math.min(gMinX, pos.x - radius);
      gMinY = Math.min(gMinY, pos.y - radius);
      gMaxX = Math.max(gMaxX, pos.x + radius);
      gMaxY = Math.max(gMaxY, pos.y + radius);
    }

    let sumGroupAreas = 0;
    for (const b of byGroup.values()) sumGroupAreas += (b.maxX - b.minX) * (b.maxY - b.minY);
    const globalArea = (gMaxX - gMinX) * (gMaxY - gMinY);
    const factor = globalArea / sumGroupAreas;

    console.log(`AC10 measured packing factor: ${factor.toFixed(3)} (bound ${PACKING_BOUND}, spike checkpoint 4.116)`);
    expect(factor).toBeLessThanOrEqual(PACKING_BOUND);
  });
});
