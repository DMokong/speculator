> **In an agentic world, the craft that used to live in the developer's head needs to live in the specification.**
>
> Agents can reason, decompose, and build — but they can't fill gaps from decades of domain intuition. The spec is where intent transfers from human to agent. We built Speculator because a great spec means the agent barely needs to improvise.
>
> 📖 [Read the full manifesto: *Quality In, Quality Out* →](MANIFESTO.md)

# Speculator

A Claude Code plugin that enforces a 4-gate quality pipeline on agentic development workflows with LLM-as-judge spec scoring, git worktree isolation, and in-repo evidence artifacts. *Spec + Evaluator = Speculator.*

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
/spec close               # Gate 4: evidence package + merge to main
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
  ▸ Gate 3: Code Review ............... ✅ No blocking findings
  ▸ Gate 4: Evidence Package .......... ✅ All artifacts present

  Ready to merge. Run /spec close to finalize.
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
Gate 1: Spec Quality --> Gate 2: Code Quality --> Gate 3: Review --> Gate 4: Evidence Package
   (LLM-as-judge)         (tests + coverage)      (code review)       (all gates pass -> merge)
```

Each gate produces a YAML evidence artifact in `docs/specs/{feature}/evidence/`. All 4 gates have dedicated rubrics in `rubrics/` that define scoring criteria, checklists, and pass/fail thresholds.

## Commands

| Command | Description |
|---------|-------------|
| `/spec start` | Create spec from template + git worktree + beads epic |
| `/spec score` | Gate 1: LLM-as-judge spec quality scoring (6 dimensions) |
| `/spec implement` | Create implementation plan + beads stories + execute tasks |
| `/spec gate` | Check or run any specific gate |
| `/spec review` | Gate 3: Automated code review |
| `/spec close` | Gate 4: Evidence package + merge worktree to main + compact into SYSTEM-SPEC.md |
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

When a spec passes all gates and merges via `/spec close`, its contributions are automatically folded into a single **compacted system specification** (`SYSTEM-SPEC.md`). This living document represents what the system currently does and why, structured by domain:

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
├── skills/
│   ├── sdlc/SKILL.md         # Master orchestrator (routes /spec subcommands)
│   ├── spec-create/SKILL.md  # /spec start -- spec + worktree + beads epic
│   ├── spec-score/SKILL.md   # /spec score -- Gate 1 via spec-scorer agent
│   ├── gate-check/SKILL.md   # /spec gate -- check/run any gate
│   ├── sdlc-run/SKILL.md     # /spec run -- autonomous pipeline orchestrator
│   ├── sdlc-status/SKILL.md  # /spec status -- cross-worktree pipeline view
│   ├── sdlc-doctor/SKILL.md  # /spec doctor -- diagnostics + auto-fix
│   └── spec-compact/SKILL.md # /spec compact -- bootstrap or single-spec compaction
├── agents/
│   ├── spec-scorer/AGENT.md    # LLM-as-judge subagent for spec evaluation + impact validation
│   ├── code-reviewer/AGENT.md  # Gate 3 code review subagent (6-point checklist)
│   └── spec-compactor/AGENT.md # Folds closed specs into SYSTEM-SPEC.md
├── rubrics/
│   ├── spec-quality.md        # 6-dimension rubric (completeness, clarity, testability, intent_verifiability, feasibility, scope)
│   ├── impact-awareness.md    # Impact validation rubric with mismatch decision matrix
│   ├── acceptance-criteria.md # Gate 2 sub-rubric for AC traceability
│   ├── code-quality.md       # Gate 2 evidence-based rubric (7 checks)
│   ├── review.md             # Gate 3 code review rubric (6 checklist items)
│   └── evidence-package.md   # Gate 4 evidence completeness rubric
├── templates/
│   ├── spec-template.md       # Blank spec with YAML frontmatter (includes impact_rating + amends)
│   └── scorecard-template.yml # Gate 1 evidence artifact template
├── hooks/
│   └── hooks.json            # PreToolUse: pre-commit gate warning
├── lib/
│   └── spec-resolution.md    # Spec identification algorithm + worktree redirect
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

## License

MIT -- see [LICENSE](LICENSE).
