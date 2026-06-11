# Gate Registry — Canonical Gate Fact Table

This document is the single canonical inventory of every quality gate in the Speculator pipeline: its id, label, evidence artifact, config key, default threshold, pipeline position, rubric, and scorer.

> **This table is ENFORCED BY `tests/test-gate-wiring.sh`.** The test parses the rows below and asserts every gate's touchpoints (gate-check, sdlc-status, sdlc-run, sdlc-doctor, evidence-package rubric, rubric files, scorer agents) are consistently wired — in both directions.
>
> **Prompts keep facts inline for LLM reliability.** Skills repeat these facts in their own prose because runtime dereferencing is less reliable for LLMs than inline facts. Do NOT rewrite skills to dereference this file at runtime — this file exists for humans and for the structural test, not as a runtime lookup.
>
> **When adding a gate: add the registry row FIRST**, then run `bash tests/test-gate-wiring.sh` and let the test failures enumerate every touchpoint still to update. (Every gate shipped from v2.7.0 onward was incompletely wired — this registry + test is the mechanism that prevents recurrence.)

## The Registry

<!-- GATE-TABLE-START -->
| Gate ID | Gate | Evidence file | Config key | Default threshold | Pipeline phase | Rubric | Scorer agent |
|---------|------|---------------|------------|-------------------|----------------|--------|--------------|
| spec-quality | 1 | gate-1-scorecard.yml | gates.spec-quality (required — always on) | 7.0 | Phase 1: Scoring | rubrics/spec-quality.md | spec-scorer |
| code-quality | 2 | gate-2-quality.yml | gates.code-quality (required — always on) | n/a (binary checks; coverage_threshold default 80) | Phase 3: Implementation + Gate 2 | rubrics/code-quality.md | none — mechanical |
| eval-intent | 2a | gate-2a-eval-intent.yml | gates.eval-intent.enabled (opt-in) | 6.5 | Phase 2a: Eval Authoring | rubrics/eval-intent.md | eval-intent-scorer |
| eval-quality | 2b | gate-2b-eval-quality.yml | gates.eval-quality.enabled (opt-in) | 6.5 | Phase 3a: Eval Quality (Gate 2b) | rubrics/eval-quality.md | eval-quality-scorer |
| comprehension | 2c | gate-2c-comprehension.yml | gates.comprehension.enabled (opt-in) | 7.0 | NOT WIRED | rubrics/comprehension.md | none committed — NOT WIRED |
| review | 3 | gate-3-review.yml | gates.review (required — always on) | n/a (checklist verdicts pass/warn/fail) | Phase 4: Review | rubrics/review.md | code-reviewer |
| evidence-package | 4 | gate-4-summary.yml | gates.evidence-package (required — always on) | n/a (mechanical checklist) | Phase 5: Close | rubrics/evidence-package.md | none — mechanical |
<!-- GATE-TABLE-END -->

### Column notes

- **Config key** — opt-in gates use `gates.<id>.enabled` in `.claude/sdlc.local.md`; required gates are always-on (`required: true`) and have no enable switch.
- **Default threshold** — the score a gate must meet when no project override is set. Verified against the rubric's Gate Decision section and the `sdlc-doctor --init` template. Gates marked `n/a` are mechanical (binary checks or checklists), not score-thresholded.
- **Pipeline phase** — the exact phase string from `skills/sdlc-run/SKILL.md` section 2 (Pipeline Position Detection).
- **Scorer agent** — the agent directory under `agents/` whose `AGENT.md` produces the evidence artifact. `none — mechanical` means the gate-check skill collects evidence directly without an LLM scorer.

### Gate 2c (comprehension) — NOT wired

The comprehension gate's components live on branch `gate-2c-comprehension`; it is **NOT wired — do not reference it as runnable**. Only its rubric (`rubrics/comprehension.md`) and forward-compatible conditional checks (sdlc-status display row, gate-check/evidence-package Gate 4 verification) are committed. No committed skill may reference `phase-comprehension.md`, dispatch a comprehension scorer, or list comprehension as a runnable gate — `tests/test-gate-wiring.sh` asserts this. Wiring it is a future deliberate act: merge the branch, update this row, and let the test enumerate the remaining touchpoints.

The sdlc-close PR-body evidence table and the sdlc-run pipeline summary **intentionally exclude Gate 2c** until it is wired — only the forward-compatible verification surfaces above may reference it. If a user enables `gates.comprehension.enabled` today, gate-check reports the gate as unwired (with remediation: disable it or check out the branch) and sdlc-doctor WARNs on the key.

### Display convention for disabled opt-in gates

- `sdlc-status` (full inventory surface): disabled opt-in gates render as SKIPPED rows — the user sees the whole gate landscape.
- The sdlc-close PR body and the sdlc-run Phase 5 pipeline summary (delivery surfaces): disabled opt-in gates are **omitted entirely** — delivery artifacts show only gates that ran. Do not show them as skipped there.

### Blinding scope (which judges see thresholds)

**Gate 1 (spec-scorer) is currently the only blinded judge**: it receives weights, dimension minimum, risk signals, and the resolved SYSTEM-SPEC.md path inline — never the config path or any threshold — and the invoking skill stamps `threshold`/`result` post-dispatch. The Gate 2a/2b judges (eval-intent-scorer, eval-quality-scorer) still receive the project config path and read their own thresholds; extending invoker-stamping to them is a known follow-up, not an accident of omission.

## Touchpoints when adding a gate

A new gate requires coordinated edits across roughly a dozen files. Add the registry row above first, then work through:

1. `lib/gates.md` — this registry (FIRST)
2. `rubrics/<gate>.md` — the gate's rubric with a Gate Decision section
3. `agents/<scorer>/AGENT.md` — if the gate is LLM-scored
4. `skills/gate-check/SKILL.md` — valid-gates list, evidence file mapping, missing-evidence dispatch, Gate 4 opt-in verification
5. `skills/sdlc-status/SKILL.md` — opt-in config switches, evidence file list, pipeline row order + display rules
6. `skills/sdlc-run/SKILL.md` — position-detection table, phase section (plus `references/phase-<name>.md`)
7. `skills/sdlc-run/references/phase-evidence.md` — pipeline-summary conditional gate rows + the close-workflow delegation paragraph
8. `skills/sdlc-close/SKILL.md` — PR-body evidence table conditional rows (opt-in gates appear only when enabled)
9. `skills/sdlc-doctor/SKILL.md` — `--init` config template block (opt-in gates: commented block with threshold)
10. `rubrics/evidence-package.md` — conditional check section + Evidence Output Format entry
11. `skills/sdlc/SKILL.md` — routing table, if the gate gets its own subcommand
12. `tests/test-gate-wiring.sh` — usually no change (registry-driven), but extend Layer A if the gate introduces a new touchpoint class
13. `CHANGELOG.md` / `README.md` — document the gate and its config
