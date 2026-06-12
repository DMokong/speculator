# Eval: AC7 — Single-file projects can't tell anything changed

**Observable success (without source code access)**:
A maintainer of a single-file project (like Speculator's own repo) upgrades the plugin and runs a full spec lifecycle — score, evals, close, compaction. Every SYSTEM-SPEC interaction looks exactly like the previous version: behaviors fold into the one file, no index appears, no domain questions are asked, no migration is suggested as required.

**Anti-patterns this eval would catch**:
- Forced or nagging migration (would fail — the split is an opt-in scaling tool, not a new default)
- A domain prompt appearing in a project that has no domains (would fail — single-file mode must not grow new ceremony)

**Would fail if**:
- Any new file or prompt appears in a single-file project's close flow
- The single file's fold-in format changes in any way
