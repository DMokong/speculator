---
stream: 2026-07-15-asbuilt-viz-cytoscape
phase: plan
entry: idea
conductor_model: fable
weave:
  superpowers: loaded (brainstorming used for phase 1)
  speculator: SPEC-004 (worktree: .claude/worktrees/asbuilt-viz-cytoscape)
  beads: speculator-0d6 (epic; DB reinit-local 2026-07-15 — dolt store was empty + prefixless after May migration, snapshot in session scratchpad)
  workflow_tool: available
  fable_mode: loaded — gate citations
target_repo: /Users/dustincheng/projects/speculator
---

# Stream: asbuilt-viz-cytoscape

Rebuild the As-Built viz renderer (`asbuilt/src/viz-template.html` + `viz.ts`)
around Cytoscape.js + fcose with semantic zoom, replacing the hand-rolled SVG
force sim that hit its ceiling on dense flat-package bundles.

Origin: field feedback from the sdlc-clients backfill (110-concept Go bundle,
cmd/cli=54 + tests=42) — label crowding, and a first patch round (population-
scaled anchor rings + dense-group label suppression) that Dustin reverted:
suppression lost at-a-glance names, scaled rings left a huge empty middle.

Issues (claudeclaw beads): claw-jqcf (crowding, primary), claw-mb5o (tests
supergroup — resolved in-design), supersedes claw-wsit's *spatial* grouping
rule only. Out of scope: claw-j65u (semantic types), claw-8b8v (backfill skill).

Design: design.md (approved interactively by Dustin, 2026-07-15)

Phase 2 record: SPEC-004 approved at Gate 1 = 8.2 (fresh blind re-score after
AC10 amendment; initial 9-AC version scored 8.3). Gate 2a = 8.0 pass on round
2 — round 1 failed 7.3 with a blocking flag (zero eval coverage of
anti-pattern #2, the field-reverted empty-middle layout), fixed at the root by
adding AC10 (compactness packing bound) + its eval rather than padding an
existing eval. Both gates blind re-scored. Evidence: spec dir evidence/
(gate-1-scorecard.yml, gate-2a-eval-intent.yml), commit cf091c0.

Plan: plan.md (Phase 3, awaiting human approval — last mandatory touchpoint)

## Task ledger

| Task | Wave | Status | Fix rounds | Notes |
|---|---|---|---|---|
| 01-vendor-libs | 1 | pending | 0 | standard; parallel_safe; network allowed (pin step) |
| 02-dense-fixture | 1 | pending | 0 | standard; parallel_safe; testable |
| 03-spike | 2 | pending | 0 | judgment (opus); human look-checkpoint after |
| 04-data-model | 3 | pending | 0 | standard; testable; viz.ts + own test file |
| 05-template | 4 | pending | 0 | judgment (opus); testable; template only |
| 06-tests-hardening | 5 | pending | 0 | standard; testable; test-adversary N=3 after |
