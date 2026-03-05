---
name: gate-check
description: >-
  Use when the user says "/sdlc gate", "check gate", "verify gate", "gate status",
  or wants to check whether a specific gate has been passed for a spec. Can also
  run a gate check (e.g., collect code quality evidence for Gate 2).
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
   - `review` (Gate 3) — check if review evidence exists
   - `evidence-package` (Gate 4) — check if all prior gates passed

3. **Check gate status**: Look in `{spec_dir}/{spec_name}/evidence/` for the gate's evidence artifact:
   - Gate 1: `gate-1-scorecard.yml` with `result: pass`
   - Gate 2: `gate-2-quality.yml` with all required checks passing
   - Gate 3: `gate-3-review.yml` with approval recorded
   - Gate 4: `gate-4-summary.yml` with all gates listed as passed

4. **If gate evidence is missing**: Offer to help produce it:
   - Gate 1 missing → suggest `/sdlc score`
   - Gate 2 missing → guide the user to run tests and collect evidence, then write `gate-2-quality.yml`
   - Gate 3 missing → guide the user to run code review, then write `gate-3-review.yml`
   - Gate 4 missing → check all prior gates, if all pass then write `gate-4-summary.yml`

5. **Report status**: Show which gates are passed, pending, or failed for this spec.

## Gate 2: Collecting Code Quality Evidence

When running Gate 2, help the user:
1. Identify the project's test command (look at package.json scripts, Makefile, pyproject.toml, etc.)
2. Run the tests and capture results
3. Run coverage if configured
4. Write the evidence artifact to `{spec_dir}/{spec_name}/evidence/gate-2-quality.yml`

## Gate 3: Collecting Review Evidence

When running Gate 3:
1. Check if a code review has been done (look for PR review, or ask if manual review happened)
2. Record the reviewer, date, and outcome
3. Write evidence to `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`

## Gate 4: Evidence Package

When running Gate 4:
1. Read all prior gate evidence files
2. Verify all required gates (from project config) have `result: pass`
3. Write a summary to `{spec_dir}/{spec_name}/evidence/gate-4-summary.yml` containing:
   - List of all gates with their results
   - Overall pipeline result (pass only if all required gates pass)
   - Timestamp
   - Whether work was done in a worktree (check `git worktree list`)
4. If all gates pass and we're in a worktree, suggest running `/sdlc close` to merge back to main

## Worktree Awareness

When checking gates, be aware that work may be happening in a git worktree:
- Evidence files are in the worktree's copy of `{spec_dir}/{spec_name}/evidence/`
- The main worktree won't see this evidence until the branch is merged
- This is expected — evidence travels with the feature branch
- **If on main**, step 0 (worktree redirect) ensures you read/write evidence from the correct worktree path
- All file paths (`{spec_dir}/{spec_name}/evidence/`) should be resolved relative to the active base path (worktree or main), not assumed to be relative to cwd
