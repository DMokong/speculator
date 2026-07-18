# 05-final-audit — report

## spec-auditor — round 1

Blinded cold-read of `main...HEAD` against `docs/specs/asbuilt-semantic-types/spec.md`
(SPEC-005). Inputs: spec text, diff, codebase only. ACs are numbered as the spec
numbers them (AC1–AC10 plus AC9a). Full suite: `bun test asbuilt/tests/` →
352 pass / 0 fail (27 files); SPEC-005 files alone → 107 pass / 0 fail.

| AC | Verdict | Evidence |
|----|---------|----------|
| AC1 | satisfied | `asbuilt/src/fold.ts` `decideConceptType` returns `{type: suggestedTypeRaw, bucket:"applied"}` for a well-formed novel suggestion; `renderConceptContent` feeds `decidedType` into `renderFrontmatter` (fixed SPEC-049 field order). Test `test_ac1_fold_applies_suggested_type_and_preserves_field_order` asserts `fm.type==="Service"` and `fieldOrderOf===SPEC049_FIELD_ORDER`. Fold reads the `generator.artifact` pointer (`fold.ts` `ev.generator?.artifact`). |
| AC2 | satisfied | `fold.ts` `existingIsSemantic` branch → `bucket:"preserved"`, type stays mechanical. `test_ac2_fold_preserves_existing_semantic_type_and_counts_preserved`: folds `Model`, then a later `Service` draft; expects `type==="Model"`, `preserved===1`, `applied===0`. |
| AC3 | satisfied | `fold.ts` `suggestedTypeRaw===undefined` → `bucket:null`, type = `reclassifyType(...)`. `test_ac3_fold_byte_identical_when_suggested_type_absent` (hashBundle equality on `pass-evidence.yml`) + hardening `test_ac3_second_fold_with_no_suggested_type_field_preserves_a_previously_applied_semantic_type` (absent field keeps prior `Service`, all typeCounts 0). |
| AC4 | satisfied | `fold.ts` `conceptType(resource)==="Test"` → `bucket:"skipped"`, mechanical type = `Test`. Tests `test_ac4_fold_test_classified_resource_keeps_test...` and `..._by_filename_stays_test_even_when_frontmatter_type_is_still_module` (drifted `Module` frontmatter, test filename → stays `Test`). |
| AC5 | satisfied | `refresh.ts` uses existing `reclassifyType` (concept.ts:173 preserve-any-non-Module/Test). Pinned by `refresh.test.ts` `test_ac5_semantic_type_survives_refresh_for_changed_resource` and `..._for_unchanged_resource` (poison to `Service`, refresh, assert `Service` survives). |
| AC6 | satisfied | `asbuilt/src/reclassify.ts` apply phase rewrites only the `type:` line (`rewriteTypeLine`), enriched+`Module` gate. `test_ac6_frontmatter_diff_is_exactly_the_type_line` (only `type:` line differs, body byte-equal); `test_ac6_cli_prints_applied_preserved_skipped_counts_and_exits_0` (stdout `applied=1 preserved=0 skipped=0`, exit 0). |
| AC7 | satisfied | `reclassify.ts` Phase-1 validation collects violations and throws before any write; apply phase skips skeleton-only (reason) and preserves existing-semantic (reason), exit 0. Tests `test_ac7_skeleton_only...`, `test_ac7_existing_semantic_type_is_preserved...`, `test_ac7_unknown_concept_path_throws_before_any_write`, `test_ac7_cli_exits_nonzero_on_unknown_concept_and_writes_nothing` (hashBundle unchanged). |
| AC8 | satisfied | `agents.test.ts` reads shipped `agents/asbuilt-generator/AGENT.md` live (`readFileSync(GENERATOR_PATH)`), asserts `suggested_type` in the `enrichment_drafts` block, all ten curated terms via word-boundary regex against the parsed body, and the `omit the field entirely when not confident` / `never guess` instruction. No production enum constant to couple against (fold/reclassify use open vocab). |
| AC9 | satisfied | `reclassify.ts` applies open-vocab `Migration` as-is (no enum check); malformed (non-string/empty/multi-line) collected as violations → throw before write, multi-violation reported together. `fold.ts` malformed → `bucket:"skippedInvalid"`, siblings still apply. Tests `test_ac9_open_vocabulary...`, `test_ac9_malformed_*_rejected_before_any_write`, `test_ac9_validation_collects_multiple_violations_together`, fold `test_ac9_fold_malformed_suggestions_skipped_invalid_and_siblings_still_apply` (skippedInvalid=2, applied=1). |
| AC9a | satisfied | Literal `Module`/`Test` treated as absent. `fold.ts` `suggestedTypeRaw==="Module"||"Test"` → `bucket:"skipped"`; `reclassify.ts` `entry.suggestedType==="Module"||"Test"` → skipped ("machine vocabulary"), checked before current-type branches. Tests incl. hardening `test_ac9a_literal_module_suggestion_on_an_already_semantic_concept_is_skipped_not_preserved`. |
| AC10 | satisfied | `reclassify.ts` idempotent by construction (2nd run: prior write now reads non-`Module` → preserved), codepoint-sorted deterministic order, no clock/random (grep for `Date`/`Math.random` empty). Tests `test_ac10_second_run_over_already_applied_state...` (2nd run applied=[], hashBundle equal) and `..._independent_of_the_artifact_entries_order`. |

