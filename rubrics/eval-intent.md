# Eval Intent Rubric

You are evaluating a set of authored evals (intent artifacts) against a spec. Score each dimension 1-10 using the criteria below. Evals are markdown files in `docs/specs/{feature}/evals/` that describe observable user outcomes — they are NOT executable tests.

## Anti-Inflation Guidance

A score of 7 means "good — evals capture intent faithfully." A score of 8 means "strong — evals would survive implementation context loss." Scores of 9-10 should be rare. Most first-draft evals from capable authors should score 5-7. Resist the urge to inflate — implementation-biased evals scoring 8+ are the primary failure mode.

---

## Intent Coverage (1-10)

Do the evals verify the "why" (the user outcome) rather than the "what" (the implementation behavior)?

- **1-3 (Poor):** Evals describe function calls, return values, or internal state. A different valid implementation would fail these evals even though the user experience is correct. Example: "the `score_evals()` function returns a dict with keys intent_coverage and anti_pattern_detection."
- **4-6 (Adequate):** Evals describe behavior but are anchored to specific implementation choices. A user could partially verify them without source code, but some statements require internal knowledge.
- **7-8 (Good):** Evals describe observable user outcomes. A tester without source code access could verify each eval. References to implementation details are absent.
- **9-10 (Excellent):** Evals are stated entirely in user-visible terms. Each eval explicitly distinguishes the observable outcome from how it might be achieved. Would remain valid across any compliant implementation.

### Calibration Examples

**Score 2-3:**
```
Eval for AC2: The eval_intent_scorer() function in agents/eval-intent-scorer/AGENT.md is invoked with spec_path and evals_dir arguments and returns a dict containing overall_score, dimension_scores, and flags keys.
```
(References internal function name, file path, and specific return type — cannot be verified without source code.)

