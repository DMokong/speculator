# Evidence Package Rubric

Gate 4 is a mechanical completeness checklist. It verifies that all prior gates have been passed and that the pipeline is clean before the feature branch is merged. There is no subjective scoring — every check is binary pass/fail (or `n/a` for conditional checks whose gate is disabled).

## Checks

### 1. Gate 1 Evidence Exists (required)

The spec quality gate must have passed. Evidence file `gate-1-scorecard.yml` must be present in the spec's evidence directory with `result: pass`.

How to verify:
1. Look for `{spec_dir}/{spec_name}/evidence/gate-1-scorecard.yml`
2. Parse the YAML and check that the `result` field is `pass`
3. If the file is missing, result is `missing`. If present but `result` is not `pass`, result is `fail`

### 2. Gate 2 Evidence Exists (required)

The code quality gate must have passed. Evidence file `gate-2-quality.yml` must be present in the spec's evidence directory with all required checks passing.

How to verify:
1. Look for `{spec_dir}/{spec_name}/evidence/gate-2-quality.yml`
2. Parse the YAML and check that the overall gate result is `pass`
3. If the file is missing, result is `missing`. If present but any required check failed, result is `fail`

### 3. Gate 2a Evidence Exists (conditional — required if eval-intent is enabled)

The eval intent gate is opt-in. When enabled, it must have passed before the package is complete.

