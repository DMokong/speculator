# Eval: AC1 — Enabled gate enters Phase 3b at the right pipeline position

**Observable success (without source code access)**:
A developer with `gates.comprehension.enabled: true` who has just passed (or disabled) eval quality runs `/sdlc run` and sees the pipeline announce a comprehension phase — after eval quality, before code review. The phase produces a new evidence file `gate-2c-comprehension.yml` in the spec's evidence directory before any review output appears.

**Anti-patterns this eval would catch**:
- Comprehension runs after review instead of before it (would fail — review must receive the artifact as preamble)
- The gate runs even though gate-2c evidence already exists (would fail — position detection must respect existing evidence on resume)
- Enabling the flag errors out or warns "not wired" (would fail — the v2.9.0 stub behavior must be gone)

**Would fail if**:
- `/sdlc run` jumps from eval quality straight to review with the flag enabled
- The comprehension phase runs before Gate 2/2b instead of after
- Resume re-runs comprehension when passing evidence already exists
