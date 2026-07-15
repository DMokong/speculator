# Vendored rendering libraries (SPEC-004, AC9)

Pinned UMDs inlined into viz.html by viz.ts at build time.
Never loaded from a CDN. Update = replace file + update this table + re-run
the load smoke + re-run tests.

Browser load order (and global-eval order in tests):
**layout-base → cose-base → cytoscape → cytoscape-fcose.**

## Vendored files (shipped = patched-minified derivatives, round 3 / T04)

`layout-base.js`, `cose-base.js`, and `cytoscape-fcose.js` ship as the
**pre-patched, minified derivatives** described in "Minification, round 3"
below. `cytoscape.min.js` ships minified upstream, unchanged.

| File | Package | Version | License | Source | shipped (minified) sha256 |
|---|---|---|---|---|---|
| cytoscape.min.js | cytoscape | 3.30.2 | MIT | https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js | `83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81` |
| layout-base.js | layout-base | 2.0.1 | MIT | https://unpkg.com/layout-base@2.0.1/layout-base.js | `00143b1ac72e168440eca4b5f7c9a55d38fd3c0cdb7e9d3b637ca9e6c1566dde` |
| cose-base.js | cose-base | 2.2.0 | MIT | https://unpkg.com/cose-base@2.2.0/cose-base.js | `572e078026cce395148f1bea26227c5ed0844e50d59135a91a6258221ac78aee` |
| cytoscape-fcose.js | cytoscape-fcose | 2.2.0 | MIT | https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js | `06cba2115c5d04b9f8014942fce1ec571eb2a8ef08498e93d9c9953a39eeb47c` |

Original (pre-minification) sha256s, unchanged from the round-1 pin — these
are what a `curl` re-fetch by URL above reproduces, and what round 2's table
recorded:

| File | original sha256 | original size |
|---|---|---|
| layout-base.js | `ec15ab5df9af3f20708f4faab994accf91cda71848cd5bb10a23432cc50b6745` | 147,958 B |
| cose-base.js | `7cae9509bd36235a63a85e71c8d9fa2cd0bc1d0c1ecc5b5a737976f39d040ddf` | 118,906 B |
| cytoscape-fcose.js | `4b1cab218d74996aa59cd8473f9239cc6398b8c1774d84d7e59ad9a68959cb57` | 57,239 B |

Total shipped size: **500,033 bytes (~488.3 KB)** — comfortably under the
700 KB budget and close to the spike's ~518 KB projection (the spike
projection over-counted; this round's actual bytes: layout-base 59,912 /
cose-base 45,919 / fcose 20,898, matching the T03 spike's measured minified
sizes exactly). `cytoscape.min.js` is unchanged at 373,304 B.

## Minification attempt (round 2, 2026-07-16)

The brief amendment asked for deterministic minified derivatives of the three
unminified files via `bun build --minify --no-bundle`, gated on a load
smoke passing. `bun --version` used: `1.3.14`.

Commands run (identical for all three, `<pkg>` substituted):

```bash
bun build asbuilt/vendor/<pkg>.src.js --minify --no-bundle --outfile asbuilt/vendor/<pkg>.js
```

Minified output produced successfully and was substantially smaller:

| File | original sha256 | original size | minified sha256 (NOT shipped) | minified size |
|---|---|---|---|---|
| layout-base.js | `ec15ab5df9af3f20708f4faab994accf91cda71848cd5bb10a23432cc50b6745` | 147,958 B | `0b0c766318b1137476dc8a3e1298d43672d9f80e4fd65bb7e96545520e3daada` | 59,909 B |
| cose-base.js | `7cae9509bd36235a63a85e71c8d9fa2cd0bc1d0c1ecc5b5a737976f39d040ddf` | 118,906 B | `71bfd20fecd4554ce192ba4ccb2572e4006f456058984ec4cf5c5337c7669242` | 45,916 B |
| cytoscape-fcose.js | `4b1cab218d74996aa59cd8473f9239cc6398b8c1774d84d7e59ad9a68959cb57` | 57,239 B | `0b4b6d41787bd31d2fefb8268d4208fda79b63d8aef8a0245a011ffe4fa3d86d` | 20,895 B |

