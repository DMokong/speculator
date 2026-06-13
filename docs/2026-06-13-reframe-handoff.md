# Handoff — Speculator Reframe: from "spec scorer" to "rigour for agent-built software"

> Written 2026-06-13 (end of the validation-campaign session) for a fresh session to pick up.
> The work is a **repositioning of the project's public voice**, grounded in what the
> validation campaign empirically found. This is writing + framing work, not pipeline code.

## Why we're doing this (read first — the honest finding)

The validation campaign (2026-06-12, see `docs/2026-06-12-validation-campaign.md` and the
three result sets in `benchmarks/results/`) tested Speculator's founding thesis — "quality in,
quality out," i.e. **spec score predicts implementation quality** — and the verdict is:

- **Spec-score-as-predictor is unproven and probably weak in 2026.** Sonnet built a near-complete
  20-requirement app from a spec that scored 5.3; the code-judge rated all implementations
  7.1–8.2 regardless of spec score; improved-vs-original outcome deltas were symmetric noise.
  The outcome experiment came back NULL (functional instrument floor-compressed by live-API
  dependency; judge deltas noise at n=2/arm). See `benchmarks/results/outcome-matrix.yml`.
- **Capability trend is against the old thesis.** The manifesto's "thin air problem" (agents
  can't fill spec gaps) was written about 2025 models. 2026 models fill gaps well, and Claude
  Code ships native plan/review. The gap Speculator's *scoring* exists to close is narrowing.
- **Scoring precision is theatre.** Test-retest sigma is 0.18–0.24 on a 10-point scale
  (`benchmarks/results/test-retest-sigma.yml`); one-decimal weighted scores imply precision the
  instrument doesn't have.

BUT — the pipeline proved genuinely valuable this week, just not via scores:

- **Gate 2a failing an eval set** caught a real intent-coverage gap → revise → pass. Forcing
  function, not measurement.
- **Gate 2c (comprehension) went 2-for-2** catching real defects via cold reads — and its
  premise *strengthens* as models improve (more capable models → more code nobody read).
- **The ablation validated the feedback, not the score**: feedback arm +2.0 mean lift, 5/6
  passed; control arm (generic revision) +0.6, 1/6 (`feedback-vs-control-ablation.yml`). The
  lift comes from substantive critique, not rubric arithmetic.
- **The meta-lesson**: five implementer agents self-reported success over six blocking bugs a
  fresh-eyes verifier pass caught. Trust-at-a-distance comes from evidence + independent
  verification, not assertions.

**Conclusion driving the reframe:** Speculator-as-spec-scorer is aging badly;
Speculator-as-trust-infrastructure-for-agent-work is the real, defensible product — and it's
already what the pipeline is under the hood. Reframe the story to match the value.

## The reframe (agreed with Dustin)

**Name:** keep "Speculator." Lean into the Latin *speculari* = "to keep watch"; a Roman
*speculator* was a **scout/watchman** posted to see trouble coming. The product keeps watch over
the artifacts of comprehension so dark code can't grow unseen. (The old "Spec + Evaluator" pun
is demoted; the evaluators are the enforcement mechanism, not the point.)

**Thesis v2:** Agent-speed development makes it trivially cheap to skip the artifacts of
understanding — and the absence is invisible at commit time, crushing six months later.
Speculator makes every shortcut that mortgages future comprehension **visible at the moment
it's taken**. The evaluators exist only to keep the artifact chain honest. The expanded gloss
Dustin offered: "Spec + Evaluation + Comprehension evaluator … the evaluator part is just a
means to ensure we have these artifacts so we're not taking shortcuts that break future
comprehension and grow dark code. Using Speculator means following best practices that keep the
product maintainable by human and agent alike, with proper engineering rigour."

**The artifact chain** (the table to reproduce/refine in the docs — note the asymmetry: better
models make every row MORE skippable and MORE dangerous to skip):

| Artifact | Preserves | Cheap to skip because | Expensive to lack because |
|---|---|---|---|
| Spec | Intent (why/what) | "the model figures it out" | can't later separate decisions from accidents |
| Evals (2a) | Expected behavior pre-impl | post-hoc tests verify what was built | letter-vs-spirit drift undetectable |
| Tests + quality (2/2b) | Behavior, pinned | green feels sufficient | tests that can't detect violations are decoration |
| Comprehension (2c) | Proof someone can explain it cold | implementer "obviously" gets it | dark code — shipped, passing, understood by no one |
| Evidence (3/4) | Receipts it all happened | self-reported success feels like success | trust-at-a-distance becomes vibes |
| Living SYSTEM-SPEC | What the system does + why, w/ provenance | doc rot is tomorrow's problem | institutional memory lives in no head (agents included) |

## Engineering rigour — the spine of the new positioning

Test for inclusion: **a rigour principle qualifies only if it predates software** (ops,
aviation, manufacturing already paid for the lesson — Dustin's "ops already solved this" made
into a design rule). The seven working principles, each with pre-software ancestor + enforcing
gate + campaign receipt:

1. **Intent is explicit before work begins** — requirements eng / change requests → spec-first
   + Gate 1 feedback loop (ablation-validated).
