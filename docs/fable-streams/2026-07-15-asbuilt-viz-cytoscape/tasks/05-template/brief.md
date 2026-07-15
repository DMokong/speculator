---
task: 05-template
parallel_safe: false
testable: false
tier: judgment
---

## Goal

Rewrite `asbuilt/src/viz-template.html`'s render layer around Cytoscape +
fcose per SPEC-004: compound directory groups, semantic-zoom labels, test-node
styling, and every existing interaction preserved — using T04's embedded
`elements` and vendor placeholders, and the spike's settled layout facts.

## Done-check

Building the dense fixture and the claudeclaw bundle each produce a viz.html
that (a) opens in headless Chrome with zero console/unhandled-rejection
errors, (b) is ≤ 700KB, (c) at fit view shows group labels but no child
labels, and (d) preserves tooltip / detail panel / search / filters / table /
theme behaviors (verified by your browser-driven checks recorded in the
report).

## File scope

**Working directory contract:** ALL work happens in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; `git rev-parse --abbrev-ref HEAD` must print
`asbuilt-viz-cytoscape` before any write or commit — else STOP and escalate.
Only your report (absolute stream path) is written outside the worktree.

- `asbuilt/src/viz-template.html` (modify — the only product file)
- Scratch build outputs under `/tmp/` or the session scratchpad (uncommitted)

## Required content

**Vendor slots** (before the main script, exact order):

```html
<script>/*VENDOR:layout-base:start*/__VENDOR_LAYOUT_BASE__/*VENDOR:layout-base:end*/</script>
<script>/*VENDOR:cose-base:start*/__VENDOR_COSE_BASE__/*VENDOR:cose-base:end*/</script>
<script>/*VENDOR:cytoscape:start*/__VENDOR_CYTOSCAPE__/*VENDOR:cytoscape:end*/</script>
<script>/*VENDOR:fcose:start*/__VENDOR_FCOSE__/*VENDOR:fcose:end*/</script>
```

(T04's `inlineVendor` fills these; fcose self-registers against the global
`cytoscape` — no `.use()` call needed.)

**Render layer:** replace `<svg id="svg">` with `<div id="cy">` (absolute,
inset 0). Delete the hand sim (`tick`, `settle`, `positionAll`, `fit`,
wheel/pan/drag handlers, the SVG edge/label/node layer code). KEEP `hash()` —
it seeds initial positions. Instantiate:

```js
const cy = cytoscape({
  container: document.getElementById("cy"),
  elements: DATA.elements,           // from T04
  layout: { name: "fcose", quality: "proof", randomize: false, animate: false,
            packComponents: true, tile: true,
            tilingPaddingVertical: 4, tilingPaddingHorizontal: 4,
            nodeSeparation: 12, idealEdgeLength: 46, nodeRepulsion: 4500,
            gravity: 1, gravityCompound: 1, numIter: 2500,
            fit: true, padding: 40 },
  // style: see below
});
```

Seed each child element's `position` from `hash(id)` before layout (spread
`90 + 44*Math.sqrt(groupCount)` — copy the existing formula; determinism, not
placement, is its job). No `Math.random`, no `Date.now()`, no argless
`new Date()` anywhere in the template.

**Style sheet (settled facts):** child nodes `width/height: data(d)`, label
`data(label)`, `font-size: 10`, **`min-zoomed-font-size: 24`**; compound
parents (`:parent`) labeled `data(label)` with NO min-zoomed-font-size
(always visible), subtle fill/border like today's group hulls; state classes
`skeleton|accuracy|full` mapped to the existing CSS variable colors (keep the
ring/citation look: e.g. border for audited); `.test` nodes: rounded-rect
shape + the tan test tint (legend entry stays); edges: width/opacity scaled
by `data(w)` preserving today's sparse-aware calibration intent (`links.length
<= 25` → darker/thicker); `.dim { opacity: 0.15 }` (or effect-equivalent to
today's dimming); selected node visibly marked.

**Judgment item — tile label overlap (spike look note):** fcose's `tile`
packs edge-less nodes into a tight grid whose labels overlap at zoom. Address
it: raise tiling padding (try 8–12) and/or shrink label emphasis until a ~3×
zoom into the dense fixture's cmd/cli cluster shows readable, non-stacked
labels. Verify by screenshot; record the chosen values and the screenshot
path in your report. Do not suppress labels to solve it (AC2).

**Interactions — identical behavior (AC5):** re-wire onto cy events:
`mouseover/mouseout/mousemove` on child nodes → existing tooltip content
(id, group, symbols, enrichment, STALE, hint line) + neighbor-highlight
dimming; `tap` on child node → existing `select(n)` panel (unchanged HTML,
including the TEST stamp via `n.type === "Test"`); background tap →
`select(null)`; search input → dim non-matches (same haystack: id, title,
tags, export names); state chips (all/audited/skeleton) and area chips —
**area filter now reads `n.test`** (`fArea === "tests"` matches `n.test ===
true`) since the spatial `tests` group no longer exists; table view, theme
toggle, header tiles/sheetblock/footer untouched. `DATA.nodes`/`byId` remain
the source for panel/table; `cy` elements carry ids to join on. Node dragging:
cytoscape's built-in grab (fine); pan/zoom: built-in.

## Inputs

- Spike report (settled facts + verify-render approach):
  `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md`
- T04's report + `asbuilt/src/viz.ts` (elements shape, placeholders, inlineVendor)
- Current `asbuilt/src/viz-template.html` (everything you must preserve)
- Spec ACs 2/3/5/8: `docs/specs/asbuilt-viz-cytoscape/spec.md`
- Plan Task T05: `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md`

## Verification commands

```bash
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
git rev-parse --abbrev-ref HEAD    # asbuilt-viz-cytoscape
bun -e 'import {buildViz} from "./asbuilt/src/viz"; import {makeDenseSandbox} from "./asbuilt/tests/helpers/dense-fixture"; const r = buildViz(makeDenseSandbox(), "2026-07-16"); await Bun.write("/tmp/t05-dense.html", r.html); console.log("dense bytes:", r.html.length)'
bun asbuilt/src/viz.ts --target /Users/dustincheng/projects/claudeclaw --date 2026-07-16 --out /tmp/t05-claw.html
wc -c /tmp/t05-dense.html /tmp/t05-claw.html          # both ≤ 716800
grep -c 'https://unpkg\|https://cdn' /tmp/t05-dense.html   # 0 (grep exit 1 = pass)
grep -c 'Math.random\|Date.now()' /tmp/t05-dense.html # count must equal the count inside VENDOR marker regions only — verify none in the non-vendor script (show your extraction)
# browser checks (headless Chrome, per spike's verify-render approach): zero console errors,
# fit view = parent labels only, zoom-in = child labels, tooltip/panel/search/filter/table/theme live.
```

Commit: `git add asbuilt/src/viz-template.html && git commit -m "feat(asbuilt): cytoscape+fcose template — compound groups, semantic zoom, interactions (SPEC-004 T05)"`

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/05-template/report.md`:
sizes, browser-check evidence (console-error probe output, screenshot paths
for fit + zoom on both bundles), the tile-padding values chosen and why,
verification tails ≤30 lines each.

## Out of scope

- viz.ts and tests (T04 done; T06 next). Changing layout engine or the
  settled option values beyond the tile-padding judgment item. New features
  (minimaps, animations, export buttons). Suppressing any label statically.
