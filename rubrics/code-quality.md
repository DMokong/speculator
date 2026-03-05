# Code Quality Gate Rubric

Gate 2 checks whether the implementation meets the project's code quality bar. This gate is evidence-based: it checks for the existence and content of quality artifacts, not subjective code review.

## Required Evidence

### Tests Pass (required if `gates.code-quality.tests_required: true`)

Evidence: a test run was executed and all tests passed.

How to verify:
1. Check that a test command was run (project-specific — e.g. `pytest`, `npm test`, `cargo test`)
2. Check that the exit code was 0 (all tests passed)
3. Record the test command, pass count, fail count, and timestamp

```yaml
evidence_type: test-run
command: "pytest tests/ -v"
exit_code: 0
tests_passed: 42
tests_failed: 0
tests_skipped: 1
timestamp: 2026-03-03T11:00:00Z
```

### Coverage Threshold (required if `gates.code-quality.coverage_threshold` is set)

Evidence: code coverage meets or exceeds the configured threshold.

How to verify:
1. Check that a coverage report exists
2. Check that overall line coverage >= threshold from project config

```yaml
evidence_type: coverage
coverage_percent: 85
threshold: 80
result: pass
timestamp: 2026-03-03T11:00:00Z
```

## Gate Decision

- All required checks must pass
- Write evidence to `{spec_dir}/{spec_name}/evidence/gate-2-quality.yml`
