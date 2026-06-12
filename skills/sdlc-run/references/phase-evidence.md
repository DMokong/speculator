# Phase 5: Evidence Package & Deliver (Gate 4)

This phase wraps the close workflow with autonomy-mode checkpoints. The close mechanics themselves (Gate 4, beads closure, lock release, delivery, compaction) live in the `sdlc-close` skill — do not duplicate them here.

Read `close.strategy` from the project config (`.claude/sdlc.local.md`). Default is `merge` if not set.

## Autonomy checkpoints (run BEFORE the close workflow)

1. **Guided + interactive mode** → Present a summary of all work before proceeding:
   ```
   Pipeline Summary:
     Spec:           {spec_title} ({spec_id})
     Trust mode:     {autonomy_mode} (score: {trust_score})
     Gate 1 (spec):  pass ({score})
     Gate 2a (eval intent):  pass ({score})
     Gate 2 (code):  pass
     Gate 2b (eval quality): pass ({score})
     Gate 2c (comprehension): pass ({score})
     Gate 3 (review): pass
     Plan:           {N} tasks completed
     Stories:        {N} completed (closed during the close workflow, before Gate 4)
     Delivery:       {close_strategy} (merge or pr)
   ```
   The Gate 2a row is included only when `gates.eval-intent.enabled: true` in `.claude/sdlc.local.md`; the Gate 2b row only when `gates.eval-quality.enabled: true`; the Gate 2c row only when `gates.comprehension.enabled: true`. Omit the rows for disabled opt-in gates — do not show them as skipped.

   Then ask:
   ```
   AskUserQuestion: "Gates 1-3 passed (plus enabled opt-in gates). Approve running the close workflow — Gate 4 + {merge to main / create PR}? (y/n)"
   ```
   - If rejected, stop and let the user review.
   - Note: Gate 4 has NOT run yet at this checkpoint — never claim "all gates passed" here. Gate 4 runs inside the close workflow (step 4).

2. **Guided + headless mode** → Commit everything, output review instructions, exit:
   - If strategy is `merge`:
     ```
     Gates 1-3 passed. Evidence committed.
     Run /sdlc close in interactive mode to run Gate 4 and deliver (merge),
     or run /sdlc run again in interactive mode to resume.
     ```
   - If strategy is `pr`:
     ```
     Gates 1-3 passed. Evidence committed.
     Run /sdlc close in interactive mode to run Gate 4 and create the PR with full evidence body.
     ```
   - Both strategies route through the `sdlc-close` workflow — never print a raw `git merge` command that would deliver to main without Gate 4 evidence, beads closure, lock release, or compaction.

3. **Full Auto mode** → Proceed to the close workflow automatically, no approval pause. The `sdlc-close` skill's autonomy-mode section has it **execute** the delivery (merge or PR per strategy) directly — it does not stop to guide a human.

## Close workflow (delegated)

4. **Execute the close workflow exactly as defined in the `sdlc-close` skill** (`${CLAUDE_PLUGIN_ROOT}/skills/sdlc-close/SKILL.md`). It covers, in order: beads story/epic closure (before Gate 4 — its beads-cleanup check requires closed stories), Gate 4 evidence package via `gate-check`, `status: closed` frontmatter update + `.active` lock release, the evidence commit, and strategy-dependent delivery (merge + compaction, or PR with the evidence-table body — including Gate 2a/2b/2c rows when enabled — + compaction). In Full Auto mode the skill executes the merge/PR commands itself per its autonomy-mode section.
