---
name: sdlc
description: >-
  Use when the user says "/sdlc" with any subcommand (start, score, gate, status,
  implement, review, close), or just "/sdlc" with no args to see status. This is
  the master orchestrator for the Agentic SDLC quality pipeline.
---

# Agentic SDLC — Master Orchestrator

You are the entry point for the Agentic SDLC quality pipeline.

## Worktree Awareness Preamble (run BEFORE routing)

Before routing any subcommand, check if this session is on main but should be in a worktree:

1. Run `git worktree list` and determine if you're on main or in a worktree.
2. If on main, scan all worktrees for specs (follow the **Worktree Redirect Check** in `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`).
3. If worktree specs are found, warn the user and ask which worktree to target.
4. If the user picks a worktree, set the worktree's absolute path as the base directory for all subsequent spec/evidence operations. Inform them: *"Operating against worktree `{name}`. For full isolation, consider launching a separate Claude Code session in this worktree."*
5. Pass the resolved base path to whichever sub-skill handles the command.

**Skip this preamble** for commands that don't need a spec: `/sdlc start`, `/sdlc doctor`.

## Routing

Based on the user's command, invoke the appropriate sub-skill:

| Command | Action |
|---------|--------|
| `/sdlc` (no args) | Show pipeline status — invoke `sdlc-status` skill |
| `/sdlc start` | Create a new spec — invoke `spec-create` skill (runs doctor first) |
| `/sdlc score` | Score a spec (Gate 1) — invoke `spec-score` skill |
| `/sdlc gate [name]` | Check/run a gate — invoke `gate-check` skill |
| `/sdlc status` | Show pipeline status — invoke `sdlc-status` skill |
| `/sdlc implement` | Guide to implementation phase (see below) |
| `/sdlc review` | Run Gate 3 — invoke `gate-check` skill with gate=review |
| `/sdlc close` | Run Gate 4 — invoke `gate-check` skill with gate=evidence-package |
| `/sdlc doctor` | Run system diagnostics — invoke `sdlc-doctor` skill |

## `/sdlc implement`

This command bridges from the approved spec to actionable implementation work. It orchestrates planning, task creation, and execution handoff.

### Process

1. **Verify Gate 1** has passed. If not, block and redirect to `/sdlc score`.

2. **Verify worktree** (check `git worktree list`). If not in a worktree, warn:
   - "You're on main. For isolation, consider using `/sdlc start` to create a dedicated worktree."

3. **Resolve the active spec** (follow `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`).

4. **Read the approved spec** to understand requirements, acceptance criteria, and constraints.

5. **Create the implementation plan**:
   - Invoke the `writing-plans` skill (from superpowers plugin if available)
   - The plan should be derived FROM the spec — requirements map to tasks, ACs map to test criteria
   - Plan is saved to `docs/plans/YYYY-MM-DD-{feature-name}.md` in the worktree
   - If writing-plans is not available, guide the user to create a plan manually

6. **Create beads user stories** from the plan:
   - For each task in the plan, create a beads issue:
     ```bash
     beads create --title "Task N: {task title}" --description "{task description from plan}" --priority P2
     ```
   - Link each story to the epic (created during `/sdlc start`) using beads dependencies:
     ```bash
     beads dep add {story-id} --blocked-by {epic-id}
     ```
   - Record the story IDs in the plan document for traceability

7. **Present the execution options**:
   - **Subagent-Driven (this session)**: Dispatch fresh subagent per task, review between tasks. Use `subagent-driven-development` skill.
   - **Parallel Session (separate)**: Open new session with `executing-plans` skill.
   - **Manual**: User implements tasks themselves, checking them off as they go.

8. **Remind about gates**: Gate 2 (code quality) will be checked before merge. Tests must pass, coverage must meet threshold.

### Traceability Chain

```
Epic (beads)
  └── Spec (docs/specs/{name}/spec.md)
       └── Scorecard (evidence/gate-1-scorecard.yml)
       └── Plan (docs/plans/YYYY-MM-DD-{name}.md)
            └── Story 1 (beads) → Task 1 in plan
            └── Story 2 (beads) → Task 2 in plan
            └── Story N (beads) → Task N in plan
```

Each story can be tracked, audited, and closed independently. The epic closes when all stories are done and Gate 4 passes.

## `/sdlc close`

This command finalizes the feature and guides merging back to main:

1. **Run Gate 4** (evidence package) — invoke `gate-check` skill with gate=evidence-package.

2. **Release the spec lock**: Remove the `.active` file from the spec directory:
   ```bash
   rm docs/specs/{spec-name}/.active
   ```

3. **Close beads issues**:
   - Read the spec's `epic` field from YAML frontmatter to find the epic ID
   - Find all stories linked to this epic (`beads dep list {epic-id}`)
   - Verify all stories are completed — if any are open, warn the user
   - Close all completed stories: `beads close {story-id}`
   - Close the epic: `beads close {epic-id}`
   - Update the spec's YAML frontmatter: `status: closed`

4. **Guide the merge** (if Gate 4 passes):
   a. Check if we're in a worktree (`git worktree list`)
   b. If in a worktree:
      - Commit all remaining changes
      - Explain: "Ready to merge back to main. Since specs and evidence live in unique directories (`docs/specs/{feature-name}/`), merges are typically clean."
      - Guide: `git checkout main && git merge {worktree-branch}`
      - After merge: the worktree can be cleaned up on session exit
   c. If on main: just confirm all gates passed and work is committed.

5. **Remind about shared files**: "If you modified any shared files (.beads/, CLAUDE.md, sdlc.local.md) in the worktree, review those changes carefully during merge."

## `/sdlc` with no args

If the user just types `/sdlc` with no subcommand, show the pipeline status (same as `/sdlc status`).

## Worktree Awareness

The SDLC workflow uses git worktrees for feature isolation:
- `/sdlc start` creates a worktree for the feature
- All work (spec, scoring, implementation, review) happens in the worktree
- `/sdlc close` guides merging back to main
- Multiple features can be in progress simultaneously without branch-switching

**Conflict-safe files** (unique per feature): `docs/specs/{name}/`, evidence, implementation code
**Shared files** (avoid modifying in worktrees): `.beads/`, `.claude/sdlc.local.md`, `CLAUDE.md`

## Autonomous Mode (Future)

`/sdlc run` will eventually chain all sub-skills in sequence for fully autonomous execution. For v1, each step is manually invoked.