**The load smoke FAILED against the minified derivatives**, so per the brief's
explicit fallback instruction they were not shipped. Root cause: all three
packages' UMD wrapper opens with
`(function webpackUniversalModuleDefinition(root, factory) { ... })(this, function() {...})`,
i.e. the detection block is invoked with `this` as the `root` argument, which
must resolve to the global object (`globalThis`) when loaded via a `<script>`
tag or indirect `eval`. `bun build` — with or without `--minify`, with or
without `--no-bundle`, and independent of every `--format`/`--target`
combination tried (`iife`, `cjs`, `esm`, `browser`, `node`, default) —
statically substitutes that top-level `this` with a literal `exports`
reference, because it detects the file assigns to `module.exports` /
`exports[...]` elsewhere and assumes the file will only ever be consumed
through a CommonJS `require()` wrapper (where top-level `this` genuinely
does equal `exports`). That assumption is correct for `require()` consumers
but wrong for our global-eval / script-tag use case, where no `exports`
binding exists, so the very first vendor file to load throws
`ReferenceError: exports is not defined` before `cytoscape` or `cytoscape-fcose`
ever load. This is a `bun build` transpiler behavior, not a flag we
control — no combination of documented flags avoids it (see task report
round 2 for the full flag matrix tried).

Per the brief ("If the smoke FAILS on minified derivatives, fall back to
shipping the unminified originals"): all three files ship as their
unminified, byte-for-byte-as-published originals (sha256s in the table
above). The downloaded `.src.js` staging copies were deleted after
verification, per the brief's cleanup instruction — originals remain
re-fetchable from the Source URLs above and re-verifiable against the
recorded sha256.

## Minification, round 3 (2026-07-16, T04) — SHIPPED

Round 2's root-cause diagnosis (above) pinpointed the exact defect: `bun
build` rewrites the UMD wrapper's top-level `this` → `exports` because the
file also assigns to `module.exports` elsewhere, and that rewrite is what
breaks global-eval loading. The T03 spike (finding 6) and this task's brief
supply the fix: **pre-patch the wrapper's `this` → `globalThis` before
minifying**, so there is no top-level `this` left for `bun build` to
rewrite. `bun --version` used: `1.3.14` (same as round 2 — reproducible,
byte-identical minified output was confirmed against round 2's earlier
attempt at the same sizes: layout-base 59,912 / cose-base 45,919 / fcose
20,898, matching the spike's measured sizes exactly).

Originals were re-staged from the git history commit `ddfc32e` (which holds
the round-1 pinned originals, unchanged since — confirmed by re-hashing
against the sha256s in the "original sha256" table above before patching).
No network re-fetch was needed since the originals are still present at
`asbuilt/vendor/` on this branch prior to this task's overwrite.

Commands run (identical for all three, `<pkg>` substituted, staged outside
`asbuilt/vendor/` and never committed):

```bash
sed 's/(this, function/(globalThis, function/' <pkg>.orig.js > <pkg>.src.js
bun build <pkg>.src.js --minify --no-bundle --outfile asbuilt/vendor/<pkg>.js
```

Each original had exactly one `(this, function` occurrence (the UMD wrapper's
own invocation), confirmed via `grep -c '(this, function' <pkg>.orig.js` = 1
for all three before patching.

| File | patched-minified sha256 (SHIPPED) | size |
|---|---|---|
| layout-base.js | `00143b1ac72e168440eca4b5f7c9a55d38fd3c0cdb7e9d3b637ca9e6c1566dde` | 59,912 B |
| cose-base.js | `572e078026cce395148f1bea26227c5ed0844e50d59135a91a6258221ac78aee` | 45,919 B |
| cytoscape-fcose.js | `06cba2115c5d04b9f8014942fce1ec571eb2a8ef08498e93d9c9953a39eeb47c` | 20,898 B |

**The load smoke PASSES** against these derivatives (see "Load smoke" below)
— the pre-patch removes the top-level `this` entirely, so `bun build` has
nothing ambiguous to rewrite; the shipped `globalThis` assignment survives
minification intact (present in each file as the literal string
`globalThis`, immediately preceding the minified factory-function
invocation — whitespace around the comma is stripped by the minifier, so
`grep -c 'globalThis, function'` — with the space, as written in a plain
English description of the pattern — does not match; `grep -c
'globalThis,function'` — no space, the actual minified byte sequence — does,
≥1 in every one of the three files). These three files ship as the patched-
minified derivatives; `cytoscape.min.js` is untouched.

## Load smoke

A bun script (adapted from `/tmp/vendor-smoke.ts` per round 2; this round's
copy lives in the session scratchpad, not committed — regenerable)
global-evals the four files in load order via `(0, eval)(...)` and confirms
`cytoscape({headless: true, elements: []}).layout({name: "fcose"})` does not
throw.

- Against round 2's minified derivatives (no pre-patch): **FAIL**
  (`ReferenceError: exports is not defined`, thrown by `layout-base.js`, the
  first file in load order).
- Against round 3's patched-minified derivatives — **the files shipped in
  this directory today**: **PASS** (`fcose ok`).
