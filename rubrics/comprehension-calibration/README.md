# Gate 2c Calibration Corpus

47 band-verified calibration examples for the comprehension gate's LLM-as-judge, fulfilling
the rubric's own Calibration Set Requirements (rubrics/comprehension.md): ~12 per dimension
across all four scoring bands, including 4 plausible-but-wrong examples for Accuracy and
letter-vs-spirit cases for Spec Fidelity.

## What this is for

The corpus exists to counter two judge failure modes: **charitable drift** (rewarding fluent
prose regardless of substance) and **severity collapse** (everything lands 7-8). It is NOT
loaded into the judge's prompt wholesale — the rubric keeps its small set of inline anchors.
Uses:

1. **Judge calibration runs** — score corpus excerpts with the comprehension-scorer and
   measure divergence from the verified bands (the spec-bench `calibrate` pattern: divergence
   > 1 point per dimension flags `needs_tuning`).
2. **Anchor rotation** — when an inline rubric anchor underperforms, promote a corpus example.
3. **Regression checks after rubric edits** — re-run the corpus; band agreement should not drop.

## Provenance

Generated 2026-06-12 from the gate's two real artifacts (SPEC-002, SPEC-003 — the gate's
first live runs) plus domain-varied synthetic scenarios (auth, data pipelines, UI, feature
flags, billing). Every example was adversarially band-verified by a blind judge that assigned
its own band before seeing the proposed one; 2 of 49 generated examples were rejected as
wrong-band and excluded. The highest-value class — explanations that read confidently but
contradict the diff — is deliberately over-represented, per the rubric's requirement.

| Dimension | Examples | 1-3 | 4-6 | 7-8 | 9-10 |
|---|---|---|---|---|---|
| accuracy | 12 | 4 | 4 | 3 | 1 |
| spec_fidelity | 12 | 4 | 4 | 3 | 1 |
| ac_coverage | 12 | 3 | 5 | 2 | 2 |
| scope_containment | 11 | 3 | 2 | 3 | 3 |
