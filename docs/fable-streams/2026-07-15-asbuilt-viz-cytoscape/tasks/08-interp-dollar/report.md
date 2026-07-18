## implementer — round 1

### What I changed

Only `asbuilt/src/viz.ts` was modified (the sole file in the implementer's
file scope for this task; `asbuilt/tests/viz.test.ts` already carried the
test-author's regression tests — the `$`-substitution corruption regression
describe block and the round-trip-guard describe block — from a prior
uncommitted state in the worktree before I started, and I did not touch it).

1. **Interpolation fix (goal item 1).** Replaced the two hazardous
   `.replace`/`.replaceAll` calls that took a **string** replacement argument
   (`.replaceAll("__PROJECT__", basename(targetRepo)).replace("__ASBUILT_DATA__", json)`)
   with the file's existing split/join convention (the same pattern
   `inlineVendor` already uses, one function above, for the identical `$`
   hazard on vendor code):
   ```ts
   const html = withVendor.split("__PROJECT__").join(projectName).split("__ASBUILT_DATA__").join(json);
   ```
   I initially tried a function-replacer form (`.replace("__ASBUILT_DATA__", () => json)`)
   per the brief's first-listed option, but the brief's own verification grep
   (`replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]`) flags it as a false
   positive: POSIX ERE backtracking lets `[^(]` consume the literal space
   character between `,` and `(` in `, () =>`, so the "function replacer"
   form still matches the forbidden pattern. Empirically confirmed (see
   verification tail below) before switching to split/join, which the brief
   explicitly permits as an alternative and which sidesteps the grep issue
   entirely since it never calls `.replace(`/`.replaceAll(` on the
   placeholders at all.
2. **Build-time round-trip guard (goal item 2).** Added
   `export function assertDataRoundTrip(html: string): void` — extracts the
   `<script id="asbuilt-data" type="application/json">…</script>` region via
   regex, `JSON.parse`s it, and throws an `Error` if the tag is missing, the
   parse fails, or the parsed object lacks `meta`/`elements`. `buildViz`
   calls it immediately after interpolation, before returning. One parse, no
   clock reads, no randomness (preserves the codebase's determinism
   invariant). This matches the contract the test-author's tests already
   assumed (`vizModule.assertDataRoundTrip`), confirmed by reading
   `viz.test.ts` before writing the implementation — no rename was needed.
3. **Comment fix (goal item 3).** Rewrote the `inlineVendor` doc comment:
   removed the now-false "A no-op … until T05 lands" sentence, replaced with
   "The template carries all four placeholders and inlining is active; the
   vendor-provenance tests byte-compare each inlined region against
   `asbuilt/vendor/`." Kept the preceding split/join rationale sentence
   verbatim (accurate and load-bearing, per the brief).
4. **Regression tests** — already present in `asbuilt/tests/viz.test.ts`
   before my round started (test-author's prior work, uncommitted in the
   worktree). I read them to derive the `assertDataRoundTrip` contract and
   ran them red-first against the unfixed `viz.ts` to confirm they fail for
   the right reason before implementing (see below). I did not modify this
   file.

### Verification

**0. Working-directory guard (before any write):**
```
$ git rev-parse --show-toplevel
/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
$ git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape
```
Matched the brief's checkout/branch contract exactly — proceeded.

