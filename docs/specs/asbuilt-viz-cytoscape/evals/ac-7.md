# Eval AC7 — same command, same contract, real bundle still builds

Observable success: An operator runs the build exactly as they do today — same
command shape, pointing at a target repo, an output path, and an explicit
date — and gets a working artifact. The date shown in the artifact is the one
they passed, never the wall-clock date of the machine. Pointing the build at
claudeclaw's real 67-concept bundle produces a working viz without errors.

Anti-patterns this catches: contract drift hiding inside a rewrite — the
engine swap must be invisible to every script and workflow that invokes the
builder today.

Would fail if:
- Existing invocations break (a flag renamed, removed, or newly required).
- Building the same bundle on different days without changing inputs yields
  different dates in the artifact (clock leaked into the build).
- The real, existing bundle fails to build or renders broken.
- The rebuilt claudeclaw viz is less legible than today's: its five directory
  clusters and their labels must remain as readable at default zoom as in the
  current renderer (journey: "at least as legible as today").
