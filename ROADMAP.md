# Speculator Roadmap

> Last updated: 2026-07-07 (v2.18.0)
>
> The MANIFESTO defines the *thesis*. The CHANGELOG records *what shipped*. This document covers *what's next* and *what we deliberately deferred*.

---

## The Anti-Dark-Code Thesis

The strategic frame Speculator is building toward is **anti-dark-code** — a pipeline that prevents code from shipping unless intent, behavior, and comprehension can all be evidenced.

> *"Dark code = production software generated, passing tests, shipped — but never understood by anyone at any point. Distinct from technical debt; enabled by two breaks: (1) AI separates generation from comprehension, (2) automated quality gates bypass the need for human understanding."*
> — Nate B Jones, "Your Codebase Is Full of Code Nobody Understood" (Apr 2026)

The Amazon "Kiro" case study — 80% AI-coding mandate + 16K engineer layoffs → autonomous environment deletion → 13h downtime — is the load-bearing example. The crisis wasn't the tool; it was eliminating the humans who *understood* what the tool was touching. NBJ's follow-up ("Comprehension Over Output", Apr 21) generalized the diagnosis to the labor market: *production is cheap, comprehension is scarce.*

Jones proposed three fixes. Speculator's pipeline maps to all three:

| Jones's fix | Speculator gate | Status |
|-------------|------------------|--------|
| **Spec-driven dev** — comprehension lives in the spec | Gate 1 (Spec Quality) + Gate 2a (Eval Intent) | ✅ Shipped |
| **Comprehension gates** — PRs blocked unless human can explain what the code does | **Gate 2c (Comprehension Gate)** | ✅ **Graduated: measured As-Built mode (v2.13.0) is on by default for new projects since v2.17.0** |
| **Context engineering** — failure modes + why-wired-this-way on high-risk modules | Gate 2c artifact (durable per-AC explanation, not just a gate) | 🚧 Same artifact, dual purpose |

Gate 2b (Eval Quality) addresses a separate failure mode — tests that pass while testing the wrong thing — and was always **Phase 1 of a two-phase anti-dark-code expansion**. Gate 2c is **Phase 2**.

**Design reference:** see `docs/REVIEW-2026-04-28.md` for current-state review and the original design at `docs/superpowers/specs/2026-04-15-anti-dark-code-pipeline-design.md` (in the parent ClaudeClaw workspace).