**Score 5-6:**
```
Eval for AC2: When scoring runs, a YAML file appears in the evidence directory. It contains an overall score and per-dimension scores for the 4 dimensions.
```
(Observable outcome, but doesn't state what a user would *do* or *see* — reads like a mechanical check, not an intent statement.)

**Score 7-8:**
```
Eval for AC2: A developer who has just authored evals and triggered scoring can read the resulting evidence file and understand: how their evals scored overall, where they were weakest (per-dimension), and what specific issues to address. They don't need to read source code to interpret the scorecard.
```

**Score 9-10:**
```
Eval for AC2: After scoring, a developer reviewing the evidence file can answer these questions without any other context: (1) Did my evals pass the quality threshold? (2) Which of the 4 dimensions dragged my score down? (3) What specifically do I need to improve in my evals to pass? The scorecard tells this story without requiring the developer to look at the rubric or the implementation.
```

---

## Anti-Pattern Detection (1-10)

Do the evals explicitly check that known failure modes from the spec's anti-patterns section are caught?

- **1-3 (Poor):** Evals describe the happy path only. None of the spec's named anti-patterns appear in the evals, even by implication.
- **4-6 (Adequate):** Some evals reference failure modes, but not the specific anti-patterns named in the spec. A system that exhibits a documented anti-pattern could pass these evals.
- **7-8 (Good):** At least half of the spec's named anti-patterns are explicitly covered by evals that would fail if that anti-pattern were implemented.
- **9-10 (Excellent):** Every named anti-pattern in the spec has at least one eval that would specifically fail if that anti-pattern were exhibited. The "would fail if" section of each eval names the anti-pattern.

### Calibration Examples

**Score 2-3:**
```
Spec anti-patterns: (1) Implementation-biased evals, (2) Retrospective eval authoring, (3) SYSTEM-SPEC.md blindness.

Evals authored:
- AC1 eval: "The session starts and produces eval files"
- AC4 eval: "SYSTEM-SPEC.md is checked"
```
(Neither eval names anti-patterns or would fail if an anti-pattern were implemented.)

**Score 5-6:**
```
AC1 eval includes: "Would fail if the session accepts 'function F returns X' as a valid eval"
```
(Covers one instance of the implementation-bias anti-pattern, but doesn't reference the anti-pattern by name or cover retrospective authoring.)

**Score 7-8:**
```
AC1 eval: "Would fail if: session accepts implementation-biased evals (anti-pattern 1: implementation-biased evals)"
AC6 eval: "Would fail if: eval authoring is triggered after implementation has started (anti-pattern 2: retrospective eval authoring)"
```

**Score 9-10:**
```
All 5 anti-patterns from the spec are named in "Would fail if" sections of specific evals, with the anti-pattern label cited. Each eval would specifically fail for that anti-pattern, not just for any general failure.
```

---

## Journey Completeness (1-10)

Do the evals cover the critical user journeys from the spec end-to-end?

- **1-3 (Poor):** Evals cover isolated behaviors. No eval traces a complete user action from trigger to observable outcome. Critical journeys from the spec are unrepresented.
- **4-6 (Adequate):** Some journeys are partially covered. The start and end states are addressed, but transitions or edge cases within the journey are missing.
- **7-8 (Good):** Each critical user journey named in the spec has at least one eval covering the full path from trigger to outcome. Edge cases within journeys are covered for high-risk paths.
- **9-10 (Excellent):** All critical user journeys are fully covered. Each journey has a primary eval (happy path) and at least one edge-case eval. Journeys are traced from the initiating action through to the final observable state.

### Calibration Examples

**Score 2-3:**
```
Spec critical journeys: "Author a spec, gate on evals before touching code"
Evals: Cover AC1 (session starts), AC2 (scorer returns scorecard). No eval covers the full journey from spec approval through eval authoring to implementation gate.
```

**Score 5-6:**
```
AC1 eval covers session initiation. AC6 eval covers full-auto mode. But no eval covers the journey where evals fail, improvement suggestions appear, author revises, and pipeline then proceeds — the most common non-trivial journey.
```

**Score 7-8:**
```
AC3 eval covers the feedback loop journey end-to-end: low score → suggestions → revision → re-score → threshold met → proceed. AC4 eval covers the SYSTEM-SPEC conflict journey: authoring begins → conflict surfaced → three resolution paths available.
```

**Score 9-10:**
```
All 4 named critical journeys from the spec are covered by evals tracing from the initiating action to the final observable state. The "contested behavior" journey (eval catches letter-vs-spirit violation) is specifically addressed with a "would fail if" that describes a compliant-but-wrong implementation.
```

---

## Implementation Independence (1-10)

Could these evals pass with any valid implementation, or are they coupled to one specific approach?

- **1-3 (Poor):** Evals name specific files, functions, config keys, or data structures. A valid alternative implementation would fail these evals even though it correctly delivers the user outcome.
- **4-6 (Adequate):** Evals are mostly behavioral but make implicit assumptions about implementation details (e.g., "the YAML file contains a key named X" when X is an implementation choice, not a user-visible requirement).
- **7-8 (Good):** Evals describe user-observable outcomes without naming implementation internals. A team using a different architecture to implement the same behavior would still pass these evals.
- **9-10 (Excellent):** Evals are explicitly stated in terms of user-visible behavior. Implementation details are absent. The author has actively verified that each statement could remain true across multiple valid implementations.

### Calibration Examples

**Score 2-3:**
```
Eval: "The gate-2a-eval-intent.yml file in the evidence/ directory contains an overall field and a dimensions field with four sub-keys: intent_coverage, anti_pattern_detection, journey_completeness, implementation_independence."
```
(The specific YAML field names and file path are implementation choices — a valid alternative could use different field names.)

**Score 5-6:**
```
Eval: "A YAML evidence file appears in the evidence directory containing overall score, per-dimension breakdown, and flags."
```
(Less coupled, but "YAML" and "evidence directory" are still implementation-specific choices.)

**Score 7-8:**
```
Eval: "A developer can read the scoring output and understand: their overall result, which dimension needs improvement, and specific actions to take — without reading any source code or documentation."
```

**Score 9-10:**
```
Eval: "A developer reviewing the scoring output can answer the three key questions (passed?, which dimension was weakest?, what to fix?) without consulting source code, rubric documentation, or any other artifact. This remains true regardless of whether the output is YAML, JSON, plain text, or a formatted terminal report."
```

---

## Scoring

### Default Weights

| Dimension                  | Weight |
|---------------------------|--------|
| Intent Coverage            | 0.30   |
| Anti-Pattern Detection     | 0.25   |
| Journey Completeness       | 0.25   |
| Implementation Independence| 0.20   |

Round the overall score to one decimal place.

### Per-Dimension Minimum

Each dimension must score >= 4. A dimension scoring below 4 forces a `fail` regardless of overall average.

The per-dimension minimum defaults to 4 but can be overridden in `.claude/sdlc.local.md` via `gates.eval-intent.per_dimension_minimum`.

---

## Flags

### Blocking
Issues that must be fixed before the eval authoring phase can pass.
- Any eval that names a specific function, file, or internal data structure (score ≤ 3 in implementation independence)
- Missing coverage for a named anti-pattern from the spec's anti-patterns section (when anti-pattern section is non-empty)
- No evals authored for a spec with 3+ ACs

### Recommended
Issues that should be addressed but don't block.
- Evals that cover happy path only with no "would fail if" statement
- A critical user journey from the spec with no corresponding eval
- Score below 6 in any single dimension

### Advisory
Nice-to-have improvements.
- Evals that could be more specific about the observable state (e.g., "user sees output" → "user sees output within 5 seconds")
- Opportunities to combine overlapping evals for clarity

---

## Gate Decision

The gate passes only when all three conditions are met:
1. Overall score >= threshold (from `gates.eval-intent.threshold` in `sdlc.local.md`, default 6.5)
2. Every dimension >= per-dimension minimum (default 4)
3. No blocking flags

If any condition fails: `result: fail`
If all pass: `result: pass`
