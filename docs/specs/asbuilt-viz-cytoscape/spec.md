---
id: SPEC-004
status: approved
author: Dustin Cheng
date: 2026-07-15
epic: speculator-0d6
worktree: asbuilt-viz-cytoscape
risk_level: medium
impact_rating: none          # SYSTEM-SPEC.md contains no viz behaviors (gates/scorers/compactor only)
domain:                      # single-file SYSTEM-SPEC layout — not required
amends: []
---

## Problem Statement

The As-Built viz (`asbuilt/src/viz-template.html`, rendered by `asbuilt/src/viz.ts`)
renders dense flat-package bundles as an unreadable blob of overlapping labels.
Field case: sdlc-clients, a real Go CLI repo — 110-concept OKF bundle with
`cmd/cli` = 54 concepts and a cross-cutting `tests` supergroup = 42.

Two traced causes:

1. The force layout anchors every non-`src` group to a ring of flat radius 330
   (`viz-template.html:344`) regardless of group population; initial scatter
   scales by `sqrt(population)` but the anchor ring never did.
2. Permanent `<text>` labels have zero collision avoidance, and viewBox zoom
   scales text with circles, so label crowding is zoom-invariant. Node circles
   never overlap (the positional de-overlap pass works; ~40–50px gaps), but
   15–25-char filename labels exceed the gaps and stack.

A first patch round (population-scaled anchor radius; permanent label
suppression for groups > 15) was field-tested and **reverted**: suppression
lost at-a-glance names, and scaled rings pushed the big groups far apart
leaving a large empty middle. The two patches failed in opposite directions —
the real success criteria are compact layout **and** labels that survive
density. The hand-rolled SVG force sim has hit its ceiling; this spec replaces
the rendering engine rather than hand-tuning it further.

Design (approved 2026-07-15): `docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/design.md`

## Requirements

- [ ] R1: Replace the template's hand-rolled SVG force sim with Cytoscape.js +
      the fcose layout, with OKF directory groups modeled as compound parent
      nodes so the layout packs clusters compactly by construction.
- [ ] R2: Labels use semantic zoom — compound group labels always visible;
      individual node labels appear when zoomed in past a threshold
      (`min-zoomed-font-size`). No label is ever permanently suppressed by
      group size or any other static rule.
- [ ] R3: Test concepts are spatially grouped under their source directory's
      compound node with distinct visual identity (badge/styling from their
      frontmatter classification). The global `tests` bucket is removed.
      Classification remains frontmatter-driven, never path-derived — this
      supersedes only the *spatial* half of the claw-wsit rule.
- [ ] R4: Existing interactions are preserved with identical behavior: hover
      tooltip (id, group, symbol count, enrichment state), click-to-detail
      panel, search that dims non-matches, and state/area filters.
- [ ] R5: The artifact contract is preserved: single self-contained HTML file,
      no external resource references, no network at build or view time,
      byte-deterministic regeneration, `viz.ts` CLI unchanged
      (`--target/--out/--date`, no clock reads).
- [ ] R6: Cytoscape and fcose (plus fcose's cose-base/layout-base
      dependencies) are vendored as pinned minified files under
      `asbuilt/vendor/` with versions and licenses recorded, inlined by
      `viz.ts` at build time.
- [ ] R7: A synthetic dense-bundle fixture (≥50-concept group plus ≥40 test
      concepts) exercises the crowding case in the test suite as a regression
      anchor.

## Acceptance Criteria

<!-- Gate 2b tip: name your tests after these AC IDs (e.g., test_ac1_...) to help
     the eval-quality scorer map tests to criteria. Each AC should have at least
     one test that verifies its observable outcome, not just its surface behavior. -->
- [ ] AC1: Given the dense fixture bundle, when `viz.ts` builds `viz.html`,
      then the embedded graph data contains one compound parent per source
      directory, every test concept's parent is its source directory's
      compound (with a test marker), and no global `tests` group exists
      anywhere in the embedded data.
- [ ] AC2: Given the built template, when its stylesheet and script are
      inspected, then node labels are governed by a zoom threshold
      (`min-zoomed-font-size` or equivalent zoom-conditional rendering),
      compound group labels carry no zoom threshold (always visible), and no
      code path suppresses labels conditional on group population or any other
      static property.
- [ ] AC3: Given any bundle, when `viz.html` is built, then the file contains
      no external script/link/import references and no network-fetching code
      paths reachable at view time; all vendored library code is inlined; the
      only URLs present are XML/SVG namespace identifiers or URLs inside
      embedded bundle-data strings.
