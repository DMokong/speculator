---
stream: 2026-07-15-asbuilt-viz-cytoscape
phase: done
entry: idea
conductor_model: fable (phases R–4 waves 1-2 + spike checkpoint), opus-emulation (waves 3-4 incl. T05 interruption recovery), fable (wave 5+, 2026-07-18)
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
| 01-vendor-libs | 1 | done | 0 | ddfc32e; unminified originals shipped (681KB) — bun-minify breaks UMD global-eval (this→exports rewrite), documented in VENDOR.md; smoke passes |
| 02-dense-fixture | 1 | done | 0 | c743291 (relocated round 1 content); 10/10 tests green in worktree |
| 03-spike | 2 | done | 0 | judgment; look approved 2026-07-16; fcose mandatory (cose non-deterministic); ship patched-minified stack ~518KB; AC10 reframed to drift anchor ≤4.5 |
| 04-data-model | 3 | done | 1 | 6bb6a36; minified vendor 488KB runs fcose (conductor-verified); 13/13 new tests; grep done-check had stray-space bug (brief error, documented) |
| 05-template | 4 | done | 0 | 69e3a82; full pipeline pass round 1; conductor-verified renders (573KB/600KB, semantic zoom + co-located tests visible); label-overlap polish item to final review |
| 06-tests-hardening | 5 | done | 1 | f3b465d+8015c7d+7131e0d; adversary: 9 gaps found, hardened, residue empty; 352/352 green (conductor-verified) |


## Spike checkpoint (2026-07-16, opus tier)

Look approved by Dustin. Settled: fcose is mandatory (built-in cose fails AC8
determinism); ship patched-minified fcose stack (wrapper `this`→`globalThis`
before `bun build --minify`) at ~518KB spike-dense; `min-zoomed-font-size: 24`.
AC10 reframed drift-anchor ≤4.5 (measured 4.116) — the ratio provably cannot
discriminate the reverted ring (2.63), so the look-gate arbitrates
compactness. Spec/eval/plan amended; Gate 1 + Gate 2a blind re-scores in
flight before wave-3 dispatch.

## Closing record (2026-07-18, fable tier)

Delivered as speculator PR #2 (https://github.com/DMokong/speculator/pull/2),
branch asbuilt-viz-cytoscape, 13 commits. All gates pass: G1 8.7, G2 362/362
+ 86.25% coverage, G2a 8.0 (r2), G2b 7.8 (r2), G2c 7.8, G3 pass (1 warn),
G4 33/33 mechanical. Blinded final-audit: 10/10 ACs; its AC5 panel finding
(dim parity) + Gate 2c's 3 findings all fixed in-branch. Adversary phase:
9 suite-sensitivity gaps hardened, residue empty. SPEC-004 compacted into
SYSTEM-SPEC.md (11 entries). Epic speculator-0d6 closed; lock released.
Worktree stays until PR merge. Deferred out of scope: claw-j65u (semantic
types), claw-8b8v (backfill skill), label-overlap polish (Gate-3 warn).
