# Report — 03-spike

## implementer — round 1

Working directory verified before any write:
`git rev-parse --show-toplevel` = `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-viz-cytoscape`,
`git rev-parse --abbrev-ref HEAD` = `asbuilt-viz-cytoscape`. All repo reads happened
in the worktree; the only file written outside it is this report at its absolute
stream path. Scratch scripts + spike HTMLs live under
`…/scratchpad/spike/` (uncommitted). `bun --version` = `1.3.14`. A local Google
Chrome (`/Applications/Google Chrome.app/…`) was available and used for the
browser look-checks.

### ⚠ Escalation: `plan_invalidating_discovery` (AC10 packing metric is non-operational)

AC10 and finding-3's formula assume (a) a well-packed fcose layout lands ≤3.0× on
the dense fixture and (b) the reverted ring layout **fails** that bound. **Both are
false**, measured first-hand:

| Layout (dense fixture) | packing factor (global bbox / Σ per-group bbox) |
|---|---|
| fcose (recommended options) | **4.116** — OVER 3.0 |
| reverted ring (template's own settled sim) | **2.631** — UNDER 3.0 (i.e. PASSES) |

The metric would **fail the good layout and pass the reverted one** — the exact
inversion of AC10's intent. Root cause: `global/Σ(cluster-bbox)` measures voids
only when clusters are tight, discrete, non-overlapping blocks. The reverted ring
scatters each group widely (spread `90+44·√count`) so per-group bboxes are large
and mutually overlapping → Σ is inflated → ratio is *low* even though the layout
has the empty-middle void that got it reverted. fcose makes tight, separated
clusters (small Σ) with real inter-cluster gaps → ratio is *high*.

I tried to rescue it three ways, all negative:
- **Tuning fcose** (seed radius 0–330, gravity 0.25–200, gravityCompound,
  nodeSeparation 6–60, nodeRepulsion 1k–20k, idealEdgeLength 30–140,
  tile/packComponents on/off, quality proof): dense floors at **~3.7** and never
  reaches "comfortably under 3.0". Best worst-case was 3.721.
- **AC1 regrouping** (fold tests into their source dir → cmd/cli becomes the
  96-node cluster): dense=3.574, claw=**8.972** — worse, not better.
- **Alternative metrics.** Ink-fill (`global bbox / Σπr²`) doesn't discriminate
  either (dense: fcose 27.9 < ring 34.9 ✓ but claw: fcose 27.6 > ring 19.4 ✗).
  Node-overlap count is 0 for *both* fcose and the settled ring — the ring's
  de-overlap force resolves overlaps, so overlap isn't the discriminator on this
  fixture.

Because `cose` is disqualified on determinism (see finding 2/6), fcose is
mandatory, and fcose cannot satisfy AC10-as-written on the dense fixture. **This is
a human/spec call at the T03 checkpoint**, so I completed all six findings and both
HTMLs and surface this rather than block. Recommendation options for the checkpoint
are in "Settled facts", item AC10.

---

### Finding 1 — Headless load (loader incantation)

Global-eval the four vendor UMDs in load order via indirect eval
`(0, eval)(readFileSync(path,"utf8"))`. Indirect eval runs in global scope where
`module`/`exports`/`define` are undefined, so each webpack UMD takes its `else
root[name]=factory()` branch and binds onto `globalThis`. **fcose self-registers**
against the global `cytoscape` — no manual `.use()` is required (verified by a
run with the `.use()` call removed: "self-registered: YES"). Load order
(VENDOR.md): `layout-base.js → cose-base.js → cytoscape.min.js →
cytoscape-fcose.js`.

```
$ bun scratchpad/spike/headless-load.ts
globals present: layoutBase=function coseBase=object cytoscape=function cytoscapeFcose=function
cytoscape ok, fcose registered
exit=0
```

Caveat T06 must ship in `vendor-load.ts`: headless fcose needs node **dimensions**.
`styleEnabled:false` leaves width/height NaN → `RangeError: Array length…` in
cose-base's repulsion-grid sizing. The working incantation runs
`cytoscape({headless:true, styleEnabled:true, style:[{selector:"node[d]",
style:{width:"data(d)",height:"data(d)"}}], elements})` with a diameter `d` in each
node's data. Determinism is unaffected (no randomness in the stylesheet).

### Finding 2 — Determinism (verdict: DETERMINISTIC)

Built elements from `buildViz(makeDenseSandbox(),"2026-07-15")`, parsed the embedded
JSON with `/(\{"meta":.*"links":\[.*\]\})/s`, mapped nodes→child elements
(`parent:"dir:"+group`, one parent element per group) seeded from the template's FNV
`hash()` (`90+44·√groupCount` spread around the old ring anchors), links→edges. Ran
fcose (`randomize:false, animate:false`) twice in-process **and** in a fresh bun
subprocess. All 111 child positions `JSON.stringify`-identical both ways → no
`Math.random`/clock leak. (Note: fcose with `randomize:false` runs its spectral
phase and largely *ignores* the seed positions — the seed-radius sweep gave
identical factors for R∈{0,90,180,330} — but the output is still deterministic, and
the seed is present as AC8 requires.)

```
$ bun scratchpad/spike/determinism.ts
identical positions: true   (in-process, two fcose runs)
identical positions: true   (cross-process, fresh bun)
determinism verdict: DETERMINISTIC (111 child nodes)
exit=0
```

### Finding 3 — Packing factor (both bundles)

Per-group axis-aligned bbox over member centers ± radius `4+2.3·√(symbols||1)`;
global bbox over all nodes; factor = globalArea / Σ groupAreas. Recommended fcose
options (locked). **Both bundles land OVER the 3.0 bound** — see the escalation
above for why this is a metric problem, not a tuning failure.

```
$ bun scratchpad/spike/packing.ts   (fcose section)
[dense/fcose] 111 nodes / 18 links / 6 groups
  groups: cmd/cli(54), internal/cli(4), internal/model(6), internal/util(4), src(1), tests(42)
  Σ groupArea = 93,873   globalArea = 386,368   packing factor = 4.116
[claudeclaw/fcose] 67 nodes / 54 links / 8 groups
  Σ groupArea = 155,275   globalArea = 520,849   packing factor = 3.354
--- summary (AC10 bound = 3.0) ---
dense  fcose=4.116  cose=0.296     claw   fcose=3.354  cose=0.902
fcose worst-case factor = 4.116  (OVER 3.0)
```
(cose factors are far under 3.0 but fluctuate run-to-run — 0.296 here vs 0.362/0.334
in earlier runs — a direct symptom of cose's non-determinism; see finding 6.)

### Finding 4 — Options + zoom threshold

Recommended fcose option set (below) + **`min-zoomed-font-size: 24`** with child
label `font-size: 10`. Browser-verified in headless Chrome (DPR 1, 1440×900):
- At fit-to-view (real `cy.zoom()` = **1.03** dense / **0.86** claw) child labels do
  **not** render; group (compound-parent) labels **do** (they carry no zoom gate).
  Confirmed: threshold 16 leaked labels, 24 and 32 both hid them cleanly — cytoscape
  compares against an oversampled (~2×) effective label size, so the naive
  `font·zoom≈10` estimate is low; empirical cutoff is ~20px, 24 clears it.
- A ~3× zoom-in on the cmd/cli cluster renders child labels readably (screenshot
  `shot-zoomin.png`: file000.go, file045.go, … legible). Labels re-appear at
  zoom≈1.2, a gentle zoom-in.
- Look note for the checkpoint: fcose `tile` packs the many isolated nodes into a
  tight grid whose labels overlap ("fileCfileC…") at high zoom — a density artifact,
  not a blocker.

### Finding 5 — Look artifacts

Two self-contained HTMLs written (vendor scripts inlined, data inlined, compound
parents, recommended fcose options, `min-zoomed-font-size:24`, state colors, test
tint + rounded-badge shape, always-on parent labels, built-in pan/zoom only, **no
CDN**). Both open in headless Chrome with **zero console/window errors**:

```
$ ls -la scratchpad/spike/spike-dense.html scratchpad/spike/spike-claudeclaw.html
-rw-r--r--  727910  spike-dense.html
-rw-r--r--  727868  spike-claudeclaw.html
$ grep -c 'https://unpkg\|https://cdn' scratchpad/spike/spike-dense.html
0                       # grep exit 1 = pass (no CDN refs)
$ bun scratchpad/spike/verify-render.ts     # headless Chrome, error-capture probe
spike-dense.html: OK nodes=117 edges=18 zoom=1.03
spike-claudeclaw.html: OK nodes=75 edges=54 zoom=0.86
```
Paths: `…/scratchpad/spike/spike-dense.html`, `…/scratchpad/spike/spike-claudeclaw.html`.
Reference screenshots for the checkpoint also captured: `shot-dense.png`,
`shot-claw.png`, `shot-zoomin.png` (same scratch dir).

### Finding 6 — Output size + engine recommendation

`spike-dense.html` size under each variant (budget = spec's ≤700 KB = 716,800 B):

| Variant | vendor files | spike-dense.html | packing (dense/claw) | determinism |
|---|---|---|---|---|
| (a) vendored fcose stack (unminified) | 4 | **710.8 KB** (727,860 B) — **OVER** | 4.116 / 3.354 | deterministic ✓ |
| (b) built-in `cose`, cytoscape.min alone | 1 | 394.1 KB (403,596 B) — ok | 0.296 / 0.902 | **NON-deterministic ✗** |
| (c) minified fcose stack (patched) | 4 | **518.1 KB** (530,486 B) — ok | 4.116 / 3.354 | deterministic ✓ |

```
$ bun scratchpad/spike/sizes.ts
(a) vendored fcose stack (4 files):      710.8 KB (727,860 B)  >700KB OVER
(b) built-in cose, cytoscape.min alone:  394.1 KB (403,596 B)  <=700KB ok
(c) minified fcose stack (patched):      smoke=PASS  518.1 KB (530,486 B)  <=700KB ok
    minified sizes: layout-base=59,912  cose-base=45,919  fcose=20,898
```

- **`cose` is disqualified.** Two runs give different positions
  (`cose identical (two runs): false`), so it fails AC8 regardless of its smaller
  size and low packing factor. The engine must stay **fcose**.
- **Variant (c) is the recommended shipping form.** VENDOR.md round 2 minified the
  three unminified files but the smoke failed because `bun build` rewrote the
  wrapper's top-level `this` → `exports`. Pre-patching each source's wrapper
  `(this, function` → `(globalThis, function` **before** `bun build --minify
  --no-bundle` removes the top-level `this`, so bun has nothing to rewrite. The load
  smoke then **PASSES** and the output is **518 KB — comfortably under the 700 KB
  budget**. Exact derivation (per file, `<pkg>` ∈ {layout-base, cose-base,
  cytoscape-fcose}; cytoscape.min.js stays as-is):
  ```
  sed 's/(this, function/(globalThis, function/' vendor/<pkg>.js > <pkg>.src.js
  bun build <pkg>.src.js --minify --no-bundle --outfile <pkg>.min.js
  # then global-eval [layout-base.min, cose-base.min, cytoscape.min, fcose.min] → fcose registers
  ```
  Engine recommendation: **keep fcose, ship the patched-minified stack (c)**. This
  is a T01 follow-up (redo the minification with the pre-patch); it does not fit
  ≤700 KB otherwise.

---

## Settled facts for T04–T06

- **Loader incantation** (T06 `vendor-load.ts`): global-eval the four UMDs in order
  `layout-base → cose-base → cytoscape(.min) → cytoscape-fcose` via
  `(0, eval)(readFileSync(f,"utf8"))` at a plain-script top level (module/exports not
  in scope). fcose self-registers against the global `cytoscape`; no `.use()` needed.
  Return `globalThis.cytoscape`. Headless callers must set
  `styleEnabled:true` with a `node[d]` width/height stylesheet, else cose-base throws
  `RangeError` on NaN node dimensions.
- **fcose option set** (production):
  ```js
  { name:"fcose", quality:"proof", randomize:false, animate:false,
    packComponents:true, tile:true, tilingPaddingVertical:4, tilingPaddingHorizontal:4,
    nodeSeparation:12, idealEdgeLength:46, nodeRepulsion:4500,
    gravity:1, gravityCompound:1, numIter:2500 /* + fit:true, padding:40 at view time */ }
  ```
- **`min-zoomed-font-size`**: **24** (with child-label `font-size:10`, parent labels
  ungated). Hides child labels at fit (zoom≈0.86–1.03), reveals them by zoom≈1.2.
- **Measured packing factors** (recommended options): dense fixture **4.116**,
  claudeclaw bundle **3.354**. Reverted settled ring for reference: dense 2.631,
  claw 1.722.
- **Recommended AC10 constant / gate** — *routed to the human checkpoint* (see
  escalation). The `global/Σ(cluster-bbox)` ratio does not discriminate the good
  layout from the reverted one on the dense fixture (it fails fcose 4.12 and passes
  the ring 2.63). Options for Dustin:
  1. **Drop the automated packing-factor gate** for AC10 and keep the look-gate
     (human/screenshot) as the compactness guard — the field failure was judged by
     eye, and the metric provably can't stand in for it here.
  2. **Replace the metric** with one validated against *both* fcose output and a
     faithful reproduction of the reverted field case (sdlc-clients), not the
     synthetic dense fixture — candidate signals (inter-cluster gap / centroid
     spread) still need a fixture that actually exhibits the empty-middle void.
  3. **If a ratio gate is kept**, set the constant to **≥4.5** (fcose passes) and
     delete the "reverted ring must fail" clause, which this metric cannot enforce.
  My recommendation: option 1 for now (the human look-gate is the real compactness
  arbiter), revisit an automated metric in a follow-up with a real field fixture.

## Verification command tails

```
$ bun scratchpad/spike/headless-load.ts    → "cytoscape ok, fcose registered"          exit 0
$ bun scratchpad/spike/determinism.ts      → "identical positions: true" ×2 ; DETERMINISTIC exit 0
$ bun scratchpad/spike/packing.ts          → dense fcose=4.116  claw fcose=3.354        exit 0
$ ls -la …/spike/spike-dense.html …/spike/spike-claudeclaw.html   → both present (727,910 / 727,868 B)
$ grep -c 'https://unpkg\|https://cdn' …/spike/spike-dense.html   → 0  (grep exit 1 = pass)
$ bun scratchpad/spike/verify-render.ts    → both "OK …" (headless Chrome, no errors)
$ bun scratchpad/spike/sizes.ts            → (a) 710.8KB OVER  (b) 394.1KB  (c) 518.1KB smoke PASS
```

Scratch dir (all uncommitted):
`/private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/`
— scripts (`lib.ts`, `headless-load.ts`, `determinism.ts`, `packing.ts`,
`render.ts`, `sizes.ts`, `verify-render.ts`, plus tuning/inspection helpers),
`spike-dense.html`, `spike-claudeclaw.html`, and reference screenshots.

## verifier — round 1

**Command 1:** `bun /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/headless-load.ts`
- Exit code: 0
- Output (last 30 lines):
```
globals present: layoutBase=function coseBase=object cytoscape=function cytoscapeFcose=function
cytoscape ok, fcose registered
```

**Command 2:** `bun /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/determinism.ts`
- Exit code: 0
- Output (last 30 lines):
```
identical positions: true   (in-process, two fcose runs)
identical positions: true   (cross-process, fresh bun)
determinism verdict: DETERMINISTIC (111 child nodes)
```

**Command 3:** `bun /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/packing.ts`
- Exit code: 0
- Output (last 30 lines):
```
=== fcose (vendored stack) ===

[dense/fcose] 111 nodes / 18 links / 6 groups (concepts meta=111)
  groups: cmd/cli(54), internal/cli(4), internal/model(6), internal/util(4), src(1), tests(42)
  Σ groupArea = 93,873   globalArea = 386,368
  packing factor = 4.116

[claudeclaw/fcose] 67 nodes / 54 links / 8 groups (concepts meta=67)
  groups: finance-ui/src(2), memory-mcp-server/scripts(2), memory-mcp-server/src(12), memory-ui/src(6), scripts/asbuilt(19), scripts/asbuilt-viz(1), src(3), tests(22)
  Σ groupArea = 155,275   globalArea = 520,849
  packing factor = 3.354

--- summary (AC10 bound = 3.0) ---
dense  fcose=4.116  cose=0.284
claw   fcose=3.354  cose=0.626
fcose worst-case factor = 4.116  (OVER 3.0)
```

**Command 4:** `ls -la /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/spike-dense.html /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/spike-claudeclaw.html`
- Exit code: 0
- Output (last 30 lines):
```
-rw-r--r--@ 1 dustincheng  wheel  727868 16 Jul 02:54 /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/spike-claudeclaw.html
-rw-r--r--@ 1 dustincheng  wheel  727910 16 Jul 02:54 /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/spike-dense.html
```

**Command 5:** `grep -c 'https://unpkg\|https://cdn' /private/tmp/claude-501/-Users-dustincheng-projects-claudeclaw/17374e48-d5d6-4153-847f-70d3c6c6e967/scratchpad/spike/spike-dense.html`
- Exit code: 1 (pass — grep found 0 matches)
- Output (last 30 lines):
```
0
```

**Summary:** All five verification commands executed successfully. All exit codes match expectations. Both HTML artifacts exist and contain no CDN references.

## adversarial-reviewer — round 1

Refute-then-steelman. Worktree/branch verified: `git rev-parse --show-toplevel` =
`…/.claude/worktrees/asbuilt-viz-cytoscape`, branch `asbuilt-viz-cytoscape`. All
spike scripts run against this worktree; HTMLs + scripts live in scratchpad
(uncommitted, per brief). No broken_harness.

**Done-check re-run independently — all pass:**
```
headless-load.ts → "cytoscape ok, fcose registered"                 exit 0
determinism.ts   → "identical positions: true" ×2 ; DETERMINISTIC    exit 0
packing.ts       → dense fcose=4.116  claw fcose=3.354               exit 0
grep CDN dense/claw → 0 / 0 (grep exit 1 = pass)
sizes.ts         → (a)710.8KB OVER  (b)394.1KB  (c)518.1KB smoke PASS
verify-render.ts → spike-dense.html OK ; spike-claudeclaw.html OK  (headless Chrome, no console errors)
```
All six findings present with adjacent evidence tails. Both spike HTMLs exist at
the stated paths (727,910 / 727,868 B) and open with zero console/unhandled-
rejection errors (verify-render.ts injects an `error`/`unhandledrejection` probe
into a copy and both report `OK`, not `ERR`).

**Wrong-input / attack attempts that failed to break it:**
- Scope audit: `git diff --stat HEAD -- asbuilt/src asbuilt/tests` is EMPTY;
  no untracked files under src/ or tests/. `asbuilt/node_modules` is a pre-existing
  symlink to the main checkout (mtime 01:41, before the 02:3x–02:5x spike work) —
  not the implementer's write; the gitignore `node_modules/` dir-pattern simply
  doesn't match the symlink file. Not a scope breach.
- HTML self-containment: no `<script src=…>`, CDN grep = 0. The only `http(s)://`
  strings are MIT/Apache license-comment URLs inside the inlined vendor code — not
  fetched, not CDN; a T04–T06 productization cleanup note, out of scope for the spike.

**AC10 discovery independently reproduced (steelman of the escalation):**
```
ring-settle.ts → SETTLED reverted-ring layout: dense=2.631  claw=1.722
packing.ts     → fcose dense=4.116 (OVER 3.0)
```
The reverted ring (the layout that got reverted in the field) PASSES the ≤3.0 bound
while fcose (the good layout) FAILS it — the exact inversion the implementer
reported. The `plan_invalidating_discovery` is sound and correctly routed to the
T03 human checkpoint. This is the spike doing its job (de-risking AC10), not a
defect in the deliverable — the done-check is fully met.

Nearly-flagged-then-dropped: the unignored `asbuilt/node_modules` in the worktree —
dropped after confirming it is a pre-existing symlink, not authored by this task.

Verdict: pass. The spike survived the attack; all six findings land with evidence,
both artifacts render cleanly, scope is honored, and the AC10 metric problem is a
legitimate surfaced discovery for the human checkpoint.

```json
{
  "verdict": "pass",
  "findings": [],
  "escalation": null
}
```