Evidence tail — full suite:
```
 352 pass
 0 fail
 2161 expect() calls
Ran 352 tests across 27 files.
```

Evidence tail — SPEC-005 files (`fold` + `reclassify` + `agents` + `refresh`):
```
 107 pass
 0 fail
```

Evidence tail — reclassify.ts determinism grep (`Date`/`Math.random`/`Date.now`): no matches (exit 1).

### Scope surplus
None. The fold CLI's added `types_applied/preserved/skipped/skipped_invalid` stdout line and the `FoldResult.typeCounts` object realize the "fold summary" counts the ACs themselves reference (AC2 "counts it as preserved, not applied"; AC9/AC9a). The added `AGENT.md` backfill-mode duty, `docs/specs/asbuilt-semantic-types/evals/*.md`, gate evidence YAML, and `spec.md` are spec/process artifacts (Speculator gate scaffolding + the spec itself), not runtime behavior; the backfill-duty documentation is in the spec's own Out-of-Scope narrative ("ships ... a documented agent prompt duty it can consume") and R3.

### Scope deficit
None. Every AC (AC1–AC10, AC9a) has an implementation trace in `fold.ts` / `reclassify.ts` / `refresh.ts` (unchanged, pinned) / `AGENT.md`, each with passing behavioral tests.

## fable — round 2

Adjudication of the two panel findings (conductor, in-session — recorded takeover;
Gate 3's blinded code review independently sees this delta):

**AC9a (refuted 3/3) — ACCEPTED.** fold and reclassify implemented different
check orders for literal machine vocabulary on already-semantic concepts
(fold: preserved; reclassify: skipped). The adversary's reclassify hardening
was never mirrored into fold. Fix: canonical precedence in decideConceptType —
malformed → literal → test-boundary → existing-semantic → apply; mirrored
hardening test added to fold.test.ts.

**AC4 (refuted 2/3) — CORE ACCEPTED, BOUNDARY REFINED.** Real defects: (1)
reclassify derived the test boundary from current frontmatter type only, so a
drifted test concept still typed Module could receive a semantic type via the
automated path — filename-derived guard added (uses the concept's resource
field); (2) fold's existing-semantic check outranked the test-boundary check.
Ruling on the contested corner: automated paths NEVER apply a suggestion
across the test boundary (bucket skipped, boundary reason), but a pre-existing
semantic type on a test resource (human ingress only) is preserved in value,
never repaired to Test — forced repair would clobber the human-correction
journey (AC2/AC5/AC7 family) and diverge from refresh's shipped preserve
semantics. AC4 + the machine-owned constraint amended in the spec to state
this precisely (clarifying amendment, no re-score — Gate 1 structure
unchanged; disclosed here).

Also handled: audit-panel agents left 9 untracked debris files in the
worktree (ad-hoc proof scripts, one carrying its own bug that failed the
suite) — removed via git clean; same agent-hygiene failure family as the
claw-aeb7 detached-HEAD lesson. Debris was additive-only; tracked files
unaffected.

Evidence after fix:
```
356 pass, 0 fail (2180 expect) — bun test asbuilt/tests/
tsc --noEmit clean · biome clean
4 new hardening tests: fold AC9a mirror, fold AC4 boundary,
reclassify filename-boundary (drifted-Module + semantic-typed)
```
