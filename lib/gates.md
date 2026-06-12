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
| comprehension | 2c | gate-2c-comprehension.yml | gates.comprehension.enabled (opt-in, experimental) | 7.0 | Phase 3b: Comprehension (Gate 2c) | rubrics/comprehension.md | comprehension-scorer |
| review | 3 | gate-3-review.yml | gates.review (required — always on) | n/a (checklist verdicts pass/warn/fail) | Phase 4: Review | rubrics/review.md | code-reviewer |
| evidence-package | 4 | gate-4-summary.yml | gates.evidence-package (required — always on) | n/a (mechanical checklist) | Phase 5: Close | rubrics/evidence-package.md | none — mechanical |
<!-- GATE-TABLE-END -->

### Column notes

- **Config key** — opt-in gates use `gates.<id>.enabled` in `.claude/sdlc.local.md`; required gates are always-on (`required: true`) and have no enable switch.
- **Default threshold** — the score a gate must meet when no project override is set. Verified against the rubric's Gate Decision section and the `sdlc-doctor --init` template. Gates marked `n/a` are mechanical (binary checks or checklists), not score-thresholded.
- **Pipeline phase** — the exact phase string from `skills/sdlc-run/SKILL.md` section 2 (Pipeline Position Detection).
- **Scorer agent** — the agent directory under `agents/` whose `AGENT.md` produces the evidence artifact. `none — mechanical` means the gate-check skill collects evidence directly without an LLM scorer.

### Gate 2c (comprehension) — wired (experimental, default off)

The comprehension gate is fully wired and ships **experimental, default off** — enable it with `gates.comprehension.enabled: true` in `.claude/sdlc.local.md`. Enablement is a global flag, not bound to `risk_level` (risk-level-bound enablement is deferred to v3 — see the ROADMAP backlog). The `comprehension-scorer` agent cold-reads the spec + diff (never the implementing session's reasoning), generates a per-AC comprehension artifact, and scores it against `rubrics/comprehension.md`. The rubric's calibration corpus is still seed-stage — that open work is what keeps the gate labeled experimental.

### Display convention for disabled opt-in gates

- `sdlc-status` (full inventory surface): disabled opt-in gates render as SKIPPED rows — the user sees the whole gate landscape.
- The sdlc-close PR body and the sdlc-run Phase 5 pipeline summary (delivery surfaces): disabled opt-in gates are **omitted entirely** — delivery artifacts show only gates that ran. Do not show them as skipped there.

### Blinding scope (which judges see thresholds)

**Gate 1 (spec-scorer) is currently the only blinded judge**: it receives weights, dimension minimum, risk signals, and the resolved SYSTEM-SPEC.md path inline — never the config path or any threshold — and the invoking skill stamps `threshold`/`result` post-dispatch. The Gate 2a/2b/2c judges (eval-intent-scorer, eval-quality-scorer, comprehension-scorer) still receive the project config path and read their own thresholds; extending invoker-stamping to them is a known follow-up, not an accident of omission.

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