**Prior art (study, don't fork):**
- **`NateBJones-Projects/OB1`** — NBJ's "Open Brain" infrastructure. Includes a `recipes/repo-learning-coach/` recipe that operationalizes comprehension as an interactive lesson app (Supabase-backed, durable takeaways flow into the `thoughts` table). Demonstrates the *learning* face of comprehension — the "make systems self-describing" layer. Licensed FSL-1.1-MIT (converts to MIT after 2 years).
- **`az9713/dark-code-skills`** — community 14-skill / 7-hook suite explicitly built in response to NBJ's three-layer framework. Includes a `comprehension-gate` skill with a 7-dimension operational rubric (credential exposure, cross-service side effects, blast radius, state/persistence mismatch [Kiro pattern], token TTL, implicit assumptions, comprehension check) producing CLEAR / REVIEW REQUIRED / HOLD verdicts. Different orientation from Speculator's planned Gate 2c — operational-risk-focused rather than spec-alignment-focused — and the two are complementary, not competing. No license file at time of review (treat as read-only reference).

**Cross-pollination opportunity:** the operational dimensions in `dark-code-skills` (blast radius, implicit assumptions, Kiro pattern, TTL hygiene) are not in scope for Speculator's Gate 2c (which is intent-fidelity-focused) but several would naturally enrich Gate 3 (code review). Worth a follow-on issue once Gate 2c lands.

---

## Where we are (2026-07-07)

| Pillar | Status |
|---|---|
| Required 4-gate pipeline (Spec / Code / Review / Evidence) | ✅ Shipped, dogfooded on Speculator's own SPECs |
| Gate 2a — Eval Intent (pre-implementation) | ✅ Shipped v2.8.0, opt-in |
| Gate 2b — Eval Quality (post-implementation) — *Anti-dark-code Phase 1* | ✅ Shipped v2.7.0, opt-in |
| **Gate 2c — Comprehension Gate** — *Anti-dark-code Phase 2* | ✅ Shipped 2026-06-12 (experimental) → graduated via As-Built mode v2.13.0 (measured: calibration divergence 0.5, sigma 0.162) |
| Gate 3 — Mandatory secrets scan | ✅ Shipped v2.5.0, 25/25 fixture tests passing |
| Gate 3 — Skill description eval | ✅ Shipped v2.6.0 |
| `/sdlc run` autonomous orchestrator with trust ladder | ✅ Shipped v1.3.0, refined through v2.x |
| Self-improvement loop with boundary constraints | ✅ Shipped, encoded in 3 places in `sdlc-run/SKILL.md` |
| Worktree isolation + cross-worktree resolution | ✅ Shipped, documented in `lib/spec-resolution.md` |
| SYSTEM-SPEC.md (living spec) + spec-compactor agent | ✅ Shipped v2.1.0, first compaction landed (SPEC-001) |
| Impact awareness validation | ✅ Shipped, decision matrix in `rubrics/impact-awareness.md` |
| Spec-Bench harness | ✅ Shipped, 67/67 tests passing, 3-round results published |
| Spec-Bench calibration protocol (human-vs-judge) | ✅ Shipped, divergence flagging in place |
| SYSTEM-SPEC split layout (index + per-domain files) | ✅ Shipped v2.11.0 (SPEC-042), compactor routes by `domain:` |
| As-Built living KB (fold / refresh / backfill / verify / graphify lane) | ✅ Shipped v2.13.0, hardened v2.16.0 (SPEC-054: dead-id reconciliation, skeleton refusal guard, conservative call edges, test-source classification) |
| Multi-language extraction (TS, Go, Java, Python) | ✅ Shipped v2.15.0 (SPEC-053), TS byte-identical to prior extractor |
| `/spec prime` — CLAUDE.md onboarding | ✅ Shipped v2.14.0 (SPEC-052) |
| Validation campaign (test-retest sigma, feedback-vs-control ablation, outcome matrix) | ✅ Landed — see `benchmarks/results/` |
| **All seven gates enabled by default in `doctor --init`** | ✅ **Shipped v2.17.0** (2c in `mode: asbuilt`; existing configs unaffected) |
| **Risk-level-bound gate enablement** (per-gate `risk_levels:` allowlists) | ✅ **Shipped v2.18.0** (SPEC-057: one predicate in `lib/gates.md`, read by every surface; doctor default binding `[medium, high, critical]`; 2a/2b evidence records weights — Gate 4 recomputes all scored gates) |

---

## Gate 2c: Comprehension Gate — shipped experimental; As-Built mode graduated (v2.13.0)

**Goal:** close the dark-code pathway between "tests pass" and "code ships." The comprehension agent reads the spec + diff *cold* (no access to the implementing agent's reasoning — the implementing agent cannot be its own judge), generates a per-AC explanation artifact, then scores it.

**Status:** shipped experimental 2026-06-12; calibration corpus v2.12.0 (47 band-verified examples); `mode: asbuilt` v2.13.0 — a split generator/blinded-judge instrument with mechanically validated citations, measured against the corpus (calibration mean divergence 0.5, no `needs_tuning` flags, test-retest sigma 0.162, band-edge sigma follow-up completed; see `rubrics/comprehension.md` § As-Built mode). **Since v2.17.0 the gate is enabled by default for new projects, in `mode: asbuilt`** — the first blocking production run scored 8.9 and caught a real invoker error (wrong diff-range base) during its own smoke test (SPEC-055, v2.17.1). The legacy single-dispatch scorer remains uncalibrated and is no longer the generated default. Remaining measurement follow-ups (human anchoring of the accuracy subset, 9-10-band coverage, non-TS calibration) are tracked in the consuming project's issue tracker; risk-level binding is now Active Priority 2.

The artifact has dual value:
- **As a gate** — catches dark code (implementations that satisfy tests while missing spec intent).
- **As context** — durable per-AC documentation answering *"why was this written this way?"* for future developers and agents months later. This is Jones's "context engineering" layer operationalized.

### Architecture (as shipped)

| Element | Specification |
|---------|---------------|
| Position in pipeline | Between Gate 2b (Eval Quality) and Gate 3 (Code Review) |
| Agent | `agents/comprehension-scorer/AGENT.md` (single agent generates + scores in one pass) |
| Rubric | `rubrics/comprehension.md` — 4 dimensions |
| Evidence | `evidence/gate-2c-comprehension.yml` |
| Threshold | Overall ≥ 7.0, every dimension ≥ 5, no blocking flags |
| Config | `gates.comprehension.enabled` + `mode` in `sdlc.local.md` (enabled + `mode: asbuilt` by default in generated configs since v2.17.0) |
| Phase detection | Row 3b in `sdlc-run/SKILL.md` between rows 3a (eval-quality) and 4 (review) |

### Scoring rubric — 4 dimensions

| Dimension | Weight | What it catches |
|-----------|--------|-----------------|
| AC Coverage | 0.30 | Every AC mapped with a substantive, non-trivial entry |
| Accuracy | 0.30 | Does the explanation actually match the code? (judge sees diff + artifact) |
| Spec Fidelity | 0.25 | Does the described behavior match the spec's intent, not just letter? — **this is the dark-code detector** |
| Scope Containment | 0.15 | Unexplained behaviors = scope creep or dark-code pockets |

**Critical judge instruction:** *"You are evaluating whether this explanation is accurate and whether the implementation does what the spec intended. Do not evaluate code quality — that is Gate 3's job."*

### Downstream effect on Gate 3

The Gate 3 reviewer reads the comprehension artifact as preamble before running the 6-point review. The reviewer doesn't have to re-derive *"what does this code do"* from scratch — they enter review already knowing which ACs are fully/partially covered, where the code lives, and which behaviors are unexplained. Review becomes richer and faster.

### Build status

| Workstream | Status |
|------------|--------|
| `rubrics/comprehension.md` with calibration examples (10–15 per dimension) | 🚧 **Open** — seed examples shipped; the calibrated corpus (from real artifacts) is the critical path |
| `agents/comprehension-scorer/AGENT.md` | ✅ Shipped |
| `gate-check` skill update + `sdlc-run` phase detection | ✅ Shipped (row 3b + `references/phase-comprehension.md`) |
| Gate 3 preamble update (read comprehension artifact) | ✅ Shipped (gate-check reads the artifact before the Gate 3 checklist) |
| Schema update in `sdlc.local.md` template | ✅ Shipped (`/sdlc doctor --init` commented block) |
| Dogfooded SPEC + Gate 1–4 evidence | 🚧 Open — first real run should dogfood the gate on its own changes |

The agent code was mostly mechanical, as predicted. **Calibration is the remaining build.** A confidently wrong explanation is worse than no explanation (false confidence) — the calibration set must include cases where the explanation looks plausible but contradicts the diff, seeded from real artifacts the wired gate now produces. Without a strong calibration set, the Accuracy dimension drifts and the gate becomes performative — which is why the gate stays labeled experimental until the corpus exists.

### Risks

1. **Accuracy drift.** The Accuracy dimension carries 0.30 weight; getting it wrong undermines the whole gate. Mitigation: build calibration explicitly around "plausible-but-wrong" examples.
2. **Gaming.** Teams aware of the rubric might add explanation language without substance. Mitigation: Spec Fidelity is hard to game by adding text — it requires the implementation to actually match the spec's intent. Calibration examples should explicitly identify gaming patterns.
3. **Latency.** Cold-read of spec + diff + generation + scoring is the most expensive gate by far. ~~Suggestion: bind enablement to `risk_level` rather than a global flag, in v3.~~ Shipped v2.18.0 (SPEC-057): per-gate `risk_levels:` allowlists, `[medium, high, critical]` by default in generated configs.

---

## Active priorities (next 1–2 minor releases)

> Re-baselined 2026-07-07 (v2.17.1). The previous edition's active list is mostly shipped:
> the validation campaign landed (test-retest sigma, feedback-vs-control ablation, and the
> outcome matrix — all in `benchmarks/results/`), the SYSTEM-SPEC domain split shipped as
> the supported split layout (SPEC-042), and Gate 2c graduated from opt-in experimental to
> **on by default (`mode: asbuilt`) for new projects** in v2.17.0.

### 1. Spec drift detection (`/sdlc audit`) — precondition now met

**Goal:** measure divergence between the living spec (SYSTEM-SPEC) and the living code, over time. SYSTEM-SPEC captures *what we said the system does*; this tool flags when the code stops matching it, amendment-aware (`amends` knows which behaviors are intentionally drifting).

**Why now:** the deferral condition — "drift detection cannot ship before the living spec has a corpus to drift against" — is satisfied. The reference consuming project's SYSTEM-SPEC now spans an index plus 6 domain files covering ~50 compacted specs. An early exploration stalled in that repo (its SPEC-013, 2026-03, pre-split-layout); a restart should build on the split layout + `amends` machinery, and can share bones with the as-built staleness system — drift at the spec level parallels `refresh.ts` staleness at the code level, and the graph manifest gives `audit` a deterministic code-side anchor the March design never had.

**Shape (proposed):**
- A new `/sdlc audit` skill: given the SYSTEM-SPEC layout and a worktree, surface per-behavior drift signals (missing implementation, divergent implementation, orphaned implementation).
- Output: `evidence/audit-{date}.yml` summarizing drift per domain section.
- Integrates with Spec-Bench so drift-rate becomes measurable as a property of teams/harnesses.

### 2. ~~Risk-level-bound gate enablement~~ — ✅ shipped v2.18.0 (SPEC-057)

Per-gate `risk_levels:` allowlists on the opt-in gate blocks, activation predicate defined once in `lib/gates.md` "Risk-level binding" and mirrored into every consumer surface (gate-check, sdlc-run + references, sdlc-status, evidence-package rubric, verify-evidence.sh), enforced by the wiring suite (135 checks, mechanically guarded >103 baseline). `doctor --init` ships `risk_levels: [medium, high, critical]` by default; binding refines but never overrides `enabled: false`; missing/invalid risk metadata fails safe. Rider: 2a/2b scorecards now record their dimension weights, so `verify-evidence.sh` recomputes all four scored gates (the standing "2 skipped" is gone).

### 3. Spec-Bench × mutation testing validation

**Goal:** test the predictive validity of Gate 2b (and eventually 2c) scores against an independent ground truth: mutation kill rates (Stryker/Pitest). High 2b scores should predict high kill rates on AC-relevant mutations.

**Why it got more urgent:** Gate 2b now runs by default for every new project (v2.17.0) — its predictive validity is a live product question, not a research nicety.

**Prerequisite unchanged:** the bench corpus contains zero test files and Gate 2b has never produced a bench evidence artifact; the constant-implementer arm must ship test suites first. Still the single highest-leverage research move.

### 4. Calibration guide

**Goal:** published default tunings per project profile, backed by empirical distributions. Partially unblocked — sigma, ablation, and outcome-matrix data now exist in `benchmarks/results/`; what's missing is per-profile pass/fail distributions. Heavier defaults (v2.17.0) make this MORE urgent: new adopters now need "when to turn things off / retune" guidance more than "what to enable."

## Backlog (prioritized but not scheduled)

> Tactical open issues live in the consuming project's tracker (`bd ready`), grouped roughly as: refresh guardrails (hash-gate reclassification bypass — the P2; extract-first baseline guard), viz productization (which absorbs the NUL-byte hygiene fix), judge-calibration follow-ups (9-10-band, human anchoring), and docs hygiene (comprehension.md EXPERIMENTAL banner + machine-local pointers; evidence-provenance corrections).


- **Spec-Bench public dataset + leaderboard** *(moved from active priorities, 2026-06-12)*. Community-contributed PRDs with openly scored results — the MANIFESTO's "we need a spec quality benchmark" call. The harness and calibration protocol ship today; what's missing is curation and operations. **Trigger: deferred until ≥5 PRDs exist organically — a leaderboard with one PRD and no community is an operations sinkhole.** Re-activate when contributions arrive (see "How to contribute"), not by building ahead of them.
- **Post-implementation quality tracing.** Connect Gate 2 failures, Gate 3 blockers, and post-merge bugs back to the originating spec so we can answer "what spec gaps cost us?" empirically. Requires a thin telemetry layer over the existing evidence files.
- **NBJ "Explanation Artifact" 4-question template** as an optional Gate 2c output mode. The Apr 21 follow-up describes a labor-market-friendly format ("what is this code doing / what assumptions / what could break / what would I change") that doubles as a hiring signal. Gate 2c could emit either the structured YAML *or* the 4-question prose, configurable per project.
- **Add a `Makefile`** target for `test`, `lint`, and the full structural validation pass — currently each suite is a separate manual command.
- **Hard-block mode for the pre-commit hook — robustness first.** Today it's warning-only (`hooks/hooks.json`). Observed 2026-07-07: the hook misfired on a cross-repo commit (couldn't resolve `sdlc.local.md` from a worktree cwd and blocked an unrelated repo's release commit). Fix cwd/repo resolution before any hard-block mode.
- **Test-runner-driven discovery in `eval-quality-scorer`.** Today the agent globs for fixed patterns (`**/test_*.py`, `**/*.test.ts`, etc.). Reading `pytest.ini` / `vitest.config.ts` / `cargo.toml` would generalize discovery without hardcoded language assumptions. Elevated by default-on 2b: a glob miss on an unconventional layout now reads as a false low score for every new adopter.
- **`prime --compact` variant.** A shorter prime block for projects that want the marker-fenced section under ~25 lines (from the SPEC-054 handoff).
- **Non-TS judge calibration campaign.** The asbuilt judge's reliability record (divergence 0.5, sigma 0.162) was measured on TypeScript targets; Go/Java/Python bundles (extractable since v2.15.0) have no measured record yet.

### Shipped from backlog

- **`RELEASE.md`** — shipped v2.8.1. Documents the three-step release dance plus the known landmines.
- **CI workflow** — shipped v2.8.1 (`.github/workflows/ci.yml`). Runs all three structural test suites, `verify-evidence.sh` checks, the Spec-Bench pytest suite, and a plugin.json/CHANGELOG version-consistency check on pushes and PRs.
- **Promote `/sdlc implement` to its own skill file** — shipped v2.9.0: `skills/sdlc-implement/SKILL.md`.
- **N/A rationale paragraph in `rubrics/code-quality.md`** — shipped v2.9.0: "Prompt-Only Changesets (N/A Rationale)" section formalizes the previously informal practice.

---

## Deliberately deferred / out of scope

These have come up in discussion and we've consciously *not* picked them up:

- ~~A separate "epic" type in beads.~~ Overtaken by events — bd grew native epics (`--type=epic` + `--parent` hierarchy + `bd epic status`) and the consuming project's pipeline uses them for every spec. The `sdlc-implement` skill's `dep add --blocked-by {epic}` instruction predates this and should be updated to `--parent` (bd rejects task↔epic blocking).
- **Cross-spec automated conflict detection beyond `amends` validation.** The MANIFESTO names it as a long-term aspiration, but right now `impact-awareness` validation handles the most common case (modifying behavior captured in SYSTEM-SPEC.md). Going broader would require either much larger SYSTEM-SPEC corpora or fundamentally different machinery.
- **Per-spec persistent trust scores.** Trust is per-spec, not historical, and we're keeping it that way. Every spec starts fresh — too many factors vary between features for accumulated trust to be safe to carry forward.
- **Automatic merging without human approval, even at Full Auto + low risk.** The "headless cleanly exits with instructions" pattern in Guided mode is intentional — it's what lets Speculator be safe to run in a long-running headless session.
- **Replacing markdown rubrics with structured schemas.** The current rubric format (markdown with banded calibration examples) is what makes them useful as in-context prompts for LLM-as-judge. A schema-first version would optimize for tooling at the cost of readability and judge accuracy.

---

## How to contribute

The most valuable contributions today are:

1. **Calibration examples for Gate 2c.** The As-Built mode is measured and on by default; what remains is coverage at the edges — 9-10-band examples for spec_fidelity/ac_coverage/scope_containment, human anchoring of the accuracy subset, and any non-TypeScript examples. "This comprehension entry looks plausible but contradicts the diff" cases are still the most valuable.
2. **PRDs for Spec-Bench.** Drop a PRD + functional tests in `benchmarks/prds/` and run the harness. Submit the results. We need diversity of domains.
3. **Mutation testing baselines.** If you have an open-source project with Stryker/Pitest baselines, point us at it — it's the validation move for Gate 2b.
4. **Calibration data.** Run `spec-bench calibrate` against your own runs and contribute the calibration artifacts. They're how we tune the LLM-as-judge over time.
5. **Real-world spec quality data.** If you adopt Speculator on a real codebase, the empirical distribution of scores you see is the most useful thing in the world for the calibration guide.

Find issues at [github.com/DMokong/speculator/issues](https://github.com/DMokong/speculator/issues). The MANIFESTO is the "why"; this document is the "what next".

---

## Source attribution

The anti-dark-code framing is built on:

- Nate B Jones, *"Your Codebase Is Full of Code Nobody Understood"* (Apr 14, 2026) — dark code taxonomy, comprehension gate concept, three-fix framework. [link](https://natesnewsletter.substack.com/p/your-codebase-is-full-of-code-nobody)
- Nate B Jones, *"Your Comprehension Is Worth More"* / "Comprehension Over Output" (Apr 21, 2026) — labor market generalization, Explanation-as-Artifact 4-question template, "production is cheap, comprehension is scarce" thesis.
- Bryan Cantrill, *"The Peril of Laziness Lost"* (TLDR DevOps, Apr 14, 2026) — same failure from a different angle: LLMs lack the "laziness virtue" that forces abstraction pressure.
- Internal design: `docs/superpowers/specs/2026-04-15-anti-dark-code-pipeline-design.md` (parent ClaudeClaw workspace) — the full Phase 1 / Phase 2 architecture that this roadmap operationalizes.
- Barr et al., *"The Oracle Problem in Software Testing"* (IEEE TSE 2014) — AC-to-behavior fidelity theoretical foundation for Gate 2b.
- *Intent-Based Mutation Testing* (ICST Mutation 2025) — academic analog to Gate 2b's framing.
