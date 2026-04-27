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
  self_improvement_trigger: 8.0
  full_auto_threshold: 7.8
  guided_threshold: 7.0
  max_spec_retries: 3
  intent_verifiability_min: 8
---

# SDLC Plugin — Speculator Project Configuration

Speculator dog-fooding its own quality pipeline.
