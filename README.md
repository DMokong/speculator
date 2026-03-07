# Agentic SDLC Plugin

A Claude Code plugin that enforces a 4-gate quality pipeline on agentic development workflows with LLM-as-judge scoring, git worktree isolation, and in-repo evidence artifacts.

## Prerequisites

- **[Claude Code](https://claude.com/claude-code)** — required runtime (the plugin exposes slash commands inside Claude Code)
- **[beads CLI](https://github.com/DMokong/beads)** — git-backed issue tracking for traceability (`npm install -g beads-cli`)
- **git** (2.20+) — worktree support for feature isolation

## Installation

```bash
# Add the marketplace (one-time)
claude plugin marketplace add DMokong/claude-plugins

# Install the plugin
claude plugin install agentic-sdlc@dmokong-plugins --scope project

# Bootstrap your project
/sdlc doctor --init
```

`/sdlc doctor --init` will create a default `.claude/sdlc.local.md` config, verify prerequisites, and register the pre-commit hook.

## Quick Start

```bash
/sdlc doctor    # verify environment is healthy
/sdlc start     # create spec + worktree + beads epic
# fill in the spec...
/sdlc score     # Gate 1: automated spec quality scoring
/sdlc implement # create plan + beads stories + execute
/sdlc review    # Gate 3: code review
/sdlc close     # Gate 4: evidence package + merge to main
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
| `/sdlc start` | Create spec from template + git worktree + beads epic |
| `/sdlc score` | Gate 1: LLM-as-judge spec quality scoring (5 dimensions) |
| `/sdlc implement` | Create implementation plan + beads stories + execute tasks |
| `/sdlc gate` | Check or run any specific gate |
| `/sdlc review` | Gate 3: Automated code review |
| `/sdlc close` | Gate 4: Evidence package + merge worktree to main |
| `/sdlc status` | Cross-worktree pipeline view (all features at a glance) |
| `/sdlc doctor` | Diagnostics + auto-fix (prereqs, config, hooks) |

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
    completeness: 0.25     # does the spec cover all requirements?
    clarity: 0.25          # is the spec unambiguous?
    testability: 0.25      # can acceptance criteria be verified?
    feasibility: 0.15      # is the spec technically achievable?
    scope: 0.10            # is the spec appropriately scoped?
  dimension_minimum: 5     # any dimension below this fails the gate
```

## Plugin Structure

```
agentic-sdlc/
├── skills/
│   ├── sdlc/SKILL.md         # Master orchestrator (routes /sdlc subcommands)
│   ├── spec-create/SKILL.md  # /sdlc start -- spec + worktree + beads epic
│   ├── spec-score/SKILL.md   # /sdlc score -- Gate 1 via spec-scorer agent
│   ├── gate-check/SKILL.md   # /sdlc gate -- check/run any gate
│   ├── sdlc-status/SKILL.md  # /sdlc status -- cross-worktree pipeline view
│   └── sdlc-doctor/SKILL.md  # /sdlc doctor -- diagnostics + auto-fix
├── agents/
│   └── spec-scorer/AGENT.md  # LLM-as-judge subagent for spec evaluation
├── rubrics/
│   ├── spec-quality.md       # 5-dimension rubric (completeness, clarity, testability, feasibility, scope)
│   ├── acceptance-criteria.md # Gate 2 sub-rubric for AC traceability
│   ├── code-quality.md       # Gate 2 evidence-based rubric (7 checks)
│   ├── review.md             # Gate 3 code review rubric (6 checklist items)
│   └── evidence-package.md   # Gate 4 evidence completeness rubric
├── templates/
│   ├── spec-template.md      # Blank spec with YAML frontmatter
│   └── scorecard-template.yml # Gate 1 evidence artifact template
├── hooks/
│   └── hooks.json            # PreToolUse: pre-commit gate warning
├── lib/
│   └── spec-resolution.md    # Spec identification algorithm + worktree redirect
├── LICENSE
└── README.md
```

## Worktree Isolation

Each feature gets its own git worktree via `/sdlc start`:

```
your-project/                              # main worktree
your-project/.claude/worktrees/
  ├── add-user-auth/                       # feature A worktree
  └── redesign-api/                        # feature B worktree
```

- Multiple features can be in progress simultaneously (separate Claude Code sessions)
- Memory is symlinked so all worktrees share the same project memory
- Specs, evidence, and implementation code are conflict-safe (unique per feature)
- `/sdlc close` guides merging back to main

### Cross-Worktree Awareness

All skills detect when you're on main but specs live in worktrees. They'll prompt you to redirect to the correct worktree before operating. `/sdlc status` shows specs from ALL workspaces in one view.

## Beads Integration

The SDLC lifecycle is tracked via beads issues for full traceability:

```
Epic (created by /sdlc start)
  └── Spec (docs/specs/{name}/spec.md)
       └── Scorecard (evidence/gate-1-scorecard.yml)
       └── Plan (docs/plans/YYYY-MM-DD-{name}.md)
            └── Story 1 (beads) -> Task 1 in plan
            └── Story N (beads) -> Task N in plan
```

- `/sdlc start` creates the epic
- `/sdlc implement` creates user stories from the plan
- `/sdlc close` closes all stories + epic

Every gate artifact links back to the beads issue, creating a traceable chain from requirement to merged code.

## Spec Resolution

When a skill needs to identify which spec to operate on, it follows this order:

1. **Explicit user selection** -- `/sdlc score add-user-auth`
2. **Worktree affinity** -- worktree name matches spec directory
3. **Cross-worktree redirect** -- on main, scan worktrees for specs
4. **Lock file check** -- skip specs locked by other sessions
5. **Single spec fallback** -- one unlocked spec auto-selected
6. **Ask the user** -- multiple specs, present choices

## License

MIT -- see [LICENSE](LICENSE).
