---
name: sdlc-close
description: >-
  Runs the Speculator delivery workflow (Gate 4 + close) for a completed spec —
  builds the evidence package, closes the beads epic and stories, releases the
  spec lock, delivers to main via merge or PR per close.strategy, and compacts
  the spec into SYSTEM-SPEC.md. Use when the user says "/sdlc close", "/spec
  close", "close the spec", "close out this spec", "finalize the feature and
  merge", "deliver this spec to main", "ship this spec", or when the sdlc-run
  pipeline reaches Phase 5. NOT for closing individual beads issues or generic
  "close this issue/PR" requests — those have nothing to do with the spec
  delivery pipeline.
---

# `/sdlc close` — Deliver a Completed Spec

You are finalizing a feature and delivering it to main. This skill is the **single source of truth** for the close workflow — the `sdlc` router and the `sdlc-run` Phase 5 reference both delegate here.

The delivery method depends on the `close.strategy` setting in the project config (`.claude/sdlc.local.md`):

- `merge` (default) — direct merge to main from the worktree
- `pr` — create a pull request to main (for environments with branch protection rules)

## Step 0: Resolve the spec

Resolve the active spec (follow `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`). If the `sdlc` router or `sdlc-run` orchestrator already resolved a worktree base path, use it for all spec/evidence operations below.

## Steps 1–4: Common to both strategies

1. **Run Gate 4** (evidence package) — invoke `gate-check` skill with gate=evidence-package. This produces `evidence/gate-4-summary.yml`. If Gate 4 fails, stop and report the failing checks — do not proceed to delivery.

2. **Close beads issues**:
   - Read the spec's `epic` field from YAML frontmatter to find the epic ID
   - Find all stories linked to this epic (`beads dep list {epic-id}`)
   - Verify all stories are completed — if any are open, warn the user
   - Close all completed stories: `beads close {story-id}`
   - Close the epic: `beads close {epic-id}`
   - Update the spec's YAML frontmatter: `status: closed`

3. **Release the spec lock**: Remove the `.active` file from the spec directory:
   ```bash
   rm docs/specs/{spec-name}/.active
   ```
   The lock signals an in-flight spec — it is deliberately the **last** bookkeeping artifact removed, after beads closure, so an interrupted close never leaves a spec that looks closed but still holds open work.

4. **Commit** all evidence and close bookkeeping:
   ```
   chore(sdlc): gate 4 — evidence package complete
   ```

## Step 5+: Deliver to main

Read `close.strategy` from the project config (`.claude/sdlc.local.md`). Default is `merge` if not set.

### Strategy: `merge` (default)

5. **Guide the merge** (if Gate 4 passes):
   a. Check if we're in a worktree (`git worktree list`)
   b. If in a worktree:
      - Commit all remaining changes
      - Explain: "Ready to merge back to main. Since specs and evidence live in unique directories (`docs/specs/{feature-name}/`), merges are typically clean."
      - Guide: `git checkout main && git merge {worktree-branch}`
      - After merge: the worktree can be cleaned up on session exit
   c. If on main: just confirm all gates passed and work is committed.

6. **Compact into system spec** (runs after merge lands on main):
   - Invoke the `spec-compactor` agent (from `${CLAUDE_PLUGIN_ROOT}/agents/spec-compactor/AGENT.md`) with:
     - `spec_path`: path to the closing spec
     - `system_spec_path`: `{spec_dir}/SYSTEM-SPEC.md`
   - The agent produces an updated SYSTEM-SPEC.md (or creates it if this is the first compaction)
   - If the agent fails or SYSTEM-SPEC.md cannot be written, log the failure and leave the spec at `status: closed` — do not block the close flow

7. **Mark spec as compacted** (only if step 6 succeeded):
   - Update the spec's YAML frontmatter:
     - `status: compacted`
     - `compacted_into: SYSTEM-SPEC`
     - `compacted_date: {today's date in YYYY-MM-DD}`

8. **Commit compaction changes** (only if step 6 succeeded):
   - Stage SYSTEM-SPEC.md and the spec's updated frontmatter
   - Commit with message: `chore(sdlc): compact {spec_id} into SYSTEM-SPEC.md`
   - Tell the user: "Two commits created: merge commit + compaction commit. This is by design — compaction only runs for validated, shipped specs."

9. **Remind about shared files**: "If you modified any shared files (.beads/, CLAUDE.md, sdlc.local.md) in the worktree, review those changes carefully during merge."

### Strategy: `pr`

5. **Compact into system spec** (runs on the feature branch, before PR creation):
   - Invoke the `spec-compactor` agent (from `${CLAUDE_PLUGIN_ROOT}/agents/spec-compactor/AGENT.md`) with:
     - `spec_path`: path to the closing spec
     - `system_spec_path`: `{spec_dir}/SYSTEM-SPEC.md`
   - The agent produces an updated SYSTEM-SPEC.md (or creates it if this is the first compaction)
   - If the agent fails or SYSTEM-SPEC.md cannot be written, log the failure and leave the spec at `status: closed` — do not block the close flow

6. **Mark spec as compacted** (only if step 5 succeeded):
   - Update the spec's YAML frontmatter:
     - `status: compacted`
     - `compacted_into: SYSTEM-SPEC`
     - `compacted_date: {today's date in YYYY-MM-DD}`

7. **Commit compaction changes** (only if step 5 succeeded):
   - Stage SYSTEM-SPEC.md and the spec's updated frontmatter
   - Commit with message: `chore(sdlc): compact {spec_id} into SYSTEM-SPEC.md`

8. **Create a pull request**:
   a. Check if we're in a worktree (`git worktree list`)
   b. **Verify `gh` CLI is available**:
      ```bash
      which gh
      ```
      If `gh` is not found, stop and tell the user: *"gh CLI is required for PR creation. Install it: https://cli.github.com/ — then re-run `/sdlc close`."*
   c. Push the branch to the remote:
      ```bash
      git push -u origin {worktree-branch}
      ```
      If the push fails, surface the error and suggest: *"Check your remote with `git remote -v`. Ensure the remote exists and you have push access."*
   d. Build the PR body from the gate evidence:
      - Read `gate-4-summary.yml` for the pipeline result
      - Read the spec's title, problem statement, and acceptance criteria
      - Read `gate-1-scorecard.yml` for the spec quality score
      - Read `gates.*.enabled` from `.claude/sdlc.local.md` to determine which opt-in gates ran
      - Compose a PR description with:
        - **Summary**: spec title and 1-2 sentence problem statement
        - **Spec quality**: overall score from Gate 1
        - **Evidence**: table with one row per gate that ran — Gates 1, 2, 3, and 4 always; add a Gate 2a (eval-intent) row if `gates.eval-intent.enabled: true` and a Gate 2b (eval-quality) row if `gates.eval-quality.enabled: true`. Do not list disabled opt-in gates.
        - **Acceptance criteria**: list from the spec
        - Footer: `🔬 Quality pipeline: Speculator | Spec: {spec_id} | Score: {overall_score}`
   e. Create the PR:
      ```bash
      gh pr create --title "{spec_title}" --body "{composed body}" --base main
      ```
      If `gh pr create` fails, surface the error and suggest: *"Run `gh auth status` to verify authentication. Ensure you have repo access."*
   f. Report the PR URL to the user.

9. **Remind about shared files**: "If you modified any shared files (.beads/, CLAUDE.md, sdlc.local.md) in the worktree, review those changes carefully — they'll be part of the PR diff."

10. **Worktree note**: "The worktree stays active until the PR merges. After merge, clean up with `git worktree remove {worktree-path}`."
