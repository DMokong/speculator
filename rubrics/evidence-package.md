# Evidence Package Rubric

Gate 4 is a mechanical completeness checklist. It verifies that all prior gates have been passed and that the pipeline is clean before the feature branch is merged. There is no subjective scoring — every check is binary pass/fail.

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

### 3. Gate 3 Evidence Exists (required)

The code review gate must have passed. Evidence file `gate-3-review.yml` must be present in the spec's evidence directory with `result: pass`.

How to verify:
1. Look for `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`
2. Parse the YAML and check that the `result` field is `pass`
3. If the file is missing, result is `missing`. If present but `result` is not `pass`, result is `fail`

### 4. No Blocking Flags (required)

The Gate 1 scorecard must have no unresolved blocking-severity flags. Blocking flags force a gate failure regardless of score, so any that remain unaddressed indicate the spec was not properly revised.

How to verify:
1. Read `gate-1-scorecard.yml`
2. Check the `flags` section for any entries with `blocking` severity
3. If blocking flags exist, check whether they have been addressed (either the flag was removed in a re-score, or an override with justification exists)
4. Pass if no blocking flags remain unaddressed; fail otherwise

### 5. Spec Status (required)

The spec's frontmatter status must indicate it has been approved for implementation or completed.

How to verify:
1. Read the spec file's YAML frontmatter
2. Check the `status` field
3. Pass if status is `approved` or `complete`; fail if `draft` or any other value

### 6. Beads Cleanup (required if applicable)

If a beads epic was created for this feature, all child stories must be closed before the branch can be merged. This prevents orphaned work items.

How to verify:
1. Check whether a beads epic ID is associated with this spec (typically in the spec frontmatter or evidence files)
2. If no epic exists, this check is `n/a` and does not block
3. If an epic exists, run `bd show <epic_id>` and verify all child stories have status `closed`
4. Pass if all stories are closed; fail if any are open

## Gate Decision

All checks must pass for the pipeline result to be `pass`:

- Checks 1-5 must each be `pass`
- Check 6 must be `pass` or `n/a`
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
  review:
    evidence_file: gate-3-review.yml
    result: pass | fail | missing
blocking_flags_resolved: true | false
spec_status: approved | complete | draft
beads_epic: <epic_id> | null
beads_stories_closed: true | false | n/a
pipeline_result: pass | fail
```
