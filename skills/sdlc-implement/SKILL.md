---
name: sdlc-implement
description: >-
  Runs the Speculator implementation phase — bridges from an approved, Gate-1-passed
  spec to actionable work by creating an implementation plan derived from the spec,
  generating linked beads user stories, and handing off execution. Use when the user
  says "/sdlc implement", "/spec implement", "implement the spec", "start the
  implementation phase", "plan the implementation from this spec", "turn the spec into
  tasks", or when the spec has passed Gate 1 and is ready for implementation. NOT for
  generic "implement this function/feature" requests outside the spec pipeline.
---

# `/sdlc implement` — From Approved Spec to Implementation

This skill bridges from the approved spec to actionable implementation work. It orchestrates planning, task creation, and execution handoff. The `sdlc` router delegates here.

## Process

1. **Verify Gate 1** has passed. If not, block and redirect to `/sdlc score`.

2. **Verify worktree** (check `git worktree list`). If not in a worktree, warn:
   - "You're on main. For isolation, consider using `/sdlc start` to create a dedicated worktree."

3. **Resolve the active spec** (follow `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`). If the `sdlc` router already resolved a worktree base path, use it for all spec/plan operations below.

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

## Traceability Chain

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
