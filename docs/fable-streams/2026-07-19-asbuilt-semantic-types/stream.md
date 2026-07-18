---
stream: 2026-07-19-asbuilt-semantic-types
phase: done
entry: idea
conductor_model: fable
weave:
  superpowers: loaded (shape done in-conversation with Dustin, 2026-07-19)
  speculator: SPEC-005 (worktree: .claude/worktrees/asbuilt-semantic-types, branch asbuilt-semantic-types off main 12442dd; lock .active held)
  beads: claudeclaw tracker — claw-j65u (speculator local store retired)
  workflow_tool: available
  fable_mode: loaded
target_repo: /Users/dustincheng/projects/speculator
---

# Stream: asbuilt-semantic-types

Every non-test As-Built concept collapses to `type: Module` — the OKF type
field carries no architectural role. conceptType() is filename-pattern-only
(correct for the machine skeleton stage); the enrichment agent's output
contract never asks for a classification, so its correctly-identified roles
in Explanation prose are discarded; fold.ts reclassifyType() already
preserves non-Module/Test types (the sticky path exists, never fed).

Shaped with Dustin (2026-07-19): forward path (generator suggested_type →
fold applies over mechanical default) + one-shot reclassify/backfill for
already-enriched bundles (frontmatter-only, no re-enrichment; the refresh
hash-equality early-return claw-nb9j otherwise blocks them forever);
curated core vocabulary + open fallback (OKF v0.1 open-vocab contract);
first-semantic-wins stickiness (suggested_type only upgrades FROM
Module/Test; never overwrites an existing semantic type).

Issue: claw-j65u (P2). Design: design.md. Plan: plan.md (presented to
Dustin 2026-07-19 — awaiting approval, the last mandatory touchpoint).

Phase 2 record: Gate 1 = 8.6 PASS (threshold 7.0, no blocking flags;
scorer independently verified every code-surface claim). Three recommended
findings amended into the spec same-day: AC1 generator.artifact pointer
attribution, AC9a Module/Test-restatement no-op, AC9 malformed-value
handling split (reclassify strict all-or-nothing vs fold skip-and-disclose).
Evidence: evidence/gate-1-scorecard.yml. 11 evals authored (AC1-AC10 +
AC9a). Gate 2a round 1: 7.3 numeric but FAIL on blocking flag (ac-5 named
an internal function — implementation-independence rule); fixed via
behavioral rewrite + ac-2 journey statement; round 2 blind re-score:
8.3 PASS, no blocking flags. Spec work committed + pushed on branch
asbuilt-semantic-types. Plan approved by Dustin 2026-07-19; wave 1 dispatched.

## Task ledger

| Task | Wave | Status | Fix rounds | Notes |
|---|---|---|---|---|
| 01-fold-suggested-type | 1 | done | 0 | AC1-AC5, AC9a, fold half of AC9 |
---
stream: 2026-07-19-asbuilt-semantic-types
phase: done
entry: idea
conductor_model: fable
weave:
  superpowers: loaded (shape done in-conversation with Dustin, 2026-07-19)
  speculator: SPEC-005 (worktree: .claude/worktrees/asbuilt-semantic-types, branch asbuilt-semantic-types off main 12442dd; lock .active held)
  beads: claudeclaw tracker — claw-j65u (speculator local store retired)
  workflow_tool: available
  fable_mode: loaded
target_repo: /Users/dustincheng/projects/speculator
---

# Stream: asbuilt-semantic-types

Every non-test As-Built concept collapses to `type: Module` — the OKF type
field carries no architectural role. conceptType() is filename-pattern-only
(correct for the machine skeleton stage); the enrichment agent's output
contract never asks for a classification, so its correctly-identified roles
in Explanation prose are discarded; fold.ts reclassifyType() already
preserves non-Module/Test types (the sticky path exists, never fed).

Shaped with Dustin (2026-07-19): forward path (generator suggested_type →
fold applies over mechanical default) + one-shot reclassify/backfill for
already-enriched bundles (frontmatter-only, no re-enrichment; the refresh
hash-equality early-return claw-nb9j otherwise blocks them forever);
curated core vocabulary + open fallback (OKF v0.1 open-vocab contract);
first-semantic-wins stickiness (suggested_type only upgrades FROM
Module/Test; never overwrites an existing semantic type).

Issue: claw-j65u (P2). Design: design.md. Plan: plan.md (presented to
Dustin 2026-07-19 — awaiting approval, the last mandatory touchpoint).

