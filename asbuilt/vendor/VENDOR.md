# Vendored rendering libraries (SPEC-004, AC9)

Pinned UMDs inlined into viz.html by viz.ts at build time.
Never loaded from a CDN. Update = replace file + update this table + re-run
the load smoke + re-run tests.

Browser load order (and global-eval order in tests):
**layout-base → cose-base → cytoscape → cytoscape-fcose.**

## Vendored files

| File | Package | Version | License | Source | sha256 |
|---|---|---|---|---|---|
| cytoscape.min.js | cytoscape | 3.30.2 | MIT | https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js | `83e8c54a6bec655bfd81df07df605649c268af69aeca67a5ea2da54ea42dac81` |
| layout-base.js | layout-base | 2.0.1 | MIT | https://unpkg.com/layout-base@2.0.1/layout-base.js | `ec15ab5df9af3f20708f4faab994accf91cda71848cd5bb10a23432cc50b6745` |
| cose-base.js | cose-base | 2.2.0 | MIT | https://unpkg.com/cose-base@2.2.0/cose-base.js | `7cae9509bd36235a63a85e71c8d9fa2cd0bc1d0c1ecc5b5a737976f39d040ddf` |
| cytoscape-fcose.js | cytoscape-fcose | 2.2.0 | MIT | https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js | `4b1cab218d74996aa59cd8473f9239cc6398b8c1774d84d7e59ad9a68959cb57` |

Total shipped size: **697,407 bytes (~681 KB)**. `cytoscape.min.js` ships
minified upstream (373,304 B). `layout-base.js`, `cose-base.js`, and
`cytoscape-fcose.js` ship as the **unminified originals** — see "Minification
attempt" below for why.

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

## Load smoke

A bun script (`/tmp/vendor-smoke.ts`, not committed — regenerable) global-evals
the four files in load order via `(0, eval)(...)` and confirms
`cytoscape({headless: true, elements: []}).layout({name: "fcose"})` does not
throw.

- Against the minified derivatives above: **FAIL** (`ReferenceError: exports
  is not defined`, thrown by `layout-base.js`, the first file in load order).
- Against the shipped (unminified) files in this directory: **PASS**
  (`fcose ok`).
