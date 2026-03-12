---
name: sdlc-doctor
description: >-
  Use when the user says "/sdlc doctor", "/spec doctor", "sdlc check", "spec check",
  "sdlc health", "check sdlc setup", or when invoked automatically by /sdlc start
  to verify the environment is ready. Runs diagnostics on plugin config, git state,
  and worktree wiring.
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

### 3. Plugin Wiring

The SDLC plugin being loaded is self-evident — if `/sdlc doctor` is running, the plugin is installed and all skills are registered.

Check if the PreToolUse hook is registered:
```bash
# Check settings.local.json for SDLC hook
grep -l "SDLC PRE-COMMIT" .claude/settings.local.json 2>/dev/null
```
- **PASS**: Hook registered
- **WARN**: Hook not registered (commits won't show gate warnings)

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

Plugin Wiring
  ✅ Plugin loaded (sdlc-doctor is running)
  ⚠️  Pre-commit hook: not registered (optional, run /sdlc doctor --fix to add)

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
- Missing hook registration → add to settings.local.json (warn user first since it's gitignored)
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
scoring:
  weights:
    completeness: 0.25
    clarity: 0.25
    testability: 0.25
    feasibility: 0.15
    scope: 0.10
  dimension_minimum: 5
---

# SDLC Plugin — Project Configuration

This file configures the Speculator plugin for this project.
Edit the YAML frontmatter above to adjust thresholds and paths.
```

2. Create the spec directory: `mkdir -p docs/specs`
3. Re-run the doctor checks to confirm everything passes.
