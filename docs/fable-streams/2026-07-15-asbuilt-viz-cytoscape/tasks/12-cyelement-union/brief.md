---
parallel_safe: false
testable: false
tier: standard
---

# 12-cyelement-union — CyElement as a three-arm discriminated union

## Goal

Fix PR #2 review finding I4 (Important): `CyElement` in `asbuilt/src/viz.ts` (~line 133) is a single interface with every distinguishing field optional, while its own doc comment describes three distinct kinds (compound-parent, child node, edge) and the template and tests branch on field presence (`parent !== undefined`, `source !== undefined`). Model it as a three-arm discriminated union so those branchings become compiler-checked, and make `classes` required on child nodes (every child gets a state class). Zero runtime cost — this is a type-level change; the emitted elements JSON must be byte-identical.

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/
```

(strict typecheck green with the union in place; full 362+ suite green — the dense-fixture and viz golden tests are the byte-identity guard)

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape` (the SPEC-004 worktree — you inherit the conductor's cwd, which is a DIFFERENT repo; `cd` there first)
- Expected branch: `asbuilt-viz-cytoscape`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-viz-cytoscape" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape"`

Modify:

- `asbuilt/src/viz.ts` — the type definitions and `toElements` (plus any in-file using sites the typecheck forces)
- Test files ONLY where `bun run typecheck` fails because of the union — minimal type-level adjustments (annotations, narrowing, local type updates), no assertion changes, no restructuring

This runs as its own wave — no siblings — but the wave-F1 diffs landed just before it; rebase-of-thinking: read the CURRENT `viz.ts` (it now carries the 08 interpolation fix), don't assume the pre-fix shape.

## Required content

1. **The union (viz.ts):** three named arms with exact shapes derived from what `toElements` actually emits today (derive from the code, not from this brief — but the expected shape is approximately):
   - parent: `{ data: { id: string; label: string } }` — no `classes`, no `parent`
   - child: `{ data: { id: string; parent: string; label: string; test: boolean; d: number }; classes: string }` — `classes` REQUIRED
   - edge: `{ data: { id?: string; source: string; target: string; w: number }; classes?: string }`
   `CyElement` becomes the union of the three. Name the arms clearly (e.g. `CyParentElement` / `CyChildElement` / `CyEdgeElement`). Export whatever the tests legitimately import today. Keep or adapt the existing doc comment — it already describes the three kinds accurately in prose.
2. **`toElements` and using sites:** adjust construction/annotations so strict tsc accepts the union with NO runtime edits — if making the types honest forces a runtime change, that is a discovery about the data model, not a refactor detail: stop and escalate `plan_invalidating_discovery` with the tsc error as evidence rather than changing emitted output.
3. **Byte-identity:** the full suite's golden/dense-fixture tests are the enforcement. Do not regenerate any golden file.
4. Field optionality must match reality: if the code emits a field the approximate shapes above miss (or omits one they include), follow the code and say so in your report.

## Inputs

Read before acting:

- `asbuilt/src/viz.ts` — `CyElement` (~line 133 pre-08; re-locate), `toElements`, `buildViz`
- `asbuilt/tests/viz-elements.test.ts` — the consumers that branch on field presence
- `rg "CyElement" asbuilt/` — every declaration/import site (some tests re-declare a local copy; claw-04ku owns deduping those — touch them only if typecheck forces it)

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/12-cyelement-union/report.md`. State explicitly, with the full-suite tail adjacent, that the emitted elements shape is unchanged (golden tests green). ≤30-line tails.

## Out of scope

- Any runtime behavior change whatsoever
- Deduplicating test-side `CyElement` re-declarations or other scaffolding (claw-04ku)
- `viz-template.html`, vendor files, and all wave-F1 territory
