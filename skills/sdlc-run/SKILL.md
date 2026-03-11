---
name: sdlc-run
description: >-
  Autonomous end-to-end pipeline orchestrator. Chains scoring, planning,
  implementation, review, and merge with trust-based autonomy modes.
  Use when the user says "/sdlc run", "run the pipeline", "execute the
  full sdlc", or wants to run the entire quality pipeline autonomously.
---

# `/sdlc run` — Autonomous Pipeline Orchestrator

You are the autonomous orchestrator for the Agentic SDLC pipeline. You chain all five phases — scoring, planning, implementation, review, and merge — into a single invocation, using a trust-based autonomy model to decide how much human oversight is needed.

## The Self-Improvement Philosophy

> **Self-improvement is built into every pipeline run, not just a fallback for weak specs.**
>
> The self-improvement trigger (configurable, default **8.0**) is intentionally set **higher** than the Full Auto threshold (default **7.8**). A spec scoring 7.9 could run autonomously, but engaging with scorer feedback first makes it better. Only specs scoring >= 8.0 on first pass skip self-improvement entirely. This philosophy treats quality refinement as a **practice**, not a penalty.

---

## 1. Entry Point Resolution

Parse the arguments to determine what to run and how to find the spec.

### No arguments → Auto-detect

1. Resolve the active spec using `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md` (worktree redirect check, resolution order).
2. Once spec is found, proceed to **Pipeline Position Detection** to determine where to resume.

### Quoted string → Generate spec skeleton

If the argument is a quoted string (e.g., `/sdlc run "add email snooze"`):

1. Derive a kebab-case slug from the string (e.g., `add-email-snooze`).
2. Generate a spec skeleton containing:
   - `title` — the user's string
   - `problem_statement` — placeholder: `TODO: describe the problem this solves`
   - At least one requirement: `R1: TODO`
   - At least one acceptance criterion: `AC1: TODO`
   - `risk_level: medium` (default)
3. Write to `docs/specs/{slug}/spec.md` using the template at `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md` as the structural base.
4. Announce the skeleton was created and enter Phase 1 (scoring). The scorer will flag the TODOs as blocking issues, which the self-improvement loop will attempt to flesh out from context.

### SPEC-ID → Locate by ID

If the argument matches `SPEC-NNN` (e.g., `/sdlc run SPEC-042`):

1. Search for a spec with that ID across all worktrees and the main tree:
   ```bash
   # Check main and all worktrees for spec with matching ID
   for dir in $(git worktree list --porcelain | grep "^worktree " | sed 's/worktree //'); do
     grep -rl "^id: SPEC-042" "$dir/docs/specs/"/*/spec.md 2>/dev/null
   done
   ```
2. If found, use that spec's directory as the active spec.
3. If found in a different worktree, announce which worktree contains it and set the worktree path as the base for all operations.
4. Proceed to **Pipeline Position Detection**.

---

## 2. Pipeline Position Detection

After resolving the spec, determine where the pipeline left off by checking evidence files in order. The spec directory is `{spec_dir}/{spec_name}/`.

| Check | Condition | Phase to start |
|-------|-----------|----------------|
| 1 | No `evidence/gate-1-scorecard.yml` | Phase 1: Scoring |
| 2 | Scorecard exists, no plan in `docs/plans/` matching this spec | Phase 2: Planning |
| 3 | Plan exists, no `evidence/gate-2-quality.yml` | Phase 3: Implementation + Gate 2 |
| 4 | Gate 2 exists, no `evidence/gate-3-review.yml` | Phase 4: Review |
| 5 | Gate 3 exists, no `evidence/gate-4-summary.yml` | Phase 5: Close |
| 6 | All gates exist | Pipeline complete — nothing to do |

Announce which phase will start:
```
Pipeline position: Phase {N} — {phase_name}
Resuming from {description of last completed checkpoint}.
```

---

## 3. Phase 1: Spec Scoring & Trust Evaluation

### Read Configuration

Read the project config from `.claude/sdlc.local.md` and look for a `run:` block. If no `run:` block exists, use these defaults:

```yaml
run:
  self_improvement_trigger: 8.0
  full_auto_threshold: 7.8
  guided_threshold: 7.0
  max_spec_retries: 3
  max_code_retries: 3
  intent_verifiability_min: 8
```

### Score the Spec

Invoke the `spec-score` skill → produces `evidence/gate-1-scorecard.yml`.

Read the scorecard and extract:
- `overall` score (weighted average)
- `intent_verifiability` dimension score
- All `flags` (blocking, recommended, advisory)

Read the spec YAML frontmatter and extract:
- `risk_level` (default: `medium` if absent)

### Trust Ladder

Evaluate the trust ladder in this exact order. Hard gates are checked first; score-based evaluation only applies if no hard gate fires.

