# Eval: AC4 — Silence about domain halts, never guesses

**Observable success (without source code access)**:
A spec with no domain marker reaches close in a split project. In an unattended pipeline run, compaction stops and the escalation message lists the domains that exist — every system-spec file is untouched. In an interactive session, the author is asked to pick or create a domain before anything is written.

**Anti-patterns this eval would catch**:
- The tooling guesses a domain from spec content (would fail — a behavior filed in the wrong domain corrupts the provenance map silently; a halt is recoverable, a wrong guess is not)
- Autonomous mode writes to some default/misc domain (would fail — same corruption, different costume)

**Would fail if**:
- Any file is modified when the domain is undeclared in autonomous mode
- The escalation omits the list of existing domains (the human needs them to answer)
- Interactive mode proceeds without an explicit author choice
