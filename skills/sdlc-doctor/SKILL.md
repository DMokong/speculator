---
name: sdlc-doctor
description: >-
  Runs diagnostic health checks on the Speculator environment — verifies git state,
  project config, plugin wiring, spec directory health, lock status, and beads CLI
  availability. Use when the user says "/sdlc doctor", "/spec doctor", "sdlc check",
  "spec check", "sdlc health", "check sdlc setup", "is my setup working?", "diagnose
  speculator", or when invoked automatically by /sdlc start.
---

# SDLC Doctor — System Diagnostics

Run a comprehensive health check on the SDLC workflow environment. Report results as a checklist with PASS/FAIL/WARN for each item.

## Checks to Run

### 1. Environment

```bash
# Git repo valid?
git rev-parse --is-inside-work-tree

# Current branch / worktree?
git branch --show-current
git worktree list
```

- **PASS**: Valid git repo, branch identified
- **FAIL**: Not a git repo

### 2. Project Files

Check these files exist:

| File | Required | Check |
|------|----------|-------|
| `CLAUDE.md` | Yes | Exists and non-empty |
| `.claude/sdlc.local.md` | Yes | Exists, has valid YAML frontmatter with `spec_dir` and `gates` |

- **PASS**: All required files present and valid
- **FAIL**: Missing CLAUDE.md or sdlc.local.md

**Config lint — scoring weights** (run when `sdlc.local.md` is present): if the frontmatter defines `scoring.weights`, the weights must sum to 1.0 (±0.001). A skewed sum silently distorts every Gate 1 weighted overall.

```bash
# Sum scoring.weights from the YAML frontmatter
awk '/^scoring:/{s=1} s && /^  weights:/{w=1; next} w && /^    [a-z_]+:/{sum+=$2} w && /^  [a-z_]/{exit} END{printf "%.3f\n", sum}' .claude/sdlc.local.md
```

If the file's indentation deviates from the default layout, read the frontmatter and sum the `scoring.weights` values directly instead of relying on the snippet.

- **PASS**: weights sum to 1.0 (±0.001)
- **WARN**: weights sum to anything else — report the actual sum: `⚠️ scoring weights sum to {sum} (expected 1.0) — Gate 1 overall scores will be skewed; fix scoring.weights in .claude/sdlc.local.md`
- If `scoring.weights` is absent entirely, the plugin defaults apply — no warning.

**Config lint — risk_levels** (run when `sdlc.local.md` is present; predicate reference: `lib/gates.md` "Risk-level binding"). Read every `gates.*` block that defines a `risk_levels:` key and WARN on each of these, naming the offending gate:

- **Out-of-enum value**: any entry not in `{low, medium, high, critical}` — `⚠️ gates.{gate}.risk_levels contains unrecognized value '{value}' — the gate will fail-safe to active for specs it cannot classify; fix the typo (valid: low, medium, high, critical)`
- **Empty list** (`risk_levels: []`): the gate never runs — `⚠️ gates.{gate}.risk_levels is an empty list (the gate never runs) — use enabled: false if you mean to turn the gate off`
- **On a required-gate block** (`spec-quality`, `code-quality`, `review`, `evidence-package`): inert — `⚠️ gates.{gate}.risk_levels has no effect: required gates have no enable switch and always run`

A clean config — `risk_levels` only on opt-in gate blocks, values in-enum, non-empty — produces no warnings. Absent `risk_levels` keys are fine (the gate runs at every risk level).

### 3. Plugin Wiring

The SDLC plugin being loaded is self-evident — if `/sdlc doctor` is running, the plugin is installed and all skills are registered.

The pre-commit gate hook ships with the plugin (`hooks/hooks.json`) and is auto-registered when the plugin loads — no per-project registration is needed. Verify the plugin's hook file is present:
```bash
# Hook ships with the plugin and auto-registers
ls "${CLAUDE_PLUGIN_ROOT}/hooks/hooks.json" 2>/dev/null
```
- **PASS**: Hook file present (auto-registered with the plugin)
- **WARN**: Hook file missing from plugin installation (reinstall the plugin)

### 4. Spec Directory & Cross-Worktree Visibility

```bash
# spec_dir from config exists?
ls docs/specs/ 2>/dev/null
```

