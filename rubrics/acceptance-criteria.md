# Acceptance Criteria Traceability Rubric

This rubric is used by Gate 2 (Code Quality) when evaluating AC traceability.
It defines how to assess whether each acceptance criterion from the spec has
adequate test coverage.

> **Note:** This rubric is consumed by the `gate-check` skill when processing
> Gate 2's AC traceability check. It is not used as a standalone gate.

## For Each Acceptance Criterion, Check:

### Structure (pass/fail)
- Does it describe a specific scenario with preconditions, actions, and expected results?
- Is it atomic (tests one thing, not a compound condition)?

### Measurability (pass/fail)
- Can the outcome be objectively observed (not "feels fast" or "looks good")?
- Are specific values given where quantities matter (timeouts, limits, counts)?

### Verification Evidence
- For each AC, what evidence would prove it passed?
  - Automated test output
  - Manual test result with specific steps
  - System metric or log entry

## Traceability Mapping

For each acceptance criterion, identify the test(s) that verify it.

| AC ID | AC Summary | Test File(s) | Test Name(s) | Covered? |
|-------|-----------|--------------|--------------|----------|
| AC1   | _brief description_ | _path/to/test_ | _test function or case_ | yes / no |
| AC2   | ... | ... | ... | ... |

Guidelines for the mapping:
- An AC is **covered** if at least one test directly exercises the scenario it describes.
- A single test may cover multiple ACs, but each AC must have at least one test mapped.
- If no test exists for an AC, mark it as uncovered and note the gap.

## Coverage Summary

After completing the traceability mapping, produce a coverage summary:

- **Total ACs**: _count_
- **Covered**: _count_
- **Uncovered**: _count_
- **Coverage**: _percentage_

All ACs must have `structure=pass` and `measurability=pass`, and coverage must
be 100% for the AC traceability check to pass within Gate 2.
