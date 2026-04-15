# System Specification

<!-- This document is automatically maintained by the spec-compactor agent. -->
<!-- Do not edit manually — changes will be overwritten at next compaction. -->
<!-- Each behavior entry includes a [from: SPEC-XXX] provenance trail. -->

## Pipeline Gates

- Gate 2b (Eval Quality Scoring) is an opt-in LLM-as-judge gate that runs between Gate 2 and Gate 3, scoring test suites as faithful instruments of their spec's acceptance criteria. [from: SPEC-001]
- Gate 2b is opt-in via `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`; it is disabled by default. [from: SPEC-001]
- When `gates.eval-quality.enabled: false` (default), the `sdlc-run` pipeline skips Gate 2b and proceeds directly from Gate 2 to Gate 3. [from: SPEC-001]
- When `gates.eval-quality.enabled: true`, the `sdlc-run` pipeline detects Gate 2 evidence and, if no `gate-2b-eval-quality.yml` artifact exists, dispatches the `eval-quality-scorer` agent before proceeding to Gate 3. [from: SPEC-001]

## Eval Quality Scorer

- The `eval-quality-scorer` agent reads the spec and test files, scores the test suite against `rubrics/eval-quality.md`, and emits a YAML evidence artifact at `evidence/gate-2b-eval-quality.yml`. [from: SPEC-001]
- The `gate-2b-eval-quality.yml` artifact contains all 7 dimension scores, an overall weighted score, a pass/fail result against the 6.5 threshold, and blocking/recommended/advisory flags. [from: SPEC-001]
- A test suite that tests only implementation artifacts (e.g., HTTP status codes rather than behavioral outcomes) scores below 6.5 and generates blocking or recommended flags citing behavioral specificity or intent fidelity concerns. [from: SPEC-001]
- A test suite with comprehensive behavioral assertions mapped to each acceptance criterion scores >= 6.5 with all 7 dimensions scoring >= 4. [from: SPEC-001]

## Eval Quality Rubric

- `rubrics/eval-quality.md` defines a 7-dimension rubric scoring test suites on: AC coverage, behavioral specificity, intent fidelity, sensitivity, scenario completeness, assertion density, and test independence. [from: SPEC-001]
- The rubric includes scored calibration examples per dimension (band-based: low-score and high-score examples per dimension) to ensure LLM judge reliability. [from: SPEC-001]
- The pass threshold for Gate 2b is 6.5 (lower than Gate 1's 7.0 threshold, reflecting the genuine difficulty of achieving high eval quality on first pass). [from: SPEC-001]

## Gate Check Skill

- The `gate-check` skill recognizes `gate=eval-quality` as a valid gate identifier and knows how to collect evidence for it. [from: SPEC-001]
- When `gate-check` is invoked with `gate=eval-quality` and `gate-2b-eval-quality.yml` exists with `result: pass`, the skill reports the gate as passing. [from: SPEC-001]
- When `gate-check` is invoked with `gate=eval-quality` and `gate-2b-eval-quality.yml` is absent, the skill dispatches the `eval-quality-scorer` agent. [from: SPEC-001]

## Spec Template

- `templates/spec-template.md` includes a comment in the Acceptance Criteria section explaining how AC IDs map to test names and why this traceability improves Gate 2b Dimension 1 (AC Coverage) scores. [from: SPEC-001]
