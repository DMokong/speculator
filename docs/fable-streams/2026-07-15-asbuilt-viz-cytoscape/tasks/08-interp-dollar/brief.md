---
parallel_safe: true
testable: true
tier: standard
---

# 08-interp-dollar — kill $-pattern corruption on the data interpolation path

## Goal

Fix PR #2 review finding C1 (Critical): `buildViz` in `asbuilt/src/viz.ts` interpolates the bundle JSON and project name via `String.replace`/`replaceAll` with a **string** replacement argument (`.replace("__ASBUILT_DATA__", json)` / `.replaceAll("__PROJECT__", basename(targetRepo))`, currently viz.ts:321). JavaScript treats `$$`, `$&`, `` $` ``, `$'` in the replacement string as substitution patterns, so any concept prose containing them (sed/regex/shell/Makefile docs — realistic for target repos) silently corrupts the embedded JSON; the `` $` `` case splices ~500KB of template into the JSON and ships a dead viewer with exit code 0. The file already knows this hazard — `inlineVendor` (viz.ts:200–208) uses split/join for exactly this reason, with a doc comment saying so — but the data path was missed. This task also adds a build-time corruption guard (so `buildViz` can never emit a broken artifact with exit 0) and fixes the now-false "no-op until T05 lands" claim in the `inlineVendor` doc comment (review finding I5a — T05 landed in this same PR; the placeholders exist and inlining is active).

## Done-check

From the worktree root, all three must pass:

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c 'until T05 lands' asbuilt/src/viz.ts | grep -qx 0
```

(The second command asserts no string-argument replacement remains for either placeholder — only a function replacer `() =>` or split/join form. The third asserts the rotted comment sentence is gone.)

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape` (the SPEC-004 worktree — you inherit the conductor's cwd, which is a DIFFERENT repo; `cd` there first)
- Expected branch: `asbuilt-viz-cytoscape`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-viz-cytoscape" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape"`

Modify ONLY:

- `asbuilt/src/viz.ts` (implementer)
- `asbuilt/tests/viz.test.ts` (test-author; implementer may adjust only if a test it wrote needs a mechanical fix)

Wave siblings own `asbuilt/src/viz-template.html`, `asbuilt/tests/viz-surface.test.ts`, `asbuilt/tests/vendor-provenance.test.ts`, `asbuilt/tests/viz-layout.test.ts` — do not touch them.

## Required content

1. **Interpolation fix (viz.ts):** both `__ASBUILT_DATA__` and `__PROJECT__` interpolations become immune to `$`-substitution patterns. Use a function replacer (`.replace("__ASBUILT_DATA__", () => json)`, `.replaceAll("__PROJECT__", () => ...)`) or split/join (the file's existing convention per `inlineVendor`). Preserve existing behavior exactly otherwise, including the `/<\//g → "<\\/"` escaping of the JSON.
2. **Build-time round-trip guard (viz.ts):** after interpolation, `buildViz` re-extracts the content of the `<script id="asbuilt-data" type="application/json">…</script>` region from the produced html and `JSON.parse`s it, throwing an `Error` (→ nonzero CLI exit) if extraction or parse fails or if the parsed object lacks `meta`/`elements`. This is the invariant that makes silent corruption impossible regardless of future interpolation bugs. Keep it cheap (one parse); no clock reads, no randomness (byte-determinism is a hard invariant in this codebase).
3. **Comment fix (viz.ts):** rewrite the `inlineVendor` doc-comment sentence claiming it is "a no-op … until T05 lands" to state current truth: the template carries the four placeholders and inlining is active, byte-compared against `asbuilt/vendor/` by the vendor-provenance tests. Keep the split/join rationale sentence — it is accurate and load-bearing.
4. **Regression tests (viz.test.ts, test-author — write these FIRST; the `$`-corruption test must fail against the current unfixed code):**
   - A bundle whose concept description contains all four hazard sequences (`$$`, `$&`, `` $` ``, `$'`) builds an artifact from which the embedded JSON re-extracts, parses, and returns the description **byte-identical** (`toBe` on the exact string).
   - A `targetRepo` basename containing `$&` interpolates into the artifact literally (no substitution artifacts) — skip only if `basename` paths make this untestable without touching the filesystem in a way the existing tests don't already do (they build from temp dirs; follow the existing pattern in the `buildViz` describe block).
   - The round-trip guard throws on corruption: simulate by asserting the guard function rejects an html string whose data region is invalid JSON (structure this however the implementation makes testable — a small exported helper is acceptable).
   Follow the existing test idioms in `viz.test.ts` (temp-dir fixtures, live template parsing — never hand-copy template constants into tests).

## Inputs

Read before acting:

- `asbuilt/src/viz.ts` — `inlineVendor` (~line 200) and `buildViz` (~line 280–325)
- `asbuilt/tests/viz.test.ts` — the `buildViz` describe block (existing fixture/temp-dir idiom)
- `asbuilt/src/viz-template.html` lines ~300–310 — the data script tag shape
- This brief's Goal section (the review finding, restated verbatim in substance)

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/08-interp-dollar/report.md`. Every claim adjacent to a command-output tail (≤30 lines). Test-author must show the new `$`-corruption test FAILING against unfixed code (red-first evidence) if it runs before the implementer; implementer shows it passing after the fix.

## Out of scope

- `asbuilt/src/viz-template.html` (09 owns the error banner; template is untouched here)
- Vendor script-tag order assertions (10), seed-block extraction (11), `CyElement` union (12)
- `esc()` quote escaping, empty-bundle NaN%, duplicate-resource uniqueness assert, size-budget anchor, AC3 denylist additions — all deferred to claw-04ku
- Any change to the emitted artifact's bytes beyond the corrupted-input cases (a well-formed bundle without `$` sequences must build byte-identically to before)
