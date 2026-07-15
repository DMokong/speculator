# asbuilt-viz-cytoscape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
> **In this stream** the fable-conductor execute-wave pipeline dispatches each task from its `tasks/NN-slug/brief.md`; this plan is the source those briefs are derived from.

**Goal:** Replace the As-Built viz's hand-rolled SVG force sim with vendored Cytoscape.js + fcose (compound directory groups, semantic-zoom labels) so dense flat-package bundles render compact and readable — SPEC-004, 10 ACs.

**Architecture:** `viz.ts` keeps its CLI and data extraction, gains a `test` flag + path-derived grouping + an exported `toElements()` mapping + vendor-inlining; `viz-template.html` is rewritten around a Cytoscape canvas (fcose `randomize:false`, seeded from the existing FNV hash; layout settles client-side — no baked coordinates). Tests evolve mechanically while preserving every existing intent, plus a dense fixture and a headless packing-bound harness.

**Tech Stack:** bun, TypeScript, Cytoscape.js + cytoscape-fcose (+ cose-base, layout-base) vendored as pinned minified UMD files. No new package.json dependencies — vendor files only.

## Global Constraints (from SPEC-004)

- Single self-contained `viz.html`; no external resource references; no network at build or view time (AC3).
- Byte-deterministic regeneration; date only from `--date`; no `Math.random`/`Date.now`/argless-`new Date()` in build or template code (AC4, AC8).
- CLI contract unchanged: `bun asbuilt/src/viz.ts --target <repo> --date YYYY-MM-DD [--out <path>]` (AC7).
- Vendored pinned libs under `asbuilt/vendor/` with versions + licenses + sha256 recorded (AC9); no registry access in tests.
- Output size budget ≤ 700KB for a ~110-concept bundle.
- Changes confined to `asbuilt/src/viz.ts`, `asbuilt/src/viz-template.html`, `asbuilt/vendor/` (new), `asbuilt/tests/` (+ helpers/fixtures), and stream/spec docs.
- Layout compactness bound (amended at spike checkpoint 2026-07-16): AC10 is a drift anchor — packing factor ≤ 4.5 on the dense fixture with the checkpoint-measured 4.116 recorded beside it; the look-gate arbitrates compactness (the ratio provably cannot discriminate the reverted ring layout).

## File Structure

```
asbuilt/vendor/                      NEW  pinned UMDs: cytoscape.min.js, layout-base.js,
                                          cose-base.js, cytoscape-fcose.js + VENDOR.md manifest
asbuilt/src/viz.ts                   MOD  test flag, path grouping, toElements(), vendor inlining
asbuilt/src/viz-template.html        MOD  rewritten render layer (cytoscape + fcose + semantic zoom)
asbuilt/tests/helpers/dense-fixture.ts  NEW  synthetic 111-concept flat-package bundle generator
asbuilt/tests/helpers/vendor-load.ts    NEW  global-eval loader for vendor UMDs in bun (headless)
asbuilt/tests/viz-elements.test.ts      NEW  toElements() mapping contract (T04's own tests)
asbuilt/tests/viz-layout.test.ts        NEW  headless fcose determinism + AC10 packing bound
asbuilt/tests/viz.test.ts               MOD  evolved intents (self-containment, grouping supersession)
```

Interface hub — **the embedded JSON grows two things** (single source of truth for both the browser and the headless harness):

```ts
// viz.ts — data.nodes[i] gains:
//   test: boolean          (isTestConcept(fm) — classification, never path)
//   group: groupOf(resource) ALWAYS (path-derived; the "tests" spatial bucket dies)
// data gains:
//   elements: CyElement[]  (toElements(nodes, links) — what cytoscape consumes)

export interface CyElement {
  data: {
    id: string;            // node: resource path | edge: `${source}->${target}` | parent: `dir:${group}`
    parent?: string;       // node → its `dir:${group}` compound
    label?: string;        // node: basename | parent: group name
    test?: boolean;        // node: test marker (styling + area filter)
    source?: string;       // edge only
    target?: string;       // edge only
    w?: number;            // edge weight
  };
  classes?: string;        // node: "skeleton"|"accuracy"|"full" (+ " test")
}

export function toElements(nodes: VizConceptNode[], links: VizLink[]): CyElement[]
```

