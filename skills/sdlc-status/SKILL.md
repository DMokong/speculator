---
name: sdlc-status
description: >-
  Shows cross-worktree pipeline status — displays where each spec stands in the 4-gate
  quality pipeline, including specs across all worktrees. Use when the user says "/sdlc
  status", "/spec status", "show pipeline status", "where am I in the sdlc", "what gates
  have passed", "how's the feature going?", "what's left to do?", "progress check", or
  wants to see the current state of their spec's quality pipeline.
---

# SDLC Pipeline Status

Show the user where their spec currently stands in the quality pipeline.

## Process

1. **Show worktree context**: Run `git worktree list` and show the current workspace:
   - If in a worktree: `Worktree: {name} (branch: {branch})`
   - If on main: `Workspace: main`

2. **Read project config**: Get `spec_dir` from `.claude/sdlc.local.md`. Also read the opt-in gate switches: `gates.eval-intent.enabled` (Gate 2a), `gates.eval-quality.enabled` (Gate 2b), and `gates.comprehension.enabled` (Gate 2c) — these control which conditional rows appear in the status display (step 5).

3. **Find active specs — including across worktrees**:
   a. List specs in the local `{spec_dir}/` (current workspace).
   b. **If on main**, also scan all worktrees for specs:
      ```bash
      MAIN_WT=$(git worktree list | head -1 | awk '{print $1}')
      git worktree list --porcelain | grep "^worktree " | sed 's/worktree //' | while read wt; do
        [ "$wt" = "$MAIN_WT" ] && continue
        ls "$wt"/docs/specs/*/spec.md 2>/dev/null
      done
      ```
   c. Merge results — show all specs with their location (main vs worktree name).

4. **For each spec, check gate evidence**: Look in the spec's evidence directory using the correct base path (worktree or main). Evidence files per gate: `gate-1-scorecard.yml`, `gate-2a-eval-intent.yml`, `gate-2-quality.yml`, `gate-2b-eval-quality.yml`, `gate-2c-comprehension.yml`, `gate-3-review.yml`, `gate-4-summary.yml`.

5. **Display status**: Show a clear pipeline view for each active spec. Rows appear in pipeline execution order: Gate 1, Gate 2a, Gate 2, Gate 2b, Gate 2c, Gate 3, Gate 4. Opt-in gate rows (2a/2b/2c) are conditional:
   - Config block present with `enabled: true` → render the row with PASS/FAIL/PENDING based on evidence
   - Config block present with `enabled: false` → render the row as SKIPPED
   - Config block absent → omit the row entirely

```
Workspace: main
Active worktrees: memory-phase-1-5, add-user-auth

📍 On main:
  (no active specs)

📍 Worktree: memory-phase-1-5 (branch: feat/memory-phase-1-5)
  SPEC-001: memory-phase-1-5-enhancements (status: approved)
    Gate 1: Spec Quality      PASS (8.5/10, threshold 7.0)
    Gate 2a: Eval Intent      PENDING (opt-in, enabled)
    Gate 2: Code Quality      PENDING
    Gate 2b: Eval Quality     SKIPPED (opt-in, disabled)
    Gate 3: Review            PENDING
    Gate 4: Evidence Package  PENDING

📍 Worktree: add-user-auth (branch: feat/add-user-auth)
  SPEC-002: add-user-auth (status: draft)
    Gate 1: Spec Quality     PENDING
```

(In this example, `gates.eval-intent.enabled: true` and `gates.eval-quality.enabled: false` in `.claude/sdlc.local.md`; no `gates.comprehension` block exists, so no Gate 2c row is shown.)

Use these indicators:
- PASS — evidence exists, result is pass (for Gate 2a, `override-pass` also counts as PASS)
- FAIL — evidence exists, result is fail
- PENDING — no evidence yet
- SKIPPED — gate not required in project config (also used for opt-in gates with `enabled: false`)

6. **Suggest next action**: Based on the first pending gate for each spec, suggest what the user should do next. If on main, remind them to switch to the appropriate worktree (or launch a new session there) to continue work.
