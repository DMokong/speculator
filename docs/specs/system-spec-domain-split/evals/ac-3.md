# Eval: AC3 — New domains are born complete

**Observable success (without source code access)**:
A maintainer closes the project's first spec for a brand-new domain. Afterwards the new domain file exists with the folded behaviors, AND the index's domain table lists the new domain with a row pointing at the file — in one compaction, with no follow-up step.

**Anti-patterns this eval would catch**:
- Domain file created but the index never learns about it (would fail — index drift; future readers can't navigate to the new domain)

**Would fail if**:
- The new domain file exists but the index's table has no row for it
- The author must hand-edit the index after compaction