## Task Graph & Waves

| Wave | Task | Scope | parallel_safe | testable | tier |
|---|---|---|---|---|---|
| 1 | T01 vendor-libs | asbuilt/vendor/ | true | false | standard |
| 1 | T02 dense-fixture | asbuilt/tests/helpers/dense-fixture.ts + its test | true | true | standard |
| 2 | T03 spike | scratch + stream tasks/03-spike/ (report) | — | false | judgment |
| — | **HUMAN CHECKPOINT** — Dustin eyeballs the spike renders before productization | | | | |
| 3 | T04 data-model | asbuilt/src/viz.ts + tests/viz-elements.test.ts | — | true | standard |
| 4 | T05 template | asbuilt/src/viz-template.html | — | true | judgment |
| 5 | T06 tests+hardening | asbuilt/tests/ (viz.test.ts, viz-layout.test.ts, vendor-load.ts) | — | true | standard |
| — | test-adversary (N=3) after T06 — spec carries test-suite ACs (AC6, AC10) | | | | |

Estimated agent count: ~20–26 (6 tasks × implementer+verifier+reviewer, test-author on 4 testable tasks, 3 test-breakers, fix rounds).

---

### Task T01: Vendor the rendering libraries

**Files:**
- Create: `asbuilt/vendor/cytoscape.min.js`, `asbuilt/vendor/layout-base.js`, `asbuilt/vendor/cose-base.js`, `asbuilt/vendor/cytoscape-fcose.js`
- Create: `asbuilt/vendor/VENDOR.md`

