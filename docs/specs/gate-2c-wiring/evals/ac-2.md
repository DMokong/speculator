# Eval: AC2 — Disabled gate is invisible

**Observable success (without source code access)**:
A developer who has NOT enabled comprehension runs the full pipeline end-to-end and never sees a comprehension phase, is never asked for gate-2c evidence, and `/sdlc close` completes with Gate 4 recording comprehension as `n/a`. Nothing about their experience changes from v2.9.0.

**Anti-patterns this eval would catch**:
- Gate 4 fails a spec because gate-2c-comprehension.yml is missing while the flag is off (would fail — disabled means not required anywhere)
- sdlc-status shows a confusing pending Gate 2c row for projects that never enabled it (would fail — absent config block means no row)

**Would fail if**:
- Any pipeline surface (run, status, gate-check, close) demands 2c evidence with the flag off or absent
- The default doctor template ships with the gate enabled
