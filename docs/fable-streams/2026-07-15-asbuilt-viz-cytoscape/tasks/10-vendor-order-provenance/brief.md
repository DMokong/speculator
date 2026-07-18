---
parallel_safe: true
testable: false
tier: standard
---

# 10-vendor-order-provenance — pin vendor script-tag order; fix false provenance citation

## Goal

Fix PR #2 review findings I2 and I5b (Important), both in `asbuilt/tests/vendor-provenance.test.ts`:

- **I2:** the vendor script-tag order in `asbuilt/src/viz-template.html` is asserted nowhere. It is load-bearing — the reviewer proved empirically that loading fcose before cytoscape yields a dead page with all tests still green. The template's current working order is `__VENDOR_LAYOUT_BASE__` → `__VENDOR_COSE_BASE__` → `__VENDOR_CYTOSCAPE__` → `__VENDOR_FCOSE__` (~lines 302–305), with the data script (`__ASBUILT_DATA__`, ~line 307) after all four. One test pinning that order closes the gap.
- **I5b:** the comment at ~line 91–93 justifies its anchored header check by citing sub-attributions "further down" in `cytoscape.min.js`, including "an async.js port notice" — which does not exist. The conductor verified: `grep` finds **zero** occurrences of the substring `async` anywhere in `asbuilt/vendor/cytoscape.min.js`. The comment must cite only what is actually in the file.

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/vendor-provenance.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c 'async' asbuilt/tests/vendor-provenance.test.ts | grep -qx 0
```

(new order test present and green; no `async.js` citation remains)

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape` (the SPEC-004 worktree — you inherit the conductor's cwd, which is a DIFFERENT repo; `cd` there first)
- Expected branch: `asbuilt-viz-cytoscape`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-viz-cytoscape" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape"`

Modify ONLY:

- `asbuilt/tests/vendor-provenance.test.ts`

Everything else — template, viz.ts, other test files — belongs to wave siblings. Read freely, write nowhere else.

## Required content

1. **Order test:** a new test (in an appropriately named describe block) that reads the RAW `asbuilt/src/viz-template.html`, takes `indexOf` for each of the five placeholders (`__VENDOR_LAYOUT_BASE__`, `__VENDOR_COSE_BASE__`, `__VENDOR_CYTOSCAPE__`, `__VENDOR_FCOSE__`, `__ASBUILT_DATA__`), and asserts:
   - each index is `> -1` (placeholder present),
   - each placeholder occurs **exactly once** (`indexOf === lastIndexOf` — duplicates would make `inlineVendor`'s split/join inline a vendor bundle twice),
   - the five indexes are **strictly increasing** in the order listed above (dependency order: layout-base and cose-base are fcose's UMD deps; cytoscape's global must exist before fcose registers; data comes after vendors).
   Include a short comment stating the empirical failure this pins (fcose before cytoscape → dead page, no test failure).
2. **Comment correction:** rewrite the ~line 91–93 justification comment to cite only sub-attributions that actually exist in `asbuilt/vendor/cytoscape.min.js`. First `grep` the vendor file yourself for what IS there (e.g. check whether the claimed "Bezier-curve-generator credit" is real — search for `Copyright`/`MIT`/`Bezier` occurrences beyond the primary header) and cite that accurately; if nothing concrete exists beyond the primary header, genericize the comment honestly (e.g. "other MIT/Copyright substrings appearing later in the bundle") — but only after verifying which case is true, with the grep evidence in your report. Do not weaken or restructure the test itself.

## Inputs

Read before acting:

- `asbuilt/tests/vendor-provenance.test.ts` — whole file (existing describe structure and idioms)
- `asbuilt/src/viz-template.html` ~lines 295–310 — the placeholder region
- `asbuilt/vendor/cytoscape.min.js` — grep only (it is minified; do not read it whole)
- `asbuilt/src/viz.ts` `inlineVendor` + `VENDOR_PLACEHOLDERS` (~lines 180–210) — the canonical placeholder list

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/vendor-provenance.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c 'async' asbuilt/tests/vendor-provenance.test.ts | grep -qx 0 && echo NO-ASYNC-CITATION
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/10-vendor-order-provenance/report.md`. Include the grep evidence for what sub-attributions actually exist in `cytoscape.min.js` adjacent to the comment rewrite claim. ≤30-line tails.

## Out of scope

- Any file other than `asbuilt/tests/vendor-provenance.test.ts`
- Changing the template's actual script order (it is currently correct; you pin it, not change it)
- The vendor-file-list single-sourcing (claw-04ku owns dedup)