- **PASS**: Spec directory exists
- **WARN**: No specs yet (that's fine for a fresh project)

**Cross-worktree scan** (always run, even from main):
```bash
MAIN_WT=$(git worktree list | head -1 | awk '{print $1}')
echo "Scanning all worktrees for specs..."
git worktree list --porcelain | grep "^worktree " | sed 's/worktree //' | while read wt; do
  WT_NAME=$(basename "$wt")
  [ "$wt" = "$MAIN_WT" ] && WT_NAME="main"
  for spec_dir in "$wt"/docs/specs/*/; do
    [ -f "$spec_dir/spec.md" ] && echo "  Found: $(basename $spec_dir) in $WT_NAME"
  done
done
```

Display all discovered specs with their location:
```
Spec Directory
  ✅ docs/specs/ exists
  📋 Specs found across all workspaces:
     • memory-phase-1-5-enhancements → worktree: memory-phase-1-5
     • add-user-auth → worktree: add-user-auth
  ⚠️  No specs on main (all specs live in worktrees — this is normal)
```

If on main and specs only exist in worktrees, this is **INFO** not a warning — specs are expected to live in worktrees.

### 5. Active Specs & Locks

For each spec found, check:
- Has YAML frontmatter with `id` and `status`?
- If status is `approved`, does Gate 1 evidence exist?
- Any orphaned evidence without a spec?

**Lock health** (see `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md` for full spec):
```bash
# Find all active lock files
find docs/specs/ -name ".active" -type f 2>/dev/null
```

For each `.active` lock file:
- Read the lock: `worktree` and `started` fields
- Check if the worktree still exists: `git worktree list | grep {worktree_name}`
- Check lock age: locks older than 24 hours are suspicious

| Condition | Status |
|-----------|--------|
| Lock exists, worktree exists | ✅ PASS — actively being worked on |
| Lock exists, worktree gone | ⚠️ STALE — worktree removed but lock remains |
| Lock exists, older than 24h | ⚠️ AGED — might be abandoned |
| No lock | ✅ PASS — spec available |

Display in status:
```
Specs & Locks
  📋 SPEC-001: add-user-auth (status: draft, Gate 1: pending)
     🔒 Locked by worktree/add-user-auth (2 hours ago)
  📋 SPEC-002: dark-mode (status: approved, Gate 1: pass)
     🔓 Available
  ⚠️  SPEC-003: email-notifs (status: draft)
     🔒 STALE LOCK — worktree no longer exists. Run /sdlc doctor --fix to clean up.
```

### 6. Beads CLI

```bash
which bd 2>/dev/null || which beads 2>/dev/null
```

- **PASS**: beads CLI found in PATH
- **FAIL**: beads CLI not found — required for SDLC issue tracking. See https://github.com/DMokong/beads for installation.

### 7. As-Built Mode: bun Availability

This check only applies when a project's `.claude/sdlc.local.md` configures `gates.comprehension.mode: asbuilt` — `bun` is **not** required otherwise; skip this check entirely for `legacy` mode (the mode-routing default when the key is absent; configs generated by `--init` since v2.17.0 set `mode: asbuilt` explicitly) or when the comprehension gate is disabled.

```bash
which bun 2>/dev/null
```

- **PASS**: `gates.comprehension.mode: asbuilt` configured and `bun` found in PATH
- **WARN**: `gates.comprehension.mode: asbuilt` configured and `bun` missing — "⚠️ asbuilt mode requires bun; install https://bun.sh or set mode: legacy"
- **N/A** (no check run): `gates.comprehension.mode` absent or `legacy`

## Output Format

Present results as a clear diagnostic report:

```
SDLC Doctor — System Health Check
══════════════════════════════════

Workspace: main (or worktree/{name})
Branch: feat/add-user-auth

Environment
  ✅ Git repository valid
  ✅ Branch: feat/add-user-auth

Project Files
  ✅ CLAUDE.md present (245 lines)
  ✅ sdlc.local.md valid (spec_dir: docs/specs, 4 gates configured)
  ✅ scoring weights sum to 1.000

Plugin Wiring
  ✅ Plugin loaded (sdlc-doctor is running)
  ✅ Pre-commit gate hook present (auto-registered with plugin)

Specs
  ✅ Spec directory exists (docs/specs/)
  📋 1 active spec: SPEC-001 add-user-auth (status: draft, Gate 1: pending)

Beads CLI
  ✅ beads CLI found: /usr/local/bin/bd

Summary: 7 passed, 1 warning, 0 failures
```

## Severity Levels

- **FAIL** (❌): Blocks the workflow. Must be fixed before proceeding.
- **WARN** (⚠️): Workflow will work but with reduced capability. Flag to user.
- **PASS** (✅): Healthy.
- **INFO** (📋): Informational, no action needed.

## Auto-Fix

If the user runs `/sdlc doctor --fix` or if invoked from `/sdlc start`, attempt to fix issues:

- Missing spec directory → create it
- Stale lock files (worktree gone) → remove the `.active` file

Do NOT auto-fix:
- Missing CLAUDE.md (project-specific, user should create)
- Missing sdlc.local.md (needs user decisions on thresholds — use `--init` to generate a default)

## --init Flag

If the user runs `/sdlc doctor --init`, or if `.claude/sdlc.local.md` is missing and the user confirms:

1. Generate a default `.claude/sdlc.local.md` with these contents:

```yaml
---
spec_dir: docs/specs
evidence_dir: evidence

gates:
  # --- Required gates (always on) ---
  spec-quality:
    threshold: 7.0
    required: true
  code-quality:
    tests_required: true
    coverage_threshold: 80
    ac_traceability: false
    build_required: false
    lint_required: false
    type_check_required: false
    required: true
  review:
    required: true
  evidence-package:
    required: true

  # --- Optional gates (enabled by default since v2.17.0; risk-bound by default since v2.18.0; disable with `enabled: false`) ---
  eval-intent:                # Gate 2a: pre-implementation intent capture (v2.8.0)
    enabled: true
    risk_levels: [medium, high, critical]   # runs only for these spec risk levels; remove to run at every level
    threshold: 6.5
    per_dimension_minimum: 4
    max_eval_retries: 3
  eval-quality:               # Gate 2b: post-implementation eval-quality scoring (v2.7.0)
    enabled: true
    risk_levels: [medium, high, critical]   # runs only for these spec risk levels; remove to run at every level
    threshold: 6.5
    per_dimension_minimum: 4
  comprehension:              # Gate 2c: as-built comprehension gate (requires bun — https://bun.sh)
    enabled: true
    risk_levels: [medium, high, critical]   # runs only for these spec risk levels; remove to run at every level
    mode: asbuilt             # validated instrument; `legacy` needs no bun but is uncalibrated
    threshold: 7.0
    per_dimension_minimum: 5

# Spec quality scoring (Gate 1) — weights must sum to 1.0
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
  strategy: merge          # "merge" (direct merge to main) or "pr" (open a pull request)

# /spec run autonomy thresholds
# Sized to measured scorer noise: test-retest sigma is 0.18-0.24 on polished
# specs (benchmarks/results/test-retest-sigma.yml), so full-auto sits well
# clear of the guided threshold rather than within judge noise of it.
run:
  self_improvement_trigger: 8.5   # score below this triggers refinement loop
  full_auto_threshold: 8.3        # minimum score for autonomous execution
  guided_threshold: 7.0           # minimum score for guided mode (below = stop)
  max_spec_retries: 3
  max_code_retries: 3
  intent_verifiability_min: 8     # hard gate for intent dimension
  risk_signals:
    - delete
    - production
    - deploy
    - payment
---

# SDLC Plugin — Project Configuration

This file configures the Speculator plugin for this project. Edit the YAML
frontmatter above to adjust thresholds, weights, and which gates run.

## Optional gates (enabled by default, risk-bound by default)

Three gates ship enabled by default (since v2.17.0) and are turned off by
setting `enabled: false` on their blocks under `gates:`. Since v2.18.0 each
block also ships a `risk_levels: [medium, high, critical]` allowlist: the
gate runs only when the spec's frontmatter `risk_level` (default `medium`)
is in the list, so low-risk specs skip the optional gates' latency by
default. Remove the `risk_levels` line to run a gate at every risk level;
`enabled: false` always wins over any allowlist:

- **Gate 2a — Eval Intent** (`eval-intent`): pre-implementation intent
  capture. For each AC, you author an eval in `docs/specs/{feature}/evals/`
  describing the user-observable outcome; the `eval-intent-scorer` agent
  scores the eval set on 4 dimensions before implementation begins.
- **Gate 2b — Eval Quality** (`eval-quality`): post-implementation
  test-suite quality scoring. The `eval-quality-scorer` agent scores
  whether tests are good detection instruments for the spec's ACs across
  7 dimensions, between Gate 2 and Gate 3.
- **Gate 2c — Comprehension** (`comprehension`): anti-dark-code
  comprehension gate, between Gate 2b and Gate 3. In the default
  `mode: asbuilt`, deterministic code-graph citation checks plus a blinded
  generator/judge pair score a per-AC explanation artifact (requires bun);
  `mode: legacy` uses the single `comprehension-scorer` agent instead.

You can disable any of them independently. See the project README's
Configuration section for details.
```

2. Create the spec directory: `mkdir -p docs/specs`
3. Re-run the doctor checks to confirm everything passes.