Phase 2 record: Gate 1 = 8.6 PASS (threshold 7.0, no blocking flags;
scorer independently verified every code-surface claim). Three recommended
findings amended into the spec same-day: AC1 generator.artifact pointer
attribution, AC9a Module/Test-restatement no-op, AC9 malformed-value
handling split (reclassify strict all-or-nothing vs fold skip-and-disclose).
Evidence: evidence/gate-1-scorecard.yml. 11 evals authored (AC1-AC10 +
AC9a). Gate 2a round 1: 7.3 numeric but FAIL on blocking flag (ac-5 named
an internal function — implementation-independence rule); fixed via
behavioral rewrite + ac-2 journey statement; round 2 blind re-score:
8.3 PASS, no blocking flags. Spec work committed + pushed on branch
asbuilt-semantic-types. Plan approved by Dustin 2026-07-19; wave 1 dispatched.

## Task ledger

| Task | Wave | Status | Fix rounds | Notes |
|---|---|---|---|---|
| 01-fold-suggested-type | 1 | done | 0 | AC1-AC5, AC9a, fold half of AC9 |
| 02-reclassify-cli | 1 | done | 1 | AC6, AC7, AC9, AC9a, AC10 — new applier CLI |
| 03-generator-contract | 1 | done | 0 | AC8 — AGENT.md duty + live-parse contract test |
| 04-test-adversary | 2 | done | 0 | 3 gaps found (AC4 fixture divergence, AC3 absent-suggestion re-fold, AC9a bucket order) — hardened, residue empty; 352/352 |
| 05-final-audit | 3 | done | 1 | 11/11 ACs satisfied on cold-read; panel found 2 real defects (AC9a precedence divergence 3/3, AC4 test-boundary gap 2/3) — adjudicated + fixed 8fd6e3c; panel agents left 9 debris files (cleaned, hygiene rule added to gate dispatches) |
| 06-gates | 4 | done | 1 | G1 8.6 · G2a 8.3(r2) · G2 358/358 + 85.25% cov · G2c 7.6 (whitespace asymmetry found→fixed 1a52cd3) · G3 pass 0-blocking · G4 package |
 AC6, AC7, AC9, AC9a, AC10 — new applier CLI |
| 03-generator-contract | 1 | done | 0 | AC8 — AGENT.md duty + live-parse contract test |
| 04-test-adversary | 2 | done | 0 | 3 gaps found (AC4 fixture divergence, AC3 absent-suggestion re-fold, AC9a bucket order) — hardened, residue empty; 352/352 |
| 05-final-audit | 3 | done | 1 | 11/11 ACs satisfied on cold-read; panel found 2 real defects (AC9a precedence divergence 3/3, AC4 test-boundary gap 2/3) — adjudicated + fixed 8fd6e3c; panel agents left 9 debris files (cleaned, hygiene rule added to gate dispatches) |
| 06-gates | 4 | done | 1 | G1 8.6 · G2a 8.3(r2) · G2 358/358 + 85.25% cov · G2c 7.6 (whitespace asymmetry found→fixed 1a52cd3) · G3 pass 0-blocking · G4 package |


## Closing record (2026-07-19, fable tier)

Delivered as speculator PR #3 (https://github.com/DMokong/speculator/pull/3),
branch asbuilt-semantic-types, 5 commits. Gates: G1 8.6 · G2a 8.3 (r2 after
blocking flag r1) · G2 358/358 + 85.25%/96.23% coverage · G2c 7.6 · G3 pass
0-blocking · G4 conductor-assembled (disclosed). Adversary: 3/3 breakers
produced real gaps, hardened, residue empty. Final-audit panel: 2 real
findings adjudicated + fixed (8fd6e3c) with AC4 amendment; Gate 2c cold-read
found a third divergence (whitespace malformed) fixed 1a52cd3. Root-cause
pattern across all three: hand-duplicated precedence logic — extraction filed
claw-jeh5. Product demo: 9/9 origin-bundle enriched concepts typed,
frontmatter-only, idempotent (evidence in gate-4-package.yml). Compacted into
SYSTEM-SPEC.md (4 sections, 25 bullets). Panel-agent debris incident (9 files,
1 suite-breaking) cleaned; hygiene contract added to all gate dispatches.
Conductor tier: fable throughout; conductor-executed takeovers recorded in
05-final-audit (audit fixes) — all other work via dispatched adversarial
waves. claw-j65u closes on merge; merge is Dustin's call.