How to verify:
1. Read `gates.eval-intent.enabled` (and any `risk_levels:` allowlist on the block) from `.claude/sdlc.local.md`
2. If `enabled` is `false` or absent, result is `n/a` and does not block
3. If `true` but the gate is risk-bound-out for this spec (`risk_levels` present AND the spec's effective risk_level — frontmatter `risk_level`, default `medium`; out-of-enum ⇒ fail-safe active + warn — is not in the list), result is `n/a` with a rationale naming both sides, e.g. `n/a — risk binding: spec risk_level 'low' not in risk_levels [medium, high, critical]`; does not block (see `lib/gates.md` "Risk-level binding")
4. If active for this spec, look for `{spec_dir}/{spec_name}/evidence/gate-2a-eval-intent.yml`
5. Parse the YAML and check that the `result` field is `pass` or `override-pass`
6. If the file is missing, result is `missing`. If present but `result` is neither `pass` nor `override-pass`, result is `fail`

### 4. Gate 2b Evidence Exists (conditional — required if eval-quality is enabled)

The eval quality gate is opt-in. When enabled, it must have passed before the package is complete.

How to verify:
1. Read `gates.eval-quality.enabled` (and any `risk_levels:` allowlist on the block) from `.claude/sdlc.local.md`
2. If `enabled` is `false` or absent, result is `n/a` and does not block
3. If `true` but the gate is risk-bound-out for this spec (same predicate as check 3), result is `n/a` with the risk-binding rationale; does not block
4. If active for this spec, look for `{spec_dir}/{spec_name}/evidence/gate-2b-eval-quality.yml`
5. Parse the YAML and check that the `result` field is `pass`
6. If the file is missing, result is `missing`. If present but `result` is not `pass`, result is `fail`

### 5. Gate 2c Evidence Exists (conditional — required if comprehension is enabled)

The comprehension gate is opt-in. When active for a spec, it must have passed before the package is complete.

How to verify:
1. Read `gates.comprehension.enabled` (and any `risk_levels:` allowlist on the block) from `.claude/sdlc.local.md`
2. If `enabled` is `false` or absent, result is `n/a` and does not block
3. If `true` but the gate is risk-bound-out for this spec (same predicate as check 3), result is `n/a` with the risk-binding rationale; does not block
4. If active for this spec, look for `{spec_dir}/{spec_name}/evidence/gate-2c-comprehension.yml` (or `gate-2c-asbuilt.yml` when `gates.comprehension.mode: asbuilt` is configured — that file satisfies this check when its `result` field is `pass`; see `rubrics/comprehension.md` § As-Built mode)
5. Parse the YAML and check that the `result` field is `pass`
6. If the file is missing, result is `missing`. If present but `result` is not `pass`, result is `fail`

### 6. Gate 3 Evidence Exists (required)

The code review gate must have passed. Evidence file `gate-3-review.yml` must be present in the spec's evidence directory with `result: pass`.

How to verify:
1. Look for `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`
2. Parse the YAML and check that the `result` field is `pass`
3. If the file is missing, result is `missing`. If present but `result` is not `pass`, result is `fail`
4. Additionally count any `warn` verdicts in the `checks` section — warns never affect pass/fail, but they must be surfaced in the gate-4 summary (`gates.review.warnings` in the Evidence Output Format below) so non-blocking findings aren't silently dropped at merge time

### 7. No Blocking Flags (required)

The Gate 1 scorecard must have no unresolved blocking-severity flags. Blocking flags force a gate failure regardless of score, so any that remain unaddressed indicate the spec was not properly revised.

How to verify:
1. Read `gate-1-scorecard.yml`
2. Check the `flags` section for any entries with `blocking` severity
3. If blocking flags exist, check whether they have been addressed (either the flag was removed in a re-score, or an override with justification exists)
4. Pass if no blocking flags remain unaddressed; fail otherwise

### 8. Spec Status (required)

The spec's frontmatter status must indicate it has been approved for implementation or completed.

How to verify:
1. Read the spec file's YAML frontmatter
2. Check the `status` field
3. Pass if status is `approved` or `complete`; fail if `draft` or any other value

### 9. Beads Cleanup (required if applicable)

If a beads epic was created for this feature, all child stories must be closed before the branch can be merged. This prevents orphaned work items.

How to verify:
1. Check whether a beads epic ID is associated with this spec (typically in the spec frontmatter or evidence files)
2. If no epic exists, this check is `n/a` and does not block
3. If an epic exists, run `bd show <epic_id>` and verify all child stories have status `closed`
4. Pass if all stories are closed; fail if any are open

## Schema Versioning & Historical Evidence

Two grace rules keep this checklist from retroactively failing specs that closed under earlier plugin versions:

- **Earlier-schema evidence is verified structurally only.** Evidence files produced by earlier plugin versions (e.g. a flat `checks:` map without per-check `verdict`/`notes` nesting, or a scorecard without a `weights:` block) are verified for structural validity — present, parseable, `result` field recorded — not for conformance to the current canonical schemas. Do not fail a closed spec because its evidence predates a schema change.
- **Opt-in gates enabled after a spec closed**: when an opt-in gate (checks 3–5) was enabled in the project config AFTER the spec closed, the gate's evidence is recorded as `n/a` with the rationale `"gate enabled post-closure"` — not treated as `missing`. This matches the WARN behavior of `scripts/verify-evidence.sh` for the same condition.

## Gate Decision

All checks must pass (or be legitimately `n/a`) for the pipeline result to be `pass`:

- Checks 1, 2, 6, 7, 8 must each be `pass`
- Checks 3, 4, 5 must each be `pass` (when their gate is active for this spec) or `n/a` (when disabled, or risk-bound-out with the risk-binding rationale recorded)
- Check 9 must be `pass` or `n/a`
- If any check is `fail` or `missing`, the pipeline result is `fail`

Write evidence to `{spec_dir}/{spec_name}/evidence/gate-4-summary.yml`

## Evidence Output Format

```yaml
evidence_type: evidence-package
timestamp: 2026-03-07T12:00:00Z
gates:
  spec-quality:
    evidence_file: gate-1-scorecard.yml
    result: pass | fail | missing
  code-quality:
    evidence_file: gate-2-quality.yml
    result: pass | fail | missing
  eval-intent:
    evidence_file: gate-2a-eval-intent.yml
    result: pass | override-pass | fail | missing | n/a
    # n/a examples: "gate disabled", "gate enabled post-closure", or
    # rationale: "risk binding: spec risk_level 'low' not in risk_levels [medium, high, critical]"
  eval-quality:
    evidence_file: gate-2b-eval-quality.yml
    result: pass | fail | missing | n/a
  comprehension:
    evidence_file: gate-2c-comprehension.yml  # or gate-2c-asbuilt.yml when gates.comprehension.mode: asbuilt
    result: pass | fail | missing | n/a
  review:
    evidence_file: gate-3-review.yml
    result: pass | fail | missing
    warnings: 0  # count of warn verdicts in gate-3 checks — non-blocking, surfaced for visibility
blocking_flags_resolved: true | false
spec_status: approved | complete | draft
beads_epic: <epic_id> | null
beads_stories_closed: true | false | n/a
pipeline_result: pass | fail
```
