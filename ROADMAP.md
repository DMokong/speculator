# Speculator Roadmap

> Last updated: 2026-06-12 (v2.8.1)
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
| **Comprehension gates** — PRs blocked unless human can explain what the code does | **Gate 2c (Comprehension Gate)** | 🚧 **Components on branch `gate-2c-comprehension`, wiring pending — top priority** |
| **Context engineering** — failure modes + why-wired-this-way on high-risk modules | Gate 2c artifact (durable per-AC explanation, not just a gate) | 🚧 Same artifact, dual purpose |

Gate 2b (Eval Quality) addresses a separate failure mode — tests that pass while testing the wrong thing — and was always **Phase 1 of a two-phase anti-dark-code expansion**. Gate 2c is **Phase 2**.

**Design reference:** see `docs/REVIEW-2026-04-28.md` for current-state review and the original design at `docs/superpowers/specs/2026-04-15-anti-dark-code-pipeline-design.md` (in the parent ClaudeClaw workspace).

**Prior art (study, don't fork):**
- **`NateBJones-Projects/OB1`** — NBJ's "Open Brain" infrastructure. Includes a `recipes/repo-learning-coach/` recipe that operationalizes comprehension as an interactive lesson app (Supabase-backed, durable takeaways flow into the `thoughts` table). Demonstrates the *learning* face of comprehension — the "make systems self-describing" layer. Licensed FSL-1.1-MIT (converts to MIT after 2 years).
- **`az9713/dark-code-skills`** — community 14-skill / 7-hook suite explicitly built in response to NBJ's three-layer framework. Includes a `comprehension-gate` skill with a 7-dimension operational rubric (credential exposure, cross-service side effects, blast radius, state/persistence mismatch [Kiro pattern], token TTL, implicit assumptions, comprehension check) producing CLEAR / REVIEW REQUIRED / HOLD verdicts. Different orientation from Speculator's planned Gate 2c — operational-risk-focused rather than spec-alignment-focused — and the two are complementary, not competing. No license file at time of review (treat as read-only reference).

**Cross-pollination opportunity:** the operational dimensions in `dark-code-skills` (blast radius, implicit assumptions, Kiro pattern, TTL hygiene) are not in scope for Speculator's Gate 2c (which is intent-fidelity-focused) but several would naturally enrich Gate 3 (code review). Worth a follow-on issue once Gate 2c lands.

---

## Where we are (2026-06-12)

| Pillar | Status |
|---|---|
| Required 4-gate pipeline (Spec / Code / Review / Evidence) | ✅ Shipped, dogfooded on Speculator's own SPECs |
| Gate 2a — Eval Intent (pre-implementation) | ✅ Shipped v2.8.0, opt-in |
| Gate 2b — Eval Quality (post-implementation) — *Anti-dark-code Phase 1* | ✅ Shipped v2.7.0, opt-in |
| **Gate 2c — Comprehension Gate** — *Anti-dark-code Phase 2* | 🚧 Components rescued to branch `gate-2c-comprehension` (2026-06-12), wiring pending |
| Gate 3 — Mandatory secrets scan | ✅ Shipped v2.5.0, 25/25 fixture tests passing |
| Gate 3 — Skill description eval | ✅ Shipped v2.6.0 |
| `/sdlc run` autonomous orchestrator with trust ladder | ✅ Shipped v1.3.0, refined through v2.x |
| Self-improvement loop with boundary constraints | ✅ Shipped, encoded in 3 places in `sdlc-run/SKILL.md` |
| Worktree isolation + cross-worktree resolution | ✅ Shipped, documented in `lib/spec-resolution.md` |
| SYSTEM-SPEC.md (living spec) + spec-compactor agent | ✅ Shipped v2.1.0, first compaction landed (SPEC-001) |
| Impact awareness validation | ✅ Shipped, decision matrix in `rubrics/impact-awareness.md` |
| Spec-Bench harness | ✅ Shipped, 67/67 tests passing, 3-round results published |
| Spec-Bench calibration protocol (human-vs-judge) | ✅ Shipped, divergence flagging in place |

---

## #1 Priority — Gate 2c: Comprehension Gate

**Goal:** close the dark-code pathway between "tests pass" and "code ships." The comprehension agent reads the spec + diff *cold* (no access to the implementing agent's reasoning — the implementing agent cannot be its own judge), generates a per-AC explanation artifact, then scores it.

The artifact has dual value:
- **As a gate** — catches dark code (implementations that satisfy tests while missing spec intent).
- **As context** — durable per-AC documentation answering *"why was this written this way?"* for future developers and agents months later. This is Jones's "context engineering" layer operationalized.

### Architecture (already designed)

| Element | Specification |
|---------|---------------|
| Position in pipeline | Between Gate 2b (Eval Quality) and Gate 3 (Code Review) |
| Agent | `agents/comprehension-scorer/AGENT.md` (single agent generates + scores in one pass) |
| Rubric | `rubrics/comprehension.md` — 4 dimensions |
| Evidence | `evidence/gate-2c-comprehension.yml` |
| Threshold | Overall ≥ 7.0, every dimension ≥ 5, no blocking flags |
| Config | `gates.comprehension.enabled: true` in `sdlc.local.md` (default off) |
| Phase detection | New row in `sdlc-run/SKILL.md` between rows 3a (eval-quality) and 4 (review) |

### Scoring rubric — 4 dimensions

| Dimension | Weight | What it catches |
|-----------|--------|-----------------|
| AC Coverage | 0.30 | Every AC mapped with a substantive, non-trivial entry |
| Accuracy | 0.30 | Does the explanation actually match the code? (judge sees diff + artifact) |
| Intent Alignment | 0.25 | Does the described behavior match the spec's intent, not just letter? — **this is the dark-code detector** |
| Scope Containment | 0.15 | Unexplained behaviors = scope creep or dark-code pockets |

**Critical judge instruction:** *"You are evaluating whether this explanation is accurate and whether the implementation does what the spec intended. Do not evaluate code quality — that is Gate 3's job."*

### Downstream effect on Gate 3

The Gate 3 reviewer reads the comprehension artifact as preamble before running the 6-point review. The reviewer doesn't have to re-derive *"what does this code do"* from scratch — they enter review already knowing which ACs are fully/partially covered, where the code lives, and which behaviors are unexplained. Review becomes richer and faster.

### Build cost

| Workstream | Effort |
|------------|--------|
| `rubrics/comprehension.md` with calibration examples (10–15 per dimension) | Medium — calibration is the critical path |
| `agents/comprehension-scorer/AGENT.md` | Small — pattern matches existing scorer agents |
| `gate-check` skill update + `sdlc-run` phase detection | Small — copy Gate 2a/2b shape |
| Gate 3 preamble update (read comprehension artifact) | Small |
| Schema update in `sdlc.local.md` template | Trivial |
| Dogfooded SPEC + Gate 1–4 evidence | Required (the pipeline ships its own changes) |

The agent code is mostly mechanical. **Calibration is the build.** A confidently wrong explanation is worse than no explanation (false confidence) — the calibration set must include cases where the explanation looks plausible but contradicts the diff. Without a strong calibration set, the Accuracy dimension drifts and the gate becomes performative.

### Risks

1. **Accuracy drift.** The Accuracy dimension carries 0.30 weight; getting it wrong undermines the whole gate. Mitigation: build calibration explicitly around "plausible-but-wrong" examples.
2. **Gaming.** Teams aware of the rubric might add explanation language without substance. Mitigation: Intent Alignment is hard to game by adding text — it requires the implementation to actually match the spec's intent. Calibration examples should explicitly identify gaming patterns.
3. **Latency.** Cold-read of spec + diff + generation + scoring is the most expensive gate by far. The cost is acceptable for high-stakes specs (`risk_level: high`) and may be too high for trivial changes. Suggestion: bind enablement to `risk_level` rather than a global flag, in v3.

---

## Active priorities (next 1–2 minor releases, after Gate 2c)

### 2. Spec-Bench × mutation testing validation

**Goal:** test the predictive validity of Gate 2b (and eventually 2c) scores against an independent ground truth.

**Why:** Gate 2b claims to score test suites as detection instruments. The honest validation is mutation testing — Stryker (JS), Pitest (JVM), or equivalent injects bugs and measures kill rate. **High Gate 2b scores should predict high mutation kill rates on AC-relevant mutations.** This is a directly testable hypothesis.

**Shape:**
- Run Spec-Bench against PRDs that ship with mutation testing baselines.
- Correlate Gate 2b dimension scores with kill rates per AC.
- Publish the correlation matrix in `benchmarks/results/`.
- If correlation is weak: Gate 2b's rubric needs re-tuning. If strong: Gate 2b can be promoted from advisory to load-bearing in dev workflows.

**Prerequisite:** Gate 2b has never produced an evidence artifact, and the bench corpus contains zero test files. The correlation work first requires the constant-implementer arm to ship test suites and Gate 2b to run on them — there is nothing to correlate until both exist.

**Status:** opportunity called out in the Phase 1 design doc; not started. This is the single highest-leverage research move because it gives us the empirical answer to *"does this actually work?"*

### 3. Spec drift detection

**Goal:** measure divergence between the living spec (SYSTEM-SPEC.md) and the living code, over time.

**Why:** the MANIFESTO's "Specs as Living Organisms" section needs an evidence track. SYSTEM-SPEC.md captures *what we said the system does*; we need a tool that flags when the code stops matching it. [Spec-Kit-Antigravity](https://github.com/compnew2006/Spec-Kit-Antigravity-Skills) has explored a `/util-speckit.diff` primitive; we can take it further by being amendment-aware (`amends` field knows which behaviors are intentionally drifting).

**Shape (proposed):**
- A new `/sdlc audit` skill that, given a SYSTEM-SPEC.md and a worktree, surfaces per-behavior drift signals (missing implementation, divergent implementation, orphaned implementation).
- Output: `evidence/audit-{date}.yml` summarizing drift per domain section.
- Integrates with Spec-Bench so we can measure drift-rate as a property of teams/harnesses.

**Precondition:** deferred behind in-repo SYSTEM-SPEC dogfooding — drift detection cannot ship before the living spec has a corpus to drift against. SYSTEM-SPEC.md is one fold-in (~35 lines) today.

**Status:** not started. Design notes welcome via issue.

### 4. SYSTEM-SPEC.md domain split

**Goal:** prepare for scale. The compactor agent has a hardcoded `<500-line` sizing constraint as a known cliff. The first fold-in is one domain (eval quality, ~35 lines from SPEC-001). Once 5–10 specs accumulate, single-file SYSTEM-SPEC.md will start to feel cramped.

**Shape:**
- Split into `system-spec/` directory with per-domain files + `index.md`.
- Compactor agent reads/writes domain files; `[from: ...]` provenance trails preserved.
- Existing tooling (impact validation, eval-intent regression scan) updated to glob the directory.

**Trigger:** when SYSTEM-SPEC.md crosses ~300 lines, plan the split. We're at ~35 today.

### 5. Calibration guide

**Goal:** published default tunings per project profile, backed by Spec-Bench distributions.

**Why:** v2.x ships with a lot of dials (~12 thresholds across `sdlc.local.md`). Reasonable defaults exist, but there's no published guidance on *when to retune*. A greenfield startup spec, an enterprise compliance spec, and a refactor spec have different reasonable thresholds.

**Shape:**
- `docs/calibration-guide.md` showing the empirical pass/fail distribution from Spec-Bench runs.
- Three to four named project profiles with per-profile `sdlc.local.md` examples.
- Decision tree: "your specs are scoring 7.5–7.8 consistently, your team is junior, your features touch payments — try profile X."

**Status:** Spec-Bench data needed first.

---

## Backlog (prioritized but not scheduled)

- **Spec-Bench public dataset + leaderboard** *(moved from active priorities, 2026-06-12)*. Community-contributed PRDs with openly scored results — the MANIFESTO's "we need a spec quality benchmark" call. The harness and calibration protocol ship today; what's missing is curation and operations. **Trigger: deferred until ≥5 PRDs exist organically — a leaderboard with one PRD and no community is an operations sinkhole.** Re-activate when contributions arrive (see "How to contribute"), not by building ahead of them.
- **Post-implementation quality tracing.** Connect Gate 2 failures, Gate 3 blockers, and post-merge bugs back to the originating spec so we can answer "what spec gaps cost us?" empirically. Requires a thin telemetry layer over the existing evidence files.
- **Risk-level-bound gate enablement.** Today opt-in gates are global on/off via `sdlc.local.md`. Binding Gate 2c to `risk_level: high` (and similar) lets teams adopt it where it matters most without paying the latency tax on trivial specs.
- **NBJ "Explanation Artifact" 4-question template** as an optional Gate 2c output mode. The Apr 21 follow-up describes a labor-market-friendly format ("what is this code doing / what assumptions / what could break / what would I change") that doubles as a hiring signal. Gate 2c could emit either the structured YAML *or* the 4-question prose, configurable per project.
- **Add a `Makefile`** target for `test`, `lint`, and the full structural validation pass — currently each suite is a separate manual command.
- **Hard-block mode for the pre-commit hook.** Today it's warning-only (`hooks/hooks.json`); v3 could let users opt into a hard block once the warning has trained the workflow.
- **Test-runner-driven discovery in `eval-quality-scorer`.** Today the agent globs for fixed patterns (`**/test_*.py`, `**/*.test.ts`, etc.). Reading `pytest.ini` / `vitest.config.ts` / `cargo.toml` would generalize discovery without hardcoded language assumptions.

### Shipped from backlog

- **`RELEASE.md`** — shipped v2.8.1. Documents the three-step release dance plus the known landmines.
- **CI workflow** — shipped v2.8.1 (`.github/workflows/ci.yml`). Runs all three structural test suites, `verify-evidence.sh` checks, the Spec-Bench pytest suite, and a plugin.json/CHANGELOG version-consistency check on pushes and PRs.
- **Promote `/sdlc implement` to its own skill file** — shipped v2.9.0: `skills/sdlc-implement/SKILL.md`.
- **N/A rationale paragraph in `rubrics/code-quality.md`** — shipped v2.9.0: "Prompt-Only Changesets (N/A Rationale)" section formalizes the previously informal practice.

---

## Deliberately deferred / out of scope

These have come up in discussion and we've consciously *not* picked them up:

- **A separate "epic" type in beads.** Using `feature` with child deps works fine at our scale; introducing a new type adds tooling burden without solving a real problem.
- **Cross-spec automated conflict detection beyond `amends` validation.** The MANIFESTO names it as a long-term aspiration, but right now `impact-awareness` validation handles the most common case (modifying behavior captured in SYSTEM-SPEC.md). Going broader would require either much larger SYSTEM-SPEC corpora or fundamentally different machinery.
- **Per-spec persistent trust scores.** Trust is per-spec, not historical, and we're keeping it that way. Every spec starts fresh — too many factors vary between features for accumulated trust to be safe to carry forward.
- **Automatic merging without human approval, even at Full Auto + low risk.** The "headless cleanly exits with instructions" pattern in Guided mode is intentional — it's what lets Speculator be safe to run in a long-running headless session.
- **Replacing markdown rubrics with structured schemas.** The current rubric format (markdown with banded calibration examples) is what makes them useful as in-context prompts for LLM-as-judge. A schema-first version would optimize for tooling at the cost of readability and judge accuracy.

---

## How to contribute

The most valuable contributions today are:

1. **Calibration examples for Gate 2c.** This is the build's critical path. If you can articulate "this comprehension entry looks plausible but contradicts the diff" with a real example, you're directly unblocking Phase 2.
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
