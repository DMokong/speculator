# Eval: AC4 — Evidence is auditable by arithmetic, not trust

**Observable success (without source code access)**:
After a comprehension run, an auditor who opens the gate's evidence file can reproduce its bottom-line score using only what the file itself records — the per-dimension scores, the weighting that combined them, and the bar each dimension had to clear. No access to configuration, source, or the scoring session is needed to confirm the arithmetic, and the project's mechanical evidence verifier accepts the file.

**Anti-patterns this eval would catch**:
- A bottom-line score that doesn't match its own recorded components (would fail — arithmetic must be reproducible by a third party)
- Evidence recording scores but not how they were combined (would fail — an unverifiable overall is an assertion, not evidence)

**Would fail if**:
- Reproducing the overall from the file's own recorded components fails beyond rounding tolerance
- The file requires outside information (config, session logs) to audit
- The mechanical verifier rejects a freshly produced comprehension evidence file
