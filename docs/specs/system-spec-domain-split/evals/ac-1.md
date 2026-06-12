# Eval: AC1 — Layout detection is automatic and consistent

**Observable success (without source code access)**:
A maintainer of a split-layout project (index + per-domain files) and a maintainer of a single-file project both run any SYSTEM-SPEC-touching command. Neither configures anything: the split project's tooling routes and reads per-domain; the single-file project's tooling behaves exactly as before. Both get the right mode every time, from every consumer (compactor, scorer, eval check, compact skill).

**Anti-patterns this eval would catch**:
- One consumer detects split while another treats the same project as single-file (would fail — detection must be defined once and shared)
- A layout config knob the user must set (would fail — detection is from the files themselves)

**Would fail if**:
- Any two SYSTEM-SPEC consumers disagree about a project's layout
- A split project is detected only when BOTH markers are present (either marker suffices)
- An ambiguous project errors instead of falling back to single-file mode
