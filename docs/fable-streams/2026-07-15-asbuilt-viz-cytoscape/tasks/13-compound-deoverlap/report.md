## fable — round 1

claw-dsob, conductor-executed in-session (recorded takeover: look-gate-arbitrated
visual tuning needs the conductor's eyes in the iteration loop; worker dispatch
adds no adversarial value for layout physics — the suite + browser measurement
are the checks).

Root cause (verified at vendor source): fcose repels node BODIES only; compound
rectangles are post-hoc bounding boxes (+16px style padding) and compound labels
are render overlays sized by text length. `packComponents: true` is inert —
`asbuilt/vendor/cytoscape-fcose.js` guards packing on `layoutUtilities&&`, and
the layout-utilities extension is not vendored.

Fix: deterministic post-layout de-overlap pass in viz-template.html
(compoundExtent + deOverlapCompoundBoxes: padded, label-aware extents; smaller
group moves; fixed pair order and tie-breaks; sweep-parity axis alternation;
60-sweep cap), invoked after an explicit `cy.layout(...).run()` (constructor
layout is now `{ name: "preset" }` for the seeds) followed by refit.

Field fix-loop (conductor's own): first version converged headless but exhausted
its 30-sweep cap in the browser — style padding inflated extents into a
horizontal squeeze that the fixed minimal-axis rule could never escape
(instrumented in-page: a group shuttling on x between two neighbours while the
freeing y-push was never chosen). Fix: axis alternation by sweep parity + cap
60 + tests now measure padded compounds (DSOB_STYLE) + a dedicated squeeze
regression test.

Evidence:
- Suite: 378 pass / 0 fail (2194 expect) — includes 4 new dsob tests
  (guaranteed-overlap separation w/ vacuity guard, determinism, dense-pipeline
  invariant, squeeze regression); tsc clean; biome clean.
- Browser (settled, cy.stop+fit pinned): origin bundle nodeBodyOverlaps 0,
  compoundBoxOverlaps 0 (was 8, worst 30.3%), labelAwareExtentOverlaps 0
  (was 3 residual under the 30-cap version); bbox 878x985 → 904x1164.
- Dense fixture: 0 overlaps, bbox 1097x704 IDENTICAL pre/post (pass no-ops),
  AC10 packing unchanged 2.636.
- Screenshots: session scratchpad proof/ (claudeclaw-fixed-fit.png,
  dense-fixed-fit.png vs claudeclaw-fit-true.png before).

Look-gate: conductor-approved; Dustin's eyeball verdict pending on the fit-view
screenshot (his call closes claw-dsob).
