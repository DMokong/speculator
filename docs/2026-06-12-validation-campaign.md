# The Validation Campaign — Blog Source Pack (2026-06-12)

> Raw material for the Substack post(s). Every number here has a committed artifact behind it —
> pointers inline. The story beats are at the bottom. This is source material, not the draft.

## The one-line arc

A morning code review found that Speculator — a tool whose entire thesis is "measure quality" —
had **zero valid data points for its own thesis**. By midnight the same day: five releases, a
sigma study, a controlled ablation, a calibration corpus, a new gate that caught real bugs on
both of its first live runs, and the thesis's final open question running as an experiment.

## Timeline (all 2026-06-12, one session)

| When | What | Artifact |
|---|---|---|
| Morning | 23-agent review: 7 subsystem mappers → 4 critic lenses → 12 adversarially-verified recommendations | `docs/reviews/2026-06-12/full-review-23-agents.json` |
| | Gate 2c rescue — 867 lines, 45 days unbacked in a working tree, one `git clean -fd` from deletion | branch → merged in v2.10.0 |
| | **v2.8.1 "trust release"** — the installed plugin had self-reported the wrong version for ~8 weeks; the pre-commit gate hook had NEVER fired (invalid matcher syntax); first CI, first git tags | CHANGELOG 2.8.1 |
| Midday | Consolidation wave: 5 parallel implementer agents → **6 fresh-eyes verifier agents found 6 blocking + 30 should-fix issues the implementers' self-reports missed** → 3 fix agents | `docs/reviews/2026-06-12/consolidation-verification-56-findings.json` |
| | **v2.9.0** — gate registry + 79-assertion structural test (mutation-tested), deterministic evidence verifier, Gate 1 scorer blinding | CHANGELOG 2.9.0 |
| Afternoon | **v2.10.0** — Gate 2c (comprehension) wired as 7th gate, shipped through its own pipeline as SPEC-002 | `docs/specs/gate-2c-wiring/` (full evidence) |
| | Sigma study: first-ever measurement of the judge's test-retest noise | `benchmarks/results/test-retest-sigma.yml` |
| | **v2.11.0** — SYSTEM-SPEC domain split (SPEC-003), second full pipeline run | `docs/specs/system-spec-domain-split/` |
| Evening | Feedback-vs-control ablation lands | `benchmarks/results/feedback-vs-control-ablation.yml` |
| | Calibration corpus: 47 band-verified examples | `rubrics/comprehension-calibration/` |
| | **v2.12.0** — corpus + ablation results + noise-safe consumer defaults | CHANGELOG 2.12.0 |
| Night | Outcome matrix (spec score → implementation quality) in flight | `benchmarks/runs/bench-2026-06-12-00x` |

## The headline numbers

### 1. The judge's noise floor (sigma study)

5 repeated scorings of fixed specs, pinned scorer, production rubric:

| Spec quality | Test-retest sigma (overall) |
|---|---|
| Rough draft | **0.86** |
| Polished (×2) | **0.24 / 0.18** |

The trust ladder granted full autonomy on a **0.2-point distinction (7.8 vs 8.0)** — provably
inside judge noise. Response: thresholds raised to 8.3/8.5 (own repo, then consumer defaults).
*The tool that measures spec quality had never measured its own measurement.*

### 2. The ablation (feedback content vs revision compute)

Paired arms, n=3 each, same PRD, pinned scorer, production rubric. Control arm gets identical
revision passes with a generic "improve this spec" prompt — no scorer feedback.

| Arm | Mean lift | Pass rate | Iterations to pass |
|---|---|---|---|
| Feedback | **+2.23** (2.7 / 1.8 / 2.2) | 3/3 | 1, every time |
| Control | **+0.63** (1.5 / 0.4 / **0.0**) | 0/3 | exhausted all 3 |

One control chain got *literally zero lift* from three revision passes. The previously
published "Speculator ALWAYS improves specs (9/9)" claim was a same-judge feedback loop with
no control arm — it's now caveated in place, and this replaces it as the citable evidence.

### 3. Gate 2c: two live runs, two real catches

