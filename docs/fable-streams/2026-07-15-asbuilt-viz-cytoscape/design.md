# Design: As-Built viz v2 — Cytoscape/fcose renderer with semantic zoom

Approved by Dustin 2026-07-15 (interactive brainstorm, fable-conductor Phase 1).

## Problem

The As-Built viz (`asbuilt/src/viz-template.html`, rendered by `asbuilt/src/viz.ts`)
renders dense flat-package bundles as an unreadable blob. Field case: sdlc-clients,
a real Go CLI repo — 110-concept OKF bundle, `cmd/cli` = 54 concepts, cross-cutting
`tests` supergroup = 42. Two traced causes:

1. Anchor radius is a flat constant (330) regardless of group population
   (`viz-template.html:344`); initial scatter scales by `sqrt(population)` but the
   anchor ring never did.
2. Permanent text labels have zero collision avoidance, and viewBox zoom scales
   text with circles, so label crowding is zoom-invariant. Circles themselves never
   overlap (the positional de-overlap pass works); 15–25-char filename labels
   exceed the ~40–50px inter-node gaps and stack.

A first patch round (population-scaled anchor `R = 200 + 26 * count`; suppress
permanent labels for groups > 15) was tried in the field and **reverted** — the
suppression lost at-a-glance names, and the scaled rings pushed `tests` and source
groups far apart leaving a huge empty middle. Both patches failed in opposite
directions; the real success criteria are **compact layout + labels that survive
density**, which is what layout engines and semantic zoom exist to resolve.
Verdict from the failure: the hand-rolled force sim has hit its ceiling.

## Goal & acceptance

- A dense flat-package bundle (54-concept group + 42 tests) is readable at default
  zoom: compact packed clusters, visible group names, no dead space, no permanently
  suppressed labels — zooming into any cluster reveals its file labels.
- Small bundles (e.g. claudeclaw's 67-concept, 5-group bundle) look at least as
  good as today.
- Output remains a single self-contained `viz.html`: no external resource
  references, no network at build or view time.
- Regeneration is byte-deterministic (unchanged bundle → identical bytes).
- Existing interactions preserved: hover tooltip, click-to-detail panel,
  search-dims-non-matches, state/area filters.

## Approach (chosen: engine swap, client-settle preserved)

Replace the hand-rolled SVG force sim with **Cytoscape.js + fcose**, keeping
today's determinism model: no baked coordinates — the file carries deterministic
data + a deterministic seed, and layout settles client-side at view time.

Rejected alternatives:
- **Iterate the hand-rolled sim** (zoom-aware labels + circle-packed group hulls):
  no new dependency, but round two of hand-tuning after round one was reverted on
  look alone; packing and label quality permanently trail a real engine; every
  future density issue stays bespoke.
- **Dense-bundle alternate view** (treemap-in, graph-out): a UX redesign, not a
  fix; parked.

## Architecture & packaging

- `viz.ts` CLI contract and data extraction unchanged: `--target / --out / --date`,
  bundle + graph manifest → embedded JSON block. The `--date` convention (no clock
  reads) stands.
- Template rewritten around Cytoscape. Libraries **vendored**: pinned minified UMD
  files checked into `asbuilt/vendor/` (cytoscape core; cytoscape-fcose plus its
  cose-base/layout-base dependencies), inlined by `viz.ts` at build time. No CDN
  at build or view time.
- Output size grows ~95KB → ~550KB — acceptable for a local artifact that travels
  with the bundle.

## Graph model & grouping (resolves claw-mb5o; supersedes claw-wsit spatial rule)

- Directory groups become **compound parent nodes** (real containers, packed by
  the layout).
- Test concepts keep classification identity — `Test` type from frontmatter,
  badge + distinct styling — but are **grouped under their source directory's
  compound**, dissolving the global `tests` bucket. claw-wsit's rule survives
  where it matters: classification remains frontmatter-driven, never path-guessed;
  only the *spatial* grouping changes. The existing test asserting
  `group === "tests"` is updated to the new contract with a comment recording the
  supersession.

## Layout & determinism

- fcose with `randomize: false`, initial positions seeded from the existing FNV
  hash function. Layout settles client-side, per browser — same model as today.
- No coordinates in the file ⇒ byte-determinism reduces to what already holds:
  deterministic data JSON + static template + static vendored libs.
- No clock reads, no `Math.random` in our code. Spike verifies fcose makes no
  internal random calls under `randomize: false`.

## Semantic zoom & interactions

- Compound group labels always visible (the "city names" at altitude).
- Node labels use `min-zoomed-font-size` to fade in as the user zooms into a
  cluster — nothing is ever permanently suppressed; zoom is the reveal mechanism.
- Hover tooltip, click detail panel, search filter (dims non-matches), and
  state/area filters re-wired onto Cytoscape's event API with behavior identical
  to today.

## Testing

- All existing `viz.test.ts` intents carry over: JSON embedding + counts, edge
  collapsing to file links, `</` escaping against script breakout,
  byte-determinism (build twice, compare bytes).
- Self-containment check evolves mechanically while preserving intent: vendored
  lib code may incidentally contain substrings like `fetch(` that the current
  regex bans. The check is re-scoped to enforce no external URLs/resources and no
  runtime network use, rather than substring-matching the vendor blob.
- New fixture: synthetic dense bundle (54-concept group + 42 tests shape)
  exercising the crowding case as a regression anchor.

## Rollout — spike-first

- **Task 1 (spike, human checkpoint):** prove vendored-lib inlining works, fcose
  determinism holds, and render claudeclaw's real bundle + the dense fixture.
  Dustin eyeballs the result before productize tasks run — round one of fixes was
  reverted on look alone, so the look gate is explicit this time.
- **Then productize:** template rewrite, interaction re-wiring, test updates,
  fixture, docs.
- claudeclaw's `scripts/asbuilt-viz/` reference copy stays frozen per the
  plugin-first decision (2026-07-05) — untouched by this stream.

## Out of scope

- claw-j65u (semantic concept types — generator output contract change).
- claw-8b8v (backfill workflow skill).
- Any change to bundle generation, fold, refresh, or gate flows.