**1. Red-first: `bun test asbuilt/tests/viz.test.ts` against unfixed `viz.ts`** (run before any edit):
```
(fail) $-substitution corruption regression (C1, claw-04ku PR #2 review) > C1: a description containing $$, $&, $`, $' round-trips byte-identically through the embedded JSON [3.55ms]
(fail) $-substitution corruption regression (C1, claw-04ku PR #2 review) > C1: a targetRepo basename containing $& interpolates literally into __PROJECT__, not as a match-substitution [5.84ms]
(fail) round-trip corruption guard (C1 build-time invariant) > C1: throws when the asbuilt-data script tag is missing entirely [0.14ms]
(fail) round-trip corruption guard (C1 build-time invariant) > C1: throws when the data region contains invalid JSON [0.06ms]
(fail) round-trip corruption guard (C1 build-time invariant) > C1: throws when the parsed data is valid JSON but lacks meta/elements [0.09ms]
(fail) round-trip corruption guard (C1 build-time invariant) > C1: does not throw for a well-formed data region containing meta and elements [0.11ms]
(fail) round-trip corruption guard (C1 build-time invariant) > C1: buildViz's own real output always satisfies the round-trip guard [5.05ms]

 13 pass
 7 fail
 50 expect() calls
Ran 20 tests across 1 file. [188.00ms]
```
Exactly the 7 new C1 tests fail red, all other pre-existing tests pass — confirms the tests exercise the described corruption and were absent-guard-driven, not a harness artifact.

**2. Empirical confirmation of the grep-regex quirk** (after first attempting the function-replacer form):
```
$ ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
355:    .replaceAll("__PROJECT__", () => projectName)
356:    .replace("__ASBUILT_DATA__", () => json);
(exit 1 — grep matched, so `!` failed)
```
This is why I switched to split/join instead (see "What I changed" item 1).

**3. `bun test asbuilt/tests/viz.test.ts` after the split/join fix:**
```
bun test v1.3.14 (0d9b296a)

 20 pass
 0 fail
 58 expect() calls
Ran 20 tests across 1 file. [114.00ms]
```
All 20 tests pass, including all 7 previously-red C1 tests.

**4. Brief's done-check commands, run verbatim from the worktree root:**
```
$ bun test asbuilt/tests/viz.test.ts        → 20 pass, 0 fail
$ ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
GREP1 PASS (no match, exit 0)
$ grep -c 'until T05 lands' asbuilt/src/viz.ts | grep -qx 0
GREP2 PASS (count is 0)
```

**5. Additional verification commands from the brief's "Verification commands" section:**
```
$ git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape

$ cd asbuilt && bun run typecheck
$ tsc --noEmit
(no output — clean)

$ cd asbuilt && bun run lint
$ biome check src/ tests/
Checked 69 files in 47ms. No fixes applied.
```

**6. Full asbuilt suite regression check (not required by the brief, but run to confirm no collateral breakage):**
```
$ bun test asbuilt/tests/
...
asbuilt/tests/viz-layout.test.ts:
AC10 measured packing factor: 2.636 (bound 4.5, spike checkpoint 4.116)

 374 pass
 0 fail
 2188 expect() calls
Ran 374 tests across 31 files. [8.26s]
```
(Several unrelated `fatal: ambiguous argument 'HEAD'` stderr lines appeared during this run, from a different test file's git subprocess calls against a non-git temp dir — pre-existing behavior, unrelated to `viz.ts`, and did not cause any test to fail. Out of scope for this task; not investigated further.)

### File scope compliance

`git diff --stat` confirms only `asbuilt/src/viz.ts` was modified by me (43
lines changed). `asbuilt/tests/viz.test.ts`, `asbuilt/src/viz-template.html`,
`asbuilt/tests/vendor-provenance.test.ts`, `asbuilt/tests/viz-layout.test.ts`,
and `asbuilt/tests/viz-surface.test.ts` were already modified in the worktree
before my round began (wave siblings' work) — I read but did not edit any of
them.

### Disputes of prior findings

None — round 1, no prior report sections exist.

### Escalations

None. No scope breach, no plan-invalidating discovery, no working-directory
mismatch.

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
✓ **Pass** — branch is correct.

### Command 2: Test suite
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/viz.test.ts
```
**Exit code:** 0
**Output:**
```
bun test v1.3.14 (0d9b296a)

 20 pass
 0 fail
 58 expect() calls
Ran 20 tests across 1 file. [248.00ms]
```
✓ **Pass** — all 20 tests pass, including the 7 new C1 corruption regression tests.

### Command 3: String-argument replace guard
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
```
**Exit code:** 0
**Output:** (no output — negation succeeded)
**Pass** — no string-argument `.replace()` or `.replaceAll()` calls remain on `__ASBUILT_DATA__` or `__PROJECT__` placeholders.

### Command 4: TypeScript type check
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run typecheck
```
**Exit code:** 0
**Output:**
```
$ tsc --noEmit
```
✓ **Pass** — type checking clean.

### Command 5: Linter
```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
```
**Exit code:** 0
**Output:**
```
$ biome check src/ tests/
Checked 69 files in 162ms. No fixes applied.
```
✓ **Pass** — linter passes on all 69 files.

### Summary

All 5 verification commands passed. The implementer's fix is complete:
- The `$`-substitution corruption vulnerability is eliminated via split/join.
- The build-time round-trip guard is in place and all regression tests pass.
- The rotted comment claiming "no-op until T05" is removed.
- No type or lint errors.

## adversarial-reviewer — round 1

### Working-directory contract
```
$ git rev-parse --show-toplevel
/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
$ git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape
```
Matches expected checkout/branch exactly. No harness mismatch.

### Refute attempts (all failed to break the claim)

1. **Independent done-check re-run** (not trusting the report):
```
$ bun test asbuilt/tests/viz.test.ts
 20 pass
 0 fail
 58 expect() calls
$ ! grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]' asbuilt/src/viz.ts
exit: 0
$ grep -c 'until T05 lands' asbuilt/src/viz.ts | grep -qx 0
exit: 0
```
All three done-check commands pass independently.

2. **Verification commands re-run**: `bun run typecheck` → clean (`tsc --noEmit`, no output); `bun run lint` → `Checked 69 files in 57ms. No fixes applied.` Both pass.

3. **Grep-quirk claim, verified empirically** — the report claims a function-replacer
   form (`.replace("__ASBUILT_DATA__", () => json)`) would false-positive against the
   brief's own done-check grep, justifying the split/join choice instead. Tested directly:
```
$ echo '  .replaceAll("__PROJECT__", () => projectName)' | grep -nE 'replace(All)?\("__(ASBUILT_DATA|PROJECT)__", *[^(]'
1:  .replaceAll("__PROJECT__", () => projectName)
grep exit: 0
```
   Confirmed — `[^(]` matches the space before `(`, so grep would flag the "correct"
   function-replacer form. The pivot to split/join (an explicitly permitted alternative
   per the brief) is a well-founded, disclosed engineering decision, not a shortcut.

4. **Byte-identical-for-normal-input attack** (out-of-scope guard: "a well-formed bundle
   without `$` sequences must build byte-identically to before"): checked placeholder
   occurrence counts in `viz-template.html` — `__PROJECT__` appears 3× (title, h1, aria-label),
   `__ASBUILT_DATA__` appears exactly once (script tag). Old code used `.replaceAll` for
   `__PROJECT__` (all 3) and single `.replace` for `__ASBUILT_DATA__` (only 1, but there's
   only 1 to replace anyway). New split/join replaces all occurrences of both — behaviorally
   identical for the template as it exists today. No regression found.

5. **Escaping-preservation attack**: confirmed `JSON.stringify(data).replace(/<\//g, "<\\/")`
   (the script-breakout escaping) is untouched by the diff — same line, unmodified logic,
   only the downstream interpolation call changed.

6. **Round-trip guard contract attack** (goal item 2): read `assertDataRoundTrip` —
   extracts via non-greedy regex on the literal `<script id="asbuilt-data" ...>...</script>`
   tag, `JSON.parse`s, throws on missing tag / parse failure / missing `meta`/`elements`.
   Matches the brief's item 2 exactly (one parse, no clock/randomness). The regex boundary
   is safe because the JSON's own `</` sequences are escaped to `<\/` before interpolation,
   so no embedded data content can prematurely close the match.

7. **Scope audit**: `git diff --stat` shows `asbuilt/src/viz.ts | 43 ++++++++-` as the only
   file with net insertions attributable to this task's described changes (comment rewrite,
   `assertDataRoundTrip` export, split/join fix). `viz.test.ts` and the other wave-sibling
   files (`viz-template.html`, `vendor-provenance.test.ts`, `viz-layout.test.ts`,
   `viz-surface.test.ts`) are also dirty in the shared worktree, consistent with parallel
   wave siblings' uncommitted work as the report claims — read but not attributable to this
   task's diff content. No evidence the implementer edited outside `asbuilt/src/viz.ts`.

8. **Test-content audit**: read the four new tests directly — hazard-description
   byte-identical round-trip, `$&`-in-basename literal interpolation, and four
   `assertDataRoundTrip` behavior tests (missing tag / invalid JSON / missing keys / valid
   pass-through) plus a real-`buildViz`-output sanity check. All match Required-content
   item 4's four bullets. Report's "red-first" evidence (7 named failing tests, all C1-tagged,
   13 pre-existing pass) is internally consistent with this test file's structure.

### Conclusion

No wrong-input, done-check, scope, or evidence gaps survived scrutiny. The fix is a correct,
minimal, well-scoped application of the brief's own prescribed remedy (split/join, matching
`inlineVendor`'s existing convention), the round-trip guard matches the brief's contract
precisely, the comment rot is removed, and behavior is preserved byte-for-byte for
non-hazardous input. Nothing to report.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```

## fable — round 2

Blinded whole-delta review (opus, no stream docs, no session reasoning) returned
one minor finding against this task's guard: `assertDataRoundTrip` enforced only
parseability + `meta`/`elements` presence, while its comment claimed protection
"regardless of future interpolation bugs" — valid-but-wrong JSON would slip it.
All other refutation attempts across the whole F1+F2 delta failed (union
byte-identity, CLI silent-failure path, `<\/` escaping vs the guard regex,
determinism, test self-copy/can-never-fail checks — each verified clean by the
reviewer running suite/typecheck/lint/e2e-build itself; artifact 533,263 bytes,
under budget).

Adjudication: fixed in-session by the conductor (change too small for a
dispatch round): `assertDataRoundTrip(html, expected?)` now deep-compares the
re-parsed region against the source object via re-stringify byte-equality when
`expected` is passed, and `buildViz` passes `data`. Doc comment updated to
state the two-tier guarantee accurately. Re-verified:

```
374 pass, 0 fail (2188 expect() calls)  [bun test asbuilt/tests/]
tsc --noEmit: clean · biome: clean
```
