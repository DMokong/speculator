# Eval: AC8 — A new user can discover and enable the gate from the README alone

**Observable success (without source code access)**:
A developer reading only the README learns the pipeline has 4 required + 3 opt-in gates, sees Gate 2c in the pipeline diagram and gate table, finds an enablement snippet (`gates.comprehension.enabled: true`), and sees it clearly labeled experimental with the cold-read/anti-dark-code rationale in one paragraph.

**Anti-patterns this eval would catch**:
- Docs still describing 2c as "designed, not yet built" (would fail — the v2.8.x framing must be gone)
- The gate documented as production-ready without the experimental caveat (would fail — calibration corpus is still open)

**Would fail if**:
- README pipeline description still says "2 opt-in"
- No enablement example exists outside skill internals
- The experimental label or rationale is missing
