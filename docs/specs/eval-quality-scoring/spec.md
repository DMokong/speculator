---
id: SPEC-001
status: approved
author: Dustin Cheng
date: 2026-04-15
epic: speculator-icu
worktree: eval-quality-scoring
risk_level: medium
impact_rating: none
amends: []
---

## Problem Statement

Speculator catches spec quality problems (Gate 1) and verifies tests pass (Gate 2), but never asks: *are the tests good instruments of the spec?* A test suite can achieve 100% pass rate while systematically testing implementation artifacts rather than specified behaviors. When the implementation changes in a spec-compliant way, these tests break for the wrong reason — or worse, they pass when the behavior is wrong.

Gate 2b closes this gap with an opt-in LLM-as-judge gate that scores test suites as faithful instruments of their spec's acceptance criteria. The abstraction layer is **AC-to-behavior fidelity** — positioning the spec as the oracle and asking whether each test faithfully detects deviation from it, rather than correlating with implementation internals today.

## Requirements

- [ ] R1: A 7-dimension rubric (`rubrics/eval-quality.md`) scores test suites on AC coverage, behavioral specificity, intent fidelity, sensitivity, scenario completeness, assertion density, and test independence
- [ ] R2: An `eval-quality-scorer` agent reads the spec + test files, scores against the rubric, and emits a YAML evidence artifact (`evidence/gate-2b-eval-quality.yml`)
- [ ] R3: The `gate-check` skill recognizes `gate=eval-quality` as a valid gate and knows how to collect evidence for it
- [ ] R4: The `sdlc-run` pipeline detects and runs Gate 2b between Gate 2 and Gate 3 when enabled
- [ ] R5: Gate 2b is opt-in via `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md` (default: false)
- [ ] R6: The spec template includes an AC traceability note to improve Dimension 1 (AC Coverage) scores

## Acceptance Criteria

- [ ] AC1: Given `rubrics/eval-quality.md` exists, when the eval-quality-scorer agent reads it alongside a spec and test files, then it produces a `gate-2b-eval-quality.yml` artifact with all 7 dimension scores, an overall weighted score, a pass/fail result against the 6.5 threshold, and blocking/recommended/advisory flags
- [ ] AC2: Given a test suite that tests only HTTP status codes (not behavioral outcomes), when Gate 2b runs, then the overall score is < 6.5 and blocking or recommended flags appear citing behavioral specificity or intent fidelity concerns
- [ ] AC3: Given a test suite with comprehensive behavioral assertions mapped to each AC, when Gate 2b runs, then the overall score is >= 6.5 and all 7 dimensions score >= 4
- [ ] AC4: Given `gates.eval-quality.enabled: false` (default), when `sdlc-run` executes the pipeline, then Gate 2b is skipped and the pipeline proceeds directly from Gate 2 to Gate 3
- [ ] AC5: Given `gates.eval-quality.enabled: true`, when `sdlc-run` detects Gate 2 evidence but no `gate-2b-eval-quality.yml`, then it dispatches the eval-quality-scorer agent before proceeding to Gate 3
- [ ] AC6: Given the gate-check skill is invoked with `gate=eval-quality`, when `gate-2b-eval-quality.yml` exists with `result: pass`, then the skill reports the gate as passing; when the file is absent, it dispatches the scorer agent
- [ ] AC7: Given `templates/spec-template.md`, when a user creates a new spec, then the Acceptance Criteria section includes a comment explaining how AC IDs map to test names and why this improves Gate 2b Dimension 1 scores

## Intent & Anti-Patterns

Gate 2b's purpose is to make the pipeline's test verification trustworthy, not just present. A test suite that passes Gate 2 mechanically but tests implementation artifacts instead of specified behaviors is producing *false confidence* — users believe their code is validated when it isn't.

The deeper intent: when a spec changes, tests should break because the behavior changed — not because the implementation changed in a spec-compliant way. AC-to-behavior fidelity is the right abstraction because it's framework-agnostic (works for Playwright, pytest, shell scripts) and positions the spec as the ground truth.

### Anti-Patterns

- **Scoring implementation correctness:** Gate 2b evaluates whether the test is a good detection instrument, not whether the implementation is correct. A test can score 10/10 on Gate 2b and still fail because the implementation is broken — that's correct behavior.
- **Running Gate 2b on every spec by default:** This gate is opt-in. Forcing it on all projects would create unnecessary friction. Teams should enable it when they want eval quality enforcement.
- **Requiring perfect scores:** The threshold is 6.5 (lower than Gate 1's 7.0) because eval quality is genuinely harder to achieve on first pass. Don't inflate the threshold.
- **Stubbing calibration examples:** The rubric's calibration examples are the primary build cost — they determine whether the LLM judge is reliable. Do not replace them with placeholder text.

### Critical User Journeys

- A developer runs `/sdlc run` on a spec with subpar tests — Gate 2b catches low behavioral specificity before Gate 3 code review, giving specific, actionable flags rather than a vague "tests aren't good enough"
- A developer enables `gates.eval-quality.enabled: true` in a project config and all subsequent specs flow through Gate 2b transparently
- The autonomous `sdlc-run` pipeline detects Gate 2b is enabled and missing, runs the scorer, and either continues (pass) or presents remediation guidance (fail)

## Constraints

- The rubric must include scored calibration examples (15–20 per dimension) — this is the critical path for LLM judge reliability
- Assertions-only extraction from Playwright tests is non-trivial (actions interleaved with assertions). MVP passes full test code with "focus on assertions" instruction — acceptable tradeoff for Phase 1
- Gate 2b is Phase 1 only. Gate 2c (Comprehension Gate) is explicitly out of scope for this spec.

## Out of Scope

- Gate 2c (Comprehension Gate) — Phase 2, separate spec
- Automated test improvement (Gate 2b reports issues; fixing them is the developer's job)
- Mutation testing integration (Stryker/Pitest) — future enhancement
- Assertions-only extraction from test files — MVP passes full test code

## Impact Declaration

No `SYSTEM-SPEC.md` exists yet in this project. No existing behaviors are amended. `impact_rating: none`, `amends: []`.
