# 10-vendor-order-provenance — report

## implementer — round 1

### Working-directory guard

```
$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --show-toplevel
/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
$ git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape
```
Matches the contract. Proceeded.

### What I changed

Modified only `asbuilt/tests/vendor-provenance.test.ts` (the sole file in scope), addressing both PR #2 findings:

1. **I2 — new order-pinning test.** Added a new `describe("vendor script-tag order (PR #2 I2): pins the load-bearing placeholder sequence", ...)` block after the existing `describe`. It:
   - Reads the RAW `asbuilt/src/viz-template.html` via `readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8")` — same pattern already used in `viz-elements.test.ts:305` for reading the real template.
   - Computes `indexOf`/`lastIndexOf` for the five placeholders in the brief's required order: `__VENDOR_LAYOUT_BASE__`, `__VENDOR_COSE_BASE__`, `__VENDOR_CYTOSCAPE__`, `__VENDOR_FCOSE__`, `__ASBUILT_DATA__`.
   - Asserts each `indexOf > -1` (present), each `indexOf === lastIndexOf` (exactly once — a duplicate would make `inlineVendor`'s split/join inline a vendor bundle twice, per `viz.ts` lines 200-208 which I read as an Input), and the five indexes strictly increasing.
   - A comment above the describe block states the empirical failure this pins: fcose loaded before cytoscape produces a dead page (fcose self-registers against the cytoscape global, which wouldn't exist yet) while every other test in the suite stays green.

2. **I5b — comment correction.** Rewrote the ~line 91-96 comment on the `cytoscape.min.js retains its literal MIT copyright header` test. The original claimed the file's "OTHER, unrelated third-party sub-attributions further down" include "a Bezier-curve-generator credit, an async.js port notice". I grepped `asbuilt/vendor/cytoscape.min.js` myself (see Verification below) and found:
   - `async` — **zero** occurrences (confirms the false claim).
   - The Bezier-curve-generator credit **is real**: at byte offset 143789, `/*! Bezier curve function generator. Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */`.
   - A second real sub-attribution exists at byte offset 59887: `/*! Embeddable Minimum Strictly-Compliant Promises/A+ 1.1.1 Thenable, Copyright (c) 2013-2014 Ralf S. Engelschall ... Licensed under The MIT License */`.
   - A third real sub-attribution follows the Bezier one at offset ~143859: `Runge-Kutta spring physics function generator. Adapted from Framer.js, copyright Koen Bok. MIT License`.

   Since a concrete, verified alternative existed (the Promises/A+ implementation notice), I did not need to fall back to the brief's generic "other MIT/Copyright substrings" wording — I replaced "an async.js port notice" with "a Promises/A+ implementation notice", which is grep-verified real. Test logic (the `expect` assertions) was untouched — only the comment text changed, per the brief's "Do not weaken or restructure the test itself."

### Grep evidence (cytoscape.min.js sub-attributions)

```
$ grep -c 'async' asbuilt/vendor/cytoscape.min.js
0

$ python3 -c "
import re
data = open('asbuilt/vendor/cytoscape.min.js', encoding='utf-8').read()
for m in re.finditer('Copyright', data):
    print(m.start(), repr(data[m.start():m.start()+120]))
"
7 'Copyright (c) 2016-2024, The Cytoscape Consortium.\n *\n * Permission is hereby granted, free of charge, to any person'
59887 'Copyright (c) 2013-2014 Ralf S. Engelschall (http://engelschall.com)\n  Licensed under The MIT License (http://opensource'
143789 'Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */\n/*! Runge-Kutta spring physics func'
```

Full context around offset 143789 (confirms the "Bezier-curve-generator credit" claim is real, unlike "async.js port notice"):
```
'!( Bezier curve function generator. Copyright Gaetan Renaudeau. MIT License: http://en.wikipedia.org/wiki/MIT_License */'
```

### Verification commands run

```
$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && bun test asbuilt/tests/vendor-provenance.test.ts
bun test v1.3.14 (0d9b296a)

 4 pass
 0 fail
 35 expect() calls
Ran 4 tests across 1 file. [51.00ms]

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape && grep -c 'async' asbuilt/tests/vendor-provenance.test.ts | grep -qx 0 && echo NO-ASYNC-CITATION
NO-ASYNC-CITATION

$ cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape/asbuilt && bun run lint
$ biome check src/ tests/
Checked 69 files in 39ms. No fixes applied.
```

### Scope check

```
$ git status --short
 M asbuilt/tests/vendor-provenance.test.ts
$ git diff --stat
 asbuilt/tests/vendor-provenance.test.ts | 48 ++++++++++++++++++++++++++++++---
 1 file changed, 44 insertions(+), 4 deletions(-)
```
Only `asbuilt/tests/vendor-provenance.test.ts` was touched, matching the brief's File scope exactly. The template's actual script order (`asbuilt/src/viz-template.html`) was not modified — I only added a test that reads and pins it.

### Disputes

None — no prior rounds exist for this task (round 1, no reviewer findings received).

### Escalation

None. All done-check and verification commands pass; work stayed within the single-file scope.

## verifier — round 1

### Command 1: git rev-parse --abbrev-ref HEAD
**Exit code:** 0
**Output:**
```
asbuilt-viz-cytoscape
```

### Command 2: bun test asbuilt/tests/vendor-provenance.test.ts
**Exit code:** 0
**Output:**
```
bun test v1.3.14 (0d9b296a)

 4 pass
 0 fail
 35 expect() calls
Ran 4 tests across 1 file. [21.00ms]
```

### Command 3: grep -c 'async' asbuilt/tests/vendor-provenance.test.ts | grep -qx 0 && echo NO-ASYNC-CITATION
**Exit code:** 0
**Output:**
```
NO-ASYNC-CITATION
```

### Command 4: cd asbuilt && bun run lint
**Exit code:** 0
**Output:**
```
$ biome check src/ tests/
Checked 69 files in 56ms. No fixes applied.
```

### Summary

All four verification commands passed:
- Branch is correct (asbuilt-viz-cytoscape)
- Test suite runs with 4 pass, 0 fail (including the new order-pinning test from I2)
- No 'async' citations remain in the test file (I5b comment correction verified)
- Lint check passes (no style violations)

## adversarial-reviewer — round 1

### Working-directory guard
```
$ git rev-parse --show-toplevel
/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
$ git rev-parse --abbrev-ref HEAD
asbuilt-viz-cytoscape
```
Matches contract. Proceeded.

### Scope audit
`git status --short` shows 4 modified files (`vendor-provenance.test.ts`, `viz-layout.test.ts`, `viz-surface.test.ts`, `viz.test.ts`), but `git diff -- asbuilt/tests/vendor-provenance.test.ts` confirms this task's diff is isolated to that one file only — the other three are uncommitted sibling-task work in the shared worktree (parallel_safe: true), untouched by this task. No scope violation.

### Independent re-run of done-check + verification commands
```
$ bun test asbuilt/tests/vendor-provenance.test.ts
 4 pass / 0 fail / 35 expect() calls
$ grep -c 'async' asbuilt/tests/vendor-provenance.test.ts | grep -qx 0 && echo NO-ASYNC-CITATION
NO-ASYNC-CITATION
$ cd asbuilt && bun run lint
Checked 69 files in 57ms. No fixes applied.
```

### Independent grep re-verification (I5b)
```
$ grep -c 'async' asbuilt/vendor/cytoscape.min.js
0
$ grep -o 'Promises/A+[^"]\{0,60\}' asbuilt/vendor/cytoscape.min.js
Promises/A+ 1.1.1 Thenable
$ grep -o 'Bezier[^"]\{0,80\}' asbuilt/vendor/cytoscape.min.js | head -1
Bezier=Lo(
```
Confirms the report's claim: "async" is genuinely absent, and the replacement citation ("Promises/A+ implementation notice") is a real sub-attribution in the vendor file. Diff shows only the comment text changed (lines 91-97); `expect()` assertions in that test untouched.

### Wrong-input attack: is the new order test a tautology?
Mutated a scratch copy of `viz-template.html` twice to probe whether the new test actually fails on a broken order (not just trivially passing against unchanged input), then restored via `git checkout`:
1. Sloppy swap creating a duplicate placeholder → test failed on the `indexOf === lastIndexOf` (exactly-once) assertion.
2. Clean swap of `__VENDOR_CYTOSCAPE__` and `__VENDOR_FCOSE__` (the exact empirical failure PR #2 cites) → test failed on the strictly-increasing assertion:
```
Expected: > 15471
Received: 15437
(fail) ... each placeholder is present exactly once, in strictly increasing (dependency) order
 3 pass / 1 fail
```
Restored template (`git checkout -- asbuilt/src/viz-template.html`), confirmed `git status --short` clean of the mutation and suite back to 4 pass / 0 fail. The new test is not a tautology — it genuinely catches the load-bearing ordering bug I2 describes.

### AC-by-AC / required-content walk
1. Order test: reads RAW template via `readFileSync(new URL("../src/viz-template.html", ...))`, checks all 5 placeholders present exactly once and strictly increasing in the brief-mandated order (layout-base → cose-base → cytoscape → fcose → data). Matches `VENDOR_PLACEHOLDERS` order in `asbuilt/src/viz.ts:187-190` and the actual template order (confirmed via grep, lines 302-307). Comment above the describe block states the empirical failure it pins, per requirement.
2. Comment correction: false "async.js port notice" replaced with grep-verified "Promises/A+ implementation notice"; test logic (`expect()` calls) unchanged — only prose.

### Verdict
Task survives the attack. No findings.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
