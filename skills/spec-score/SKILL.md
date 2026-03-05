---
name: spec-score
description: >-
  Use when the user says "/sdlc score", "score my spec", "evaluate the spec",
  "check spec quality", or wants to run Gate 1 (spec quality) on a specification.
  Invokes the spec-scorer agent to evaluate the spec and produce a scorecard.
---

# Score a Spec (Gate 1: Spec Quality)

You are helping the user run the spec quality gate on a specification.

## Process

0. **Worktree redirect check**: Run the **Worktree Redirect Check** from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`. If on main and specs exist in worktrees, ask the user which worktree to target and use its absolute path as the base for all file operations below. This prevents scoring a spec that doesn't exist on main.

1. **Identify the spec** (follow resolution order from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`):
   - If user specified a spec name/path → use it
   - If in a worktree → use the spec matching the worktree name
   - If redirected to a worktree (from step 0) → use specs at `{worktree_path}/docs/specs/`
   - Check for `.active` lock files → skip locked specs (warn if user picks one)
   - Single unlocked spec in `draft` status → use it
   - Multiple unlocked specs → list them and ask the user

2. **Invoke the spec-scorer agent**: Launch the `spec-scorer` agent (from this plugin's `agents/` directory) with:
   - The spec file path
   - The project config path (`.claude/sdlc.local.md`)

3. **Present results**: After the agent produces the scorecard, read it and present to the user:
   - Show each dimension's score with a brief explanation
   - Show the overall score and whether it passed the threshold
   - Show all flags as actionable feedback
   - If it passed: congratulate and suggest next steps (`/sdlc implement` or start coding)
   - If it failed: show what needs improvement, offer to help revise the spec

4. **Update spec status**: If the gate passed, update the spec's YAML frontmatter `status` from `draft` to `approved`.

## Do NOT

- Skip the agent — always use the spec-scorer agent for consistent evaluation
- Modify the spec content (only update the status field in frontmatter)
- Proceed to implementation guidance if the gate failed
