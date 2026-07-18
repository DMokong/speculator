---
parallel_safe: true
testable: false
tier: standard
---

# 11-seed-live-extraction — AC8/AC10 tests must measure the shipped seed code, not a hand-copy

## Goal

Fix PR #2 review finding I3 (Important): `asbuilt/tests/viz-layout.test.ts` hand-copies the template's client-side FNV `hash()` and seed-position formula (currently ~lines 38–73, functions `hash` and `seedPositions`) instead of extracting them from the live template — so the AC8 determinism and AC10 packing tests measure the test's own copy, not the shipped code. If the template's seed block drifts, these tests keep passing against stale physics. This is the exact coupling gap Gate 2b round 1 already fixed for the fcose options: the same file's `extractProductionFcoseOptions()` (~line 93) parses the shipped `layout: {…}` literal out of `viz-template.html` at test time via marker + brace-walk + indirect eval, with loud errors when the anchor goes stale. Give the seed block the same treatment.

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-layout.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c '2166136261' asbuilt/tests/viz-layout.test.ts | grep -qx 0
```

(suite green with extraction in place; the FNV offset-basis constant no longer appears in the test file — it must reach the tests only through the template slice at runtime)

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape` (the SPEC-004 worktree — you inherit the conductor's cwd, which is a DIFFERENT repo; `cd` there first)
- Expected branch: `asbuilt-viz-cytoscape`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-viz-cytoscape" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape"`

Modify ONLY:

- `asbuilt/tests/viz-layout.test.ts`

The template (`asbuilt/src/viz-template.html`) is READ-ONLY input. A wave sibling is concurrently adding an error-banner script to the template in a different region (~before line 302); anchor your extraction on the seed-block code itself, not on absolute offsets or surrounding unrelated markup.

## Required content

1. **Extraction function(s):** replace the hand-copied `hash()` and `seedPositions()` bodies with functions extracted from the live template at test time, following the `extractProductionFcoseOptions()` idiom in the same file: locate a stable textual anchor (e.g. the `function hash(` declaration and the seed-position block in the template's boot script), slice the source (brace-walk for balanced braces — the file already contains one; reuse or mirror it), and materialize via indirect eval — with the same biome-ignore pragmas and a comment citing the same rationale. Every anchor miss must throw a loud, named error ("has the template's seed block been restructured?"), never silently fall back — a stale anchor that skips is exactly the dense-fixture regex bug this codebase already catalogued (claw-04ku).
2. **Same call sites:** the extracted functions feed the existing `seedPositions`/`seededElements` call sites unchanged — this task rewires where the code COMES FROM, not what the tests assert. Type shims (`as` casts on the eval result) are acceptable and consistent with the fcose-options precedent.
3. **Fidelity guard:** if the extracted template code produces DIFFERENT seed positions than the previous hand-copy (i.e. AC8/AC10 tests change outcome after rewiring), do NOT adjust the template, the bounds, or the assertions to compensate — that would be a real shipped-vs-tested divergence, which is a discovery, not a test bug. Report it and escalate `plan_invalidating_discovery` with both value sets as evidence.
4. Keep the doc comments honest: the "reproduced here so the seed matches production" comments describing the hand-copy must be rewritten to describe the extraction.

## Inputs

Read before acting:

- `asbuilt/tests/viz-layout.test.ts` — whole file, especially `hash`/`seedPositions` (~38–73) and `extractProductionFcoseOptions` (~84–127)
- `asbuilt/src/viz-template.html` — the boot script's seed-position code (search for `2166136261` / `function hash`)

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-layout.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c '2166136261' asbuilt/tests/viz-layout.test.ts | grep -qx 0 && echo NO-HANDCOPY
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/11-seed-live-extraction/report.md`. Include the AC10 packing factor printed by the suite before AND after the rewiring (they should match; if they don't, that's the escalation path above). ≤30-line tails.

## Out of scope

- `asbuilt/src/viz-template.html` — read-only; any template change escalates `scope_breach`
- All other test files and `viz.ts`
- Extracting the brace-walk into a shared test helper (claw-04ku owns scaffolding dedup — a local mirror of the existing walker is fine here)
- Loosening any AC8/AC10 assertion or bound
