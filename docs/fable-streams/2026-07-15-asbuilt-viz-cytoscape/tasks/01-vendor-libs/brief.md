---
task: 01-vendor-libs
parallel_safe: true
testable: false
tier: standard
---

## Goal

Vendor the four rendering libraries for SPEC-004 (AC9) as pinned minified UMD
files under `asbuilt/vendor/`, with versions, licenses, source URLs, and
sha256 hashes recorded in `asbuilt/vendor/VENDOR.md`.

## Done-check

All four libraries exist under `asbuilt/vendor/` (minified derivatives where
the amended rules below produce them), `VENDOR.md` has a complete row per
file (no `<fill>` placeholders), every sha256 matches the actual files, the
global-eval load smoke passes, and all sizes are RECORDED (no hard cap —
amended 2026-07-16, see escalations.md: the output-size decision moved to
T03 finding 6).

## File scope

**Working directory contract (amended 2026-07-16 — round 1 violated this):**
ALL work happens in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; before ANY write or commit, `git rev-parse --abbrev-ref HEAD`
must print `asbuilt-viz-cytoscape` — if it prints anything else, STOP and
escalate. Never write under `/Users/dustincheng/projects/speculator` itself
(the main checkout); the only exception is your report file at its absolute
stream path. Round 1's vendor files were relocated into the worktree by the
conductor and sit there untracked — start from them.

- `asbuilt/vendor/cytoscape.min.js` (create)
- `asbuilt/vendor/layout-base.js` (create)
- `asbuilt/vendor/cose-base.js` (create)
- `asbuilt/vendor/cytoscape-fcose.js` (create)
- `asbuilt/vendor/VENDOR.md` (create)

All paths relative to the repo root you are dispatched in (the worktree).

## Required content

Fetch pinned releases from unpkg. Latest stable at execution time; known-good
floor (use these exact versions if in doubt or if newer majors look risky):

```bash
cd asbuilt/vendor
curl -sO https://unpkg.com/cytoscape@3.30.2/dist/cytoscape.min.js
curl -sO https://unpkg.com/layout-base@2.0.1/layout-base.js
curl -sO https://unpkg.com/cose-base@2.2.0/cose-base.js
curl -sO https://unpkg.com/cytoscape-fcose@2.2.0/cytoscape-fcose.js
```

NETWORK IS ALLOWED in this task only — it is the pin step. Verify each file
is real code (not an unpkg 404 HTML page): first bytes must not be `<!DOCTYPE`
or `Cannot find`.

**Minification rules (amended 2026-07-16):** cytoscape ships minified;
layout-base, cose-base, and cytoscape-fcose do not. For those three, produce
deterministic minified derivatives:

```bash
bun build asbuilt/vendor/layout-base.src.js --minify --no-bundle --outfile asbuilt/vendor/layout-base.js
# (same for cose-base, cytoscape-fcose; if --no-bundle is unsupported in the
#  installed bun, use --external '*' so the UMD require() branches are left alone)
```

Keep the downloaded originals temporarily as `.src.js`, record BOTH sha256s
(original + minified) plus `bun --version` and the exact command in
VENDOR.md, then delete the `.src.js` files (originals stay re-fetchable by
URL + recorded hash). THEN run the load smoke: a bun script that
global-evals layout-base.js → cose-base.js → cytoscape.min.js →
cytoscape-fcose.js with `(0, eval)(...)` and confirms
`cytoscape({headless: true, elements: []}).layout({name: "fcose"})` does not
throw. If the smoke FAILS on minified derivatives, fall back to shipping the
unminified originals (record that outcome and the sizes) — do not ship
broken vendor files to save bytes.

`VENDOR.md` must contain: a header explaining these are inlined into viz.html
at build time and never CDN-loaded; a table with columns
File | Package | Version | License | Source | sha256 (versions = what you
actually pinned; licenses from each package — all four are MIT, verify in the
file headers or package pages); and the load order note:
`layout-base → cose-base → cytoscape → cytoscape-fcose` (browser script order
and test global-eval order both).

## Inputs

- Plan: `docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md` (Task T01)
  — read via the absolute stream path if not present in your checkout:
  `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md`
- Spec AC9: `docs/specs/asbuilt-viz-cytoscape/spec.md`

## Verification commands

```bash
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
git rev-parse --abbrev-ref HEAD             # MUST print asbuilt-viz-cytoscape
ls -la asbuilt/vendor/
shasum -a 256 asbuilt/vendor/*.js
grep -c '<fill' asbuilt/vendor/VENDOR.md    # grep exits 1 / prints 0 — that IS the pass
head -c 80 asbuilt/vendor/cytoscape.min.js  # real JS, not an HTML error page
wc -c asbuilt/vendor/*.js                   # sizes RECORDED in VENDOR.md (no cap here)
bun /tmp/vendor-smoke.ts                    # your load-smoke script: prints "fcose ok"
```

Then commit on the current branch:
`git add asbuilt/vendor/ && git commit -m "feat(asbuilt): vendor cytoscape + fcose stack, pinned + hashed (SPEC-004 T01)"`

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/01-vendor-libs/report.md`
with: versions actually pinned (and why, if they differ from the floor),
sha256 table, total byte count, and command-output tails (≤30 lines) for every
verification command.

## Out of scope

- Any change to `asbuilt/src/` or `asbuilt/tests/` — inlining is T04, loading
  is T03/T06.
- package.json — vendor files are NOT npm dependencies; do not `bun add`.
- Choosing fcose layout options — that is T03's judgment.
