> **In an agentic world, the craft that used to live in the developer's head needs to live in the specification.**
>
> Agents can reason, decompose, and build — but they can't fill gaps from decades of domain intuition. The spec is where intent transfers from human to agent. We built Speculator because a great spec means the agent barely needs to improvise.
>
> 📖 [Read the full manifesto: *Quality In, Quality Out* →](MANIFESTO.md)
>
> 📝 Read the series: [The Tax Nobody's Measuring](https://dmokong.substack.com/p/the-tax-nobodys-measuring) · [The Specification Tax](https://dmokong.substack.com/p/the-specification-tax)

# Speculator

A Claude Code plugin that enforces a 6-stage quality pipeline (4 required + 2 opt-in eval gates) on agentic development workflows with LLM-as-judge spec scoring, git worktree isolation, and in-repo evidence artifacts. *Spec + Evaluator = Speculator.*

Speculator is being built toward an explicit goal: an **anti-dark-code pipeline** — a workflow that won't ship code unless intent, behavior, and comprehension can all be evidenced. Today it covers spec quality (Gate 1), eval intent (Gate 2a), code quality (Gate 2), eval quality (Gate 2b), code review (Gate 3), and evidence packaging (Gate 4). The next gate on the roadmap — **Gate 2c (Comprehension)** — closes the last gap between *"tests pass"* and *"any human or agent could explain what shipped."* See [ROADMAP.md](ROADMAP.md).

## Prerequisites

- **[Claude Code](https://claude.com/claude-code)** — required runtime (the plugin exposes slash commands inside Claude Code)
- **[beads CLI](https://github.com/DMokong/beads)** — git-backed issue tracking for traceability (`npm install -g beads-cli`)
- **git** (2.20+) — worktree support for feature isolation

## Installation

```bash
# Add the marketplace (one-time)
claude plugin marketplace add DMokong/claude-plugins

# Install the plugin
claude plugin install speculator@dmokong-plugins --scope project

# Bootstrap your project
/spec doctor --init
```

`/spec doctor --init` will create a default `.claude/sdlc.local.md` config, verify prerequisites, and register the pre-commit hook.

## Quick Start

### Step by step

```bash
/spec doctor              # verify environment is healthy
/spec start               # create spec + worktree + beads epic
```

Now **brainstorm before you spec.** Use Claude's [brainstorming skill](https://github.com/obra/superpowers) to explore intent, clarify requirements, and design your approach — before committing anything to the spec. The brainstorm is where ambiguity dies and intent crystallizes.

```bash
# brainstorm your feature (Superpowers skill)
# → explores intent, asks clarifying questions, proposes approaches with trade-offs
# → produces a design-approved plan ready to be formalized

/spec create              # Speculator turns your brainstormed plan into a formal spec.md
/spec score               # Gate 1: automated spec quality scoring
/spec implement           # create plan + beads stories + execute
/spec review              # Gate 3: code review
/spec close               # Gate 4: evidence package + deliver to main (merge or PR)
```

### One command

Give `/spec run` a brainstormed plan and it handles everything — creates the spec, scores it, improves it, implements it, reviews it, and merges it:

```bash
/spec run     # autonomous: create → score → improve → implement → review → merge
```

This is designed to scale across multiple agents. Each agent gets a brainstormed plan, runs `/spec run` in its own worktree, and delivers a quality-gated feature independently.

> Both `/spec` and `/sdlc` prefixes work — they're equivalent.

## Example: A Feature From Start to Finish

Here's what it actually looks like to build a feature with Speculator.

### 1. Start and brainstorm

```
You: /spec start

Speculator: What feature are you building?

You: Add a webhook notification system for order events

Speculator: Created:
  ✅ Spec: docs/specs/webhook-notifications/spec.md
  ✅ Worktree: .claude/worktrees/webhook-notifications/
  ✅ Epic: beads-a3f "Webhook notification system"

  Switched to worktree. Brainstorm your design, then run /spec create.
```

Now brainstorm. This is where the real work happens — before a single line of spec is written:

```
You: I want to add webhooks for order events. Let's brainstorm.

Claude: [explores intent] What's the main use case — are these for internal
        microservices, external integrations, or both?

You: External integrations. Third-party apps need to react to order changes.

Claude: [clarifying questions] A few things to nail down:
        • Which order events? Created, updated, cancelled, fulfilled?
        • Retry semantics — how many retries, what backoff?
        • Security — do we need payload signing?
        • Rate limiting per consumer?

You: All four events. Retry with backoff, yes signing, yes rate limiting.

Claude: [proposes approach] Here's what I'd recommend...
        [presents design with trade-offs, gets approval]
```

Once the brainstorm produces a clear, approved design:

```
You: /spec create

Speculator: Building spec from brainstorm context...
  ✅ docs/specs/webhook-notifications/spec.md populated
```

### 2. Score the spec

With the spec formalized, run `/spec score`. The scorer evaluates 6 dimensions:

```
You: /spec score

Speculator: Scoring docs/specs/webhook-notifications/spec.md...

  📊 Gate 1: Spec Quality Scorecard

  Completeness ............ 8  All sections present, requirements traced to ACs
  Clarity ................. 7  "events should be configurable" — which events? Be specific
  Testability ............. 6  AC3 says "retry failed deliveries" but no max retry count
                               or backoff strategy defined — not objectively verifiable
  Intent Verifiability .... 8  Anti-patterns documented, user journeys traced
  Feasibility ............. 7  No mention of webhook signing — security dependency missing
  Scope ................... 9  Tightly scoped to order events only

  Overall: 7.3 — PASS (threshold: 7.0)

  ⚠️ Recommended:
  • Clarify which order events are supported (created, updated, cancelled?)
  • Add max retry count and backoff strategy to AC3
  • Address webhook payload signing for security

  The spec passes, but I'd recommend addressing the flags before
  implementation. Want me to help revise?
```

### 3. Self-improvement in action

If the score is below 8.0, the self-improvement loop engages automatically during `/spec run`:

```
Speculator: Score 7.3 is below self-improvement trigger (8.0).
            Engaging self-improvement loop...

  Round 1: Addressing scorer feedback...
  • Added explicit event list: order.created, order.updated, order.cancelled
  • AC3 now specifies: max 5 retries, exponential backoff (1s, 2s, 4s, 8s, 16s)
  • Added R6: webhook payload signing with HMAC-SHA256
  • Added AC7: signature verification endpoint in docs

  Re-scoring...

  Overall: 8.1 — PASS (improved from 7.3)
  ✅ Self-improvement complete. Proceeding to Full Auto mode.
```

The requirements didn't change. The spec just got *better* by being measured.

### 4. The full autonomous run

For well-scored specs, `/spec run` handles everything:

```
You: /spec run

Speculator: Detected spec: webhook-notifications (score: 8.1, Full Auto)

  ▸ Gate 1: Spec Quality .............. ✅ 8.1 (passed)
  ▸ Planning .......................... ✅ 6 tasks created
  ▸ Implementation .................... ✅ All tasks complete
  ▸ Gate 2: Code Quality .............. ✅ Tests pass, 87% coverage
  ▸ Gate 3: Code Review ............... ✅ No blocking findings (secrets scan clean, skill eval skipped)
  ▸ Gate 4: Evidence Package .......... ✅ All artifacts present

  SYSTEM-SPEC.md updated on feature branch. Ready to merge. Run /spec close to finalize.
```

### 5. When things go wrong

Not every spec sails through. Here's what a stopped pipeline looks like:

```
You: /spec run "add payment processing"

Speculator: Scoring spec...

  Overall: 5.8 — FAIL (threshold: 7.0)

  🚫 Blocking:
  • risk_mismatch: Spec mentions "payment" and "charge" but risk_level
    is set to "low". Payment processing is at minimum "high" risk.
  • intent_verifiability: 4 (below minimum 8). No anti-patterns
    documented for a payment feature — what happens on double-charge?
    What does "refund" mean (full, partial, credit)?

  ⚠️ Pipeline stopped. This spec needs human rework before it can
  proceed. Address the blocking flags and run /spec score again.
```

## Gate Pipeline

```
Gate 1: Spec        ┌──── Gate 2a: Eval Intent ────┐  Gate 2: Code   ┌──── Gate 2b: Eval Quality ────┐  Gate 3: Code   Gate 4: Evidence
       Quality       │       (opt-in, v2.8.0)       │      Quality    │       (opt-in, v2.7.0)        │      Review        Package
  (LLM-as-judge)  ──>│   pre-impl intent capture    │ ──>(tests + ──>│   instrument-quality on       │ ──>(6-point  ──>(all gates pass
                     │   per AC, scored 4 dims      │    coverage)    │   shipped tests, scored 7d)   │    review +      → merge or PR)
                     └──────────────────────────────┘                 └───────────────────────────────┘    secrets +
                                                                                                            skill desc.)
```

Six gate stages — four always-on, two opt-in:

| Gate | Stage | Default | Evidence file |
|------|-------|---------|---------------|
| 1 — Spec Quality | pre-implementation | required | `gate-1-scorecard.yml` |
| 2a — Eval Intent | between plan and implementation | **opt-in** (`gates.eval-intent.enabled`) | `gate-2a-eval-intent.yml` |
| 2 — Code Quality | post-implementation | required | `gate-2-quality.yml` |
| 2b — Eval Quality | between code and review | **opt-in** (`gates.eval-quality.enabled`) | `gate-2b-eval-quality.yml` |
| 3 — Code Review | post-implementation | required | `gate-3-review.yml` |
| 4 — Evidence Package | pre-merge | required | `gate-4-summary.yml` |

Each gate produces a YAML evidence artifact in `docs/specs/{feature}/evidence/`. All gates have dedicated rubrics in `rubrics/` that define scoring criteria, checklists, and pass/fail thresholds.

### Gate 2a: Eval Intent (opt-in, v2.8.0)

Pre-implementation intent capture. For each acceptance criterion, the author writes an *eval* — a markdown artifact in `docs/specs/{feature}/evals/` describing the observable user outcome. The `eval-intent-scorer` agent scores the eval set on 4 dimensions (intent coverage, anti-pattern detection, journey completeness, implementation independence), checks SYSTEM-SPEC.md for behavioral conflicts, and scans prior specs for regression signals. Default threshold: 6.5. Disabled by default; enable with `gates.eval-intent.enabled: true`.

Why pre-implementation? Catching letter-vs-spirit gaming requires measuring intent *before* the implementation creates an attractor. Evals authored after seeing the code tend to ratify whatever the code does.

### Gate 3: Code Review

Gate 3 runs three checks — all blocking on failure:

1. **6-point code review** — correctness, error handling, readability, security, performance, spec alignment
2. **Mandatory secrets scan** — active grep across 5 pattern categories (high-entropy assignments, API key formats, connection strings, bearer tokens, base64-encoded credentials). Any hardcoded secret is an automatic fail — no reviewer discretion.
3. **Skill description eval** *(conditional)* — when `SKILL.md` or `AGENT.md` files appear in the diff, Gate 3 generates 5 trigger queries and 5 near-miss negatives to evaluate undertrigger/overtrigger risk. Undertriggering descriptions render skills useless, so a fail here is blocking. When no skill files are in the diff, this check is skipped and recorded as `skipped` in the evidence.

## Commands

| Command | Description |
|---------|-------------|
| `/spec start` | Create spec from template + git worktree + beads epic |
| `/spec score` | Gate 1: LLM-as-judge spec quality scoring (6 dimensions) |
| `/spec eval` | Gate 2a (opt-in): Pre-implementation eval authoring + intent scoring (4 dimensions) |
| `/spec implement` | Create implementation plan + beads stories + execute tasks |
| `/spec gate` | Check or run any specific gate (1, 2, 2a, 2b, 3, 4) |
| `/spec review` | Gate 3: Automated code review (incl. mandatory secrets scan + skill description eval) |
| `/spec close` | Gate 4: Evidence package + compact SYSTEM-SPEC.md on feature branch + deliver to main (merge or PR) |
| `/spec run [args]` | Run the full pipeline autonomously (trust-based oversight) |
| `/spec compact` | Compact closed specs into SYSTEM-SPEC.md (`--all` for bootstrap) |
| `/spec status` | Cross-worktree pipeline view (all features at a glance) |
| `/spec doctor` | Diagnostics + auto-fix (prereqs, config, hooks) |

## `/spec run` — Autonomous Pipeline

`/spec run` chains the full pipeline in a single invocation, using a trust-based autonomy model:

```
/spec run                    # auto-detect spec, resume from last checkpoint
/spec run "add email snooze" # generate spec skeleton, then run pipeline
/spec run SPEC-042           # target a specific spec by ID
```

### Trust Ladder

Spec quality determines how much human oversight is needed:

| Overall Score | Mode | Behavior |
|---------------|------|----------|
| >= 8.0 | Full Auto | No human checkpoints — runs end to end |
| 7.8 – 7.9 | Full Auto (after self-improvement) | Refinement loop first, then autonomous |
| 7.0 – 7.7 | Guided Autopilot | Pauses at plan review + pre-merge |
| < 7.0 | Stopped | Human rework needed |

**Hard gates** force Guided mode regardless of score: `intent_verifiability < 8`, `risk_level` high/critical, or `risk_mismatch` flag.

### Self-Improvement Philosophy

Self-improvement is a core principle of the Speculator pipeline, not an afterthought.

The self-improvement trigger (default **8.0**) is intentionally set **higher** than the Full Auto threshold (default **7.8**). This gap is by design:

- **>= 8.0 on first pass** — Spec was excellent. Skip self-improvement, proceed to Full Auto.
- **< 8.0** — Self-improvement loop triggers. The agent reads scorer feedback, revises weak sections, and re-scores (up to 3 attempts).
  - **Reaches >= 7.8** — Good enough for Full Auto after refinement.
  - **Exhausted, >= 7.0** — Falls back to Guided Autopilot (human reviews plan and final output).
  - **Exhausted, < 7.0** — Pipeline stops. Human rework needed.

**Why?** A spec scoring 7.9 is technically good enough for autonomous execution. But the act of engaging with feedback — reading flags, addressing weaknesses, re-expressing intent more clearly — makes the spec *better*. This practice compounds over time: each refinement teaches the spec author (human or agent) what "good" looks like.

The self-improvement loop has boundaries: it may add detail, examples, and clarifications, but it must **never** alter requirements or acceptance criteria without human approval. It improves the expression of intent, not the intent itself.

### Risk Levels

Specs declare a `risk_level` in YAML frontmatter:

| Level | Description | Pipeline Effect |
|-------|-------------|-----------------|
| `low` | No external side effects, reversible | No override |
| `medium` | Touches integrations, but reversible (default) | No override |
| `high` | Affects external systems, hard to reverse | Forces Guided |
| `critical` | Could cause harm, data loss, financial damage | Forces Guided |

The scorer validates the declaration against spec content — if risk keywords are found but `risk_level` is "low", a `risk_mismatch` blocking flag is emitted.

## Spec Drift Detection

As a project grows, specs accumulate. New features may modify behavior originally specified by older specs. Speculator tracks this through **spec compaction** and **impact analysis**.

### SYSTEM-SPEC.md — The Living System Specification

When a spec passes all gates, `/spec close` folds its contributions into `SYSTEM-SPEC.md` on the feature branch *before* delivering to main — so the compaction is part of the PR diff, not a post-merge manual step. The result is a single **compacted system specification** that represents what the system currently does and why, structured by domain:

```markdown
## Auth
- Sessions use short-lived tokens (24h expiry) [from: SPEC-004, amended by SPEC-023]
- OAuth2 with PKCE for all external providers [from: SPEC-004]

## Data Pipeline
- Ingestion normalizes to UTF-8 before storage [from: SPEC-008]
```

Each behavior entry has a `[from: ...]` provenance trail tracing it back to its originating spec(s).

### Impact Rating

New specs declare an **impact rating** (like `risk_level`) and an `amends` field:

```yaml
impact_rating: moderate     # none | low | moderate | high
amends:
  - section: "Auth"
    behavior: "Sessions use short-lived tokens (24h expiry)"
    change: "Extended to 7-day refresh tokens for mobile clients"
    reason: "Mobile UX"
```

The spec-scorer validates impact declarations against `SYSTEM-SPEC.md`. If a spec touches existing behavior but declares `impact_rating: none`, an `impact_mismatch` blocking flag is emitted. Impact validation is separate from the 6-dimension scoring — it produces flags, not scores, and does not affect the trust ladder.

### Bootstrap

For existing projects adopting drift detection:

```bash
/spec compact --all    # process all closed specs into initial SYSTEM-SPEC.md
```

## Configuration

Project-side config lives in `.claude/sdlc.local.md` (YAML frontmatter):

```yaml
# Directory where specs are created (relative to project root)
spec_dir: docs/specs

# Subdirectory within each spec for evidence artifacts
evidence_dir: evidence

# Gate definitions and thresholds
gates:
  spec-quality:
    threshold: 7.0        # minimum average score (1-10) to pass
    required: true         # block pipeline if gate fails
  code-quality:
    tests_required: true   # require test files to exist
    coverage_threshold: 80 # minimum coverage percentage
    required: true
  review:
    required: true         # require code review pass
  evidence-package:
    required: true         # require all evidence before merge

# Scoring dimension weights (must sum to 1.0)
scoring:
  weights:
    completeness: 0.20
    clarity: 0.20
    testability: 0.20
    intent_verifiability: 0.15
    feasibility: 0.15
    scope: 0.10
  dimension_minimum: 5     # any dimension below this fails the gate

# Close behavior
close:
  strategy: merge              # "merge" (direct merge) or "pr" (create pull request)
                                # Use "pr" for environments with branch protection rules

# /spec run autonomy thresholds
run:
  self_improvement_trigger: 8.0  # score below this triggers refinement loop
  full_auto_threshold: 7.8       # minimum score for autonomous execution
  guided_threshold: 7.0           # minimum score for guided mode (below = stop)
  max_spec_retries: 3             # max self-improvement attempts
  max_code_retries: 3             # max test-fix attempts in Gate 2
  intent_verifiability_min: 8     # hard gate for intent dimension
  risk_signals:                   # keywords that trigger risk validation
    - delete
    - production
    - deploy
    - payment
```

## Plugin Structure

```
speculator/
├── skills/                          # 9 skills
│   ├── sdlc/SKILL.md                # Master orchestrator (routes /spec subcommands)
│   ├── spec-create/SKILL.md         # /spec start    — spec + worktree + beads epic
│   ├── spec-score/SKILL.md          # /spec score    — Gate 1 via spec-scorer agent
│   ├── eval-authoring/SKILL.md      # /spec eval     — Gate 2a authoring loop (opt-in, v2.8.0)
│   ├── gate-check/SKILL.md          # /spec gate     — check/run any gate
│   ├── sdlc-run/SKILL.md            # /spec run      — autonomous pipeline orchestrator
│   ├── sdlc-status/SKILL.md         # /spec status   — cross-worktree pipeline view
│   ├── sdlc-doctor/SKILL.md         # /spec doctor   — diagnostics + auto-fix
│   └── spec-compact/SKILL.md        # /spec compact  — bootstrap or single-spec compaction
├── agents/                          # 5 agents
│   ├── spec-scorer/AGENT.md         # Gate 1 LLM-as-judge for spec quality + impact validation
│   ├── eval-intent-scorer/AGENT.md  # Gate 2a — scores authored evals (4 dims) + SYSTEM-SPEC conflict + regression check
│   ├── eval-quality-scorer/AGENT.md # Gate 2b — scores test suites as detection instruments (7 dims)
│   ├── code-reviewer/AGENT.md       # Gate 3 — 6-point review + mandatory secrets scan + skill-description eval
│   └── spec-compactor/AGENT.md      # Folds closed specs into SYSTEM-SPEC.md
├── rubrics/                         # 8 rubrics
│   ├── spec-quality.md              # Gate 1 — 6-dimension rubric (completeness, clarity, testability, intent_verifiability, feasibility, scope)
│   ├── impact-awareness.md          # Gate 1 sub-validation — impact mismatch decision matrix
│   ├── eval-intent.md               # Gate 2a — 4-dimension rubric for authored intent evals
│   ├── acceptance-criteria.md       # Gate 2 sub-rubric for AC traceability
│   ├── code-quality.md              # Gate 2 — evidence-based rubric (7 checks)
│   ├── eval-quality.md              # Gate 2b — 7-dimension rubric for test-suite detection quality
│   ├── review.md                    # Gate 3 — 6-point code review rubric
│   └── evidence-package.md          # Gate 4 — evidence completeness rubric
├── templates/
│   ├── spec-template.md             # Blank spec with YAML frontmatter (includes impact_rating + amends + AC traceability tip)
│   └── scorecard-template.yml       # Gate 1 evidence artifact template
├── hooks/
│   └── hooks.json                   # PreToolUse: pre-commit gate warning
├── lib/
│   └── spec-resolution.md           # Spec identification algorithm + worktree redirect + lock semantics
├── tests/
│   ├── test-eval-intent-structure.sh  # 30 structural tests for Gate 2a wiring
│   ├── test-secrets-scan.sh           # 25 tests validating Gate 3 secrets-scan patterns
│   └── fixtures/                       # Sample evals + clean/fake-secret fixtures
├── benchmarks/                      # Spec-Bench harness (see § Spec-Bench below)
├── docs/
│   └── specs/                        # Speculator's own specs (dogfooded)
├── CHANGELOG.md
├── MANIFESTO.md
├── ROADMAP.md
├── LICENSE
└── README.md
```

## Worktree Isolation

Each feature gets its own git worktree via `/spec start`:

```
your-project/                              # main worktree
your-project/.claude/worktrees/
  ├── add-user-auth/                       # feature A worktree
  └── redesign-api/                        # feature B worktree
```

- Multiple features can be in progress simultaneously (separate Claude Code sessions)
- Memory is symlinked so all worktrees share the same project memory
- Specs, evidence, and implementation code are conflict-safe (unique per feature)
- `/spec close` guides merging back to main

### Cross-Worktree Awareness

All skills detect when you're on main but specs live in worktrees. They'll prompt you to redirect to the correct worktree before operating. `/spec status` shows specs from ALL workspaces in one view.

## Beads Integration

The SDLC lifecycle is tracked via beads issues for full traceability:

```
Epic (created by /spec start)
  └── Spec (docs/specs/{name}/spec.md)
       └── Scorecard (evidence/gate-1-scorecard.yml)
       └── Plan (docs/plans/YYYY-MM-DD-{name}.md)
            └── Story 1 (beads) -> Task 1 in plan
            └── Story N (beads) -> Task N in plan
```

- `/spec start` creates the epic
- `/spec implement` creates user stories from the plan
- `/spec close` closes all stories + epic

Every gate artifact links back to the beads issue, creating a traceable chain from requirement to merged code.

## Spec Resolution

When a skill needs to identify which spec to operate on, it follows this order:

1. **Explicit user selection** -- `/spec score add-user-auth`
2. **Worktree affinity** -- worktree name matches spec directory
3. **Cross-worktree redirect** -- on main, scan worktrees for specs
4. **Lock file check** -- skip specs locked by other sessions
5. **Single spec fallback** -- one unlocked spec auto-selected
6. **Ask the user** -- multiple specs, present choices

## Spec-Bench

`benchmarks/` ships a runnable evaluation harness that tests Speculator's core thesis: *does measuring spec quality actually produce better implementations?*

The pipeline runs four phases for each PRD × target combination:

1. **Spec generation** — each target (LLM × process × harness) generates a spec from the PRD.
2. **Score + iterate** — Speculator scores each spec on the 6 dimensions; if below 7.8, the same target is given feedback and asked to improve, up to 3 rounds.
3. **Constant implementation** — a fixed implementer (Claude Code + Superpowers) builds the feature twice: once from the original spec, once from the improved spec. Implementation quality is held constant so outcome differences are attributable to spec quality.
4. **Review** — Playwright functional tests + LLM-as-judge against an outcome rubric. Results aggregated into YAML + an HTML dashboard.

Default matrix: 8 targets across `claude-code` + `copilot-cli` × `opus-4-6` / `sonnet-4-6` / `gpt-4.1` × `vanilla` / `superpowers`.

```bash
cd benchmarks
uv sync
uv run spec-bench run --prd weather-transport --matrix default.yml --runs 1
```

A human-in-the-loop calibration protocol (`spec-bench calibrate`) flags judge-vs-human divergence > 1 point per dimension as `needs_tuning`, so the LLM-as-judge can be tuned against actual human assessment rather than trusted implicitly.

Test status: **67/67 passing** (`benchmarks/tests/`). Published 3-round results live in `benchmarks/results/`.

See [`benchmarks/README.md`](benchmarks/README.md) for the full harness, calibration protocol, and CLI reference.

## Roadmap

The forward-looking story lives in [ROADMAP.md](ROADMAP.md). High-level direction:

- **Spec drift detection** — measure divergence between the living spec and the living code over time. SYSTEM-SPEC.md provides the corpus; the gap is automated diff + amendment-aware comparison.
- **Spec-Bench public dataset + leaderboard** — the harness exists; the next step is community-contributed PRDs and openly published scores. The "SWE-bench for specifications" call from the [MANIFESTO](MANIFESTO.md) is now mostly an organizing-and-publishing problem rather than a build problem.
- **SYSTEM-SPEC.md domain split** — the compactor agent has a `<500-line` sizing constraint flagged as future work. The first fold-in (SPEC-001) lives in a single-file SYSTEM-SPEC.md; once 5–10 specs accumulate, the file splits into per-domain files with a top-level index.
- **Calibration guide** — published default tunings per project profile (greenfield, brownfield, refactor) backed by Spec-Bench distributions.
- **Post-implementation quality tracing** — connect downstream findings (Gate 2 failures, Gate 3 blockers, post-merge bugs) back to the originating spec so we can answer "what spec gaps cost us?" empirically.

See [ROADMAP.md](ROADMAP.md) for status, priorities, and how to contribute.

## License

MIT -- see [LICENSE](LICENSE).
