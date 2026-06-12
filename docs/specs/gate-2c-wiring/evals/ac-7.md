# Eval: AC7 — The wiring is structurally enforced, not promised

**Observable success (without source code access)**:
A contributor runs `bash tests/test-gate-wiring.sh` and sees the comprehension gate asserted across every touchpoint (registry row, rubric, agent, gate-check, status, doctor template, evidence-package, position detection) with the suite green. Deleting any single comprehension touchpoint makes the suite fail and name the missing site.

**Anti-patterns this eval would catch**:
- The gate ships half-wired with the test still green (would fail — the exact failure mode that stranded Gate 2c for 45 days)
- Negative guards still forbidding comprehension references (would fail — the guards must flip to positive assertions)

**Would fail if**:
- test-gate-wiring.sh passes with a comprehension touchpoint removed
- The comprehension row is still exempted from Layer-A assertions
