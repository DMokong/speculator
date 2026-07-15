---
task: 06-tests-hardening
parallel_safe: false
testable: false
tier: standard
---

## Goal

Evolve the test suite into SPEC-004's verification surface: preserve every
existing intent under the new engine (AC6), add the headless layout tests
(AC8 determinism, AC10 drift anchor at 4.5), evolve self-containment for the
vendored regions (AC3), flip the dense-fixture grouping assertions to the new
contract (AC1), and leave the whole suite green offline.

## Done-check

`bun test asbuilt/tests/` — ALL tests pass, no network access required;
`grep -n '4.5' asbuilt/tests/viz-layout.test.ts` shows the AC10 bound with
the spike-measured 4.116 recorded beside it; the claw-wsit supersession
comment exists at the updated grouping assertion.

## File scope

**Working directory contract:** ALL work happens in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; `git rev-parse --abbrev-ref HEAD` must print
`asbuilt-viz-cytoscape` before any write or commit — else STOP and escalate.
Only your report (absolute stream path) is written outside the worktree.

- `asbuilt/tests/viz.test.ts` (modify)
- `asbuilt/tests/dense-fixture.test.ts` (modify — flip grouping assertions)
- `asbuilt/tests/helpers/vendor-load.ts` (create)
- `asbuilt/tests/viz-layout.test.ts` (create)
- NOT `asbuilt/src/*` and NOT `asbuilt/vendor/*` — if a product defect blocks
  a test, escalate with evidence instead of patching product code.

## Required content

**`viz.test.ts` evolution (every intent preserved, AC6):**
- *Self-containment (AC3):* split the built HTML on the
  `/*VENDOR:<name>:start*/ … /*VENDOR:<name>:end*/` markers. Each vendor
  region must be BYTE-EQUAL to the corresponding `asbuilt/vendor/` file. The
  non-vendor remainder gets the existing checks verbatim (`<script src=`,
  `<link href=`, `fetch(`/`XMLHttpRequest`/`@import`, and the URL allowlist
  `http://www.w3.org/`). License-comment URLs inside vendor code are thereby
  covered by byte-equality, not the allowlist.
- *Grouping supersession (AC1):* co-located test concept (`resource:
  src/tools/x.test.ts`, `type: Test`) asserts `group === "src/tools"` and
  `test === true`, with the comment: `// SPEC-004 supersedes claw-wsit's
  SPATIAL rule: classification stays frontmatter-driven (test flag), grouping
  is path-derived — tests live with their source directory.`
- *Unchanged intents:* embedded-JSON counts/date/folds, cross-file edge
  collapsing (`links` equality), `</` script-breakout escaping,
  byte-determinism (two builds identical). Update the extraction regex only
  as needed to tolerate the `elements` key.
- *Elements presence:* embedded data has `elements` whose child/parent/edge
  counts reconcile with `nodes`/`links`.

**`dense-fixture.test.ts` flip:** the pre-T04 assertions (54 in `cmd/cli` +
42 in `tests`) become the new contract: **96 nodes in group `cmd/cli`** (54
source + 42 tests, `test: true` on exactly 42 of them), no `tests` group.
Keep the 111-total and determinism assertions.

**`vendor-load.ts` (spike-proven loader, finding 1):** global-eval
`layout-base.js → cose-base.js → cytoscape.min.js → cytoscape-fcose.js` via
`(0, eval)(readFileSync(f, "utf8"))` at plain-script top level; fcose
self-registers; export a function returning `globalThis.cytoscape`.
**Headless caveat (mandatory):** callers must create instances with
`styleEnabled: true` and a stylesheet mapping `node[d]` width/height to
`data(d)` — `styleEnabled: false` leaves NaN dimensions and cose-base throws
`RangeError` in repulsion-grid sizing.

**`viz-layout.test.ts`** (names: `test_ac8_*`, `test_ac10_*`):
- AC8: build elements via `toElements` from the dense fixture (through
  `buildViz` + embedded JSON, or import the helpers directly), seed positions
  from the template's FNV formula, run fcose twice
  (`randomize:false, animate:false`, the production option set from the spike:
  quality proof, packComponents+tile, tilingPadding 4/4 — read T05's report
  for any padding change and use the SHIPPED template's values), assert
  positions JSON-identical.
- AC10 drift anchor: per-group bbox (centers ± radius from `d/2`), global
  bbox, factor = globalArea / Σ groupAreas;
  `const PACKING_BOUND = 4.5; // SPEC-004 AC10 drift anchor — spike checkpoint measured 4.116 (2026-07-16); look-gate arbitrates compactness, this guards drift.`
  Assert factor ≤ PACKING_BOUND and log the measured value.
- Static determinism greps (AC8 clause): the built HTML's NON-vendor script
  regions and `asbuilt/src/viz.ts` contain no `Math.random`, `Date.now(`, or
  argless `new Date()`.

## Inputs

- Spike report (loader, options, caveats, measured factors):
  `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md`
- T04 + T05 reports (shipped shapes/values):
  `…/tasks/04-data-model/report.md`, `…/tasks/05-template/report.md`
- Current `asbuilt/tests/viz.test.ts`, `asbuilt/src/viz.ts`,
  `asbuilt/src/viz-template.html`, `asbuilt/vendor/VENDOR.md`
- Spec (all ACs): `docs/specs/asbuilt-viz-cytoscape/spec.md`; plan Task T06.

## Verification commands

```bash
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
git rev-parse --abbrev-ref HEAD    # asbuilt-viz-cytoscape
bun test asbuilt/tests/            # ALL green
cd asbuilt && bunx tsc --noEmit && bunx biome check tests/ && cd ..
bun asbuilt/src/viz.ts --target /Users/dustincheng/projects/claudeclaw --date 2026-07-16 --out /tmp/t06-claw.html && wc -c /tmp/t06-claw.html   # AC7: succeeds, ≤716800
```

Commit: `git add asbuilt/tests/ && git commit -m "test(asbuilt): SPEC-004 verification surface — vendor-region equality, grouping supersession, layout determinism + drift anchor (T06)"`

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/06-tests-hardening/report.md`:
full-suite tail, the measured AC10 factor, AC7 build tail, ≤30 lines each.

## Out of scope

- Product code (`asbuilt/src/`, `asbuilt/vendor/`) — escalate defects, never
  patch them here. New test frameworks. Network-dependent tests.
