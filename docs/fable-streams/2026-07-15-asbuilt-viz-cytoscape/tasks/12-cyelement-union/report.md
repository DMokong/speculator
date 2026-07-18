## implementer — round 1

### What I changed

**`asbuilt/src/viz.ts`** (~line 130 in the pre-08 layout; re-located after the wave-F1 interpolation-fix diffs that had already landed in the working tree):

- Replaced the single `CyElement` interface (every distinguishing field optional) with a three-arm discriminated union, per the brief's Required content #1:
  - `CyParentElement` — `{ data: { id: string; label: string } }`, no `classes`, no `parent` field. Matches the code exactly (`parents` array in `toElements` only ever sets `id`/`label`).
  - `CyChildElement` — `{ data: { id: string; parent: string; label: string; test: boolean; d: number }; classes: string }`, `classes` **required**. Matches the code: every child element construction always sets `classes: stateOf(n.enrichment) + (n.test ? " test" : "")`, never omitted.
  - `CyEdgeElement` — `{ data: { id: string; source: string; target: string; w: number }; classes?: string }`. **Deviation from the brief's approximate shape, per Required content #4**: the brief's example marked edge `id` optional (`id?: string`); the actual code (`data: { id: \`\${l.source}->\${l.target}\`, source, target, w }`) always sets `id` deterministically, so I made it **required** to match reality. `classes?: string` stays optional as given — edges never emit `classes` today (confirmed via `grep classes asbuilt/src/viz-template.html`: edge styling in the template goes through `[source]`/`[target]` selectors, not classes), so "optional and never populated" is the honest type — an omitted optional key is exactly what the runtime does, so this doesn't misrepresent anything.
  - `export type CyElement = CyParentElement | CyChildElement | CyEdgeElement;`
  - Updated the doc comment above the union to describe the three arms explicitly (kept the "compound-parent / child node / edge" framing from the original comment).
- `toElements`: gave the three local arrays (`parents`, `childNodes`, `edges`) their specific arm types (`CyParentElement[]`, `CyChildElement[]`, `CyEdgeElement[]`) instead of `CyElement[]`. The object literals were already shaped correctly (no runtime edits at all — verified by re-reading the untouched map bodies), so this is a pure type-level annotation change; the array literal `[...parents, ...childNodes, ...edges]` still infers to `CyElement[]` for the function's declared return type.
- No other in-file using sites needed changes — `buildViz` only ever calls `toElements(...)` and assigns the result to `data.elements` (serialized via `JSON.stringify`), no field access.

