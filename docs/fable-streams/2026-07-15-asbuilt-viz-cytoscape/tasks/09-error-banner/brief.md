---
parallel_safe: true
testable: true
tier: standard
---

# 09-error-banner — runtime error surface in the shipped artifact

## Goal

Fix PR #2 review finding I1 (Important): the shipped viewer (`asbuilt/src/viz-template.html`) has no runtime error surface. Every failure mode — a vendor script error, fcose registration failure, embedded-JSON corruption — currently renders as a blank canvas plus a console message the audience (reviewers opening a `file://` artifact) will never open. Add a small global error handler that converts all of these from invisible to actionable: a visible banner stating that the viewer failed and what to check.

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-surface.test.ts
```

with the new "runtime error surface" tests present and green.

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape` (the SPEC-004 worktree — you inherit the conductor's cwd, which is a DIFFERENT repo; `cd` there first)
- Expected branch: `asbuilt-viz-cytoscape`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-viz-cytoscape" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape"`

Modify ONLY:

- `asbuilt/src/viz-template.html` (implementer)
- `asbuilt/tests/viz-surface.test.ts` (test-author; implementer may adjust only mechanically)

Wave siblings own `asbuilt/src/viz.ts`, `asbuilt/tests/viz.test.ts`, `asbuilt/tests/vendor-provenance.test.ts`, `asbuilt/tests/viz-layout.test.ts` — do not touch them.

## Required content

1. **Handler script (viz-template.html):** a small `<script>` block registering `window.onerror` AND `window.addEventListener("unhandledrejection", …)`, placed **before** the first vendor placeholder (`<script>__VENDOR_LAYOUT_BASE__</script>`, currently ~line 302) so vendor script-evaluation errors are caught. On first error it must surface a fixed-position banner (suggested: `id="asbuilt-error"`, `role="alert"`, top of viewport, high z-index, error styling consistent with the template's existing CSS variables) showing a short static heading (e.g. "Viewer failed to initialize"), the error message text, and a hint to open the DevTools console for details. Constraints:
   - **Vanilla DOM only** — must not reference `cy`, cytoscape, or anything defined later; it must work when the vendor scripts themselves are what failed.
   - **Tolerate early firing** — the handler may fire while the document is still parsing; guard for `document.body` availability (the vendor tags' position in the document determines whether body exists — verify and handle both, e.g. render immediately if possible else defer to `DOMContentLoaded`).
   - **Byte-determinism** — static strings only; no `Date`, no `Math.random`, no locale-dependent formatting.
   - **Show at most one banner**; subsequent errors may append/update text but must not stack banners.
   - Keep it small (~15–25 lines including CSS); the artifact size budget is close to its 700KB spec bound.
2. **Tests (viz-surface.test.ts, test-author — write FIRST, must fail against the current template):** a new describe block ("runtime error surface" or similar) pinning, at minimum:
   - The template registers `window.onerror` and an `unhandledrejection` listener.
   - The registration script's index in the raw template text is **strictly before** the index of `__VENDOR_LAYOUT_BASE__` (use `indexOf` on the raw template — follow the file's existing textual-pinning idiom).
   - The handler block references neither `cytoscape` nor `cy.` (vanilla-DOM constraint, pinned textually against the extracted handler slice).
   - The banner element id (`asbuilt-error`) and `role="alert"` appear in the handler.
   Follow the existing extraction/pinning idioms in `viz-surface.test.ts` — tests parse the shipped template live; never hand-copy template constants.

## Inputs

Read before acting:

- `asbuilt/src/viz-template.html` — head/style region, the script region ~lines 295–320, and the boot script's error posture
- `asbuilt/tests/viz-surface.test.ts` — existing textual-pinning idioms
- This brief's Goal section

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-surface.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c 'window.onerror' asbuilt/src/viz-template.html
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/09-error-banner/report.md`. Every claim adjacent to a command-output tail (≤30 lines). Test-author shows red-first evidence against the unmodified template.

## Out of scope

- `asbuilt/src/viz.ts` and every test file other than `viz-surface.test.ts`
- The empty-bundle "NaN% audited" fix, `esc()` quote escaping, size-budget test anchor, AC3 denylist — deferred to claw-04ku
- Restyling or restructuring any existing template UI; the banner is additive only
- Browser-executed verification (the conductor performs the corrupted-artifact browser check at finalize; your tests pin structure textually)
