---
spec_dir: docs/specs
evidence_dir: evidence

gates:
  # --- Required gates (always on) ---
  spec-quality:
    threshold: 7.0
    required: true
  code-quality:
    tests_required: true
    coverage_threshold: 80
    ac_traceability: false
    build_required: false
    lint_required: false
    type_check_required: false
    required: true
  review:
    required: true
  evidence-package:
    required: true

  # --- Opt-in gates (uncomment to enable) ---
  # eval-intent:                # Gate 2a: pre-implementation intent capture (v2.8.0)
  #   enabled: true
  #   threshold: 6.5
  #   per_dimension_minimum: 4
  #   max_eval_retries: 3
  # eval-quality:               # Gate 2b: post-implementation eval-quality scoring (v2.7.0)
  #   enabled: true
  #   threshold: 6.5
  #   per_dimension_minimum: 4
  # comprehension:              # Gate 2c: experimental — anti-dark-code comprehension gate
  #   enabled: true
  #   threshold: 7.0
  #   per_dimension_minimum: 5

# Spec quality scoring (Gate 1) — weights must sum to 1.0
scoring:
  weights:
    completeness: 0.20
    clarity: 0.20
    testability: 0.20
    intent_verifiability: 0.15
    feasibility: 0.15
    scope: 0.10
  dimension_minimum: 5     # any dimension below this fails the gate

# Close behavior
close:
  strategy: merge          # "merge" (direct merge to main) or "pr" (open a pull request)

# /spec run autonomy thresholds
# Sized to measured scorer noise: test-retest sigma is 0.18-0.24 on polished
# specs (benchmarks/results/test-retest-sigma.yml), so full-auto sits well
# clear of the guided threshold rather than within judge noise of it.
run:
  self_improvement_trigger: 8.5   # score below this triggers refinement loop
  full_auto_threshold: 8.3        # minimum score for autonomous execution
  guided_threshold: 7.0           # minimum score for guided mode (below = stop)
  max_spec_retries: 3
  max_code_retries: 3
  intent_verifiability_min: 8     # hard gate for intent dimension
  risk_signals:
    - delete
    - production
    - deploy
    - payment
---

# SDLC Plugin — Project Configuration

This file configures the Speculator plugin for this project. Edit the YAML
frontmatter above to adjust thresholds, weights, and which gates run.

## Enabling opt-in gates

Three gates ship disabled by default and are turned on by uncommenting their
blocks under `gates:`:

- **Gate 2a — Eval Intent** (`eval-intent`): pre-implementation intent
  capture. For each AC, you author an eval in `docs/specs/{feature}/evals/`
  describing the user-observable outcome; the `eval-intent-scorer` agent
  scores the eval set on 4 dimensions before implementation begins.
- **Gate 2b — Eval Quality** (`eval-quality`): post-implementation
  test-suite quality scoring. The `eval-quality-scorer` agent scores
  whether tests are good detection instruments for the spec's ACs across
  7 dimensions, between Gate 2 and Gate 3.
- **Gate 2c — Comprehension** (`comprehension`, experimental):
  anti-dark-code comprehension gate. The `comprehension-scorer` agent
  cold-reads the spec + diff, generates a per-AC explanation artifact, and
  scores it on 4 dimensions, between Gate 2b and Gate 3.

You can enable any of them independently. See the project README's
Configuration section for details.
