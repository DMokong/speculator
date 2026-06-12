# Eval: AC5 — Quality gates read the relevant slice, not the whole corpus

**Observable success (without source code access)**:
In a split project with six domain files, scoring a spec declared for one domain shows the impact check consulting the index plus that one domain file. The Gate 2a conflict check on the same spec reads the same slice. A spec declaring no domain gets the conservative treatment: all domains consulted.

**Anti-patterns this eval would catch**:
- Gates silently checking only the index and missing real conflicts in domain files (would fail — subset means index PLUS relevant domains, never index alone)

**Would fail if**:
- A conflict that exists in the declared domain's file goes undetected
- A domain-declaring spec's gates read every domain file anyway (the subset rule is the scaling point)
- The two gates use different subset rules for the same spec
