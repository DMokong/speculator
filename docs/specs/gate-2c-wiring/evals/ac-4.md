# Eval: AC4 — Evidence is mechanically verifiable

**Observable success (without source code access)**:
After a comprehension run, a developer opens `gate-2c-comprehension.yml` and finds: four dimension scores, the weights used, the per-dimension minimum, threshold 7.0, a result, and flags. Multiplying the recorded scores by the recorded weights reproduces the recorded overall (to one decimal, half-up). `scripts/verify-evidence.sh` accepts the file.

**Anti-patterns this eval would catch**:
- An overall score that doesn't match its own recorded components (would fail — arithmetic must be recomputable)
- Evidence with scores but no weights (would fail — recomputation impossible, the v2.9.0 scorecard convention requires recorded weights)

**Would fail if**:
- The file omits weights or per_dimension_minimum
- Recomputed overall differs from recorded overall beyond rounding tolerance
- The schema differs from the rubric's canonical Evidence Output Format
