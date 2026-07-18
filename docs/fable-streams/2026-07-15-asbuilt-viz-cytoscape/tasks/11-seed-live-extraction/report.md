## implementer — round 1

### What I changed

- `asbuilt/tests/viz-layout.test.ts` (only file touched, in scope):
  - Removed the hand-copied `hash()` and `seedPositions()` function bodies (previously ~lines 38–73), which duplicated the client-side FNV hash and ring-anchor seed-position formula from `asbuilt/src/viz-template.html` as literal TypeScript.
  - Added `extractProductionSeedPositions()`, mirroring the existing `extractProductionFcoseOptions()` idiom in the same file:
    - Reads `viz-template.html` at test time.
    - Locates the `function hash(s)` declaration via a stable text marker, then brace-walks from its opening `{` to the matching closing `}` to find the end of the hash function body.
    - From there, locates the `for (const n of nodes) {` marker (the seed-position loop that follows immediately in the template's boot script) and brace-walks it to its matching closing `}`.
    - Slices the source from the `hash` marker through the end of the for-loop — this captures `function hash(s){...}`, the `groups`/`G`/`groupCounts`/`seedPos` declarations, and the seeding loop exactly as shipped, in source order.
    - Wraps the slice in `(function (nodes) { <snippet>\nreturn seedPos; })` and materializes it via indirect eval (`(0, eval)(...)`), with the same `biome-ignore lint/style/noCommaOperator` and `biome-ignore lint/security/noGlobalEval` pragmas as the fcose extractor, and a comment citing the same "parses the real shipped code rather than trusting a hand-copied duplicate" rationale.
    - Every anchor-miss / unbalanced-brace path throws a named `Error` ("... has the template's seed block been restructured?") — no silent fallback, matching brief requirement #1 and the claw-04ku precedent cited in the brief.
  - `const seedPositions = extractProductionSeedPositions();` — materialized once at module scope, same pattern as `const FCOSE_OPTIONS = extractProductionFcoseOptions();`.
  - Call site inside `seededElements()` is textually unchanged: `const seed = seedPositions(nodes);` still resolves to the same identifier, now bound to the extracted function instead of a hand-written one (brief requirement #2 — "same call sites").
  - Rewrote the doc comment above the extraction function to describe extraction (source, mechanism, rationale) instead of "reproduced here so the seed matches production" (brief requirement #4).
  - No template changes — `asbuilt/src/viz-template.html` was read-only input, not modified.

### Why

PR #2 review finding I3: the AC8 determinism and AC10 packing tests were measuring a hand-copied duplicate of the template's seed formula, not the shipped code — so template drift in the seed block would go undetected, exactly the coupling gap already fixed for the fcose options in Gate 2b round 1. This task gives the seed block the same live-extraction treatment.

### Fidelity check (brief requirement #3)

AC10 packing factor measured identical before and after rewiring:
- **Before** (hand-copied seed formula, baseline run prior to any edit): `AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)`
- **After** (extracted seed formula): `AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)`

Byte-identical measured value — no shipped-vs-tested divergence found. No escalation needed on this axis. (Note: the extracted production code omits two defensive-only lines the old hand-copy had added — `if (!anchor) continue;` and `?? 1` on the group-count sqrt fallback — neither of which can fire for real `nodes` input, since `anchors`/`groupCounts` are always built from the same `nodes` list whose groups they index. This is consistent with the identical measured factor.)

### Verification commands run

```
$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-layout.test.ts
bun test v1.3.14 (0d9b296a)

asbuilt/tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)

 4 pass
 0 fail
 17 expect() calls
Ran 4 tests across 1 file. [184.00ms]

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c '2166136261' asbuilt/tests/viz-layout.test.ts | grep -qx 0 && echo NO-HANDCOPY
NO-HANDCOPY

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
$ tsc --noEmit
(clean exit, no output)

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
$ biome check src/ tests/
Checked 69 files in 146ms. No fixes applied.
```

### File scope confirmation

`git diff --stat` shows only `asbuilt/tests/viz-layout.test.ts` was modified by me. `git status --short` also showed `asbuilt/tests/vendor-provenance.test.ts` and `asbuilt/tests/viz-surface.test.ts` as modified — these are pre-existing uncommitted changes from a concurrent wave sibling (the brief noted a sibling is adding an error-banner script to the template in a different region); I did not touch either file. `asbuilt/src/viz-template.html` was read but not written (read-only input per brief).

### Escalations

None. No scope breach, no plan-invalidating discovery — the extracted production code produced identical AC10/AC8 results to the hand-copy it replaced.

## verifier — round 1

### Command 1: Branch verification
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
```
**Exit code:** 0
**Output:**
```
asbuilt-viz-cytoscape
```

### Command 2: Test suite
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz-layout.test.ts
```
**Exit code:** 0
**Output:**
```
bun test v1.3.14 (0d9b296a)

asbuilt/tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)

 4 pass
 0 fail
 17 expect() calls
Ran 4 tests across 1 file. [196.00ms]
```

### Command 3: Verify FNV constant not in test file
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c '2166136261' asbuilt/tests/viz-layout.test.ts | grep -qx 0 && echo NO-HANDCOPY
```
**Exit code:** 0
**Output:**
```
NO-HANDCOPY
```

### Command 4: Typecheck
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
```
**Exit code:** 0
**Output:**
```
$ tsc --noEmit
```

### Command 5: Lint
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```
**Exit code:** 0
**Output:**
```
$ biome check src/ tests/
Checked 69 files in 80ms. No fixes applied.
```

### Summary

All five verification commands passed. AC10 packing factor unchanged at 2.636 (matching implementer's baseline). FNV constant 2166136261 no longer present in test file, confirming hand-copy extraction is complete. Tests green. Typecheck and lint clean.

## adversarial-reviewer — round 1

### Working-directory contract
Verified before any action: `git rev-parse --show-toplevel` and `git rev-parse --abbrev-ref HEAD` both resolved correctly to the worktree/branch specified in the brief. No mismatch.

### Refute attempts (all failed to break the claim)

1. **Done-check re-run** — ran both done-check commands directly:
   ```
   bun test asbuilt/tests/viz-layout.test.ts        -> 4 pass, 0 fail (TEST_EXIT=0)
   grep -c '2166136261' ... | grep -qx 0            -> HANDCOPY_CHECK_EXIT=0
   ```
2. **Fidelity guard independent re-check (brief req #3)** — extracted `HEAD:asbuilt/tests/viz-layout.test.ts` (the pre-round hand-copy) into the current worktree and ran it against the *current* (post-sibling-edit) `viz-template.html`: produced the identical `AC10 measured packing factor: 2.636`. Confirms the implementer's before/after claim independently rather than trusting the report. File restored byte-for-byte after (`diff` clean).
3. **Anchor-miss wrong-input attack** — corrupted the template's `function hash(s) {` marker to `function hashXX(s) {` and re-ran the suite: got a loud, named `Error` ("could not find 'function hash(s)' in viz-template.html -- has the template's seed block been restructured?"), 1 error / 0 pass, no silent fallback — matches brief req #1. Template restored byte-identical afterward (`diff` clean, confirmed via `diff` and re-running the green suite).
4. **Anchor uniqueness check** — `grep -n "for (const n of nodes)" asbuilt/src/viz-template.html` returns exactly one match (line 376), so the post-hash `indexOf` search has no ambiguity to exploit.
5. **Scope audit** — `git status --short` shows `viz-template.html`, `vendor-provenance.test.ts`, `viz-surface.test.ts`, `viz.test.ts` as modified, but `git diff --stat HEAD -- asbuilt/tests/viz-layout.test.ts` is the only file this task's diff touches (77 insertions / 33 deletions, confined to the `hash`/`seedPositions` block per the diff body). The `viz-template.html` diff is exactly the error-banner script (before line ~302) the brief pre-announced as a concurrent sibling's change — unrelated to the seed block at line ~339+; confirmed no `hash(`/seed-loop content in that diff.
6. **Verification commands** — re-ran typecheck and lint myself: `tsc --noEmit` clean, `biome check src/ tests/` — "Checked 69 files... No fixes applied."
7. **Required content walk** — extraction mirrors `extractProductionFcoseOptions()` idiom (marker + brace-walk + indirect eval), same biome-ignore pragmas, named errors on every anchor-miss path, call site (`seedPositions(nodes)` inside `seededElements`) textually unchanged, doc comment rewritten to describe extraction not hand-copy, brace-walk kept local (not extracted to shared helper, correctly respecting the out-of-scope note).

### Findings

None. The extraction function is a faithful, byte-for-byte structural mirror of `extractProductionFcoseOptions()`, correctly slices the shipped `hash()` + seed-loop out of the live template, throws loud named errors on every anchor-miss path (verified empirically), and the fidelity guard (AC10 packing factor 2.636 before/after) was independently reproduced, not just trusted from the report. File scope is respected — only `viz-layout.test.ts` was touched by this task; the other dirty files in the worktree are pre-existing, brief-forewarned concurrent-sibling changes.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
