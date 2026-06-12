---
spec_dir: docs/specs
evidence_dir: evidence
close:
  strategy: pr
gates:
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
  eval-intent:
    enabled: true
    threshold: 6.5
    max_eval_retries: 3
    per_dimension_minimum: 4
  comprehension:
    enabled: true   # experimental — dogfooding the anti-dark-code gate; artifacts seed the calibration corpus
    threshold: 7.0
    per_dimension_minimum: 5
  review:
    required: true
  evidence-package:
    required: true
scoring:
  weights:
    completeness: 0.20
    clarity: 0.20
    testability: 0.20
    intent_verifiability: 0.15
    feasibility: 0.15
    scope: 0.10
  dimension_minimum: 5
run:
  self_improvement_trigger: 8.5
  full_auto_threshold: 8.3   # raised from 7.8 on 2026-06-12: measured test-retest sigma is 0.18-0.24 on polished specs (benchmarks/results/test-retest-sigma.yml) — the old 0.2 gap above guided was within scorer noise
  guided_threshold: 7.0
  max_spec_retries: 3
  intent_verifiability_min: 8
---

# SDLC Plugin — Speculator Project Configuration

Speculator dog-fooding its own quality pipeline.
