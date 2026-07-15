---
task: 04-data-model
parallel_safe: false
testable: false
tier: standard
---

## Goal

Land SPEC-004's build-side data model in `viz.ts` — path-derived grouping +
`test` flag (AC1), `toElements()` mapping, embedded `elements` key, vendor
inlining plumbing — and finish the vendor minification follow-up ruled at the
spike checkpoint (ship the patched-minified fcose stack, ~518KB projected).

## Done-check

`bun test asbuilt/tests/viz-elements.test.ts` passes (new file, your tests);
the vendor load smoke passes against the shipped (now minified) vendor files;
`grep -c 'globalThis, function' asbuilt/vendor/layout-base.js` ≥ 1 (patched
wrapper present in shipped derivative).

## File scope

**Working directory contract:** ALL work happens in the worktree
`/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`.
`cd` there first; before ANY write or commit, `git rev-parse --abbrev-ref HEAD`
must print `asbuilt-viz-cytoscape` — anything else, STOP and escalate. Only
your report (absolute stream path) is written outside the worktree.

- `asbuilt/src/viz.ts` (modify)
- `asbuilt/tests/viz-elements.test.ts` (create)
- `asbuilt/vendor/layout-base.js`, `asbuilt/vendor/cose-base.js`,
  `asbuilt/vendor/cytoscape-fcose.js` (replace with minified derivatives),
  `asbuilt/vendor/VENDOR.md` (update rows + derivation)
- NOT `asbuilt/src/viz-template.html` (T05), NOT `asbuilt/tests/viz.test.ts`
  or `asbuilt/tests/dense-fixture.test.ts` (T06 evolves them)

## Required content

**A. Vendor minification (settled at the 2026-07-16 checkpoint; exact
derivation proven by the spike — see tasks/03-spike/report.md finding 6):**
for each of layout-base, cose-base, cytoscape-fcose (cytoscape.min.js stays
as-is): re-fetch the original by URL+sha256 from VENDOR.md (network allowed
for this re-fetch only) or reconstruct from git history (ddfc32e has the
originals), then:

```bash
sed 's/(this, function/(globalThis, function/' <pkg>.orig.js > <pkg>.src.js
bun build <pkg>.src.js --minify --no-bundle --outfile asbuilt/vendor/<pkg>.js
```

Run the load smoke (global-eval layout-base → cose-base → cytoscape.min →
cytoscape-fcose via `(0, eval)(readFileSync(f,"utf8"))`; fcose self-registers;
`cytoscape({headless:true, elements: []}).layout({name:"fcose"})` must not
throw). Update VENDOR.md: shipped-file rows get the minified sha256s + sizes;
record original sha256 (unchanged), `bun --version`, and the two derivation
commands per file. Expected minified sizes ≈ layout-base 59,912 / cose-base
45,919 / fcose 20,898 B (spike-measured).

**B. viz.ts data model:**
- `VizConceptNode` gains `test: boolean` (= `isTestConcept(fm)`); the node's
  `group` becomes ALWAYS `groupOf(fm.resource)` (today line ~168 switches on
  isTestConcept — remove that switch; do NOT touch `isTestConcept` itself).
- Export `toElements(nodes, links)` returning cytoscape elements, in this
  deterministic order: one parent element per group (`{data:{id:"dir:"+group,
  label:group}}`, groups codepoint-sorted), then child nodes sorted by id
  (`{data:{id, parent:"dir:"+group, label:<basename>, test, d:<diameter>},
  classes:<state + (test?" test":"")>}` where diameter = `2*(4+2.3*Math.sqrt(
  symbols||1))` and state ∈ skeleton|accuracy|full per enrichment), then edges
  sorted source→target (`{data:{id:source+"->"+target, source, target, w}}`).
- Embedded JSON becomes `{ meta, nodes, links, elements: toElements(nodes,
  links) }` — same key order, still one JSON.stringify with the existing
  `</` escaping.
- Vendor inlining: export `inlineVendor(template: string): string` that
  replaces the four placeholders `__VENDOR_LAYOUT_BASE__`,
  `__VENDOR_COSE_BASE__`, `__VENDOR_CYTOSCAPE__`, `__VENDOR_FCOSE__` with the
  corresponding `asbuilt/vendor/` file contents using **split/join, never
  String.replace** (minified code contains `$`-sequences that corrupt
  replace). Wrap each insertion between `/*VENDOR:<name>:start*/` and
  `/*VENDOR:<name>:end*/` marker comments (T06 byte-compares those regions
  against the vendor files). `buildViz` calls `inlineVendor(template)` before
  the existing data replacement; with no placeholders present (current
  template, until T05) it must be a byte-level no-op.

**C. Tests (`viz-elements.test.ts`)** — failing-first, then green: test flag +
path grouping on a co-located test concept (`src/tools/x.test.ts`, type Test →
group `src/tools`, test true); no node grouped `tests` unless its path is a
two-segment `tests/*` file; toElements parent-per-group / parent wiring /
edge weights / deterministic double-call deep-equality; inlineVendor
round-trip on a synthetic 4-placeholder template string (markers present,
vendor bytes intact — compare against readFileSync of a vendor file
containing `$&` if you want the replace-corruption regression pinned); no-op
behavior on a template without placeholders.

**Known post-task state (record, do not fix):** `asbuilt/tests/viz.test.ts`
(old `group === "tests"` assertion) and `asbuilt/tests/dense-fixture.test.ts`
(pre-T04 grouping counts, carries the flip comment) will FAIL after your
change — that evolution is T06's scope. Do not edit them.

## Inputs

- Spike settled facts: `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/03-spike/report.md`
- Plan Task T04: `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/plan.md`
- `asbuilt/src/viz.ts`, `asbuilt/vendor/VENDOR.md`, `asbuilt/tests/viz.test.ts`
  (conventions only), spec `docs/specs/asbuilt-viz-cytoscape/spec.md` (AC1/AC3/AC9)

## Verification commands

```bash
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape
git rev-parse --abbrev-ref HEAD          # asbuilt-viz-cytoscape
bun test asbuilt/tests/viz-elements.test.ts
bun /tmp/vendor-smoke-t04.ts             # your smoke: prints "fcose ok" against shipped vendor files
shasum -a 256 asbuilt/vendor/*.js        # matches updated VENDOR.md rows
wc -c asbuilt/vendor/*.js                # three minified + cytoscape.min ≈ 500KB total
cd asbuilt && bunx tsc --noEmit && cd ..
```

Commit: `git add asbuilt/ && git commit -m "feat(asbuilt): path grouping + test flag + toElements + vendor inlining, minified vendor stack (SPEC-004 T04)"`

## Report obligation

Append `## implementer — round <N>` to
`/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-15-asbuilt-viz-cytoscape/tasks/04-data-model/report.md`:
vendor derivation evidence (sha256 before/after, smoke tail), test run tails,
the recorded expected-fail state of viz.test.ts / dense-fixture.test.ts
(≤30-line tails each).

## Out of scope

- The template (T05). Existing-suite evolution (T06). Layout options, zoom
  thresholds, styling (T05). Any change to isTestConcept or classification.
