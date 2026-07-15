---
task: 03-spike
parallel_safe: false
testable: false
tier: judgment
---

## Goal

De-risk SPEC-004's engine swap before productization: prove the vendored
cytoscape+fcose stack loads headless in bun, prove layout determinism under
`randomize: false`, measure the packing factor against AC10's 3.0× bound, pick
the fcose option set and the label zoom threshold, and produce two rendered
HTML artifacts (dense fixture + real claudeclaw bundle) for the human look
checkpoint.

## Done-check

The report contains all six findings (loader incantation, determinism
verdict with evidence, measured packing factors for both bundles, recommended
layout options + `min-zoomed-font-size`, artifact paths, output-size + engine
recommendation per finding 6), and both spike HTML files exist at the stated
paths and open without console errors.

## File scope

**Working directory contract:** ALL repo reads happen in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; `git rev-parse --abbrev-ref HEAD` must print
`asbuilt-viz-cytoscape`. You write nothing in any git checkout except your
report at its absolute stream path below.

- `docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md`
  (via absolute path `/Users/dustincheng/projects/speculator/docs/fable-streams/...`)
  — findings (your report obligation; also the only committed output)
- Scratch scripts and the two spike HTMLs under
  `/private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/`
  (create the dir; NOT committed)

Nothing under `asbuilt/src/` or `asbuilt/tests/` may be modified. Read
freely; write nothing there.

## Required content

Five questions, answered with evidence:

1. **Headless load.** Global-eval the four vendor UMDs in order
   (layout-base → cose-base → cytoscape → cytoscape-fcose) in bun with
   module/exports NOT visible to the eval (so the UMDs take the global
   branch), e.g. `(0, eval)(readFileSync(path, "utf8"))` at top level of a
   plain script. Confirm `globalThis.cytoscape` is a function and fcose is
   registered (`cytoscape({headless: true, ...}).layout({name: "fcose"})`
   does not throw "no such layout"). If self-registration doesn't fire,
   register manually via the fcose global and record the exact working
   incantation — T06 ships it as `vendor-load.ts`.
2. **Determinism.** Build cytoscape elements from the dense fixture: run
   `buildViz(makeDenseSandbox(), "2026-07-15")` (import from
   `asbuilt/tests/helpers/dense-fixture.ts`, landed by T02), parse the
   embedded JSON (`/(\{"meta":.*"links":\[.*\]\})/s`), map nodes → child
   elements with `parent: "dir:" + n.group` + one parent element per group,
   links → edges. Seed every child's `position` from the template's FNV
   formula (copy `hash()` from `asbuilt/src/viz-template.html`; spread
   `90 + 44*sqrt(groupCount)` around per-group angular anchors — the OLD
   anchor formula is fine as a seed; determinism is what matters). Run fcose
   twice (`headless: true, styleEnabled: false`, `randomize: false`,
   `animate: false`); assert `JSON.stringify` of all positions identical.
   Also verify NO `Math.random` interference: run in a fresh process twice
   and compare across processes.
3. **Packing factor.** From settled positions: per-group axis-aligned bbox
   (over member node centers ± node radius `4 + 2.3*sqrt(symbols||1)`),
   global bbox over all nodes; factor = globalArea / Σ groupAreas. Measure
   for the dense fixture AND for the claudeclaw bundle
   (`buildViz("/Users/dustincheng/projects/claudeclaw", "2026-07-15")` —
   machine-local read-only path). If factor ≥ 3.0, tune (`nodeSeparation`,
   `idealEdgeLength`, `nodeRepulsion`, `packComponents: true`) until
   comfortably under and record the final option set; if the engine
   naturally lands far below 3.0, recommend a tighter AC10 constant.
4. **Options + zoom threshold.** Recommend the production fcose option set
   and a `min-zoomed-font-size` value (start from 12): at fit-to-view zoom of
   the dense fixture, child labels must NOT render; group labels must; a
   ~3× zoom-in on the 96-node cluster must render child labels readably.
5. **Look artifacts.** Two self-contained HTMLs (vendor scripts inlined, data
   inlined, compound parents, your recommended options): `spike-dense.html`
   and `spike-claudeclaw.html` in the scratch dir. Minimal styling is fine
   (state colors, test tint, parent labels); interactions beyond built-in
   pan/zoom are NOT needed. No CDN references — inline everything.
6. **Output size + engine alternative (amended 2026-07-16, escalations.md).**
   The unminified fcose stack threatened the spec's ≤700KB output budget;
   T01 now ships minified derivatives where loadable. Measure the actual
   `spike-dense.html` size under (a) the vendored fcose stack and (b)
   built-in `cose` layout using cytoscape.min.js ALONE (no layout-base /
   cose-base / fcose files) — cytoscape core ships `cose` natively and it
   supports compound graphs. Record both sizes AND both packing factors /
   determinism verdicts. Recommend the engine: if built-in cose meets the
   packing bound and determinism, dropping the fcose stack entirely is the
   preferred outcome (3 fewer vendored files, ~200KB smaller artifact).
   Also test cheap variant (c): T01 round 2 proved `bun build --minify`
   output breaks ONLY because bun rewrites the webpack UMD wrapper's
   top-level `this` to `exports` (see asbuilt/vendor/VENDOR.md,
   "Minification attempt") — patch the three source files' wrapper
   `(this, function` → `(globalThis, function` BEFORE minifying (in your
   scratch dir; do NOT modify asbuilt/vendor/), re-run the load smoke, and
   if it passes record the minified fcose-stack size (~500KB vendor
   projected) as option (c) with the exact derivation commands. If NO
   variant fits ≤700KB, escalate — the spec budget is a human call.

## Inputs

- `asbuilt/vendor/` + `VENDOR.md` (T01, on the current branch)
- `asbuilt/tests/helpers/dense-fixture.ts` (T02)
- `asbuilt/src/viz.ts` (buildViz, data shape) and
  `asbuilt/src/viz-template.html` (FNV hash, node radius formula, state colors)
- Spec: `docs/specs/asbuilt-viz-cytoscape/spec.md` (AC2, AC8, AC10)
- Plan Task T03:
  `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md`

## Verification commands

```bash
# from the repo root (worktree); scratch dir abbreviated as $SCRATCH
bun $SCRATCH/spike/headless-load.ts        # exit 0, prints "cytoscape ok, fcose registered"
bun $SCRATCH/spike/determinism.ts          # exit 0, prints "identical positions: true" twice
bun $SCRATCH/spike/packing.ts              # exit 0, prints both measured factors
ls -la $SCRATCH/spike/spike-dense.html $SCRATCH/spike/spike-claudeclaw.html
grep -c 'https://unpkg\|https://cdn' $SCRATCH/spike/spike-dense.html   # 0 (grep exits 1 = pass)
```

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md`
with the five findings, each with a ≤30-line evidence tail, plus a
**Settled facts for T04–T06** section: the loader incantation, the fcose
option set, the `min-zoomed-font-size` value, the recommended AC10 constant,
and both measured packing factors. Commit ONLY the report.

## Out of scope

- Modifying any product or test source — this is evidence, not implementation.
- Interactions (tooltip/panel/search/filters) — T05's job.
- Perfecting visuals — the checkpoint judges layout shape and label behavior,
  not final styling.