```
HARD GATES (any one triggers forced Guided Autopilot):
  ┌─ intent_verifiability score < intent_verifiability_min → Guided
  ├─ risk_level is "high" or "critical"                    → Guided
  └─ scorer flagged risk_mismatch                          → Guided

SCORE-BASED (only if no hard gates triggered):
  ┌─ overall >= self_improvement_trigger (8.0)
  │    → Full Auto (skip self-improvement — spec is strong enough)
  │
  └─ overall < self_improvement_trigger
       → Enter self-improvement loop (max max_spec_retries attempts)
         ┌─ After improvement, overall >= full_auto_threshold (7.8) → Full Auto
         ├─ Retries exhausted, overall >= guided_threshold (7.0)    → Guided Autopilot
         └─ Retries exhausted, overall < guided_threshold (7.0)     → Stop
```

> **Design note:** The self-improvement trigger (8.0) is intentionally higher than the Full Auto threshold (7.8). Self-improvement is a built-in practice, not just a fallback. Only 8.0+ specs skip it. A spec can score 7.9, go through one improvement cycle, land at 8.1, and proceed as Full Auto — stronger for having engaged with the feedback.

### Self-Improvement Loop

When a spec enters the self-improvement loop, iterate up to `max_spec_retries` times:

1. **Read scorecard flags** in priority order: blocking → recommended → advisory.
2. **Identify the weakest dimensions** (lowest-scoring in the scorecard).
3. **Revise the spec** targeting specific flags:
   - Add detail, examples, anti-patterns, and clarifications to existing sections.
   - Flesh out placeholder/TODO sections using available context.
   - **BOUNDARY CONSTRAINT (elevated):** The self-improvement loop may add detail, examples, anti-patterns, and clarifications to existing sections. It MUST NOT remove or materially alter existing requirements or acceptance criteria without human approval. It is improving the spec's *expression* of the intent, not changing the intent itself.
4. **Re-invoke `spec-score`** → new scorecard replaces the previous one.
5. **Re-evaluate the trust ladder** with the new scores.
6. If the spec now qualifies for Full Auto or Guided, exit the loop.
7. If retries are exhausted and the score is still below `guided_threshold` → **Stop**.

### Record Trust Decision

Update the spec's YAML frontmatter with the trust evaluation result:

```yaml
autonomy_mode: full_auto | guided | stopped
trust_score: 8.3
trust_attempts: 1
```

### If Stopped

When the pipeline stops due to insufficient spec quality:

1. Create a beads issue tagged `spec-rework`:
   ```bash
   beads create --title "Spec rework needed: {spec_title}" \
     --description "Score: {score}, unresolved flags: {flag_list}, weakest: {dimensions}" \
     --priority P1
   ```
2. Exit with a message listing:
   - The final score
   - Unresolved blocking flags
   - The weakest dimensions with their scores
   - Suggestion: "Revise the spec and run `/sdlc run` again to resume."

### Commit

Commit all scorecard(s) and spec updates from this phase:
```
chore(sdlc): gate 1 — spec scored {score}, mode: {autonomy_mode}
```

---

## 4. Phase 2: Plan Creation

1. **Invoke the `writing-plans` skill** with the approved spec path. The plan is saved to `docs/plans/YYYY-MM-DD-{feature-name}.md`.

2. **Create beads user stories** from plan tasks:
   - For each task in the plan, create a beads issue:
     ```bash
     beads create --title "Task N: {task_title}" \
       --description "{task_description}" --priority P2
     ```
   - Link each story to the spec's epic (from spec frontmatter `epic` field):
     ```bash
     beads dep add {story-id} --blocked-by {epic-id}
     ```

3. **Guided + interactive mode** → Present the plan summary, then ask:
   ```
   AskUserQuestion: "Plan created with N tasks. Approve and continue to implementation? (y/n)"
   ```
   - If rejected, stop and let the user revise.

4. **Guided + headless mode** → Commit the plan, output review instructions, exit with code 0:
   ```
   Plan committed. Review at: docs/plans/{plan-file}
   To continue: /sdlc run
   ```

5. **Full Auto mode** → Commit and proceed to Phase 3 without pausing.

6. **Commit** plan + stories:
   ```
   chore(sdlc): phase 2 — plan created with N tasks
   ```

---

## 5. Phase 3: Implementation + Gate 2

1. **Execute the plan** using the `subagent-driven-development` skill (dispatches a fresh subagent per task). If subagents are unavailable, fall back to `executing-plans` skill.

2. **Run Gate 2** after implementation: Invoke the `gate-check` skill with `gate=code-quality` → produces `evidence/gate-2-quality.yml`.

3. **Self-heal loop** (max `max_code_retries` from config, default 3):
   - If tests fail or coverage is below the threshold:
     1. Read the failure details from test output and gate evidence.
     2. Identify the failing tests or coverage gaps.
     3. Fix the issues — add missing tests, fix broken assertions, adjust implementation.
     4. Re-run Gate 2.
   - If retries exhausted and Gate 2 still fails → escalate to human:
     ```
     Gate 2 (code quality) failed after {N} fix attempts.
     Failures: {failure_summary}
     Manual intervention needed before the pipeline can continue.
     ```

4. **Commit** implementation + evidence:
   ```
   feat: implement {spec_title}

   Gate 2 (code quality): pass
   ```

---

## 6. Phase 4: Code Review (Gate 3)