**`asbuilt/tests/viz-elements.test.ts`** — the only test file that imports/consumes `CyElement`-typed values (confirmed via `rg "CyElement" asbuilt/`: `viz.test.ts`, `viz-layout.test.ts`, and `tests/helpers/vendor-load.ts` all declare their own independent, already-all-optional structural types — `EmbeddedElement` / `CyElementDefinition` — parsed from the raw embedded JSON string, not imported from `viz.ts`, so they were untouched and unaffected by the union; per Out-of-scope, I did not touch those re-declarations):
- Added `CyChildElement` / `CyEdgeElement` / `CyParentElement` to the `../src/viz` import.
- The four `.filter((e) => e.data.parent !== undefined)` / `.filter((e) => e.data.source !== undefined)` / `.filter((e) => e.data.id.startsWith("dir:"))` call sites no longer typecheck against a union whose arms don't all share the `parent`/`source`/`label`/`classes` keys. Replaced with three named `"in"`-based type-predicate functions (`isParentEl`/`isChildEl`/`isEdgeEl`) using the exact same underlying boolean condition each site already used (`e.data.id.startsWith("dir:")`, `"parent" in e.data`, `"source" in e.data`), just spelled with an `e is CyXElement` return-type annotation so `.filter()` narrows the array type. This is a pure narrowing change — the set of elements each filter selects is identical to before (a child's `data.parent` was always a set string, never `undefined`, so `!== undefined` and `"parent" in e.data` select the same elements).
- One remaining case forced a local cast rather than a narrowing predicate: `expect(p.classes).toBeUndefined()` for parent elements. Since `CyParentElement` has no `classes` key at all (per the brief's explicit "no `classes`" arm shape), `p.classes` is not a valid property access post-narrowing. Changed to `expect((p as { classes?: unknown }).classes).toBeUndefined())` — same runtime value being asserted (`undefined`, since the key genuinely never exists on parent objects), same `expect(...).toBeUndefined()` assertion, just a mechanical cast to satisfy strict tsc. I did not change the assertion's semantics or the value tested — only added a type-level escape hatch forced by the union.
- No assertion values were changed anywhere in the file; no test was added, removed, or restructured.

### Byte-identity confirmation

This is a type-level-only change: no runtime code inside `toElements`, `buildViz`, or any using site was touched (only type annotations on already-correct object-literal constructions, plus test-side filter-predicate spelling). The golden/dense-fixture byte-identity guard tests (`viz.test.ts`, `viz-layout.test.ts`) parse the *raw emitted JSON* against their own independent, unrelated structural types and are fully green — see the full-suite tail below (374 pass, 0 fail) and the isolated run of just those three files (39 pass, 0 fail). The emitted `elements` shape is unchanged.

### Verification

```
$ cd .../asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape

$ cd .../asbuilt-viz-cytoscape/asbuilt && bun run typecheck
$ tsc --noEmit
(clean, no output)

$ cd .../asbuilt-viz-cytoscape && bun test asbuilt/tests/
bun test v1.3.14 (0d9b296a)
[unrelated pre-existing stderr noise: several "fatal: ambiguous argument 'HEAD'"
 lines from a git-log-reading test elsewhere in the suite — present before my
 change too, not caused by this diff, out of file scope]

asbuilt/tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)

 374 pass
 0 fail
 2188 expect() calls
Ran 374 tests across 31 files. [9.36s]

$ cd .../asbuilt-viz-cytoscape/asbuilt && bun run lint
$ biome check src/ tests/
Checked 69 files in 38ms. No fixes applied.

# Isolated golden/dense-fixture + toElements consumer run:
$ bun test asbuilt/tests/viz.test.ts asbuilt/tests/viz-elements.test.ts asbuilt/tests/viz-layout.test.ts
 39 pass
 0 fail
 124 expect() calls
Ran 39 tests across 3 files. [314.00ms]
```

### Files touched

- `asbuilt/src/viz.ts` (CyElement → 3-arm union; `toElements` local array annotations)
- `asbuilt/tests/viz-elements.test.ts` (import additions; 4 filter predicates → named `in`-based type guards; 1 cast for the parent `.classes` assertion)

No other files were modified. `git diff --stat asbuilt/src/viz.ts asbuilt/tests/viz-elements.test.ts` confirms these are the only two files with diffs attributable to this task (other working-tree modifications present at task start — `viz-template.html`, `vendor-provenance.test.ts`, `viz-layout.test.ts`, `viz-surface.test.ts`, `viz.test.ts` — are pre-existing wave-F1 diffs per the brief's note, untouched by me).

### Escalations

None. No plan-invalidating discovery, no scope breach, no runtime edits were required to make the union typecheck.

## verifier — round 1

### Command 1: Branch verification
**Command:**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
```
**Exit code:** 0
**Output:**
```
asbuilt-viz-cytoscape
```
**Status:** ✓ PASS

### Command 2: Typecheck
**Command:**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
```
**Exit code:** 0
**Output:**
```
$ tsc --noEmit
```
**Status:** ✓ PASS (clean, no errors)

### Command 3: Full test suite
**Command:**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/
```
**Exit code:** 0
**Output (last 20 lines):**
```
fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'
fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'
fatal: ambiguous argument 'HEAD': unknown revision or path not in the working tree.
Use '--' to separate paths from revisions, like this:
'git <command> [<revision>...] -- [<file>...]'

asbuilt/tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)

 374 pass
 0 fail
 2188 expect() calls
Ran 374 tests across 31 files. [8.58s]
```
**Status:** ✓ PASS (374 pass, 0 fail — the "fatal: ambiguous argument 'HEAD'" lines are pre-existing stderr noise from a git-log-reading test, as noted in the implementer's report. Emitted elements JSON is byte-identical per golden-fixture tests.)

### Command 4: Lint check
**Command:**
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```
**Exit code:** 0
**Output:**
```
$ biome check src/ tests/
Checked 69 files in 52ms. No fixes applied.
```
**Status:** ✓ PASS

### Summary

All four verification commands passed:
- ✓ Branch is `asbuilt-viz-cytoscape` (contract met)
- ✓ Typecheck passes with strict tsc (union type-checking enforced)
- ✓ Full suite: 374 tests pass, 0 fail (golden-fixture byte-identity confirmed)
- ✓ Lint: no issues

**Conclusion:** The discriminated union implementation is correct. `CyElement` is now a three-arm union with compiler-checked field access, `classes` is required on child nodes, and zero runtime changes to emitted output.

## adversarial-reviewer — round 1

### Working-directory contract
Verified independently before any inspection: `git rev-parse --show-toplevel` → `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`, `git rev-parse --abbrev-ref HEAD` → `asbuilt-viz-cytoscape`. Matches contract.

### Refute attempts

1. **Re-ran done-check myself** (not trusting report):
```
$ cd .../asbuilt/ && bun run typecheck
$ tsc --noEmit
(clean, no output, exit 0)

$ cd .../asbuilt-viz-cytoscape && bun test asbuilt/tests/
 374 pass
 0 fail
 2188 expect() calls
Ran 374 tests across 31 files. [12.37s]
```
Matches the implementer's and verifier's claims exactly.

2. **Scope audit** — `git diff --stat HEAD` shows 7 modified files, but only `asbuilt/src/viz.ts` and `asbuilt/tests/viz-elements.test.ts` are attributable to this task. `rg "CyElement" asbuilt/` confirms no other file references `CyElement`/`CyParentElement`/`CyChildElement`/`CyEdgeElement` (viz-layout.test.ts and vendor-load.ts use an unrelated, independently-declared `CyElementDefinition`). The other 5 modified files' diffs (viz.test.ts referencing "task 08-interp-dollar", assertDataRoundTrip in viz.ts) are thematically consistent with the brief's stated pre-existing wave-F1 interpolation fix ("it now carries the 08 interpolation fix") — not this task's contribution. No scope breach found.

3. **Field-shape audit against actual `toElements` code** (viz.ts:165-191): `CyParentElement` (`data: {id, label}`, no classes/parent) matches the `parents` map exactly. `CyChildElement` (`classes` required) matches — every child construction sets `classes: stateOf(...) + (test ? " test" : "")`, never omitted. `CyEdgeElement` deviates from the brief's approximate `id?: string` to required `id: string` — verified against the code (`id: \`${l.source}->${l.target}\`` is always set) and explicitly flagged in the report per Required-content #4. `classes?: string` on edges verified correct — no edge construction ever sets `classes`.

4. **Runtime-purity check** — diffed `toElements` line-by-line: only the three local array declarations' type annotations changed (`CyElement[]` → `CyParentElement[]`/`CyChildElement[]`/`CyEdgeElement[]`); every object-literal body is byte-identical to before. No `plan_invalidating_discovery` was needed, consistent with the report.

5. **Test-file diff audit** — `viz-elements.test.ts`: 3 named type-predicate functions (`isParentEl`/`isChildEl`/`isEdgeEl`) replace 3 inline `!== undefined`/`.startsWith` filters with logically identical conditions (`e.data.id.startsWith("dir:")`, `"parent" in e.data`, `"source" in e.data`), plus one `as { classes?: unknown }` cast for the parent `.classes` assertion. No assertion values changed, no tests added/removed/restructured — matches the brief's "minimal type-level adjustments... no assertion changes, no restructuring" constraint.

6. **Lint**: `biome check src/ tests/` → "Checked 69 files... No fixes applied." Exit 0, reproduced independently.

### Steelman

The union is modeled exactly as the brief's Required-content #1 specifies, with one explicit, well-justified, correctly-flagged deviation (edge `id` required not optional) rather than a silent one. The byte-identity claim is supported by the existing structural/embedded-JSON tests (viz.test.ts's `elements presence` test, lines 231-235) passing unchanged, combined with the fact that no runtime code was touched. Report evidence (command outputs) is adjacent to every claim and reproduces cleanly.

### Verdict

No wrong-input, scope, or evidence-gap findings survive the attack. Done-check passes on independent re-run; AC (brief's Required content #1-4) walked and satisfied; file scope respected.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
