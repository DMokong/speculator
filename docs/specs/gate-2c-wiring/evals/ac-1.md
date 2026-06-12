# Eval: AC1 — Enabled gate enters Phase 3b at the right pipeline position

**Observable success (without source code access)**:
A developer with the comprehension gate enabled who has just passed (or disabled) eval quality runs `/sdlc run` and sees the pipeline announce a comprehension phase — after eval quality, before code review. The phase produces the gate's evidence file before any review output appears, and on a pass, the subsequent review's output shows the reviewer started from the comprehension artifact (the review references the explanation rather than re-deriving what the code does from scratch).

**Anti-patterns this eval would catch**:
- Comprehension runs after review instead of before it (would fail — review must receive the artifact as preamble)
- The gate runs even though its evidence already exists (would fail — position detection must respect existing evidence on resume)
- Enabling the flag errors out or warns "not wired" (would fail — the stub behavior must be gone)
- The artifact is produced but the reviewer never consumes it (would fail — a preamble nobody reads is dark documentation; the pass-path value is the hand-off)

**Would fail if**:
- `/sdlc run` jumps from eval quality straight to review with the flag enabled
- The comprehension phase runs before Gate 2/2b instead of after
- Resume re-runs comprehension when passing evidence already exists
- A passing run's review output shows no trace of the comprehension artifact
