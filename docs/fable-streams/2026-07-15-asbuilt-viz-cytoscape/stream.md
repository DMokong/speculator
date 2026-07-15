---
stream: 2026-07-15-asbuilt-viz-cytoscape
phase: shape
entry: idea
conductor_model: fable
weave:
  superpowers: loaded (brainstorming used for phase 1)
  speculator: present — binding at phase 2
  beads: bd 1.1.0 available (epic pending /sdlc start)
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

## Task ledger

| Task | Wave | Status | Fix rounds | Notes |
|---|---|---|---|---|
