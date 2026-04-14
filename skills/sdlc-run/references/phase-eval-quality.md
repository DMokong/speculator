# Phase 3a: Eval Quality (Gate 2b)

This phase runs only when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

1. **Dispatch the `eval-quality-scorer` agent** from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with:
   - Spec path
   - Project config path (`.claude/sdlc.local.md`)
   - Worktree base directory (for test file discovery)
   - Output path: `{spec_dir}/{spec_name}/evidence/gate-2b-eval-quality.yml`

2. **If blocking flags found** → one self-fix cycle:
   1. Read the blocking flags from `gate-2b-eval-quality.yml`
   2. Present the flags to the user with clear remediation guidance:
      - Missing AC coverage: "Add tests for: {uncovered ACs}"
      - Low behavioral specificity: "Tests asserting implementation internals: {test names}"
      - Intent fidelity failures: "Tests that check letter but miss spirit: {AC and description}"
   3. If in guided mode: stop and ask the user to improve tests, then re-run
   4. If in full_auto mode: attempt to improve test coverage for blocking issues, then re-dispatch

3. **If still blocking after self-fix** → escalate to human:
   ```
   Gate 2b (eval quality) found blocking issues after auto-fix attempt:
   {blocking_flags}
   Tests need improvement before the pipeline can continue.
   Guidance: {per-AC remediation from flags}
   ```

4. **Commit** evidence:
   ```
   chore(sdlc): gate 2b — eval quality {pass|fail} ({score})
   ```
