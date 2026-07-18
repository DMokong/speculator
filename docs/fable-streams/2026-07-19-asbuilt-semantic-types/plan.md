# Plan — SPEC-005 asbuilt-semantic-types

Entry: spec written by conductor from the interactively-approved design;
Gate 1 scoring in flight. Pipeline per .claude/sdlc.local.md: Gate 1 (7.0)
→ evals (Gate 2a ≥6.5) → implement → Gate 2 (tests+80% cov) → 2b → 2c → 3
→ 4/close (strategy: pr).

## Phase A — evals (conductor + eval-intent-scorer)

Conductor authors per-AC evals; eval-intent-scorer gates at 6.5. (SPEC-004
lesson: cover the anti-patterns as first-class evals, not padding.)

## Phase B — implementation wave (one wave, 3 parallel tasks, disjoint scopes)

| Task | Scope | ACs | Flags |
|---|---|---|---|
| 01-fold-suggested-type | asbuilt/src/fold.ts, tests/fold.test.ts, tests/refresh.test.ts (additive) | AC1-AC5 | parallel_safe, testable, standard |
| 02-reclassify-cli | asbuilt/src/reclassify.ts (new), tests/reclassify.test.ts (new) | AC6, AC7, AC9, AC10 | parallel_safe, testable, standard |
| 03-generator-contract | agents/asbuilt-generator/AGENT.md, tests/agents.test.ts | AC8 | parallel_safe, testable, standard |

Pipeline per task: test-author (red-first) → implementer (sonnet) →
verifier (haiku) → adversarial-reviewer (sonnet), maxFixLoops 2.

## Phase C — test-adversary

Spec carries test-suite ACs → test-adversary.js, 3 breakers, after wave B.
Residue escalates to conductor.

## Phase D — finalize

final-audit.js (blinded spec-auditor + per-AC refute panel) → conductor
whole-branch review → /sdlc gates (2, 2b, 2c, 3) → Gate 4 + close as PR
(separate PR off main; no overlap with PR #2). Backfill DEMO on a real
bundle (conductor-run, evidence in stream) before close — the product test.

Estimated agents: ~25-30 across eval scorer, wave (≈11), adversary (≈4),
final audit (≈5), gate scorers (≈4), blinded post-review (1).