2. **Verification is independent of the actor** — separation of duties, four-eyes, DO-178C V&V
   independence → fresh-context reviewers, blinded scoring, cold-read contract. (Receipt: 5
   implementers vs 6 blocking bugs; Gate 2c 2-for-2.)
3. **Completion is evidenced, not asserted** — change records, audit trails, CAB evidence →
   gate evidence YAMLs + mechanical verification.
4. **Instruments are calibrated before trusted** — metrology, no flying on an uncalibrated
   altimeter → sigma study, bands resized, verify-evidence.sh, deterministic checks where
   judgment isn't needed. (This principle justifies demoting Gate 1 scores to bands.)
5. **Comprehension is a deliverable** — as-built drawings, runbooks, bus-factor → Gate 2c +
   artifact-as-preamble.
6. **Memory is living and provenance-tracked** — configuration management, CMDB, as-maintained
   baselines → SYSTEM-SPEC compaction with `[from:]` trails + amendment awareness.
7. **Discipline is enforced by mechanism, not vigilance** — poka-yoke, interlocks → gate-wiring
   registry test, implementer sandbox.

For public docs, compress to **four pillars** with two cross-cutting disciplines:
- Pillars: **Intent is explicit · Verification is independent · Completion is evidenced ·
  Memory compounds.**
- Cross-cutting: **Calibration** (#4) and **Mechanism over vigilance** (#7).

## Deliverables (build in THIS order — each red-penned by Dustin before it ships; the docs are
the project's public voice)

1. **`PRINCIPLES.md`** (new) — the four pillars + two cross-cutting disciplines. Each principle:
   one-line statement, its pre-software ancestor, the gate/mechanism that enforces it in
   Speculator, and the empirical receipt from the campaign. This is the "withstand the test of
   time" document; build it first because it forces precision and feeds the other two.
2. **`MANIFESTO.md` v2** — rewrite the spine: production is cheap, comprehension is scarce, and
   *the artifacts of comprehension are now the scarcest resource in software*; the artifact
   chain; the century of engineering that already learned each lesson; the pipeline as enforcer
   at agent speed. **Honestly retire the "missing measure" section** with a link to the
   validation campaign — doing so makes the manifesto itself an instance of principle #3
   (completion is evidenced). Keep the strong existing prose where it still holds (the artisan's
   dilemma, dark-code section VI½, specs-as-living-organisms VI all survive and get promoted).
3. **README headline + intro** — from "spec quality scoring and a 7-gate pipeline" to rigour-for-
   agent-built-software framing. Draft seed: *"Engineering rigour for agent-built software.
   Speculator keeps watch over the artifacts of comprehension — spec, evals, tests, explanation,
   evidence — so the product stays maintainable by humans and agents alike."* Keep the gate
   inventory/quick-start; reframe the lead and the "why."

**Deferred (note in docs, do NOT do in the reframe session):**
- **Gate 1 score → coarse bands** (ready / needs-work / stop). Follows from pillar #4; it's a
  pipeline change with its own spec, not a docs change. File/keep as a follow-up.
- **Mutation-testing experiment** (ROADMAP item) — could rescue the outcome link for the
  *test-quality* gate (better-posed than spec-score prediction). Independent track.

## Hard constraints / gotchas (don't relearn these)

- **This is the published plugin's public voice.** Dustin red-pens every doc before it ships.
  Draft as markdown for review; do not assume tone.
- **The reframe must stay empirically honest** — every claim traces to a committed artifact.
  Under-claim deliberately; the whole campaign's lesson was un-overclaiming. Do NOT resurrect
  "spec score predicts outcomes" anywhere.
- **Three-step release** if any version-bearing change ships: plugin repo → marketplace repo
  (`~/projects/claude-plugins`) → local cache (`~/.claude/plugins/cache/dmokong-plugins/
  speculator/<version>/`). See `RELEASE.md`. Docs-only changes don't need a version bump, but if
  you bump, CI enforces plugin.json == CHANGELOG top.
- **CHANGELOG/version consistency** is CI-gated; tag releases.
- **Don't touch `.beads/`** in speculator — the local tracker was retired from git this session
  (it's gitignored now). Speculator work is tracked in the **claudeclaw** beads workspace.
- **Benchmark adapters now git-init a sandbox** in their output dir (contamination fix) — don't
  remove it.
- Current version: **v2.12.0**. Speculator beads queue is **empty** (all 2026-06-12 review
  findings closed). Worktrees: main only (gate-2c + spec003 worktrees removed;
  `contamination-backup-2026-06-13` branch exists locally as insurance, safe to delete once
  comfortable).

## Key artifacts to read at session start

- `docs/2026-06-12-validation-campaign.md` — the day's arc + headline numbers + artifact map.
- `benchmarks/results/{test-retest-sigma,feedback-vs-control-ablation,outcome-matrix}.yml` — the
  three result sets the reframe is grounded in.
- `MANIFESTO.md`, `README.md`, `ROADMAP.md` — what's being reframed.
- `rubrics/comprehension.md` + `rubrics/comprehension-calibration/` — the comprehension gate,
  now the centerpiece of the value story.
- `docs/2026-06-13-substack-draft-who-measures-the-measurer.md` — the post draft; same voice and
  honesty bar the reframe docs should hit.