**Interfaces:**
- Consumes: npm registry / unpkg (network allowed in THIS task only — it's the pin step).
- Produces: four pinned UMD files + manifest that T03/T04/T05/T06 treat as read-only inputs.

- [ ] **Step 1: Fetch pinned releases** (latest stable at execution time; the versions below are the known-good floor — record what you actually pin):

```bash
cd asbuilt/vendor
curl -sO https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js
curl -sO https://unpkg.com/layout-base@2.0.1/layout-base.js
curl -sO https://unpkg.com/cose-base@2.2.0/cose-base.js
curl -sO https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js
```

- [ ] **Step 2: Record the manifest.** Write `VENDOR.md`:

```markdown
# Vendored rendering libraries (SPEC-004, AC9)

Pinned minified UMDs inlined into viz.html by viz.ts at build time.
Never loaded from a CDN. Update = replace file + update this table + re-run tests.

| File | Package | Version | License | Source | sha256 |
|---|---|---|---|---|---|
| cytoscape.min.js | cytoscape | 3.30.2 | MIT | https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js | <fill from shasum> |
| layout-base.js | layout-base | 2.0.1 | MIT | https://unpkg.com/layout-base@2.0.1/layout-base.js | <fill> |
| cose-base.js | cose-base | 2.2.0 | MIT | https://unpkg.com/cose-base@2.2.0/cose-base.js | <fill> |
| cytoscape-fcose.js | cytoscape-fcose | 2.2.0 | MIT | https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js | <fill> |

Browser load order (and global-eval order in tests): layout-base → cose-base → cytoscape → cytoscape-fcose.
```

Fill sha256 via `shasum -a 256 *.js`.

- [ ] **Step 3: Sanity-check sizes and UMD shape**

Run: `wc -c asbuilt/vendor/*.js` — expect cytoscape ≈ 350–450KB, the other three ≤ ~150KB combined (≤ 700KB total budget headroom).
Run: `head -c 200 asbuilt/vendor/cytoscape-fcose.js` — expect a UMD wrapper (`typeof exports`/`typeof define` branching).

- [ ] **Step 4: Commit**

```bash
git add asbuilt/vendor/
git commit -m "feat(asbuilt): vendor cytoscape + fcose stack, pinned + hashed (SPEC-004 T01)"
```

---

### Task T02: Dense-bundle fixture generator

**Files:**
- Create: `asbuilt/tests/helpers/dense-fixture.ts`
- Create: `asbuilt/tests/dense-fixture.test.ts`

**Interfaces:**
- Consumes: nothing (pure fs generator, mirrors `viz.test.ts`'s `makeSandbox` conventions).
- Produces: `makeDenseSandbox(): string` — returns a temp target-repo dir whose `docs/asbuilt/` bundle + `.graph-manifest.json` reproduce the field shape: `cmd/cli` = 54 source concepts + 42 co-located test concepts (resources like `cmd/cli/foo.go` / `cmd/cli/foo_test.go`), `internal/model` = 6, `internal/util` = 4, `internal/cli` = 4, one root-level `main.go` (groups to `src`). 111 concepts total. Deterministic content (indexed names, no randomness). Every concept gets `enrichment: fully-audited` on a fixed stride (1 in 3) so label-bearing audited nodes exist.

- [ ] **Step 1: Write the failing test** (`asbuilt/tests/dense-fixture.test.ts`):

```ts
import { describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { makeDenseSandbox } from "./helpers/dense-fixture";
import { buildViz } from "../src/viz";

describe("dense fixture (SPEC-004 R7)", () => {
  const target = makeDenseSandbox();
  const result = buildViz(target, "2026-07-15");

  test("reproduces the field shape: 111 concepts, 54+42 in cmd/cli", () => {
    expect(result.concepts).toBe(111);
    const data = JSON.parse(result.html.match(/(\{"meta":.*"links":\[.*\]\})/s)?.[1] ?? "{}");
    const cli = data.nodes.filter((n: { group: string }) => n.group === "cmd/cli");
    expect(cli.length).toBe(96); // 54 source + 42 tests, path-grouped together
  });

  test("cleanup", () => { rmSync(target, { recursive: true, force: true }); expect(true).toBe(true); });
});
```

Note: the 96 assertion encodes the NEW grouping contract and will fail until T04 lands — in wave 1, assert the pre-T04 observable instead (54 in `cmd/cli`, 42 in `tests`) with a `// flips to 96 when SPEC-004 T04 lands` comment, and T06 flips it. The generator itself is T02's deliverable; the wave-1 test proves counts and determinism of the fixture, not the future grouping.

- [ ] **Step 2: Implement the generator** (`asbuilt/tests/helpers/dense-fixture.ts`):

```ts
// Synthetic dense flat-package bundle mirroring the sdlc-clients field case
// (SPEC-004 R7): one 54-source + 42-test cmd/cli group, small internal/*
// groups, one root file. Deterministic: indexed names, fixed enrichment stride.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Spec { dir: string; sources: number; tests: number }
const SHAPE: Spec[] = [
  { dir: "cmd/cli", sources: 54, tests: 42 },
  { dir: "internal/model", sources: 6, tests: 0 },
  { dir: "internal/util", sources: 4, tests: 0 },
  { dir: "internal/cli", sources: 4, tests: 0 },
];

function concept(resource: string, isTest: boolean, audited: boolean): string {
  const fm = [
    `type: ${isTest ? "Test" : "Module"}`,
    `title: ${resource}`,
    `description: synthetic ${isTest ? "test" : "module"} concept`,
    `resource: ${resource}`,
    `tags:\n  - ${resource.split("/")[0]}\n  - module${isTest ? "\n  - test" : ""}`,
    `enrichment: ${audited ? "fully-audited" : "none"}`,
    "from: []",
    "explains: []",
    "stale: false",
  ].join("\n");
  const body = audited
    ? "# Structure\n\nmachine content\n\n# Explanation\n\nSynthetic audited explanation.\n"
    : "# Structure\n\nmachine content\n";
  return `---\n${fm}\n---\n\n${body}`;
}

export function makeDenseSandbox(): string {
  const target = mkdtempSync(join(tmpdir(), "viz-dense-"));
  const bundle = join(target, "docs", "asbuilt");
  const symbols: { id: string; file: string }[] = [];
  const edges: { from: string; toName: string; resolved: string | null }[] = [];
  const write = (resource: string, isTest: boolean, i: number) => {
    const mdPath = join(bundle, resource.replace(/\.(go|ts)$/, ".md"));
    mkdirSync(mdPath.slice(0, mdPath.lastIndexOf("/")), { recursive: true });
    writeFileSync(mdPath, concept(resource, isTest, i % 3 === 0));
    symbols.push({ id: `${resource}#fn${i}`, file: resource });
    if (!isTest && i % 4 === 1) {
      // deterministic sparse call web into the first source file of the group
      const dir = resource.slice(0, resource.lastIndexOf("/"));
      edges.push({ from: `${resource}#fn${i}`, toName: "fn0", resolved: `${dir}/file000.go#fn0` });
    }
  };
  for (const { dir, sources, tests } of SHAPE) {
    for (let i = 0; i < sources; i++) write(`${dir}/file${String(i).padStart(3, "0")}.go`, false, i);
    for (let i = 0; i < tests; i++) write(`${dir}/file${String(i).padStart(3, "0")}_test.go`, true, i);
  }
  write("main.go", false, 0); // root-level: groups to "src"
  writeFileSync(join(bundle, ".graph-manifest.json"),
    JSON.stringify({ target_commit: "f1e1d0c", symbols, edges }));
  return target;
}
```

- [ ] **Step 3: Run the test** — `bun test asbuilt/tests/dense-fixture.test.ts` → PASS (with the wave-1 grouping assertions).

- [ ] **Step 4: Commit** — `git add asbuilt/tests/ && git commit -m "test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)"`

---

### Task T03: Spike — prove the stack, render both bundles, measure packing *(judgment tier; human checkpoint follows)*

**Files:**
- Create: `docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md` (evidence + recommendation)
- Create (scratch, uncommitted): spike HTMLs + headless scripts under the session scratch area

**Interfaces:**
- Consumes: T01 vendor files; T02 `makeDenseSandbox()`; the real claudeclaw bundle at `/Users/dustincheng/projects/claudeclaw/docs/asbuilt` (machine-local, spike-only — never a committed test dependency).
- Produces: written answers that T04–T06 consume as settled facts: (1) vendor UMDs global-eval cleanly in bun headless (exact loader incantation), (2) fcose `randomize:false` determinism verified (two headless runs, identical positions), (3) measured packing factor on the dense fixture (+ recommended AC10 constant if ≠ 3.0), (4) recommended fcose options + `min-zoomed-font-size` value, (5) two spike HTML renders for the human checkpoint.

- [ ] **Step 1: Headless load proof.** In a scratch bun script, global-eval the four vendor files in order (module/exports shadowed so UMDs take the global branch):

```ts
import { readFileSync } from "node:fs";
const g = globalThis as Record<string, unknown>;
for (const f of ["layout-base.js", "cose-base.js", "cytoscape.min.js", "cytoscape-fcose.js"]) {
  (0, eval)(readFileSync(`asbuilt/vendor/${f}`, "utf8"));
}
const cytoscape = g.cytoscape as (opts: unknown) => unknown;
// fcose UMD self-registers when a global `cytoscape` exists; if not:
// (g.cytoscapeFcose) && (cytoscape as any).use(g.cytoscapeFcose);
```

Expected: no throw; `typeof cytoscape === "function"`. If any UMD insists on CommonJS resolution, record the working alternative (e.g. `require()` with a stub resolver) in the report — this exact loader is what T06's `vendor-load.ts` ships.

- [ ] **Step 2: Determinism proof.** Build elements from the dense fixture (`buildViz` data → simple map: parents per group, nodes with `parent`, edges), run fcose headless twice with `randomize: false`, `animate: false`, and initial positions from the template's FNV hash formula; assert positions byte-equal across runs (JSON.stringify compare). Record result.

- [ ] **Step 3: Packing measurement.** From the settled positions compute per-group bounding boxes and the global bbox; compute `globalArea / Σ groupAreas`. Record the measured factor for the dense fixture AND for the claudeclaw bundle. If measured ≥ 3.0, tune fcose (`nodeSeparation`, `idealEdgeLength`, `packComponents: true`) until comfortably under, and record the option set + recommended AC10 constant.

- [ ] **Step 4: Render the two spike HTMLs** (dense fixture + claudeclaw bundle) with a minimal template: cytoscape container, vendor scripts inlined, compound parents, fcose options from Step 3, node labels with a `min-zoomed-font-size` (start 12), parent labels always-on, test nodes tinted + badge. No interactions needed beyond built-in pan/zoom — this is a look-gate artifact, not the product.

- [ ] **Step 5: Write the report** to `tasks/03-spike/report.md`: the five findings, the two HTML paths, screenshots if a browser is available to the worker (otherwise the conductor screenshots at the checkpoint). Commit the report (not the scratch HTMLs).

**CHECKPOINT after T03:** the conductor presents both renders to Dustin (round one of this feature died on look alone). Waves 3–5 do not dispatch until the look is approved. Layout constants approved here become settled facts in T04–T06 briefs.

---

### Task T04: Data model — test flag, path grouping, toElements, vendor inlining

**Files:**
- Modify: `asbuilt/src/viz.ts`
- Create: `asbuilt/tests/viz-elements.test.ts`

**Interfaces:**
- Consumes: T01 vendor files (read at build time); T03's settled loader/option facts.
- Produces (what T05/T06 rely on):
  - `VizConceptNode.test: boolean` (new field; `group` is now ALWAYS `groupOf(resource)`)
  - `toElements(nodes: VizConceptNode[], links: VizLink[]): CyElement[]` exported from viz.ts (parents `dir:${group}` sorted, then nodes sorted by id, then edges sorted source→target — codepoint order, so embedding stays deterministic)
  - embedded JSON gains `elements` key: `{ meta, nodes, links, elements }`
  - template placeholders: `__VENDOR_LAYOUT_BASE__`, `__VENDOR_COSE_BASE__`, `__VENDOR_CYTOSCAPE__`, `__VENDOR_FCOSE__` replaced with vendor file contents via **split/join** (never `String.replace` — `$`-sequences in minified code corrupt `replace`), each wrapped by `/*VENDOR:name:start*/ ... /*VENDOR:name:end*/` markers that T06's self-containment test uses to byte-compare vendor regions against `asbuilt/vendor/` files.

- [ ] **Step 1: Write failing tests** (`asbuilt/tests/viz-elements.test.ts`): reuse `makeSandbox()` shape from viz.test.ts (copy the helper — tasks may be read out of order) and assert: (a) a test concept's node has `test: true` and `group` derived from path (fixture resource `src/tools/x.test.ts` → `"src/tools"`); (b) no node has `group === "tests"` unless its path really lives under a two-segment `tests/` dir; (c) `toElements` emits one parent per group with `id` = `dir:${group}`, every node's `parent` set, edges carry `w`; (d) element order is deterministic (two calls → deep-equal).
- [ ] **Step 2: Run to verify failure** — `bun test asbuilt/tests/viz-elements.test.ts` → FAIL (`toElements` not exported).
- [ ] **Step 3: Implement.** In viz.ts: change line 168's `group:` to `groupOf(fm.resource)` and add `test: isTestConcept(fm)`; add `test` to the interface; implement `toElements`; add `elements: toElements(nodes, links)` to `data`; inline the four vendor files into the template via split/join on the four placeholders with the marker comments. **Do not touch `isTestConcept`** — classification stays frontmatter-driven (claw-wsit's surviving half).
- [ ] **Step 4: Run** — new tests PASS. `bun test asbuilt/tests/viz.test.ts` is EXPECTED to fail on the old `group === "tests"` assertion and possibly self-containment (vendor blob) — that suite's evolution is T06's scope, not yours; do not edit it. Record the expected-fail state in your report.
- [ ] **Step 5: Commit** — `git commit -m "feat(asbuilt): path grouping + test flag + toElements + vendor inlining (SPEC-004 T04)"`

---

### Task T05: Template rewrite — cytoscape render, semantic zoom, interactions *(judgment tier)*

**Files:**
- Modify: `asbuilt/src/viz-template.html`

**Interfaces:**
- Consumes: `DATA.elements` / `DATA.nodes` / `DATA.links` / `DATA.meta` from T04; vendor placeholder slots (`<script>/*VENDOR:layout-base:start*/__VENDOR_LAYOUT_BASE__/*VENDOR:layout-base:end*/</script>` ×4, in load order layout-base → cose-base → cytoscape → fcose); fcose options + `min-zoomed-font-size` value settled by T03.
- Produces: the shipped template. Everything the current template surfaces must survive (header tiles, sheet block, footer, table view, theme toggle, tooltip, detail panel, search, state/area filters). The hand-rolled `tick/settle/positionAll/fit/pan/zoom/drag` code and the SVG node/edge/label layers are deleted — cytoscape owns rendering, pan/zoom, and drag.

Key implementation contract (bite-size steps below assume it):

```js
// container replaces the <svg>: <div id="cy"></div> (CSS: absolute inset 0)
const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: DATA.elements,
  layout: { name: "fcose", randomize: false, animate: false, quality: "proof",
            nodeSeparation: 12, packComponents: true },   // T03's settled values win over these defaults
  style: [
    { selector: "node[parent]", style: { label: "data(label)", "min-zoomed-font-size": 12, /* node sizing from data */ } },
    { selector: "$node > node", style: {} },   // compound parents
    { selector: ":parent", style: { label: "data(label)" /* NO min-zoomed-font-size — always visible (AC2) */ } },
    { selector: "node.test", style: { /* distinct shape/tint + badge treatment */ } },
    { selector: "edge", style: { width: "data(w)-scaled", opacity: /* sparse-aware, keep current calibration intent */ } },
    { selector: ".dim", style: { opacity: 0.15 } },
  ],
});
// Deterministic seed: before layout, position each child node from the FNV hash
// exactly like today (anchor-free: fcose treats these as the randomize:false start).
```

- [ ] **Step 1: Replace the render layer.** Swap `<svg id="svg">` for `<div id="cy">`; add the four vendor script slots before the main script; delete the sim (`hash` stays — it seeds), the SVG layer creation, `tick`, `settle`, `positionAll`, `fit`, wheel/pan/drag handlers.
- [ ] **Step 2: Wire cytoscape** with elements, FNV-seeded initial positions, fcose options, and the style sheet above (node size `4 + 2.3*sqrt(symbols||1)` carried into `data` by T04's elements or computed in style mappers; keep skeleton/accuracy/full class colors from the current CSS variables).
- [ ] **Step 3: Semantic zoom labels.** Child node labels: always defined, gated by `min-zoomed-font-size` (T03's value). Parent labels: no gate. Delete the `enrichment !== "none"` label conditionality — with semantic zoom every node may carry a label; audited state stays expressed via ring/color classes. (AC2's "no static suppression" includes the old audited-only rule — labels are zoom-gated for all, styled by state.)
- [ ] **Step 4: Re-wire interactions to cy events**, preserving exact behavior (AC5): `cy.on("mouseover"/"mouseout"/"mousemove", "node[^parent]"...)` wait — child selector is `node:child`; use it for tooltip (`hover(n)` reads `byId.get(el.id())`), `cy.on("tap", "node:child")` → `select(n)`, background tap → `select(null)`; `mark()`/`applyFilters()` toggle the `dim` class via `cy.batch`; **area filter switches from `n.group === "tests"` to `n.test === true`** (the observable "tests" area filter survives the spatial regrouping); search haystack unchanged. Table view, theme toggle, header blocks, panel HTML (including the `n.type === "Test"` TEST stamp) are untouched except `stateOf`/lookups now reading from `DATA.nodes` as before.
- [ ] **Step 5: Verify by hand against both bundles** — `bun asbuilt/src/viz.ts --target <dense-sandbox> --date 2026-07-15 --out /tmp/dense.html` and the claudeclaw bundle equivalent; open both, check: compact packing, group names at default zoom, labels on zoom-in, tooltip/panel/search/filters/table/theme all live. Record observations in your report.
- [ ] **Step 6: Commit** — `git commit -m "feat(asbuilt): cytoscape+fcose template — compound groups, semantic zoom (SPEC-004 T05)"`

---

### Task T06: Test evolution + headless layout harness

**Files:**
- Modify: `asbuilt/tests/viz.test.ts`
- Modify: `asbuilt/tests/dense-fixture.test.ts` (flip the wave-1 grouping assertions to the new contract)
- Create: `asbuilt/tests/helpers/vendor-load.ts` (T03's proven loader, shared)
- Create: `asbuilt/tests/viz-layout.test.ts`

**Interfaces:**
- Consumes: everything prior; T03's settled loader + AC10 constant.
- Produces: the SPEC-004 verification surface (AC-named tests per the Gate 2b tip).

- [ ] **Step 1: Evolve `viz.test.ts`** preserving every intent (AC6):
  - *Self-containment (AC3):* split the built HTML on the `/*VENDOR:name:start|end*/` markers. For each vendor region: assert byte-equality with the corresponding `asbuilt/vendor/` file (nothing new can hide there). For the NON-vendor remainder: apply the existing checks verbatim (`<script src=`, `<link href=`, `fetch(`/`XMLHttpRequest`/`@import`, URL allowlist `http://www.w3.org/`).
  - *Grouping supersession:* replace the `group === "tests"` test with: co-located test concept (`resource: src/tools/x.test.ts`, `type: Test`) → `group === "src/tools"`, `test === true`. Comment: `// SPEC-004 supersedes claw-wsit's SPATIAL rule: classification stays frontmatter-driven (test flag), grouping is path-derived — tests live with their source directory.`
  - *Everything else* (JSON embed counts, edge collapsing, `</` escaping, byte determinism ×2 builds) — unchanged assertions, updated only if the embed regex needs the new `elements` key tolerated.
- [ ] **Step 2: `vendor-load.ts`** — the T03 loader as a reusable helper: evals the four files in order into `globalThis`, returns the `cytoscape` factory with fcose registered.
- [ ] **Step 3: `viz-layout.test.ts`** (AC8 + AC10, named `test_ac8_*` / `test_ac10_*`):

```ts
// AC8: two headless fcose runs over the dense fixture's toElements output,
// randomize:false, FNV-seeded starts → identical positions (JSON deep-equal).
// AC10: settled positions → per-group bboxes + global bbox;
//   expect(globalArea).toBeLessThanOrEqual(PACKING_BOUND * sumGroupAreas)
//   const PACKING_BOUND = 3.0; // SPEC-004 AC10 — spike measured <measured>; tighten deliberately, record here.
```

- [ ] **Step 4: Static determinism greps (AC8's no-clock/no-random clause):** test asserting the template's non-vendor script region contains no `Math.random`, `Date.now(`, or `new Date()` (argless), and viz.ts likewise.
- [ ] **Step 5: Full suite + real-bundle verification commands** — `bun test asbuilt/tests/` (all green, no network: run once with network off if the harness allows), `bun asbuilt/src/viz.ts --target /Users/dustincheng/projects/claudeclaw --date 2026-07-15 --out /tmp/claw-viz.html` (AC7 succeeds; machine-local check, not a committed test), `wc -c /tmp/dense.html` ≤ 700KB.
- [ ] **Step 6: Commit** — `git commit -m "test(asbuilt): SPEC-004 verification surface — vendor-region equality, grouping supersession, headless packing bound"`

---

## Self-Review (run)

- **Spec coverage:** AC1→T04+T06 (grouping/test flag in data, dense fixture assertions); AC2→T05 (+T06 static checks); AC3→T04 markers + T06 vendor-region equality; AC4→T06 (unchanged determinism test); AC5→T05 step 4 + manual verify; AC6→T06 step 1; AC7→T06 step 5 + CLI untouched in T04; AC8→T06 layout test + greps; AC9→T01; AC10→T03 measurement + T06 bound test. R1–R7 all land (R1 T05, R2 T05, R3 T04/T05, R4 T05, R5 T04/T06, R6 T01, R7 T02). ✓
- **Placeholders:** VENDOR.md sha256 "<fill>" cells are instructions to the implementer with the exact command given — acceptable; no TBDs elsewhere. ✓
- **Type consistency:** `toElements(nodes, links)`, `CyElement`, `test: boolean`, `dir:${group}` parent ids, marker comment format `/*VENDOR:name:start*/` used consistently across T04/T05/T06. ✓
- **Known judgment points routed to the checkpoint:** fcose option set, `min-zoomed-font-size` value, AC10 constant — all T03 outputs approved by Dustin before waves 3–5. ✓
