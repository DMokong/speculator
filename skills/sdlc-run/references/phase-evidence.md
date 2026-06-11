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
     Gate 3 (review): pass
     Plan:           {N} tasks completed
     Stories:        {N} closed
     Delivery:       {close_strategy} (merge or pr)
   ```
   The Gate 2a row is included only when `gates.eval-intent.enabled: true` in `.claude/sdlc.local.md`; the Gate 2b row only when `gates.eval-quality.enabled: true`. Omit the rows for disabled opt-in gates — do not show them as skipped.

   Then ask:
   ```
   AskUserQuestion: "All gates passed. Approve and {merge to main / create PR}? (y/n)"
   ```
   - If rejected, stop and let the user review.

2. **Guided + headless mode** → Commit everything, output review instructions, exit:
   - If strategy is `merge`:
     ```
     All gates passed. Evidence committed.
     To merge: git checkout main && git merge {branch}
     Or run /sdlc run again in interactive mode to approve the merge.
     ```
   - If strategy is `pr`:
     ```
     All gates passed. Evidence committed.
     Run /sdlc close in interactive mode to create the PR with full evidence body.
     ```

3. **Full Auto mode** → Proceed with delivery automatically (merge or PR based on strategy), no approval pause.

## Close workflow (delegated)

4. **Execute the close workflow exactly as defined in the `sdlc-close` skill** (`${CLAUDE_PLUGIN_ROOT}/skills/sdlc-close/SKILL.md`). It covers, in order: Gate 4 evidence package via `gate-check`, beads story/epic closure with `status: closed` frontmatter update, `.active` lock release, the evidence commit, and strategy-dependent delivery (merge + compaction, or PR with the evidence-table body — including Gate 2a/2b rows when enabled — + compaction).
