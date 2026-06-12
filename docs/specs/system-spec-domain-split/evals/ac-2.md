# Eval: AC2 — Behaviors land in their domain, the index stays navigation

**Observable success (without source code access)**:
After closing a spec marked for the memory domain in a split project, the maintainer finds the new behavior lines — each with its provenance trail — appended to the memory domain file. Opening the index shows the same navigation content as before: no behavior entries arrived there.

**Anti-patterns this eval would catch**:
- Behavior entries written to the index (would fail — the index is navigation, not storage)
- The same behavior duplicated into a second domain file (would fail — cross-domain behaviors get one owner plus a prose cross-reference, or audits double-count)
- Provenance trails dropped during routing (would fail — every folded behavior keeps its source-spec marker)

**Would fail if**:
- Any behavior line appears in the index after compaction
- A behavior appears verbatim in more than one domain file
- Folded lines lack their originating-spec provenance
