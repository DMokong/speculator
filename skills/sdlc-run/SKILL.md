---
name: sdlc-run
description: >-
  Autonomous end-to-end pipeline orchestrator — chains spec scoring, planning,
  implementation, code review, and merge into a single invocation with trust-based
  autonomy that determines how much human oversight is needed. Use when the user says
  "/sdlc run", "/spec run", "run the pipeline", "execute the full sdlc", "build this
  feature end to end", "just do everything", "automate the whole thing", or wants to
  run the entire quality pipeline autonomously.
---

# `/sdlc run` — Autonomous Pipeline Orchestrator

You are the autonomous orchestrator for the Speculator pipeline. You chain all five phases — scoring, planning, implementation, review, and merge — into a single invocation, using a trust-based autonomy model to decide how much human oversight is needed.

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
| 3a | Gate 2 exists, `eval-quality.enabled: true`, no `evidence/gate-2b-eval-quality.yml` | Phase 3a: Eval Quality (Gate 2b) |
| 4 | Gate 2 exists (and 2b if enabled), no `evidence/gate-3-review.yml` | Phase 4: Review |
| 5 | Gate 3 exists, no `evidence/gate-4-summary.yml` | Phase 5: Close |
| 6 | All required gates exist | Pipeline complete — nothing to do |

Announce which phase will start:
```
Pipeline position: Phase {N} — {phase_name}
Resuming from {description of last completed checkpoint}.
```

---

## 3. Phase 1: Spec Scoring & Trust Evaluation

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

### Mechanical Steps

For the procedural details of Phase 1 (reading config, invoking the scorer, recording trust decisions, handling stopped specs, committing), read `references/phase-scoring.md`.

---

## Phases 2–5: Execution

Each phase below has detailed procedural steps in a dedicated reference file. The orchestrator reads the relevant file when entering each phase.

### Phase 2: Plan Creation
Create implementation plan via `writing-plans` skill, generate beads stories, handle Guided/Full Auto mode differences.
→ Read `references/phase-planning.md` for detailed steps.

### Phase 3: Implementation + Gate 2
Execute plan via `subagent-driven-development`, run Gate 2 (code quality), self-heal loop for test failures (max `max_code_retries` attempts).
→ Read `references/phase-implementation.md` for detailed steps.

### Phase 3a: Eval Quality (Gate 2b)

Run only when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

Follow the steps in `${CLAUDE_PLUGIN_ROOT}/skills/sdlc-run/references/phase-eval-quality.md`.

### Phase 4: Code Review (Gate 3)
Dispatch `code-reviewer` agent, one self-fix cycle for blocking issues, escalate if unresolved.
→ Read `references/phase-review.md` for detailed steps.

### Phase 5: Evidence Package & Merge (Gate 4)
Present pipeline summary (Guided mode), invoke `gate-check` for evidence package, close beads issues, merge to main, compact into SYSTEM-SPEC.md.
→ Read `references/phase-evidence.md` for detailed steps.

---

## 4. Headless Detection

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

## 5. Autonomy Modes — Summary

### Full Auto
The spec scored high enough on the trust ladder to run without human checkpoints. All five phases execute sequentially. Self-heal loops engage automatically for code issues. The pipeline only stops if self-heal retries are exhausted.

### Guided Autopilot
A hard gate or insufficient score requires human oversight. The pipeline runs autonomously between checkpoints but pauses at defined gates for approval. In headless mode, it exits cleanly at each checkpoint with instructions for how to continue.

### Stopped
The spec could not reach the `guided_threshold` even after `max_spec_retries` improvement attempts. The pipeline creates a beads issue for spec rework and exits. No implementation work is started.

---

## 6. Self-Improvement Loop Boundary Constraint

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
