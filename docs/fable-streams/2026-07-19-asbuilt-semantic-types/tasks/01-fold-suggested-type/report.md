# Task 01-fold-suggested-type — Report

## implementer — round 1

### What I changed

**`asbuilt/src/fold.ts`** (the only file in my implementer scope for this round — `asbuilt/src/concept.ts` was left untouched; no shared helper was needed there, matching the brief's "default is fold-local" guidance):

1. **Draft schema** — `EnrichmentDraft` gained an optional `suggested_type?: string` field (SPEC-005 R1). Declared `string` per the brief's contract, with a doc comment noting the application site validates it defensively since a loosely-typed YAML artifact can carry any scalar there (needed for AC9's non-string malformed case, e.g. `suggested_type: 424242`).
2. **New `decideConceptType(existingType, resource, suggestedTypeRaw)` helper** (fold-local, not in `concept.ts`) implementing the first-semantic-wins precedence exactly as specified in the brief's Required Content #2:
   - `suggestedTypeRaw === undefined` (field genuinely absent) → pure mechanical path via the existing `reclassifyType`, **no counting at all** — this is the AC3 backward-compat case.
   - Existing type already semantic (not `Module`/`Test`/absent) → keep it, count `preserved` (AC2).
   - Resource is test-classified (`conceptType(resource) === "Test"`) → mechanical `Test`, suggestion ignored, count `skipped` (AC4).
   - Suggestion malformed (non-string, empty string, or contains `\n`) → mechanical path, count `skippedInvalid`, and the malformed value is never touched again — it never reaches `renderFrontmatter` (AC9 fold half).
   - Suggestion is literally `"Module"` or `"Test"` → mechanical path, count `skipped` (AC9a — distinct bucket from `skippedInvalid` because the value itself was well-formed).
   - Otherwise (well-formed, novel, existing type Module/absent, non-test resource) → apply the suggestion verbatim, count `applied` (AC1, open vocabulary per AC9).
