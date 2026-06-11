---
name: spec-score
description: >-
  Runs Gate 1 spec quality scoring — evaluates a specification against a 6-dimension
  rubric (completeness, clarity, testability, intent verifiability, feasibility, scope)
  and produces a scorecard with scores, flags, and a pass/fail decision. Use when the
  user says "/sdlc score", "/spec score", "score my spec", "evaluate the spec", "check
  spec quality", "how good is my spec?", "rate this spec", "is this spec ready?", or
  wants to assess spec quality before implementation.
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

2. **Read the scoring config**: From `.claude/sdlc.local.md`, extract:
   - `scoring.weights` — the dimension weights
   - `scoring.dimension_minimum` — the per-dimension minimum (default 5)
   - `run.risk_signals` — the risk-signal keyword list, if configured (bias-safe to share — it contains no thresholds)
   - `spec_dir` — the spec directory (bias-safe — contains no thresholds). Resolve `{spec_dir}/SYSTEM-SPEC.md` for step 3; the scorer needs this path for impact validation.
   - `gates.spec-quality.threshold` — the Gate 1 pass threshold (e.g. 7.0). Keep this for step 4; do NOT pass it to the scorer.

3. **Invoke the spec-scorer agent**: Launch the `spec-scorer` agent (from this plugin's `agents/` directory) with:
   - The spec file path
   - The scoring weights, dimension minimum, and risk-signal keyword list (if configured), written inline in the dispatch prompt (the values extracted in step 2)
   - The resolved `system_spec_path` (`{spec_dir}/SYSTEM-SPEC.md`), written inline — the scorer must not read the config to derive it

   **Scorer context hygiene — do NOT pass the config file path or any threshold.** `.claude/sdlc.local.md` contains the Gate 1 pass threshold and the `run:` trust-ladder thresholds; a judge that reads the pass threshold before scoring invites score-attraction bias. The scorer's view is ONLY the weights, the dimension minimum, the risk-signal keywords, and the resolved SYSTEM-SPEC.md path. Instruct the agent to score the dimensions, compute the weighted overall, record the weights and dimension minimum it was given in the scorecard, run risk/impact validation, and emit flags — and to leave the scorecard's `threshold` and `result` fields unset for the invoker to stamp.

   **Re-score blinding** (self-improvement loop or any re-dispatch): if `evidence/gate-1-scorecard.yml` already exists, blank its stamped `threshold:` and `result:` fields (or delete the file) BEFORE dispatching, and include in the dispatch prompt: "Do not read any existing scorecard — write a fresh evaluation." A prior round's stamped threshold in the file the scorer overwrites is a blinding leak.

4. **Stamp threshold and result (post-dispatch)**: After the agent writes the scorecard, this skill — not the scorer — performs the threshold comparison:
   - Read the scorecard's `overall`, per-dimension scores, and `flags`
   - Write `threshold:` into the scorecard from `gates.spec-quality.threshold`
   - Determine and write `result:` — `pass` only if `overall` >= threshold AND every dimension >= `dimension_minimum` AND `flags.blocking` is empty; otherwise `fail`

5. **Present results**: Read the stamped scorecard and present to the user:
   - Show each dimension's score with a brief explanation
   - Show the overall score and whether it passed the threshold
   - Show all flags as actionable feedback
   - If it passed: congratulate and suggest next steps (`/sdlc implement` or start coding)
   - If it failed: show what needs improvement, offer to help revise the spec

6. **Update spec status**: If the gate passed, update the spec's YAML frontmatter `status` from `draft` to `approved`.

## Do NOT

- Skip the agent — always use the spec-scorer agent for consistent evaluation
- Pass the full project config (or its path) to the scorer — only the weights, dimension minimum, and risk-signal keywords cross the dispatch boundary
- Let the scorer stamp `threshold` or `result` — that is this skill's post-dispatch responsibility
- Modify the spec content (only update the status field in frontmatter)
- Proceed to implementation guidance if the gate failed
