# Spec Quality Rubric

You are evaluating a software specification for quality. Score each dimension 1-10 using the criteria below.

## Completeness (1-10)

Does the spec contain all required sections with enough substance to guide implementation?

- **1-3 (Poor):** Missing multiple required sections (Problem Statement, Requirements, Acceptance Criteria). What's present is vague stubs.
- **4-6 (Adequate):** All required sections present but some are thin — fewer than 2 sentences, or use placeholder language ("TBD", "TODO").
- **7-8 (Good):** All sections are substantive. Requirements are specific and enumerated. Acceptance criteria cover the main scenarios. Constraints and out-of-scope are defined.
- **9-10 (Excellent):** Comprehensive. Covers edge cases, error scenarios, and boundary conditions. Out-of-scope explicitly prevents scope creep. Requirements are traceable to acceptance criteria.

## Clarity (1-10)

Could two engineers read this spec independently and build the same thing?

- **1-3 (Poor):** Rampant ambiguity. Weasel words ("should probably", "might need to"). Vague quantities ("fast", "secure", "scalable"). Multiple valid interpretations for core requirements.
- **4-6 (Adequate):** Mostly clear but contains some vague terms. A careful reader could infer intent, but shouldn't have to. Some requirements need follow-up questions.
- **7-8 (Good):** Specific and unambiguous. Concrete values instead of vague ranges. Clear behavioral descriptions. Scope boundaries are explicit.
- **9-10 (Excellent):** Crystal clear. Every requirement has one obvious interpretation. Terminology is consistent. Technical constraints are precise (exact versions, limits, formats).

## Testability (1-10)

Can every acceptance criterion be objectively verified by a human or automated test?

- **1-3 (Poor):** Acceptance criteria are subjective ("looks good", "feels responsive", "is user-friendly"). No measurable outcomes.
- **4-6 (Adequate):** Some ACs are testable, others are vague. Mix of objective and subjective criteria. Missing Given/When/Then or equivalent structure.
- **7-8 (Good):** All ACs describe observable, measurable outcomes. Use Given/When/Then or equivalent. Each AC could become a test case.
- **9-10 (Excellent):** ACs are directly translatable to automated tests. Include specific inputs, expected outputs, and error conditions. Cover happy path and edge cases.

## Scoring

Calculate overall score as a weighted average using the weights from the project's `.claude/sdlc.local.md` configuration (default: completeness 0.34, clarity 0.33, testability 0.33).

Round the overall score to one decimal place.

## Flags

After scoring, list any specific observations that would help the spec author improve:
- Sections that are thin or could use more detail
- Ambiguous requirements (quote the specific text)
- Acceptance criteria that can't be objectively tested
- Missing edge cases or error scenarios
- Requirements that overlap or contradict each other

## Gate Decision

- If overall score >= threshold (from project config): `result: pass`
- If overall score < threshold: `result: fail`
