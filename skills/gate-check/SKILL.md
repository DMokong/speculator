---
name: gate-check
description: >-
  Checks or runs quality gates (1-4) for a specification — verifies whether gate
  evidence exists, or collects new evidence by running tests, code review, or building
  the evidence package. Use when the user says "/sdlc gate", "/spec gate", "check gate",
  "verify gate", "gate status", "are my tests passing?", "check code quality", "is this
  ready to merge?", "run the review", "collect evidence", or wants to verify or produce
  gate evidence.
---

# Check or Run a Gate

You are helping the user verify or run a quality gate for a specification.

## Process

0. **Worktree redirect check**: Run the **Worktree Redirect Check** from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`. If on main and specs exist in worktrees, ask the user which worktree to target and use its absolute path as the base for all file operations below. Gates and evidence live in the worktree — they won't exist on main until merged.

1. **Identify the spec** (follow resolution order from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`):
   - If user specified a spec name/path → use it
   - If in a worktree → use the spec matching the worktree name
   - If redirected to a worktree (from step 0) → use specs at `{worktree_path}/docs/specs/`
   - Check for `.active` lock files → skip locked specs
   - Single unlocked spec → use it; multiple → ask the user

2. **Identify the gate**: The user may specify a gate name. Valid gates:
   - `spec-quality` (Gate 1) — check if scorecard exists with `result: pass`
   - `code-quality` (Gate 2) — check test results and coverage evidence
   - `eval-quality` (Gate 2b, opt-in) — check if eval quality scorecard exists with `result: pass`
   - `review` (Gate 3) — check if review evidence exists
   - `evidence-package` (Gate 4) — check if all prior gates passed

3. **Check gate status**: Look in `{spec_dir}/{spec_name}/evidence/` for the gate's evidence artifact:
   - Gate 1: `gate-1-scorecard.yml` with `result: pass`
   - Gate 2: `gate-2-quality.yml` with all required checks passing
   - Gate 2b: `gate-2b-eval-quality.yml` with `result: pass` (only checked if `gates.eval-quality.enabled: true`)
   - Gate 3: `gate-3-review.yml` with approval recorded
   - Gate 4: `gate-4-summary.yml` with all gates listed as passed

4. **If gate evidence is missing**: Offer to help produce it:
   - Gate 1 missing → suggest `/sdlc score`
   - Gate 2 missing → guide the user to run tests and collect evidence, then write `gate-2-quality.yml`
   - Gate 2b missing → dispatch eval-quality-scorer agent from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with spec path, config path, and worktree base
   - Gate 3 missing → guide the user to run code review, then write `gate-3-review.yml`
   - Gate 4 missing → check all prior gates, if all pass then write `gate-4-summary.yml`

5. **Report status**: Show which gates are passed, pending, or failed for this spec.

## Gate 2: Collecting Code Quality Evidence

When running Gate 2:

1. **Read the rubric** at `${CLAUDE_PLUGIN_ROOT}/rubrics/code-quality.md` to determine which checks apply and how to evaluate them.
2. **Read the project config** (`.claude/sdlc.local.md`) to see which checks are enabled. The `gates.code-quality` section controls which checks run.
3. **AC traceability** (if `ac_traceability` is enabled): Read the spec's acceptance criteria and the rubric at `${CLAUDE_PLUGIN_ROOT}/rubrics/acceptance-criteria.md`. Map each AC to the code/tests that satisfy it.
4. **Run enabled checks** and collect evidence for each.
5. **Write combined evidence** to `{spec_dir}/{spec_name}/evidence/gate-2-quality.yml`.

### Available Check Types

The following 7 checks can be configured in `gates.code-quality`:

| Check | Config key | Default | Description |
|-------|-----------|---------|-------------|
| AC traceability | `ac_traceability` | `false` | Maps each acceptance criterion to implementing code and tests |
| Tests pass | `tests_required` | `true` | Runs the project's test suite and verifies all tests pass |
| Coverage threshold | `coverage_threshold` | `80` | Verifies test coverage meets the configured percentage |
| Build success | `build_required` | `false` | Verifies the project builds without errors |
| Lint | `lint_required` | `false` | Runs the project's linter and verifies no errors |
| Type check | `type_check_required` | `false` | Runs type checking (e.g., tsc, mypy) and verifies no errors |
| No regressions | *(always on)* | — | Verifies no existing tests broke due to the changes |

Checks marked `false` by default are **optional** — they only run when explicitly enabled in the project config. The "no regressions" check is always performed as part of the test run and cannot be disabled.