3. **Application site** (`renderConceptContent`, ~line 230 pre-change) — replaced the inline `reclassifyType(p.frontmatter.type, resource)` call with a `decidedType: unknown` parameter supplied by the caller, so the type decision (and its count bucket) is computed once in `fold()`'s phase-2 loop and both used for rendering and tallied into `typeCounts`.
4. **`FoldResult`** gained an additive, non-optional `typeCounts: TypeCounts` field (`{ applied, preserved, skipped, skippedInvalid }`, all numbers) — existing consumers reading only `folded`/`skipped` are unaffected; grepped every `fold()` call site and `FoldResult` reference in the tree (`asbuilt/src/refresh.ts` only imports `appendLogBullets` from fold.ts; `asbuilt/tests/{fold,refresh,reclassify}.test.ts` only call `fold()` and read fields off the result, never construct a `FoldResult` literal) — nothing breaks.
5. **CLI output** — extended the existing `console.log` line additively: `folded=X skipped=Y types_applied=A types_preserved=B types_skipped=C types_skipped_invalid=D`, preserving the original `folded=`/`skipped=` tokens unchanged (Required Content #3 — summary disclosure).

No changes to `asbuilt/src/concept.ts` or `asbuilt/src/refresh.ts` — the latter (line 118, `renderConceptFrontmatter`) already calls `reclassifyType(fm.type, resource)`, which already implements the AC5 "semantic type survives refresh" preserve behavior; the brief's Required Content #5 was purely about pinning that existing behavior with new tests, which the test-author already wrote in `asbuilt/tests/refresh.test.ts` (`test_ac5_semantic_type_survives_refresh_for_changed_resource`, `test_ac5_semantic_type_survives_refresh_for_unchanged_resource`) before my round — I did not need to touch refresh.ts or make any mechanical fixes to those tests.

The test files (`asbuilt/tests/fold.test.ts`, `asbuilt/tests/refresh.test.ts`) were already populated with the full `test_ac1_*` … `test_ac9_fold_*` suite by the test-author prior to my round (visible in `git status` at dispatch start); all of them pass against my implementation with zero mechanical fixes needed.

### Verification

**Branch/toplevel guard** (working-directory contract):
```
$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --abbrev-ref HEAD
asbuilt-semantic-types
```

**`bun test asbuilt/tests/fold.test.ts asbuilt/tests/refresh.test.ts`** (from the worktree root):
```
bun test v1.3.14 (0d9b296a)

 39 pass
 0 fail
 230 expect() calls
Ran 39 tests across 2 files. [2.21s]
```
All AC-named tests confirmed present via grep before running (`test_ac1_fold_applies_suggested_type_and_preserves_field_order`, `test_ac2_fold_preserves_existing_semantic_type_and_counts_preserved`, `test_ac3_fold_byte_identical_when_suggested_type_absent`, `test_ac4_fold_test_classified_resource_keeps_test_and_ignores_suggestion`, `test_ac9a_fold_literal_module_suggestion_is_noop_and_counted_skipped`, `test_ac9a_fold_literal_test_suggestion_does_not_force_test_on_non_test_resource`, `test_ac9_fold_malformed_suggestions_skipped_invalid_and_siblings_still_apply`, `test_ac9_fold_non_string_suggested_type_treated_as_absent_and_never_written`, `test_ac5_semantic_type_survives_refresh_for_changed_resource`, `test_ac5_semantic_type_survives_refresh_for_unchanged_resource`) — all 10 are in the 39-pass count.

**`bun run typecheck`** (from `asbuilt/`):
```
$ tsc --noEmit
tests/reclassify.test.ts(26,39): error TS2307: Cannot find module '../src/reclassify' or its corresponding type declarations.
```
This is the ONLY typecheck error, and it is not caused by my change: `asbuilt/tests/reclassify.test.ts` is a wave-sibling deliverable (task `02-reclassify-cli`, out of my file scope — brief explicitly says "do not touch") that imports `../src/reclassify`, a module task 02's implementer has not yet created in this worktree. Confirmed unrelated to `fold.ts` by re-running typecheck filtered to exclude that one file's errors:
```
$ bun run typecheck 2>&1 | grep -v "reclassify.test.ts"
$ tsc --noEmit
```
(zero output after the command banner — i.e. zero errors anywhere else in the tree, including every file I touched). I did not modify `reclassify.ts` or `reclassify.test.ts` (confirmed via `git status --short`, which shows `asbuilt/tests/reclassify.test.ts` as untracked and pre-existing at dispatch start, and `asbuilt/src/reclassify.ts` doesn't exist at all yet). I'm not raising this as a `scope_breach` or `plan_invalidating_discovery` — it doesn't touch or invalidate anything about my own scoped work, it's a normal artifact of parallel-safe wave dispatch (task 02 lands the missing module later in the same wave), and my file scope explicitly forbids fixing it myself.

**`bun run lint`** (from `asbuilt/`):
```
$ biome check src/ tests/
Checked 63 files in 43ms. No fixes applied.
```
Clean — zero lint issues across the whole `asbuilt/` tree, including `fold.ts`.

**Sanity check — full `asbuilt/tests/` suite** (not part of the done-check, run for extra confidence):
```
$ bun test asbuilt/tests/ 2>&1 | tail -6
 328 pass
 1 fail
 1 error
 2050 expect() calls
Ran 329 tests across 27 files. [16.78s]
```
The single fail/error pair is the same pre-existing `reclassify.test.ts` module-resolution gap (`error: Cannot find module '../src/reclassify'`); every other test in the tree, including all fold/refresh tests, passes. Some unrelated `fatal: ambiguous argument 'HEAD'` stderr lines also appear in this full-suite run but do not correspond to any additional failure (they don't appear at all when running only `fold.test.ts`/`refresh.test.ts` in isolation) — they come from an unrelated pre-existing test elsewhere in the tree, outside my file scope.

### Disputes

None — this is round 1, no prior findings to dispute.

### Escalations

None. I stayed within the file scope (`asbuilt/src/fold.ts` only touched; `concept.ts` and `refresh.ts` untouched; test files untouched — no mechanical fixes were needed). The one typecheck error observed (`tests/reclassify.test.ts` missing `../src/reclassify`) is a wave-sibling gap explicitly out of my scope, not a plan-invalidating discovery about my own task — documented above with evidence rather than escalated.

## verifier — round 1

**Command 1: Check branch**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --abbrev-ref HEAD
```
Exit code: 0
Output:
```
asbuilt-semantic-types
```
Status: PASS

**Command 2: Run fold and refresh tests**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/fold.test.ts asbuilt/tests/refresh.test.ts
```
Exit code: 0
Output:
```
bun test v1.3.14 (0d9b296a)

 39 pass
 0 fail
 230 expect() calls
Ran 39 tests across 2 files. [3.84s]
```
Status: PASS

**Command 3: Typecheck**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run typecheck
```
Exit code: 0
Output:
```
$ tsc --noEmit
```
Status: PASS

**Command 4: Lint**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run lint
```
Exit code: 0
Output:
```
$ biome check src/ tests/
Checked 64 files in 47ms. No fixes applied.
```
Status: PASS

## adversarial-reviewer — round 1

**Working-directory contract:** verified before any action.
```
$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --show-toplevel
/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types
$ git rev-parse --abbrev-ref HEAD
asbuilt-semantic-types
```

**Scope audit:** `git diff --stat` confirms only `asbuilt/src/fold.ts`, `asbuilt/tests/fold.test.ts`, `asbuilt/tests/refresh.test.ts` were touched by this task (445 insertions across 3 files). `git diff` on `asbuilt/src/concept.ts` and `asbuilt/src/refresh.ts` is empty — both left untouched as claimed. No scope violation.

**Done-check re-run (independent):**
```
$ bun test asbuilt/tests/fold.test.ts asbuilt/tests/refresh.test.ts
 39 pass / 0 fail / 230 expect() calls
$ (cd asbuilt && bun run typecheck)
$ tsc --noEmit   (zero output/errors)
$ (cd asbuilt && bun run lint)
Checked 64 files in 43ms. No fixes applied.
```
All AC-named tests present: test_ac1_*, test_ac2_*, test_ac3_*, test_ac4_*, test_ac9a_* (x2), test_ac9_fold_* (x2) in fold.test.ts; test_ac5_* (x2) in refresh.test.ts. Full `asbuilt/tests/` suite (348 tests, 27 files) now passes 0 fail — the reclassify.test.ts module-resolution gap the implementer flagged as a sibling-task artifact has since resolved (task 02's `asbuilt/src/reclassify.ts` now exists in the worktree), consistent with the implementer's non-escalation.

**Wrong-input attack — independent red/green reproduction of AC1:** swapped `fold.ts` for the pre-change (`git show HEAD:...`) version via file copy (not git stash/reset, to avoid destructive ops), re-ran the AC1 test:
```
Expected: "Service"
Received: "Module"
(fail) SPEC-005 AC1 ... test_ac1_fold_applies_suggested_type_and_preserves_field_order
```
Confirms the test is genuinely load-bearing (not vacuously true) — it fails red against the unmodified mechanical path and requires this task's change to pass. Restored the implementer's `fold.ts` byte-for-byte (diffed against backup — clean) and re-ran the full done-check: back to 39 pass / 0 fail.

**AC-by-AC walk:**
- AC1 (apply): `test_ac1_*` asserts `fm.type === "Service"` + SPEC-049 field order preserved. Verified red-before-green above. Pass.
- AC2 (preserve, first-semantic-wins): `test_ac2_*` folds twice with different specs/suggestions; second fold's `existingIsSemantic` branch in `decideConceptType` (fold.ts) correctly re-reads the on-disk frontmatter each call (`readConcept(oldContent, ...)` in the phase-1 loop) so the preserve path is genuinely exercised, not trivial. Pass.
- AC3 (byte-compat): reuses the pre-existing `pass-evidence.yml`/`pass-artifact.yml` fixture (no `suggested_type` field) and hashes two independent fold runs for byte-identical output; `bucket: null` short-circuit in `decideConceptType` confirmed to skip all counting when the field is `undefined`. Pass.
- AC4 (Test stays machine-owned): synthetic `foo.test.md` fixture with a `suggested_type: "Service"` draft; `conceptType(resource) === "Test"` branch checked before the malformed/literal checks, correctly ignores the suggestion. Pass.
- AC5 (survives refresh): two tests pin `reclassifyType`'s pre-existing preserve behavior for both a changed-own-resource and unchanged-own-resource (graph_hash-bump-only) case — confirmed via `asbuilt/src/refresh.ts:239` that `renderConceptFrontmatter` is called unconditionally for every `commonFiles` entry (graph_hash always moves), so the "unchanged resource" test is a genuine re-exercise of the preserve path, not a no-op assertion. `refresh.ts` correctly untouched (out of scope; brief only requires pinning tests). Pass.
- AC9a (literal Module/Test no-op): two tests, including the "trap" case (`suggested_type: "Test"` on a non-test resource must NOT force `Test`) — confirmed `decideConceptType` checks the test-classification branch before the literal-Module/Test branch, so this is exercised correctly, not accidentally passing. Pass.
- AC9 fold half (malformed → skipped-invalid, siblings unaffected, never written): multi-draft test with empty string, multi-line string, and a well-formed novel sibling (`"Migration"`) in the same fold() call — asserts the malformed values never appear in the written body (`not.toContain`) and the well-formed sibling still applies. A second test covers non-string (`424242`). Pass.

**Evidence audit:** the implementer's report claims are each adjacent to command output (branch guard, 39-pass test run, typecheck/lint output, full-suite sanity run) — all independently reproduced above with matching results. One documentation-only gap: the brief's "Report obligation" line ("Test-author shows the AC1 application test failing red against unmodified fold.ts before the implementer's round") has no dedicated `## test-author` report section — the implementer's round narrates that the tests pre-existed at dispatch but doesn't include the red-run output itself. I independently reproduced that red run above and it holds; this matches the convention observed across every other task in this stream and the prior asbuilt-viz-cytoscape stream (no task report in either stream contains a distinct `## test-author` section — test-authoring is folded into the implementer's narrative). Since the substance is verified true and the omission is consistent with established project convention rather than unique to this task, I am not raising it as a finding — noting it here for the record only.

**Verdict:** the claim of done survives the attack. Done-check passes (independently re-run), no file-scope violations, all AC-by-AC checks hold up including deliberate attempts to break the "trap" cases (AC9a literal-Test-on-non-test-resource, AC9 malformed-siblings-must-not-abort), and the AC1 red-before-green claim was independently reproduced rather than just trusted.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
