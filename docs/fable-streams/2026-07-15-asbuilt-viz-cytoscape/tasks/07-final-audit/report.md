## spec-auditor — round 1

Blinded cold-read of `main...HEAD` against `docs/specs/asbuilt-viz-cytoscape/spec.md`
(SPEC-004). Inputs: spec text, the diff, the codebase. 352/352 asbuilt tests pass
(`bun test tests/`). ACs are the spec's own AC1–AC10 (already numbered).

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 | satisfied | `asbuilt/src/viz.ts:158-184` `toElements()` emits one `dir:${group}` parent per path-derived group; children carry `parent: dir:${n.group}` + `test` flag + `test` class. `viz.ts:256` grouping is always `groupOf()` (path-derived), tests-bucket removed. Verified: `viz-elements.test.ts:130-138` (no `group==="tests"`, co-located test → `src/tools`), `dense-fixture.test.ts:62-68` (cmd/cli = 96 = 54 src + 42 test, `tests` group = 0). |
| AC2 | satisfied | Stylesheet `viz-template.html:386-391` node `node[d]` label carries `"min-zoomed-font-size": 24` (zoom threshold); `:parent` compound label `viz-template.html:398-403` has `label: data(label)` and **no** zoom threshold (always visible). No population/static label-suppression code path exists anywhere in the template (only `.dim` opacity, which is filter/hover-driven, `viz-template.html:406`). Verified by stylesheet inspection per AC2's own method. |
| AC3 | satisfied | Real 67-concept build `/tmp/claw-viz-1.html`: 0 non-vendor URLs, no `<script src>`, no `<link href>`, no `fetch`/`XMLHttpRequest`/`@import` (URL scan below). Vendor UMDs inlined via `viz.ts:200-209 inlineVendor()`. Self-containment test `viz.test.ts:162-176`. |
| AC4 | satisfied | Two CLI builds of the unchanged claudeclaw bundle are byte-identical (`cmp` = BYTE-IDENTICAL, below). Determinism tests `viz.test.ts:230-233`, `dense-fixture.test.ts:152-155`, plus sort-order guard `dense-fixture.test.ts:145-148`. |
| AC5 | satisfied | All four interactions implemented in `viz-template.html`: hover tooltip surfacing id/group/symbols/enrichment (`:436-438`, byte-identical content to old `main` template line 535), click detail panel (`select()` `:495-529`), search dimming (`applyFilters`+`visible()` `:461-479`, `.dim` `:406`), state/area chips (`:480-487`). Adaptation: area "tests" chip reads `n.test` flag (`:466`) instead of removed `group==="tests"` — same information surfaced. No automated browser test; verified by code inspection + parity diff vs `main`. |
| AC6 | satisfied | Former `expect(testNode.group).toBe("tests")` (old `main:asbuilt/tests/viz.test.ts:119`) replaced by grouping-supersession assertion with claw-wsit comment (`viz.test.ts:200-209`). JSON-embedding/counts (`:178-191`), edge-collapsing (`:193-198`), `</` breakout escaping (`:222-228`), determinism (`:230-233`) all present and passing. |
| AC7 | satisfied | CLI entry guard unchanged (`viz.ts:334-348`; diff touches only internal build logic). Real build `--target claudeclaw --date 2026-07-16` → `67 concepts`, exit 0 (below). No-clock enforced+tested (`viz-layout.test.ts:198-225`); CLI-contract tests `viz.test.ts:250-302`. |
| AC8 | satisfied | `viz-template.html:421` fcose `randomize:false`, seeded from FNV hash positions (`:339-363`) written onto child elements before construction. No `Math.random`/`Date.now`/argless `new Date()` in template or viz.ts (tested `viz-layout.test.ts:198-225`). Two headless fcose runs settle JSON-identical (`viz-layout.test.ts:186-196`); production options parsed live from the shipped template (`:93-152`). "Same browser" verified via in-process headless reproduction of the shipped stack. |
| AC9 | satisfied | `asbuilt/vendor/VENDOR.md:16-21` records package/version/license/sha256 for all 4 pinned files; `vendor-provenance.test.ts:74-80` re-hashes each shipped file against the independently-recorded sha256; `:89-102` pins cytoscape MIT header. Tests are offline (`loadCytoscape` global-evals local files, `vendor-load.ts:75-80`). |
| AC10 | satisfied | `viz-layout.test.ts:228-282` computes packing factor from settled fcose positions with production options; bound 4.5 recorded beside measured value (console: `AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)`). 2.636 ≤ 4.5. Spec's lower-bound/"ring must fail" clause was withdrawn 2026-07-16. |

### Evidence tails

AC7 — real claudeclaw build succeeds (67 concepts, exit 0):
```
viz: 67 concepts (9 audited), 54 file links from 261 resolved edges → /tmp/claw-viz-1.html
exit=0
```

AC4 — byte-determinism on the real bundle:
```
diff exit:
BYTE-IDENTICAL
```

AC3 — non-vendor URL / external-ref scan of the real build:
```
distinct URL count (non-vendor): 0
script src: False
link href: False
fetch/XHR/@import: False
```

AC10 + full suite:
```
tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)
 352 pass
 0 fail
Ran 352 tests across 30 files.
```

### Scope surplus
None. Every behavioral change in the diff (compound parents, semantic-zoom
labels, test-flag classification, vendor inlining, fcose seeded layout, dense
fixture, packing anchor) maps to an AC. The added `docs/specs/.../evals/*` and
`evidence/*` files are SDLC process artifacts for this spec, not runtime
behavior. File changes stay within the spec's declared scope (`viz.ts`,
`viz-template.html`, `vendor/`, `tests/`, docs).

### Scope deficit
None. Every AC1–AC10 has an implementation trace in the diff/codebase (see table).

## fable — adjudication of the AC5 panel finding

Panel refuted AC5 2/3. Conductor ruling after first-hand check:
- REAL (fixed): dim opacity 0.15 vs prior template's 0.08 — verified
  (`git show main:...viz-template.html:182` = .08; worktree :406 = 0.15).
  Root cause was the conductor's own T05 brief transcribing 0.15. Fixed to
  0.08 in the template (commit follows), suite 353/353 green.
- REJECTED (spec-mandated, not violations): cytoscape API replacing SVG DOM
  (the spec's purpose); area filter reading n.test instead of the removed
  spatial group (R3/AC1 mandate); test styling + legend row (R3 mandate);
  zoom-gated labels replacing audited-only labels (AC2 mandate). The
  refuters' "byte-identical" framing attacked the auditor's loose phrasing,
  not the AC, which demands behavioral parity of information surfaced —
  which holds.
Net: all 10 ACs satisfied after the one-token parity fix.
