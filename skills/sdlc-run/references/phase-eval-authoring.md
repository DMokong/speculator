# Phase 2a: Eval Authoring (Gate 2a)

This phase runs when `gates.eval-intent.enabled: true` in `.claude/sdlc.local.md`.
It executes after Phase 2 (Plan Creation) and before Phase 3 (Implementation).

1. **Check for existing gate-2a evidence**: If `evidence/gate-2a-eval-intent.yml` already exists with `result: pass` or `result: override-pass`, skip this phase and proceed to Phase 3.

2. **Dispatch the `eval-authoring` skill** with:
   - Spec path
   - Project config path (`.claude/sdlc.local.md`)
   - Worktree base directory
   - Mode: `full_auto` if the spec frontmatter's recorded `autonomy_mode` is `full_auto`, else `interactive`. Use the recorded trust decision from Phase 1 — do NOT re-derive the mode from the raw score (hard gates like `risk_level: high` or a `risk_mismatch` flag force Guided regardless of score, and re-deriving would skip the guided eval-review checkpoint those gates exist to enforce).

3. **Guided mode checkpoint** (handled by the skill in step 8 of eval-authoring):
   - The skill presents authored evals for review before scoring
   - User can edit, approve, or reject individual evals
   - Pipeline waits for approval before proceeding to scoring

4. **If gate-2a fails after max_eval_retries** (full_auto mode): escalate to human:
   ```
   Gate 2a (eval intent) could not reach the quality threshold after {N} attempts.
   Best score achieved: {score} (threshold: {threshold})
   Blocking issues: {flags}
   Manual intervention needed. Revise evals at docs/specs/{feature}/evals/, then re-run /sdlc run.
   ```

5. **If gate-2a fails with SYSTEM-SPEC.md conflicts**: escalate to human regardless of mode:
   ```
   Gate 2a blocked: eval set contains {N} unresolved SYSTEM-SPEC.md conflicts.
   {conflict details with resolution options}
   Resolve conflicts before the pipeline can proceed.
   ```

6. **Commit** evidence (handled by the eval-authoring skill):
   ```
   chore(sdlc): phase 2a — eval authoring complete ({score}/10)
   ```
