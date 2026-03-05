# Spec Resolution — How to Identify the Active Spec

This document defines the rules for determining which spec a skill should operate on. All SDLC skills that need to identify a spec MUST follow this resolution order.

## Worktree Redirect Check (run FIRST by every SDLC skill)

Before any spec resolution, every SDLC skill MUST check whether the session needs to redirect to a worktree. This prevents operating on main when the spec and evidence live in a worktree.

```bash
# Step 1: Determine if we're on main or in a worktree
MAIN_WORKTREE=$(git worktree list | head -1 | awk '{print $1}')
CURRENT_TOPLEVEL=$(git rev-parse --show-toplevel 2>/dev/null)
IN_WORKTREE=false
[ "$CURRENT_TOPLEVEL" != "$MAIN_WORKTREE" ] && IN_WORKTREE=true

# Step 2: If on main, scan worktrees for active specs
if [ "$IN_WORKTREE" = "false" ]; then
  git worktree list --porcelain | grep "^worktree " | sed 's/worktree //' | while read wt; do
    [ "$wt" = "$MAIN_WORKTREE" ] && continue
    # Check for spec directories in this worktree
    for spec_dir in "$wt"/docs/specs/*/; do
      [ -f "$spec_dir/spec.md" ] && echo "WORKTREE_SPEC: $wt → $(basename $spec_dir)"
    done
  done
fi
```

**If specs are found in worktrees but not on main:**

1. List the worktree specs to the user:
   ```
   ⚠️  You're on main, but active specs exist in worktrees:
     • memory-phase-1-5-enhancements → worktree: memory-phase-1-5
     • add-user-auth → worktree: add-user-auth
   ```

2. **Ask the user** which worktree to switch to (or if they want to stay on main).

3. **If the user picks a worktree**, use the worktree's absolute path as the base for ALL subsequent file operations:
   ```bash
   SPEC_BASE="/path/to/worktree"
   # All spec reads/writes use $SPEC_BASE/docs/specs/... instead of relative paths
   ```
   Also inform the user: *"Operating against worktree `{name}`. For full isolation, consider launching a separate Claude Code session in this worktree."*

4. **If on main and NO specs exist anywhere** (main or worktrees), that's fine — some commands like `/sdlc start` expect this.

**If already in a worktree:** Skip this check — worktree affinity (step 2 below) handles it.

---

## Resolution Order (first match wins)

### 1. Explicit User Selection
If the user specified a spec by name or path, use it. Always respect explicit input.
- `/sdlc score add-user-auth` → use `docs/specs/add-user-auth/spec.md`
- `/sdlc score docs/specs/my-feature/spec.md` → use that path directly

### 2. Worktree Affinity
If in a worktree, the worktree name maps to the spec directory:
```bash
# Get worktree name (if in one)
WORKTREE_NAME=$(basename "$(pwd)")
# Check if matching spec exists
ls docs/specs/$WORKTREE_NAME/spec.md 2>/dev/null
```
If a matching spec exists, use it automatically — this is the primary spec for this worktree. Tell the user: "Using spec `{name}` (matched from worktree name)."

### 3. Lock File Check
Before selecting any spec, check for active locks:
```bash
# Check for .active lock files
find docs/specs/ -name ".active" -type f 2>/dev/null
```
Each `.active` file contains:
```yaml
session_id: <claude session identifier or PID>
worktree: <worktree name or "main">
started: <ISO 8601 timestamp>
```
- If a spec has a `.active` file, it is being worked on by another session
- Show these as "(locked by {worktree})" when listing specs
- Do NOT auto-select a locked spec — warn the user if they try to

### 4. Single Spec Fallback
If on main (not in a worktree) and there's exactly one unlocked spec in the target status, use it. Tell the user which one was selected.

### 5. Ask the User
If multiple unlocked specs exist and none of the above resolved, list them and ask:
```
Found 3 specs:
  1. add-user-auth (status: draft)
  2. email-notifications (status: draft, locked by worktree/email-notifications)
  3. dark-mode (status: approved)

Which spec would you like to work on?
```

## Lock Management

### Acquiring a Lock
When `/sdlc start` creates a spec (or when `/sdlc implement` begins), write a lock file:
```bash
# docs/specs/{spec-name}/.active
cat > docs/specs/{spec-name}/.active << 'EOF'
session_id: $(echo $CLAUDE_SESSION_ID 2>/dev/null || echo "unknown")
worktree: $(basename "$(pwd)")
started: $(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
```

### Releasing a Lock
When `/sdlc close` finalizes a spec, remove the lock:
```bash
rm docs/specs/{spec-name}/.active
```

### Stale Locks
If a lock file exists but the worktree no longer exists (check `git worktree list`), the lock is stale:
```bash
LOCK_WORKTREE=$(grep "worktree:" docs/specs/{spec-name}/.active | awk '{print $2}')
git worktree list | grep -q "$LOCK_WORKTREE" || echo "STALE LOCK"
```
- `/sdlc doctor` should detect and offer to clean up stale locks
- Stale locks can be auto-removed with `--fix`

## .gitignore
The `.active` lock files should be gitignored — they're ephemeral session state:
```
# In .gitignore
docs/specs/**/.active
```
