---
name: sdlc
description: >-
  Master orchestrator for the Speculator quality pipeline — routes all /sdlc and
  /spec commands to specialized sub-skills. Use when the user says "/sdlc" or "/spec"
  with any subcommand (start, score, gate, eval, status, implement, review, close, run,
  compact, doctor), says "run the quality pipeline", "quality gates", "author evals",
  "write evals", or just "/sdlc" or "/spec" with no args to see status. Both prefixes
  are equivalent.
---

# Speculator — Master Orchestrator

You are the entry point for the Speculator quality pipeline.

## Worktree Awareness Preamble (run BEFORE routing)

Before routing any subcommand, check if this session is on main but should be in a worktree:

1. Run `git worktree list` and determine if you're on main or in a worktree.
2. If on main, scan all worktrees for specs (follow the **Worktree Redirect Check** in `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`).
3. If worktree specs are found, warn the user and ask which worktree to target.
4. If the user picks a worktree, set the worktree's absolute path as the base directory for all subsequent spec/evidence operations. Inform them: *"Operating against worktree `{name}`. For full isolation, consider launching a separate Claude Code session in this worktree."*
5. Pass the resolved base path to whichever sub-skill handles the command.

**Skip this preamble** for commands that don't need a spec: `/sdlc start`, `/sdlc doctor`.

## Routing

Based on the user's command, invoke the appropriate sub-skill. Both `/sdlc` and `/spec` prefixes are equivalent — treat them identically:

| Command | Action |
|---------|--------|
| `/sdlc` or `/spec` (no args) | Show pipeline status — invoke `sdlc-status` skill |
| `/sdlc start` or `/spec start` | Create a new spec — invoke `spec-create` skill (runs doctor first) |
| `/sdlc create` or `/spec create` | Alias for start — invoke `spec-create` skill (the README quickstart uses `/spec create` to formalize a brainstormed plan into spec.md) |
| `/sdlc score` or `/spec score` | Score a spec (Gate 1) — invoke `spec-score` skill |
| `/sdlc gate` or `/spec gate` | Check/run a gate — invoke `gate-check` skill |
| `/sdlc status` or `/spec status` | Show pipeline status — invoke `sdlc-status` skill |
| `/sdlc implement` or `/spec implement` | Run the implementation phase (plan + beads stories + execution handoff) — invoke `sdlc-implement` skill |
| `/sdlc review` or `/spec review` | Run Gate 3 — invoke `gate-check` skill with gate=review |
| `/sdlc close` or `/spec close` | Run the full close workflow (Gate 4 + beads closure + lock release + merge/PR delivery + compaction) — invoke `sdlc-close` skill |
| `/sdlc run` or `/spec run` | Run the full pipeline autonomously — invoke `sdlc-run` skill |
| `/sdlc doctor` or `/spec doctor` | Run system diagnostics — invoke `sdlc-doctor` skill |
| `/sdlc compact` or `/spec compact` | Bootstrap: process closed specs into SYSTEM-SPEC.md — invoke `spec-compact` skill |
| `/sdlc eval` or `/spec eval` | Run eval authoring phase (Gate 2a) — invoke `eval-authoring` skill |

## `/sdlc implement`

Delegate to the `sdlc-implement` skill. It verifies Gate 1, creates the implementation plan, generates linked beads stories, and presents execution options. Pass along the resolved worktree base path from the preamble.

## `/sdlc close`

Delegate to the `sdlc-close` skill. It is the single source of truth for the delivery flow: Gate 4 evidence package, beads closure, spec lock release, merge or PR delivery per `close.strategy`, and SYSTEM-SPEC.md compaction. Pass along the resolved worktree base path from the preamble. Do not reimplement any close steps here.

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

## Autonomous Mode (`/sdlc run`)

`/sdlc run` chains all sub-skills in sequence for autonomous execution with trust-based oversight. See the `sdlc-run` skill for full documentation.

Self-improvement is built into every run — specs scoring below 8.0 go through a refinement loop before the pipeline proceeds. This is by design: engaging with feedback is a practice, not a penalty. Only specs scoring 8.0+ on first pass skip self-improvement.