## Gate 2b: Collecting Eval Quality Evidence

This gate is opt-in. Only run it when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

When running Gate 2b:

1. Read the rubric at `${CLAUDE_PLUGIN_ROOT}/rubrics/eval-quality.md`
2. Read the project config for threshold (default 6.5) and per-dimension minimum (default 4)
3. Dispatch the `eval-quality-scorer` agent from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with:
   - The spec file path
   - The project config path
   - The worktree/project base directory (for test file discovery)
4. After the agent produces `gate-2b-eval-quality.yml`, read it and present results:
   - Show each dimension score with one-line reasoning
   - Show overall score and pass/fail against threshold
   - Show all flags as actionable feedback
   - If passed: suggest proceeding to Gate 2c (if enabled) or Gate 3
   - If failed: explain which dimensions need improvement and how

## Gate 3: Collecting Review Evidence

When running Gate 3:

1. **Read the review rubric** at `${CLAUDE_PLUGIN_ROOT}/rubrics/review.md` and evaluate the implementation against each checklist item.
2. **Run the mandatory secrets scan** described in the rubric's Security section — actively grep for hardcoded secrets before evaluating the security dimension.
3. For each checklist area, assess the code and record findings.
4. **Skill description check** (conditional — only when `SKILL.md` or `AGENT.md` files appear in the diff):
   - Run `git diff --name-only` against the base branch to check for modified/added skill files.
   - If **no** skill files are in the diff: set `skill_description: skipped` and continue.
   - If skill files **are** in the diff: for each modified `SKILL.md` or `AGENT.md`:
     1. Read the `description` frontmatter field.
     2. Generate 10 mental eval queries — 5 should-trigger (varied phrasings, including indirect requests) and 5 should-not-trigger near-misses (adjacent domains, keyword overlap but wrong intent).
     3. Evaluate each query: does the description cause the skill to trigger correctly?
     4. Check for undertrigger risk (description too narrow — legitimate uses won't trigger) and overtrigger risk (triggers on unrelated adjacent queries).
     5. Rate as `pass` (triggers reliably, good negative discrimination) or `fail` (undertriggers, overtriggers, or description is vague).
     6. Record any suggested improvements in `observations`.
   - Record the result in `skill_description` in the evidence file.
5. Write evidence to `{spec_dir}/{spec_name}/evidence/gate-3-review.yml` with the following structure:

```yaml
gate: review
result: pass | fail
timestamp: ISO-8601
checks:
  correctness: pass | fail
  error_handling: pass | fail
  readability: pass | fail
  security: pass | fail
  performance: pass | fail
  spec_alignment: pass | fail
  skill_description: pass | fail | skipped  # skipped when no SKILL.md/AGENT.md in diff
observations:
  - "Free-text observations about the implementation"
blocking_issues:
  - "Any issues that must be fixed before passing (empty if result is pass)"
```

> **Note**: A `fail` on `skill_description` is a blocking issue — descriptions that undertrigger render skills useless.

## Gate 4: Evidence Package

When running Gate 4:

1. **Read the evidence-package rubric** at `${CLAUDE_PLUGIN_ROOT}/rubrics/evidence-package.md` and verify each checklist item.
2. Read all prior gate evidence files.
3. Verify all required gates (from project config) have `result: pass`.
4. **Verify Gate 1 scorecard has no unaddressed blocking flags.** If the scorecard contains blocking flags that were not resolved, the evidence package fails.
5. **If a beads epic exists for this spec, verify all child stories are closed.** Open stories indicate incomplete work.
6. Write a summary to `{spec_dir}/{spec_name}/evidence/gate-4-summary.yml` containing:
   - List of all gates with their results
   - Overall pipeline result (pass only if all required gates pass)
   - Timestamp
   - Whether work was done in a worktree (check `git worktree list`)
   - Blocking flags status (from Gate 1 scorecard)
   - Beads epic status (if applicable)
7. If all gates pass and we're in a worktree, suggest running `/sdlc close` to merge back to main

## Worktree Awareness

When checking gates, be aware that work may be happening in a git worktree:
- Evidence files are in the worktree's copy of `{spec_dir}/{spec_name}/evidence/`
- The main worktree won't see this evidence until the branch is merged
- This is expected — evidence travels with the feature branch
- **If on main**, step 0 (worktree redirect) ensures you read/write evidence from the correct worktree path
- All file paths (`{spec_dir}/{spec_name}/evidence/`) should be resolved relative to the active base path (worktree or main), not assumed to be relative to cwd
