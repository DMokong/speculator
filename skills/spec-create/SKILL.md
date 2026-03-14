---
name: spec-create
description: >-
  Use when the user says "/sdlc start", "/spec start", "/spec create", "create a
  spec", "new spec", "start a new feature spec", or wants to begin a new piece of
  work with a formal specification. Creates a spec from the template in the
  project's configured spec directory.
---

# Create a New Spec

You are helping the user create a new specification document for a piece of work.

## Process

0. **Worktree awareness check**: Before creating anything, check the current state:
   a. Run `git worktree list` to see existing worktrees.
   b. If already in a worktree, warn: *"You're already in worktree `{name}`. Creating a new spec here will add it to this worktree rather than creating a new one. If this is a separate feature, go back to main and run `/sdlc start` from there."* Ask the user to confirm before proceeding.
   c. If on main, list any existing worktrees with active specs so the user has context:
      ```
      Existing worktrees with specs:
        • memory-phase-1-5 → SPEC-001: memory-phase-1-5-enhancements (approved)
        • add-user-auth → SPEC-002: add-user-auth (draft)
      Creating a new worktree for your new feature...
      ```

1. **Run system check**: Invoke the `sdlc-doctor` skill first to verify the environment is healthy. If critical issues are found (missing config, empty memory), fix them before proceeding.

2. **Read project config**: Read `.claude/sdlc.local.md` to get the `spec_dir` path (default: `docs/specs`).

3. **Feed system spec as context (if exists)**:
   - Check if `{spec_dir}/SYSTEM-SPEC.md` exists (where `spec_dir` is from project config)
   - If it exists, read it and include it as context when the user or AI is drafting the spec:
     ```
     The following is the current system specification. Your new spec's
     `impact_rating` and `amends` fields should reflect any overlap with
     these existing behaviors:

     [contents of SYSTEM-SPEC.md]
     ```
   - If it doesn't exist, set `impact_rating: none` and `amends: []` in the generated spec (these are the template defaults)

4. **Ask for spec details**: Ask the user (one question at a time):
   - What is this spec for? (brief title — will become the directory name, kebab-cased)
   - Who is the author? (for the YAML frontmatter)

5. **Create a worktree for this feature**:
   - **Before creating the worktree**, record the main project's memory path:
     ```bash
     # Detect the main project's memory directory dynamically
     # Claude Code keys memory on sanitized absolute path: /a/b/c -> -a-b-c
     MAIN_PROJECT_DIR=$(pwd)
     MAIN_SANITIZED=$(echo "$MAIN_PROJECT_DIR" | sed 's|^/||; s|/|-|g; s|^|-|')
     MAIN_MEMORY_DIR="$HOME/.claude/projects/$MAIN_SANITIZED/memory"
     ```
   - Use the `EnterWorktree` tool with the kebab-case title as the name (e.g., `add-user-auth`)
   - This creates an isolated workspace so multiple features can be in progress simultaneously
   - If the user declines the worktree or it fails, continue on the current branch — worktrees are recommended but not required

6. **Wire up memory in the worktree** (do this immediately after entering the worktree):
   - Claude Code keys project memory on the absolute working directory path
   - A worktree at a different path gets a *separate, empty* memory directory — losing all context
   - Fix this by symlinking the worktree's memory to the main project's memory (if it exists):
     ```bash
     if [ -d "$MAIN_MEMORY_DIR" ]; then
       WORKTREE_DIR=$(pwd)
       SANITIZED=$(echo "$WORKTREE_DIR" | sed 's|^/||; s|/|-|g; s|^|-|')
       WORKTREE_MEMORY_PARENT="$HOME/.claude/projects/$SANITIZED"

       mkdir -p "$WORKTREE_MEMORY_PARENT"
       ln -sfn "$MAIN_MEMORY_DIR" "$WORKTREE_MEMORY_PARENT/memory"

       # Verify
       if [ -f "$WORKTREE_MEMORY_PARENT/memory/MEMORY.md" ]; then
         echo "Memory symlinked successfully."
       else
         echo "WARNING: Memory symlink created but MEMORY.md not found. Memory may be empty."
       fi
     else
       echo "INFO: No memory directory detected for main project. Skipping memory wiring."
       echo "This is normal for projects without Claude Code long-term memory configured."
     fi
     ```

7. **Generate spec ID**: Use the pattern `SPEC-NNN` where NNN is the next available number. Check existing specs in `{spec_dir}/` to determine the next ID.

8. **Create the spec**:
   - Create directory: `{spec_dir}/{kebab-case-title}/`
   - Copy the template from `${CLAUDE_PLUGIN_ROOT}/templates/spec-template.md` to `{spec_dir}/{kebab-case-title}/spec.md`
   - Fill in the YAML frontmatter: id, status (draft), author, date (today)

9. **Acquire a lock** on this spec so other sessions know it's being worked on:
   ```bash
   cat > {spec_dir}/{kebab-case-title}/.active << EOF
   session_id: $(echo $CLAUDE_SESSION_ID 2>/dev/null || echo "unknown")
   worktree: $(basename "$(pwd)")
   started: $(date -u +%Y-%m-%dT%H:%M:%SZ)
   EOF
   ```
   See `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md` for full lock/resolution rules.

10. **Create a beads epic** for this feature to track the full lifecycle:
   ```bash
   beads create --title "{spec-title}" --description "Epic: {spec-title}\n\nSpec: {spec_dir}/{kebab-case-title}/spec.md\nWorktree: {worktree-name}" --priority P2
   ```
   - Record the beads issue ID in the spec's YAML frontmatter as `epic: claw-XXXX`
   - This epic tracks the feature from spec through implementation to merge
   - User stories (implementation tasks) will be created later by `/sdlc implement`

11. **Guide the user**: Tell them to fill in the spec sections. Offer to help draft any section. Remind them that when the spec is ready, they should run `/sdlc score` to get it evaluated. Review the `impact_rating` and `amends` fields — if `SYSTEM-SPEC.md` exists, these were auto-populated based on detected impact. Verify they accurately reflect what this spec changes.

## Worktree Isolation

Each feature gets its own worktree so multiple specs can be in flight simultaneously. This avoids branch-switching disruption.

**What's safe in worktrees** (unique per feature, merges cleanly):
- `docs/specs/{feature-name}/` — each spec has its own directory
- Evidence artifacts — nested inside spec directories
- Implementation code — typically different files per feature

**What to avoid modifying in worktrees** (shared across features):
- `.beads/` — issue tracking database. Create/update beads issues from the main worktree.
- `.claude/sdlc.local.md` — project config. Modify from main only.
- `CLAUDE.md` — project instructions. Modify from main only.

When the feature is complete, `/sdlc close` will guide merging the worktree back to main.

## Do NOT

- Score the spec (that's `/sdlc score`)
- Start implementation (that's after Gate 1 passes)
- Create the evidence directory yet (that's created by the scorer)
- Modify shared config files (sdlc.local.md, CLAUDE.md, .beads/) from within a worktree
