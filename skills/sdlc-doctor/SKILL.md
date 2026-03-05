---
name: sdlc-doctor
description: >-
  Use when the user says "/sdlc doctor", "sdlc check", "sdlc health", "check sdlc setup",
  or when invoked automatically by /sdlc start to verify the environment is ready.
  Runs diagnostics on plugin config, memory, git state, and worktree wiring.
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
| `SOUL.md` | No | Exists (personality file, ClaudeClaw-specific) |
| `.claude/sdlc.local.md` | Yes | Exists, has valid YAML frontmatter with `spec_dir` and `gates` |

- **PASS**: All required files present and valid
- **FAIL**: Missing CLAUDE.md or sdlc.local.md
- **WARN**: Missing optional files

### 3. Plugin Wiring

Check the SDLC plugin is properly installed:

```bash
# Plugin manifest exists?
cat .claude/plugins/agentic-sdlc/.claude-plugin/plugin.json

# Skills are symlinked for auto-discovery?
ls -la .claude/skills/sdlc
ls -la .claude/skills/spec-create
ls -la .claude/skills/spec-score
ls -la .claude/skills/gate-check
ls -la .claude/skills/sdlc-status
```

- **PASS**: Plugin manifest exists, all 5 skills symlinked
- **FAIL**: Missing plugin manifest
- **WARN**: Some skills not symlinked (will show as "Unknown skill")

Also check if the PreToolUse hook is registered:
```bash
# Check settings.local.json for SDLC hook
grep -l "SDLC PRE-COMMIT" .claude/settings.local.json 2>/dev/null
```
- **PASS**: Hook registered
- **WARN**: Hook not registered (commits won't show gate warnings)

### 4. Memory Health

This is the most critical check — ensures Cindy has full context.

```bash
# Find the memory directory for this project
MEMORY_DIR=$(ls -d ~/.claude/projects/*claudeclaw*/memory 2>/dev/null | head -1)
```

Check each memory file:

| File | Check | Minimum |
|------|-------|---------|
| `MEMORY.md` | Exists, non-empty | > 10 lines |
| `preferences.md` | Exists | > 0 lines |
| `project-context.md` | Exists | > 0 lines |
| `conversations.md` | Exists | > 0 lines |

- **PASS**: All memory files exist with content
- **WARN**: Some memory files empty or missing (context may be limited)
- **FAIL**: MEMORY.md missing or empty (critical context loss)

**If in a worktree**, additionally check:
```bash
# Is memory a symlink back to main?
ls -la "$MEMORY_DIR"
# Should show: memory -> /path/to/main/project/memory
```
- **PASS**: Memory is symlinked to main project's memory
- **FAIL**: Memory is NOT symlinked — worktree session will have empty/stale memory. Fix by running:
  ```bash
  MAIN_MEMORY=$(git worktree list | head -1 | awk '{print $1}')
  # Then symlink as described in spec-create skill
  ```

### 5. Spec Directory & Cross-Worktree Visibility

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

### 6. Active Specs & Locks

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
  ✅ SOUL.md present
  ✅ sdlc.local.md valid (spec_dir: docs/specs, 4 gates configured)

Plugin Wiring
  ✅ Plugin manifest: agentic-sdlc v0.1.0
  ✅ Skills symlinked: sdlc, spec-create, spec-score, gate-check, sdlc-status
  ⚠️  Pre-commit hook: not registered (optional, run /sdlc doctor --fix to add)

Memory Health
  ✅ MEMORY.md: 42 lines (last modified: 2 hours ago)
  ✅ preferences.md: 18 lines
  ✅ project-context.md: 35 lines
  ✅ conversations.md: 28 lines
  ✅ Memory symlink: correctly linked to main project (worktree only)

Specs
  ✅ Spec directory exists (docs/specs/)
  📋 1 active spec: SPEC-001 add-user-auth (status: draft, Gate 1: pending)

Summary: 11 passed, 1 warning, 0 failures
```

## Severity Levels

- **FAIL** (❌): Blocks the workflow. Must be fixed before proceeding.
- **WARN** (⚠️): Workflow will work but with reduced capability. Flag to user.
- **PASS** (✅): Healthy.
- **INFO** (📋): Informational, no action needed.

## Auto-Fix

If the user runs `/sdlc doctor --fix` or if invoked from `/sdlc start`, attempt to fix issues:

- Missing skill symlinks → create them
- Missing memory symlink in worktree → create it
- Missing spec directory → create it
- Missing hook registration → add to settings.local.json (warn user first since it's gitignored)
- Stale lock files (worktree gone) → remove the `.active` file

Do NOT auto-fix:
- Missing CLAUDE.md (project-specific, user should create)
- Missing sdlc.local.md (needs user decisions on thresholds)
- Empty memory files (need real content, not placeholders)
