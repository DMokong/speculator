# Agentic SDLC Plugin

A Claude Code plugin that enforces a 4-gate quality pipeline on agentic development workflows with LLM-as-judge scoring, git worktree isolation, and in-repo evidence artifacts.

## Quick Start

```bash
# From your project root (must have .claude/sdlc.local.md configured)
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
Gate 1: Spec Quality ──→ Gate 2: Code Quality ──→ Gate 3: Review ──→ Gate 4: Evidence Package
   (LLM-as-judge)         (tests + coverage)      (code review)       (all gates pass → merge)
```

Each gate produces a YAML evidence artifact in `docs/specs/{feature}/evidence/`.

## Plugin Structure

```
agentic-sdlc/
├── .claude-plugin/
│   └── plugin.json           # Plugin manifest
├── skills/
│   ├── sdlc/SKILL.md         # Master orchestrator (routes /sdlc subcommands)
│   ├── spec-create/SKILL.md  # /sdlc start — spec + worktree + beads epic
│   ├── spec-score/SKILL.md   # /sdlc score — Gate 1 via spec-scorer agent
│   ├── gate-check/SKILL.md   # /sdlc gate — check/run any gate
│   ├── sdlc-status/SKILL.md  # /sdlc status — cross-worktree pipeline view
│   └── sdlc-doctor/SKILL.md  # /sdlc doctor — diagnostics + auto-fix
├── agents/
│   └── spec-scorer/AGENT.md  # LLM-as-judge subagent for spec evaluation
├── rubrics/
│   ├── spec-quality.md       # 3-dimension rubric (completeness, clarity, testability)
│   ├── acceptance-criteria.md # Per-AC structure and measurability rubric
│   └── code-quality.md       # Gate 2 evidence-based rubric
├── templates/
│   ├── spec-template.md      # Blank spec with YAML frontmatter
│   └── scorecard-template.yml # Gate 1 evidence artifact template
├── hooks/
│   └── hooks.json            # PreToolUse: pre-commit gate warning
├── lib/
│   └── spec-resolution.md    # Spec identification algorithm + worktree redirect
└── README.md                 # This file
```

## Worktree Isolation

Each feature gets its own git worktree via `/sdlc start`:

```
~/projects/claudeclaw/                          # main worktree
~/projects/claudeclaw/.claude/worktrees/
  ├── add-user-auth/                            # feature A worktree
  └── memory-phase-1-5/                         # feature B worktree
```

- Multiple features can be in progress simultaneously (separate Claude Code sessions)
- Memory is symlinked so all worktrees share the same project memory
- Specs, evidence, and implementation code are conflict-safe (unique per feature)
- `/sdlc close` guides merging back to main

### Cross-Worktree Awareness

All skills detect when you're on main but specs live in worktrees. They'll prompt you to redirect to the correct worktree before operating. `/sdlc status` shows specs from ALL workspaces in one view.

## Beads Integration

The SDLC lifecycle is tracked via beads issues:

```
Epic (created by /sdlc start)
  └── Spec (docs/specs/{name}/spec.md)
       └── Scorecard (evidence/gate-1-scorecard.yml)
       └── Plan (docs/plans/YYYY-MM-DD-{name}.md)
            └── Story 1 (beads) → Task 1 in plan
            └── Story N (beads) → Task N in plan
```

- `/sdlc start` creates the epic
- `/sdlc implement` creates user stories from the plan
- `/sdlc close` closes all stories + epic

## Configuration

Project-side config lives in `.claude/sdlc.local.md` (YAML frontmatter):

```yaml
spec_dir: docs/specs
evidence_dir: evidence
gates:
  spec-quality:
    threshold: 7.0
    required: true
  code-quality:
    tests_required: true
    coverage_threshold: 80
    required: true
  review:
    required: true
  evidence-package:
    required: true
scoring:
  weights:
    completeness: 0.34
    clarity: 0.33
    testability: 0.33
```

## Spec Resolution

When a skill needs to identify which spec to operate on, it follows this order:

1. **Explicit user selection** — `/sdlc score add-user-auth`
2. **Worktree affinity** — worktree name matches spec directory
3. **Cross-worktree redirect** — on main, scan worktrees for specs
4. **Lock file check** — skip specs locked by other sessions
5. **Single spec fallback** — one unlocked spec auto-selected
6. **Ask the user** — multiple specs, present choices

## Installation

The plugin is auto-loaded when placed in `.claude/plugins/agentic-sdlc/`. Skills need symlinks for discovery:

```bash
# Skills must be symlinked to .claude/skills/ for auto-discovery
ln -sfn ../plugins/agentic-sdlc/skills/sdlc .claude/skills/sdlc
ln -sfn ../plugins/agentic-sdlc/skills/spec-create .claude/skills/spec-create
ln -sfn ../plugins/agentic-sdlc/skills/spec-score .claude/skills/spec-score
ln -sfn ../plugins/agentic-sdlc/skills/gate-check .claude/skills/gate-check
ln -sfn ../plugins/agentic-sdlc/skills/sdlc-status .claude/skills/sdlc-status
ln -sfn ../plugins/agentic-sdlc/skills/sdlc-doctor .claude/skills/sdlc-doctor
```

The pre-commit hook must be registered in `.claude/settings.local.json` (gitignored — local config). `/sdlc doctor --fix` can do this automatically.

## Design Documents

- **Design:** `docs/plans/2026-03-03-agentic-sdlc-design.md`
- **Implementation plan:** `docs/plans/2026-03-03-agentic-sdlc-plan.md`