1. **Dispatch the `code-reviewer` agent** from `${CLAUDE_PLUGIN_ROOT}/agents/code-reviewer/AGENT.md` with:
   - Spec path
   - Plan path
   - Worktree base directory
   - Output path: `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`

2. **If blocking issues found** → one self-fix cycle:
   1. Read the blocking issues from `gate-3-review.yml`.
   2. Address each blocking issue in the code.
   3. Re-dispatch the `code-reviewer` agent to produce a fresh review.

3. **If still blocking after self-fix** → escalate to human:
   ```
   Gate 3 (code review) found blocking issues that persist after auto-fix:
   {blocking_issues}
   Manual intervention needed.
   ```

4. **Commit** evidence:
   ```
   chore(sdlc): gate 3 — code review {pass|fail}
   ```

---

## 7. Phase 5: Evidence Package & Merge (Gate 4)

1. **Guided + interactive mode** → Present a summary of all work before proceeding:
   ```
   Pipeline Summary:
     Spec:           {spec_title} ({spec_id})
     Trust mode:     {autonomy_mode} (score: {trust_score})
     Gate 1 (spec):  pass ({score})
     Gate 2 (code):  pass
     Gate 3 (review): pass
     Plan:           {N} tasks completed
     Stories:        {N} closed
   ```
   Then ask:
   ```
   AskUserQuestion: "All gates passed. Approve and merge to main? (y/n)"
   ```
   - If rejected, stop and let the user review.

2. **Guided + headless mode** → Commit everything, output review instructions, exit:
   ```
   All gates passed. Evidence committed.
   To merge: git checkout main && git merge {branch}
   Or run /sdlc run again in interactive mode to approve the merge.
   ```

3. **Full Auto mode** → Proceed with merge automatically.

4. **Invoke `gate-check`** with `gate=evidence-package` → produces `evidence/gate-4-summary.yml`.

5. **Close beads issues**:
   - Find all stories linked to the epic: `beads dep list {epic-id}`
   - Close each completed story: `beads close {story-id}`
   - Close the epic: `beads close {epic-id}`

6. **Remove the `.active` lock file**:
   ```bash
   rm docs/specs/{spec-name}/.active
   ```

7. **Commit** all evidence:
   ```
   chore(sdlc): gate 4 — evidence package complete
   ```

8. **Merge** the worktree branch to main:
   ```bash
   git checkout main
   git merge {worktree-branch}
   ```

---

## 8. Headless Detection

Detect whether this session is interactive or headless to determine how Guided Autopilot behaves.

**Detection strategy:**
1. Check for the `CLAUDE_HEADLESS` environment variable. If set to `true` or `1`, treat as headless.
2. If no env var, attempt to use `AskUserQuestion` for the first Guided checkpoint. If the tool is unavailable or returns an error, treat as headless for the remainder of the run.

**Behavior by mode:**

| Mode | Interactive | Headless |
|------|------------|----------|
| Full Auto | No pauses — runs end to end | No pauses — runs end to end |
| Guided | Pauses at checkpoints for approval | Commits work, outputs instructions, exits cleanly |
| Stopped | Reports issues, creates beads ticket | Same |

Guided checkpoints (where interactive mode pauses):
- Phase 2: Plan approval
- Phase 5: Merge approval

---

## 9. Autonomy Modes — Summary

### Full Auto
The spec scored high enough on the trust ladder to run without human checkpoints. All five phases execute sequentially. Self-heal loops engage automatically for code issues. The pipeline only stops if self-heal retries are exhausted.

### Guided Autopilot
A hard gate or insufficient score requires human oversight. The pipeline runs autonomously between checkpoints but pauses at defined gates for approval. In headless mode, it exits cleanly at each checkpoint with instructions for how to continue.

### Stopped
The spec could not reach the `guided_threshold` even after `max_spec_retries` improvement attempts. The pipeline creates a beads issue for spec rework and exits. No implementation work is started.

---

## 10. Self-Improvement Loop Boundary Constraint

> **The self-improvement loop may add detail, examples, anti-patterns, and clarifications to existing sections. It MUST NOT remove or materially alter existing requirements or acceptance criteria without human approval. It is improving the spec's *expression* of the intent, not changing the intent itself.**

This constraint applies to every iteration of the self-improvement loop. If a flag suggests that a requirement is wrong or unnecessary, that feedback is surfaced to the human — the loop does not unilaterally remove it.

Examples of **permitted** changes:
- Adding edge case descriptions to an existing AC
- Expanding a vague requirement with concrete examples
- Adding anti-pattern notes to a design section
- Filling in TODO placeholders with derived content

Examples of **prohibited** changes:
- Removing a requirement the user wrote
- Changing an AC's success condition
- Altering the scope boundary
- Downgrading risk_level without human approval

---

## Do NOT

- Reimplement existing gate logic — always delegate to the appropriate skill or agent
- Skip the trust ladder evaluation — every run must pass through it
- Proceed to Phase 3 (implementation) if the spec is in `stopped` mode
- Alter requirements or acceptance criteria in the self-improvement loop
- Force-merge without Gate 4 evidence
- Assume interactive mode — always detect headless vs interactive
