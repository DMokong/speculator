# Escalations — 2026-07-15-asbuilt-viz-cytoscape

## 2026-07-16 · 01-vendor-libs · plan_invalidating_discovery · ruling: amend brief

Finding (implementer round 1, verified by conductor first-hand): 3 of 4
vendored packages publish no minified build; real sizes are cytoscape.min
373,304 B + layout-base 147,958 B + cose-base 118,906 B + cytoscape-fcose
57,239 B ≈ 681 KB vendor total. The brief's ≤620 KB cap is unsatisfiable as
written, and — more importantly — the spec's ≤700 KB *output* budget (a
Constraint, not an AC) is genuinely at risk with the unminified stack.

Ruling (moves: amend the brief; route the size decision to evidence):
1. T01 amended — pin the published files as canonical sources (record original
   URL + sha256), then produce deterministic minified derivatives of the three
   unminified files via `bun build --minify` (record bun version, exact
   command, input/output sha256 in VENDOR.md). Ship the minified derivatives
   iff a global-eval load smoke still registers fcose; otherwise ship the
   originals and say so. Hard size cap removed from T01's done-check — sizes
   are recorded, not capped, at this stage.
2. T03 amended — new finding 6: measure the real dense-bundle viz.html size
   under (a) the vendored fcose stack and (b) built-in `cose` layout with
   cytoscape.min.js alone (zero extra vendor files), alongside the packing
   factors for both. The layout-engine + size decision is made on that
   evidence at the human checkpoint. If neither variant fits ≤700 KB,
   escalate — a spec-budget amendment is Dustin's call, not the stream's.
Fix counters reset (brief amendment).

## 2026-07-16 · 02-dense-fixture · broken_harness · ruling: conductor environment repair + brief amendment

Finding (reviewer round 1, verified first-hand): wave-1 agents executed in
the speculator MAIN checkout, not the declared worktree — T02's commit
d13077a landed on main; T01's vendor files sat untracked on main; the
worktree was untouched. Content quality was independently confirmed fine.

Ruling:
1. Environment repair performed by the conductor (recorded here, not a task
   takeover — no content was authored): cherry-picked d13077a onto the
   `asbuilt-viz-cytoscape` branch as c743291; reset main to d037916 and
   removed the stray copies; moved `asbuilt/vendor/` into the worktree;
   verified `bun test asbuilt/tests/dense-fixture.test.ts` green in the
   worktree (10 pass / 0 fail).
2. All briefs now carry an explicit **Working directory contract** (absolute
   worktree path, mandatory `cd`, `git rev-parse --abbrev-ref HEAD` must
   print `asbuilt-viz-cytoscape` before any write or commit). Root cause:
   briefs relied on "the repo root you are dispatched in" while agents
   inherit the conductor session's cwd.
Fix counters reset (brief amendment + environment repair).

Side note recorded for the Gate-5 report: speculator's local beads was
deliberately retired 2026-06-12 (per .gitignore comment) in favor of the
claudeclaw tracker; the conductor's `bd init --reinit-local` (needed to
unblock epic creation) resurrected a local, fully-gitignored bd store. The
SPEC-004 epic speculator-0d6 lives there; the bd-init file side effects on
main (.gitignore/AGENTS.md/CLAUDE.md/.agents/.codex additions) are left
uncommitted for Dustin to keep or drop.
