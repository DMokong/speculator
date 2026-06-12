# Phase 3b: Comprehension (Gate 2c)

This phase runs when `gates.comprehension.enabled: true` in `.claude/sdlc.local.md`.
It executes after Gate 2 (Code Quality) and Gate 2b (Eval Quality, if enabled),
and before Gate 3 (Code Review).

> **Why a separate phase, not part of Gate 3?** Gate 3 evaluates *code quality*
> (correctness, security, readability). Gate 2c evaluates whether the
> implementation can be *explained in spec terms* — and whether what the code
> does still matches the spec's intent. Different question, different artifact.
> Gate 3 consumes Gate 2c's artifact as preamble (see "Downstream effect" below).

---

## 1. Check for existing evidence

If `evidence/gate-2c-comprehension.yml` already exists with `result: pass`, skip
this phase and proceed to Gate 3. The artifact persists across pipeline runs and
should not be regenerated unless the diff has changed.

If the file exists with `result: fail`, treat this run as a re-attempt — proceed
to dispatch.

## 2. Verify preconditions

Before dispatching, confirm:

1. `evidence/gate-2-quality.yml` exists with `result: pass`
2. Either `gates.eval-quality.enabled: false` (or absent) **OR**
   `evidence/gate-2b-eval-quality.yml` exists with `result: pass`

If a precondition is missing, do not dispatch — surface which prior gate is
incomplete and stop. Gate 2c reads the diff cold, but it depends on Gate 2's
verdict that the code at least runs and Gate 2b's verdict that the tests are
trustworthy instruments.

## 3. Resolve the diff

Gate 2c needs a diff to read. Resolve it in this order:

1. **Worktree mode (preferred):** if `git rev-parse --show-toplevel` differs
   from the main worktree, use `git diff main...HEAD` from inside the worktree.
2. **Single-commit mode:** if on main and a single feature commit is being
   evaluated, use `git diff HEAD~1 HEAD`.
3. **Explicit-range mode:** if the user invoked `/sdlc gate comprehension --diff-range A..B`,
   use that range.
4. **Ask the user** if none of the above resolves cleanly.

Pass the resolved diff range (not the full diff text) to the agent — the agent
re-runs `git diff` itself, so the call stays reproducible.

## 4. Dispatch the comprehension-scorer agent

Invoke the agent at `${CLAUDE_PLUGIN_ROOT}/agents/comprehension-scorer/AGENT.md`
with these inputs:

| Input | Value |
|---|---|
| `spec_path` | `docs/specs/{feature}/spec.md` |
| `diff_range` | the range resolved in step 3 (e.g. `main...HEAD`) |
| `worktree_root` | absolute path to the worktree (or main, if not in one) |
| `system_spec_path` | `{spec_dir}/SYSTEM-SPEC.md` (may not exist; agent handles missing) |
| `rubric_path` | `${CLAUDE_PLUGIN_ROOT}/rubrics/comprehension.md` |
| `output_path` | `docs/specs/{feature}/evidence/gate-2c-comprehension.yml` |
| `config_path` | `.claude/sdlc.local.md` (for threshold + per-dim minimum) |

The agent generates the comprehension artifact (Phase A) and scores it
(Phase B) in a single dispatch — see the agent's `AGENT.md` for the internal
contract.

### Cold-read constraint

The dispatching context MUST NOT include the implementing agent's reasoning,
plan, or commit messages beyond what is visible in the diff. The agent's
value comes from reading fresh — if the dispatcher has been working on the
implementation in this session, dispatch a *fresh subagent* rather than
running the agent's logic inline. From `sdlc-run` in full-auto mode this is
satisfied automatically because the orchestrator launches scoring agents
without inheriting the implementer's chain of thought. From interactive
`/sdlc gate comprehension`, the gate-check skill must dispatch a subagent.

## 5. Handle the result

After the agent writes `gate-2c-comprehension.yml`, read it and route based on
`result` and which (if any) dimension is below the per-dimension minimum.

### `result: pass`

Proceed to Gate 3. Gate 3's `code-reviewer` agent reads
`gate-2c-comprehension.yml` as preamble before running the 6-point checklist.

### `result: fail`

Failure modes split into two classes — handle them differently:

| Failing dimension | Class | Action |
|-------------------|-------|--------|
| AC Coverage | Artifact-quality | Re-dispatch may succeed (agent missed entries). Offer re-dispatch with feedback. |
| Accuracy | Artifact-quality | Re-dispatch may succeed (agent's description was wrong). Offer re-dispatch. |
| Scope Containment | Artifact-quality | Re-dispatch may succeed (agent missed unexplained behaviors). Offer re-dispatch. |
| **Spec Fidelity** | **Implementation** | Re-dispatch will NOT help. The artifact correctly describes an implementation that misses spec intent. Escalate to human. |

If ONLY Spec Fidelity is below the minimum: escalate immediately, do not
re-dispatch.

If any artifact-quality dimension is below the minimum AND Spec Fidelity is
also below the minimum: escalate. The implementation needs work; fixing the
artifact would only document the wrong thing more carefully.

If only artifact-quality dimensions fail: in interactive mode, ask the user
whether to re-dispatch with the previous artifact's flags as feedback. In
headless mode, commit the failing evidence and exit with instructions.

### Re-dispatch with feedback

When re-dispatching after an artifact-quality failure, pass the previous
artifact's `flags` block as additional context. The agent's instructions
include a "previous-attempt feedback" branch that consumes this and targets
the named issues.

Maximum re-dispatches per pipeline run: **1**. Avoid loops; if one re-dispatch
doesn't get the artifact above threshold, escalate.

## 6. Commit

### On pass
```
chore(sdlc): phase 3b — comprehension gate pass ({score}/10)
```

### On fail (after escalation decision)
```
chore(sdlc): phase 3b — comprehension gate fail ({score}/10), {dimension} below minimum
```

The fail-commit is intentional. The artifact is a useful record of what was
wrong, and committing it lets a follow-up session pick up where this one
stopped.

---

## Downstream effect: Gate 3 consumes the artifact

When Gate 2c passes, Gate 3's `code-reviewer` agent reads
`gate-2c-comprehension.yml` before evaluating the 6-point checklist. The
reviewer enters with:

- A per-AC map of where the implementing code lives (no need to grep blind)
- A list of unexplained behaviors and their classifications (scope-creep
  signals already surfaced)
- The Spec Fidelity finding (already verified that intent matches)

This makes Gate 3 faster (less re-derivation) and richer (Gate 3 can spend
its budget on code-quality concerns rather than re-asking "what does this
code do"). The Gate 3 skill (`skills/gate-check/SKILL.md`) handles the
preamble read; this phase reference does not need to do it.

---

## Failure recovery from previous incomplete run

If `gate-2c-comprehension.yml` exists with no `result` field (interrupted
write) or with malformed YAML, treat the file as absent and re-dispatch.
Log a warning to the user noting the prior incomplete artifact was discarded.
