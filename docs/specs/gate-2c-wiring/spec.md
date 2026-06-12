---
id: SPEC-002
feature: gate-2c-wiring
status: draft
risk_level: medium
impact_rating: additive
created: 2026-06-12
owner: Dustin Cheng
---

# Gate 2c — Comprehension Gate Wiring (Anti-Dark-Code Phase 2)

## Problem Statement

The pipeline verifies that tests pass (Gate 2), that tests are good instruments (Gate 2b), and that a reviewer approves the code (Gate 3) — but nothing verifies that the implementation is *understood*: that someone (human or agent) reading only the spec and the diff, cold, can explain what shipped and confirm it matches the spec's intent. That gap is the dark-code pathway: software that was generated, passed gates, shipped, and was never understood by anyone at any point. The Gate 2c components (rubric, scorer agent, phase reference) have existed since 2026-04-28 but were never wired into any executable skill — the gate's config key produced an error rather than a gate. This spec wires Gate 2c as the pipeline's seventh gate: opt-in, experimental, default off.

## Requirements

- **R1**: A global `gates.comprehension.enabled` flag (default `false`) activates Phase 3b between Gate 2b (eval quality) and Gate 3 (review). No risk-level binding (deferred to v3 per ROADMAP).
- **R2**: `sdlc-run` position detection gains a Phase 3b row (condition: Gate 2b satisfied-or-disabled AND comprehension enabled AND no `gate-2c-comprehension.yml`) and a failed-2c resume row, mirroring the 2a/3a retry pattern.
- **R3**: `gate-check` treats `comprehension` as a valid gate: status check, and a missing-evidence dispatch that launches the `comprehension-scorer` agent under the cold-read contract — the agent receives the spec and the diff ONLY, never the implementing session's reasoning.
- **R4**: The `sdlc-doctor --init` template gains a commented `gates.comprehension` block (`enabled: false`, `threshold: 7.0`, `per_dimension_minimum: 5`) labeled experimental; the v2.9.0 "enabled but not wired" doctor WARN is removed.
- **R5**: `rubrics/comprehension.md` defines the canonical `gate-2c-comprehension.yml` schema (4 dimension scores, recorded `weights:` and `per_dimension_minimum` for mechanical recomputation, threshold, result, flags); the scorer agent references the schema rather than restating it.
- **R6**: Gate 4 (evidence-package), `sdlc-status`, the close-flow PR-body evidence table, and the pipeline summary all conditionally include Gate 2c when enabled, mirroring the 2a/2b conditional handling.
- **R7**: `lib/gates.md` comprehension row flips from "NOT wired" to wired-experimental, and `tests/test-gate-wiring.sh` replaces its four negative guards with the full Layer-A assertion set for the comprehension row.
- **R8**: Failure routing is dimension-aware: artifact-quality dimensions (`ac_coverage`, `accuracy`, `scope_containment`) permit exactly one re-dispatch with prior flags as feedback; a `spec_fidelity` failure escalates to a human immediately — re-dispatch cannot fix an implementation that doesn't match spec intent.
- **R9**: README documents Gate 2c (pipeline diagram, gate table, an enablement subsection labeled experimental); ROADMAP status tables move from "designed, not built" to shipped-experimental with the calibration corpus as the open item.

## Acceptance Criteria

- **AC1** (R1, R2): Given `gates.comprehension.enabled: true`, Gate 2b satisfied or disabled, and no `gate-2c-comprehension.yml`, when `/sdlc run` performs position detection, then Phase 3b is selected and `references/phase-comprehension.md` drives the phase.
- **AC2** (R1): Given the flag is `false` or absent, when position detection runs, then Phase 3b is skipped entirely and review proceeds with no 2c evidence required anywhere (Gate 4 records `n/a`).
- **AC3** (R3): Given `/sdlc gate comprehension` with no evidence file, when gate-check runs, then the comprehension-scorer is dispatched cold (spec + diff only) and writes `{spec_dir}/{spec_name}/evidence/gate-2c-comprehension.yml`.
- **AC4** (R5): Given a completed comprehension scoring, when the evidence file is read, then it conforms to the rubric's canonical schema including recorded `weights:`, `per_dimension_minimum`, threshold 7.0, result, and flags — and the recorded overall is mechanically recomputable from the recorded weights.
- **AC5** (R8): Given a `spec_fidelity` dimension score below the per-dimension minimum, when Phase 3b evaluates the result, then the pipeline escalates to a human immediately with the artifact as evidence — no re-dispatch occurs.
- **AC6** (R6): Given comprehension enabled and passing evidence, when `/sdlc close` runs, then `gate-4-summary.yml` records the comprehension result and the PR-body evidence table includes a Gate 2c row.
- **AC7** (R7): When `bash tests/test-gate-wiring.sh` runs, then the comprehension registry row receives the same Layer-A assertions as eval-intent/eval-quality and the full suite passes.
- **AC8** (R9): When a user reads the README, then Gate 2c appears in the pipeline description ("4 required + 3 opt-in"), the gate table, and an enablement subsection that labels the gate experimental.

## Critical User Journey

A developer enables the flag and runs `/sdlc run`. After eval quality (or directly after Gate 2 when 2b is disabled), a fresh agent that has seen none of the implementation session cold-reads the spec and the diff, generates a per-AC explanation artifact ("what does this code do, and does it match what the spec intended?"), and scores it on four dimensions. On pass, the artifact becomes the Gate 3 reviewer's preamble — review starts from understanding rather than re-derivation. On a spec-fidelity failure, a human gets the artifact as evidence of exactly where the implementation diverged from intent. Months later, the artifact answers "why was this written this way?" — Jones's context-engineering layer, operationalized.

## Anti-Patterns

- Do NOT let the implementing agent grade its own comprehension — the cold-read constraint is the entire point; an implementer explaining its own code is the dark-code failure mode wearing a gate costume.
- Do NOT treat a fluent-but-wrong explanation as passing `accuracy` — confidently wrong explanations are worse than none (false confidence). This is the known calibration risk; until the calibration corpus exists the gate stays experimental and default-off.
- Do NOT enable the gate by default for consumers — the latency cost (cold-read of spec + full diff + generation + scoring) is opt-in territory.

## Constraints

- Prompt-only changeset: markdown skills/rubrics/agent + one bash test file. No runtime code. Gate 2 is therefore satisfied per the prompt-only N/A-rationale rule in `rubrics/code-quality.md`.
- Default-off in the consumer-facing doctor template; enabled in Speculator's own repo config (dogfooding — every future spec in this repo generates a comprehension artifact, seeding the calibration corpus).

## Out of Scope

- Risk-level-bound enablement (`risk_level: high` auto-enables) — v3 backlog, ROADMAP line item.
- The 40-60-example calibration corpus — the open item that keeps this gate experimental; seeded by artifacts this wiring produces.
- Blinding the comprehension judge from its own threshold — matches the 2a/2b convention; only Gate 1 is blinded today (documented in `lib/gates.md` Blinding Scope).

## Risks

1. **Accuracy-dimension drift without calibration anchors** — the rubric ships ~16 banded examples, below its own 10-15-per-dimension requirement. Mitigation: experimental label, default-off, dogfood artifact collection feeding the corpus.
2. **Latency on large diffs** — cold-read scales with diff size. Mitigation: opt-in flag; future risk-level binding scopes it to where it pays.
3. **Asymmetric failure routing confusion** — re-dispatch-once vs escalate-immediately is novel pipeline behavior. Mitigation: routing logic stated identically in phase reference, gate-check dispatch section, and rubric.
