# Eval: AC3 — Cold-read dispatch produces the evidence

**Observable success (without source code access)**:
A developer runs `/sdlc gate comprehension` on a spec with no 2c evidence. A scoring agent is dispatched that receives only the spec file and the implementation diff — and afterwards the gate's evidence file exists with per-AC explanations and scores. The developer can verify the agent was fresh: nothing from their implementation conversation appears in the artifact, and every claim in the explanation is checkable against the diff itself.

**Anti-patterns this eval would catch**:
- The implementing session grades its own work (would fail — the artifact would echo implementation-session reasoning it could not have derived from spec + diff alone)
- The dispatch passes the implementer's plan or session notes (would fail — cold-read contract violated)
- Fluent-but-unverifiable explanation (would fail — an artifact whose claims cannot be traced to specific changes in the diff is decoration, not comprehension)

**Would fail if**:
- gate-check reports comprehension as an unknown gate
- The evidence file is written without any agent dispatch (hallucinated scoring)
- The artifact references decisions only visible in the implementing session, not in the diff
- The artifact's explanations cannot be cross-checked against the diff by a third party
