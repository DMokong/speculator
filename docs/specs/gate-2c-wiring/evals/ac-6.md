# Eval: AC6 — Close flow surfaces the gate it verified

**Observable success (without source code access)**:
A developer with comprehension enabled and passing evidence runs `/sdlc close`. The Gate 4 summary records the comprehension result, and the PR description's evidence table contains a Gate 2c row alongside Gates 1-4 (and 2a/2b if enabled). Verified evidence is never silently dropped at merge time.

**Anti-patterns this eval would catch**:
- Gate 4 verifies 2c but the PR body omits it (would fail — the v2.9.0 asymmetry this wiring removes)
- The PR table shows a Gate 2c row for projects with the gate disabled (would fail — disabled gates are omitted from delivery surfaces)

**Would fail if**:
- gate-4-summary.yml lacks a comprehension entry when the gate is enabled
- The PR evidence table lacks the Gate 2c row when enabled-and-passing
