# Eval: AC7 — The wiring is structurally enforced, not promised

**Observable success (without source code access)**:
A contributor runs the project's structural test suite and sees it pass with the comprehension gate fully asserted. If they then remove any single piece of the gate's integration — wherever it lives — the suite fails and names the site that went missing. The gate cannot silently regress to half-wired.

**Anti-patterns this eval would catch**:
- The gate ships half-wired with the test still green (would fail — the exact failure mode that stranded Gate 2c for 45 days)
- Leftover guards that forbid referencing the gate (would fail — a wired gate cannot also be forbidden)

**Would fail if**:
- The structural suite passes after deleting any single integration point of the gate
- The suite still treats comprehension as an unwired exception