The comprehension gate (a fresh agent cold-reads spec + diff, explains what shipped, scores
its own explanation) found a genuine defect on **both** of its first runs:

- **Run 1** (SPEC-002, 7.8/7.0): found that the deterministic evidence verifier registered
  gate-2c evidence as unverifiable — the recompute check it was promised would never have run.
- **Run 2** (SPEC-003, 7.8/7.0): found three routing policies living only in an agent file
  instead of the lib single-source — *the exact drift mechanism that spec existed to prevent.*

Both artifacts are calibration-corpus seeds. Both fixes landed before the code review, which
then **verified the fixes via the comprehension artifact as preamble** instead of re-deriving.

### 4. The pipeline grading its own homework, honestly

- SPEC-002's eval set **failed Gate 2a (6.3/6.5, blocking flag)** — the evals didn't cover the
  spec's own "fluent-but-wrong" anti-pattern. Revised, passed 8.0 on retry. The feedback loop
  isn't theater.
- SPEC-003 applied that lesson (anti-patterns covered at authoring time): **passed first round, 8.1**.
- SPEC-003 was the **first spec to clear the sigma-raised Full Auto bar** — 8.0 → 8.4 via one
  improvement round, judged by a scorer that (since v2.9.0) never sees the pass threshold.

### 5. The multi-agent meta-result

The consolidation wave's implementers all reported success. Six independent fresh-eyes
verifiers then found **6 blocking issues** in that "successful" work — including the release's
headline feature being invoked by a relative path that meant *it would silently never run for
any actual user*, and an ordering deadlock in the close flow. Self-reported success is not
evidence; adversarial verification is. (The same pattern, applied to the product itself, IS
Gate 2c.)

## Story beats worth telling

1. **"The missing measure was missing its own measure"** — a spec-quality scorer whose own
   score noise was unmeasured, whose autonomy bands were inside that noise, and whose headline
   benchmark was a Goodhart loop. The fix wasn't shame, it was instrumentation.
2. **The 45-day unbacked rescue** — the project's #1 roadmap priority existed only as
   uncommitted files. `git checkout -b` as an act of risk management.
3. **The hook that never fired** — permission-rule syntax in a hook matcher; a quality
   enforcement mechanism that was dead on arrival and nobody noticed, because nothing verified
   the verifier. (Theme echo: who watches the gates?)
4. **Dark code's gate caught dark docs** — Gate 2c's whole premise is that fluent explanations
   of code nobody read are dangerous. Its calibration corpus is now full of deliberately
   fluent-but-wrong explanations, because that's what a judge must learn to detect.
5. **Session limit as resilience test** — the day's own infrastructure failures (a session
   limit killing all 6 benchmark chains) validated the per-target error isolation built hours
   earlier, and the workflow journal resumed the corpus build with 3 of 4 generators cached.
6. **What's still honest to say**: the ablation validates feedback-content lift under a
   same-judge design; the score → implementation-outcome link is the open question the outcome
   matrix is testing. Don't overclaim — the whole point of the day was un-overclaiming.

## Artifact map (everything committed)

- Review + verification raw findings: `docs/reviews/2026-06-12/*.json`
- Sigma study: `benchmarks/results/test-retest-sigma.yml` (+ `benchmarks/scripts/sigma_study.py`)
- Ablation: `benchmarks/results/feedback-vs-control-ablation.yml` (+ `scripts/spec_only_ablation.py`, `matrix/feedback-ablation.yml`)
- Caveated historical claims: `benchmarks/results/3-round-spec-quality.yml` (top block + addendum)
- Full pipeline evidence, both dogfood specs: `docs/specs/gate-2c-wiring/`, `docs/specs/system-spec-domain-split/` (spec, evals, all gate YAMLs incl. the comprehension artifacts)
- Calibration corpus: `rubrics/comprehension-calibration/` (47 examples + README)
- The five releases: CHANGELOG 2.8.1 → 2.12.0, git tags, CI runs
- Living spec: `docs/specs/SYSTEM-SPEC.md` (SPEC-001/002/003 provenance trails)
- Outcome matrix (pending): will land in `benchmarks/results/` when analyzed
