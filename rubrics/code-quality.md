# Code Quality Gate Rubric

Gate 2 checks whether the implementation meets the project's code quality bar. This gate is evidence-based: it checks for the existence and content of quality artifacts, not subjective code review.

## Checks

### 1. AC Traceability (optional: `gates.code-quality.ac_traceability: true`)

For each acceptance criterion in the spec, identify the test(s) that verify it. Flag any ACs with no corresponding test. Refer to `${CLAUDE_PLUGIN_ROOT}/rubrics/acceptance-criteria.md` for AC evaluation guidance.

How to verify:
1. Extract all ACs from the spec
2. For each AC, find the test(s) that exercise it
3. Record a traceability matrix mapping AC ID to test file and test name
4. Any AC with no mapped test is `uncovered`
5. Pass if all ACs are covered; fail if any are uncovered

```yaml
evidence_type: ac-traceability
mappings:
  - ac_id: AC1
    test: "tests/test_feature.py::test_user_can_login"
    status: covered
  - ac_id: AC2
    test: null
    status: uncovered
coverage: 3/4
result: pass | fail
```

### 2. Tests Pass (required if `gates.code-quality.tests_required: true`)

Evidence: a test run was executed and all tests passed.

How to verify:
1. Check that a test command was run (project-specific — e.g. `pytest`, `npm test`, `cargo test`)
2. Check that the exit code was 0 (all tests passed)
3. Record the test command, pass count, fail count, skip count, and timestamp

```yaml
evidence_type: test-run
command: "pytest tests/ -v"
exit_code: 0
tests_passed: 42
tests_failed: 0
tests_skipped: 1
timestamp: 2026-03-03T11:00:00Z
```

### 3. Coverage Threshold (required if `gates.code-quality.coverage_threshold` is set)

Evidence: code coverage meets or exceeds the configured threshold.

How to verify:
1. Check that a coverage report exists
2. Check that overall line coverage >= threshold from project config

```yaml
evidence_type: coverage
coverage_percent: 85
threshold: 80
result: pass | fail
timestamp: 2026-03-03T11:00:00Z
```

### 4. Build Success (optional: `gates.code-quality.build_required: true`, default `false`)

Evidence: the code compiles or bundles without errors.

How to verify:
1. Run the project's build command (e.g. `tsc`, `go build`, `cargo build`, `npm run build`)
2. Check that the exit code was 0

```yaml
evidence_type: build
command: "npm run build"
exit_code: 0
timestamp: 2026-03-03T11:00:00Z
```

### 5. Lint / Static Analysis (optional: `gates.code-quality.lint_required: true`, default `false`)

Evidence: the linter runs clean with no errors.

How to verify:
1. Run the project's lint command (e.g. `eslint .`, `ruff check`, `golangci-lint run`)
2. Check that the exit code was 0
3. Record warning and error counts

```yaml
evidence_type: lint
command: "eslint . --max-warnings=0"
exit_code: 0
warnings: 0
errors: 0
timestamp: 2026-03-03T11:00:00Z
```

### 6. Type Checking (optional: `gates.code-quality.type_check_required: true`, default `false`)

Evidence: the type checker passes with no errors.

How to verify:
1. Run the project's type checker (e.g. `tsc --noEmit`, `mypy .`, `pyright`)
2. Check that the exit code was 0
3. Record error count

```yaml
evidence_type: type-check
command: "tsc --noEmit"
exit_code: 0
errors: 0
timestamp: 2026-03-03T11:00:00Z
```

### 7. No Regressions (always required when `tests_required: true`)

The full test suite must pass, not just newly added tests. This ensures the implementation does not break existing functionality.

This is not a separate config flag — it is enforced whenever `tests_required` is true. The gate checker must run the complete test suite (not a filtered subset) and the test-run evidence from check 2 must reflect the full suite results.

How to verify:
1. Confirm the test command targets the full suite (no path filters or `-k` selectors that limit scope)
2. The total test count in the test-run evidence should be consistent with the project's known test count
3. Zero failures across the entire suite

This check uses the same evidence as check 2 (test-run). No additional evidence block is needed — the gate checker should verify that the test command covers the full suite.

## Prompt-Only Changesets (N/A Rationale)

Some specs change only markdown/prompt content — skills, agents, rubrics, templates, documentation — with no executable code paths. Coverage thresholds and feature-level tests do not meaningfully apply to these changesets. For a prompt-only changeset, Gate 2 is satisfied by **both** of:

1. **The repo's structural test suites pass** — whatever automated validation the project has for its prompt artifacts (e.g. plugin structure validation, frontmatter linting, link checks), recorded as normal test-run evidence (check 2).
2. **A documented N/A rationale in `gate-2-quality.yml`** for each check recorded as not applicable (coverage, feature-level tests):

```yaml
evidence_type: coverage
status: not-applicable
rationale: "Changeset is markdown/prompt-only (3 skill files, 1 rubric); no executable code paths to cover. Structural suite passed — see test-run evidence."
timestamp: 2026-03-03T11:00:00Z
```

**The `rationale` field MUST be non-empty whenever a check is recorded as N/A.** An N/A entry with an empty or missing rationale does not satisfy the check — treat it as a fail.

**Do NOT invent LLM-judged pseudo-tests to fill the gap** (e.g. "have a model read the skill and judge whether it would behave correctly"). Such tests are fragile and non-reproducible, and they manufacture false confidence. The honest evidence for a prompt-only changeset is structural validation plus an explicit rationale — not simulated test results.

## Gate Decision

- All required checks must pass
- Optional checks only apply when their config flag is set to `true`
- Write evidence to `{spec_dir}/{spec_name}/evidence/gate-2-quality.yml`
