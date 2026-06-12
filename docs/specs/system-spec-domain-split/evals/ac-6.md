# Eval: AC6 — Bootstrap rebuilds the split world faithfully

**Observable success (without source code access)**:
A maintainer of a split project deletes their system spec files and reruns the full-rebuild compaction. The result is the split layout again — index with the domain table, per-domain files, every behavior present with its provenance — not one merged mega-file.

**Anti-patterns this eval would catch**:
- Bootstrap flattening a split project back to single-file (would fail — regeneration must respect the project's layout)
- Behaviors lost or provenance stripped in the rebuild (would fail — the compactor's never-drop rule applies to rebuilds too)

**Would fail if**:
- `--all` on a split project emits a single file
- Any previously recorded behavior or provenance marker is missing after rebuild
