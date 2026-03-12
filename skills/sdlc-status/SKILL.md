---
name: sdlc-status
description: >-
  Use when the user says "/sdlc status", "/spec status", "show pipeline status",
  "where am I in the sdlc", "what gates have passed", or wants to see the current
  state of their spec's quality pipeline.
---

# SDLC Pipeline Status

Show the user where their spec currently stands in the quality pipeline.

## Process

1. **Show worktree context**: Run `git worktree list` and show the current workspace:
   - If in a worktree: `Worktree: {name} (branch: {branch})`
   - If on main: `Workspace: main`

2. **Read project config**: Get `spec_dir` from `.claude/sdlc.local.md`.

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

4. **For each spec, check gate evidence**: Look in the spec's evidence directory using the correct base path (worktree or main).

5. **Display status**: Show a clear pipeline view for each active spec:

```
Workspace: main
Active worktrees: memory-phase-1-5, add-user-auth

📍 On main:
  (no active specs)

📍 Worktree: memory-phase-1-5 (branch: feat/memory-phase-1-5)
  SPEC-001: memory-phase-1-5-enhancements (status: approved)
    Gate 1: Spec Quality     PASS (8.5/10, threshold 7.0)
    Gate 2: Code Quality     PENDING
    Gate 3: Review           PENDING
    Gate 4: Evidence Package PENDING

📍 Worktree: add-user-auth (branch: feat/add-user-auth)
  SPEC-002: add-user-auth (status: draft)
    Gate 1: Spec Quality     PENDING
```

Use these indicators:
- PASS — evidence exists, result is pass
- FAIL — evidence exists, result is fail
- PENDING — no evidence yet
- SKIPPED — gate not required in project config

6. **Suggest next action**: Based on the first pending gate for each spec, suggest what the user should do next. If on main, remind them to switch to the appropriate worktree (or launch a new session there) to continue work.
