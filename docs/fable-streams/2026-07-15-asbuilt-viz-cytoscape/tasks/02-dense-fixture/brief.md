---
task: 02-dense-fixture
parallel_safe: true
testable: true
tier: standard
---

## Goal

Build the synthetic dense-bundle fixture generator for SPEC-004 (R7): a
deterministic temp-sandbox factory reproducing the field failure shape
(sdlc-clients: one 54-source + 42-test `cmd/cli` group, small `internal/*`
groups, one root file — 111 concepts total) for use by the spike (T03) and
the regression tests (T06).

## Done-check

`bun test asbuilt/tests/dense-fixture.test.ts` passes, asserting: 111 total
concepts from `buildViz`, 54 nodes in group `cmd/cli` + 42 in group `tests`
(the CURRENT pre-T04 grouping — with a comment that T06 flips this to 96 in
`cmd/cli` when path-grouping lands), deterministic output (two `buildViz`
calls on the same sandbox → byte-identical html), and generator cleanup.

## File scope

**Working directory contract (amended 2026-07-16 — round 1 violated this):**
ALL work happens in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; before ANY write or commit, `git rev-parse --abbrev-ref HEAD`
must print `asbuilt-viz-cytoscape` — anything else, STOP and escalate. Never
write under the main checkout; only exception is your report at its absolute
stream path.

**Round-2 state:** your round-1 content was correct and has been relocated by
the conductor — commit c743291 on the branch already contains both files
below. Do NOT re-create or re-commit them. Round 2 = run the verification
commands in the worktree, confirm green, and close out in your report.

- `asbuilt/tests/helpers/dense-fixture.ts` (already on branch at c743291)
- `asbuilt/tests/dense-fixture.test.ts` (already on branch at c743291)

## Required content

`dense-fixture.ts` exports `makeDenseSandbox(): string` returning a
`mkdtempSync` target dir containing `docs/asbuilt/` with:

- Shape table: `cmd/cli` 54 sources + 42 co-located tests (resources
  `cmd/cli/fileNNN.go` / `cmd/cli/fileNNN_test.go`, zero-padded indexes),
  `internal/model` 6, `internal/util` 4, `internal/cli` 4, plus root
  `main.go` (groups to `src` under current rules). Test concepts get
  `type: Test` + `test` tag; classification is frontmatter-driven.
- Concept files: OKF frontmatter matching what `viz.ts`'s
  `parseVizFrontmatter` reads (type, title, description, resource, tags,
  enrichment, from, explains, stale) — copy the field conventions from
  `asbuilt/tests/viz.test.ts`'s `writeConcept` helper. Enrichment
  `fully-audited` on a fixed stride (every 3rd concept, `i % 3 === 0`), else
  `none`. Audited concepts get an `# Explanation` section.
- `.graph-manifest.json`: `target_commit: "f1e1d0c"`, one symbol per concept
  (`{id: "<resource>#fnI", file: "<resource>"}`), and a deterministic sparse
  edge web: for source (non-test) concepts where `i % 4 === 1`, an edge
  `{from: "<resource>#fnI", toName: "fn0", resolved: "<dir>/file000.go#fn0"}`.
- NO randomness, NO clock reads anywhere.

The plan (Task T02) contains a complete reference implementation — follow it,
adjusting only if the code doesn't compile or assertions reveal a
miscalculation.

## Inputs

- Plan Task T02 (reference implementation):
  `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md`
- Conventions to mirror: `asbuilt/tests/viz.test.ts` (`writeConcept`,
  `makeSandbox`)
- `asbuilt/src/viz.ts` (`buildViz`, frontmatter parser — read to confirm
  field expectations)

## Verification commands

```bash
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
git rev-parse --abbrev-ref HEAD   # MUST print asbuilt-viz-cytoscape
bun test asbuilt/tests/dense-fixture.test.ts
cd asbuilt && bunx tsc --noEmit && cd ..
```

Then commit on the current branch:
`git add asbuilt/tests/ && git commit -m "test(asbuilt): dense flat-package fixture, field-shape 111 concepts (SPEC-004 T02)"`

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/02-dense-fixture/report.md`
with: concept-count math (how 111 decomposes), enrichment stride outcome
(how many audited), and verification command tails (≤30 lines each).

## Out of scope

- Any change to `asbuilt/src/` — the fixture must exercise TODAY's code as-is.
- The new-grouping assertions (96 in cmd/cli) — T06 flips them; you only
  leave the flip comment.
- `asbuilt/vendor/` and anything cytoscape-related.
