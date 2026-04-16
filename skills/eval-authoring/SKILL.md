---
name: eval-authoring
description: >-
  Runs the eval authoring phase for a spec — presents each acceptance criterion and
  guides the author to write an intent-capturing eval, scores the eval set via the
  eval-intent-scorer agent, runs a SYSTEM-SPEC.md compatibility check and prior-spec
  regression check, and iterates until the configured quality threshold is met.
  Use when the user says "/sdlc eval", "author evals", "write evals for this spec",
  "eval phase", or when the sdlc-run pipeline reaches Phase 2a.
---

# `/sdlc eval` — Eval Authoring Phase

You are running the eval authoring phase. Evals are intent artifacts — markdown files that describe observable user outcomes for each acceptance criterion, independent of implementation.

## Inputs

You will receive:
- Spec path (from worktree resolution or explicit argument)
- Project config path (`.claude/sdlc.local.md`)
- Worktree base path (for regression scan)
- Mode: `interactive` or `full_auto` (from sdlc-run context, default `interactive`)

## Process

### 1. Locate the spec and load config

1. Follow `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md` to find the active spec.
2. Read `.claude/sdlc.local.md` for:
   - `gates.eval-intent.threshold` (default 6.5)
   - `gates.eval-intent.max_eval_retries` (default 3)
   - `gates.eval-intent.per_dimension_minimum` (default 4)
3. Read the spec file — extract ACs, anti-patterns, user journeys, and `amends` frontmatter.
4. Check for a partial session marker at `{spec_dir}/{spec_name}/evidence/.eval-session-partial`:
   - If found, read it to determine which ACs are already authored — resume from the next unfinished AC.
   - If not found, start from AC1.

### 2. Surface SYSTEM-SPEC.md context (before authoring)

If SYSTEM-SPEC.md exists at `{spec_dir}/SYSTEM-SPEC.md`:
1. Read the spec's `amends` frontmatter to find relevant sections.
2. Extract and display the relevant crystallized behaviors to the author:
   ```
   📋 SYSTEM-SPEC.md context — behaviors this spec amends:
   Section: {section name}
   Current behavior: {behavior text}
   Declared change: {amends.change from spec frontmatter}
   ```
3. Tell the author: "Your evals should reflect the NEW behavior described in the spec, not the old crystallized behavior above."

### 3. Author evals — one per AC

For each acceptance criterion (starting from last partial, or AC1):

**Interactive mode:**
Display the AC:
```
─────────────────────────────────────────
AC{N}: {full AC text}
─────────────────────────────────────────
Write an eval for this AC. Describe the observable outcome a user would experience
if this AC is satisfied — without referencing source code, function names, or
implementation details.

Suggested structure:
  Observable success: [what the user sees/experiences]
  Anti-patterns this catches: [which spec anti-patterns would cause failure]
  Would fail if: [concrete failure conditions in user-visible terms]
```

Accept the author's input and write it to `docs/specs/{feature}/evals/ac-{N}.md`.
Write the partial session marker after each AC: `echo "{N}" > {spec_dir}/{spec_name}/evidence/.eval-session-partial`

**Full auto mode:**
Generate the eval autonomously by:
1. Reading the AC text and the spec's problem statement
2. Identifying the user-visible outcome the AC describes
3. Checking the spec's anti-patterns section for relevant failure modes
4. Writing the eval to `docs/specs/{feature}/evals/ac-{N}.md` with the structure above

Write the partial session marker after each eval.

### 4. Score the eval set

Dispatch the `eval-intent-scorer` agent with:
- Spec path
- Evals directory (`docs/specs/{feature}/evals/`)
- SYSTEM-SPEC.md path (pass even if doesn't exist — agent handles missing file)
- Worktree root path
- Config path

### 5. Feedback loop (max `max_eval_retries` attempts)

If `result: fail` in the scorecard:

**Interactive mode:**
Present the blocking and recommended flags:
```
❌ Eval quality score: {overall} (threshold: {threshold})

Blocking issues to fix:
{blocking flags}

Suggested improvements:
{recommended flags}

Which eval files would you like to revise? (Enter AC numbers, e.g. "1 3" or "all")
```
Accept revisions, overwrite the eval files, re-dispatch the scorer.

**Full auto mode:**
Read the flags. For each blocking flag:
- If it's an implementation-detail issue: rewrite the affected eval(s) to remove the implementation reference
- If it's a missing anti-pattern coverage: add "Would fail if" statements referencing the uncovered anti-pattern
- If it's a journey gap: extend the relevant eval to trace the full journey
Re-dispatch the scorer.

If retries exhausted and still failing:
```
⚠️  Eval quality gate failed after {N} attempts.
Lowest score: {dimension} ({score}) — below minimum {per_dimension_minimum}
Blocking issues:
{blocking flags}

Options:
1. Override with written justification (recorded in evidence, does not affect trust score)
2. Stop here and manually revise evals, then re-run /sdlc eval
```
In full_auto mode: escalate to human. Stop the pipeline.

### 6. SYSTEM-SPEC.md conflict blocking

If the scorecard contains `system_spec_conflicts` entries:
- These are blocking — the pipeline cannot proceed
- Present each conflict with its three resolution options (revise eval, update amends frontmatter, or override with justification)
- Do not proceed to Phase 3 until conflicts are resolved or overridden

### 7. Override handling

If the user chooses to override:
- Prompt for written justification (cannot be empty)
- Record the override in the scorecard: update `gate-2a-eval-intent.yml` with:
  ```yaml
  override:
    overridden: true
    justification: "{user's text}"
    overridden_by: "{user identity if known, else 'manual override'}"
    override_date: "{today}"
  ```
- Change `result: fail` to `result: override-pass`
- Remove the partial session marker

### 8. Guided mode checkpoint (from sdlc-run context)

When called from sdlc-run in guided mode, after authoring is complete but BEFORE scoring:
1. Display all authored evals for review
2. Use `AskUserQuestion`: "Review the authored evals above. Options: (a) approve all, (e) edit specific AC number, (r) reject specific AC number — your choice?"
3. If edit/reject: update the file and loop back to Step 4 (re-score after changes)
4. If approve: proceed to Step 4 (scoring)

### 9. Commit and conclude

On success:
```bash
git add docs/specs/{feature}/evals/ docs/specs/{feature}/evidence/gate-2a-eval-intent.yml
git commit -m "chore(sdlc): phase 2a — eval authoring complete ({score}/10)"
```
Remove the partial session marker:
```bash
rm -f docs/specs/{feature}/evidence/.eval-session-partial
```

Report to the user:
```
✅ Gate 2a passed: eval quality {score} (threshold: {threshold})
Evals authored: {N} (one per AC)
Stored: docs/specs/{feature}/evals/
Evidence: docs/specs/{feature}/evidence/gate-2a-eval-intent.yml
```

## Error Handling

**Storage failure**: If any eval file cannot be written:
```
❌ Storage error: cannot write to {path}
Error: {error message}
Recovery: Fix permissions with `chmod 755 docs/specs/{feature}/evals/`, then re-run /sdlc eval
```
Do not silently continue with unwritten evals. Exit with error.

**Interrupted session recovery**: The `.eval-session-partial` marker file contains the last completed AC number. On next invocation, check for this file and resume from `last_completed + 1`.