- [ ] AC4: Given an unchanged bundle and manifest, when `viz.ts` runs twice,
      then the two outputs are byte-identical.
- [ ] AC5: Given the built page, when a node is hovered, clicked, searched
      for, or filtered by state/area, then tooltip, detail panel, search
      dimming, and filters behave as in the current template (same information
      surfaced, same dimming semantics).
- [ ] AC6: Given the existing `viz.test.ts` intents (JSON embedding and
      counts, cross-file edge collapsing to file links, `</` script-breakout
      escaping, determinism), when the suite runs against the new template,
      then all pass; the former `group === "tests"` assertion is updated to
      the new grouping contract with a comment recording the claw-wsit
      supersession.
- [ ] AC7: Given `viz.ts`, when invoked with `--target/--out/--date`, then the
      CLI contract is unchanged, the sheet date comes only from `--date` (no
      clock reads anywhere in build or template code), and building
      claudeclaw's real bundle (`docs/asbuilt/`, 67 concepts) succeeds.
- [ ] AC8: Given the template's layout invocation, when inspected and
      exercised, then fcose runs with `randomize: false` seeded from the
      deterministic hash-derived initial positions, our template code contains
      no `Math.random`/`Date.now`/argless-`new Date()` calls, and two loads of
      the same `viz.html` in the same browser settle to the same layout.
- [ ] AC9: Given `asbuilt/vendor/`, when inspected, then each vendored file is
      a pinned release version with its version and license recorded (manifest
      or header), and `bun` tests do not require network access to pass.
- [ ] AC10: Given the dense fixture bundle, when the layout is settled in a
      headless run, then the packed layout has no large voids: the
      axis-aligned bounding box of all settled clusters has area at most 3×
      the sum of the individual clusters' bounding-box areas. (The constant
      starts at 3.0, may be tightened by the spike, and is recorded in the
      test alongside the measured value; the reverted ring layout, which
      pushed groups apart around an empty middle, must fail this bound.)

## Intent & Anti-Patterns

The viz exists so a human can *comprehend* a bundle at a glance and drill in
smoothly. Density must cost zoom effort, never information. Compactness and
label survival are both mandatory — the field feedback proved that sacrificing
either gets the work reverted.

### Anti-Patterns
- Permanent label suppression keyed on group size (field-tested, rejected —
  dense groups went nameless at every zoom).
- Population-scaled anchor rings or any layout that buys density relief with
  empty space between clusters (field-tested, rejected).
- Baking layout coordinates into the artifact — floating-point layout results
  can differ across platforms and would silently break byte-determinism; the
  file carries data + seed, and layout settles client-side.
- Loading any library from a CDN at build or view time.
- Meeting AC1's letter by renaming the global tests bucket while still
  clustering all tests together spatially.

### Critical User Journeys
- A reviewer opens `viz.html` for a dense flat-package Go bundle: sees named,
  compactly packed directory clusters at default zoom; zooms into one cluster
  and reads individual file labels; hovers/clicks for detail.
- A maintainer regenerates an unchanged bundle: output is byte-identical, so
  drift diffs stay quiet.
- A claudeclaw user opens the existing 67-concept bundle: at least as legible
  as today, all current interactions intact.
- Anyone double-clicks `viz.html` from `file://` with no network: fully
  functional.

## Constraints

- Single-file self-contained artifact; output size budget ≤ 700KB for a
  ~110-concept bundle.
- Byte-deterministic build: no timestamps, no clock, no randomness; date only
  via `--date` (existing convention).
- Vendored, pinned dependencies only; no package registry access at build or
  test time.
- Changes confined to `asbuilt/src/viz.ts`, `asbuilt/src/viz-template.html`,
  `asbuilt/vendor/` (new), `asbuilt/tests/viz.test.ts` + fixtures, and docs.
- Toolchain: bun (existing asbuilt convention).

## Out of Scope

- Semantic concept-type classification (claw-j65u) and any change to the
  generator agent's output contract.
- A backfill workflow skill (claw-8b8v).
- Any change to extract/skeleton/fold/refresh/gate flows or bundle formats.
- claudeclaw's frozen `scripts/asbuilt-viz/` reference copy (plugin-first
  decision, 2026-07-05).

## Impact Declaration

`impact_rating: none` — SYSTEM-SPEC.md documents pipeline gates, scorers,
rubrics, and compactor behaviors; the As-Built viz renderer appears nowhere in
it. No existing system behavior is amended.
