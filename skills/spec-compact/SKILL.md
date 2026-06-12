---
name: spec-compact
description: >-
  Folds closed specs into the cumulative system specification (SYSTEM-SPEC.md) — either
  bootstrapping from all closed specs with --all or compacting a single named spec on
  demand. Use when the user says "/sdlc compact", "/spec compact", "compact specs",
  "update the system spec", "fold this in", "consolidate specs", "bootstrap SYSTEM-SPEC",
  or wants to maintain the living system specification.
---

# Compact Specs into SYSTEM-SPEC.md

You are helping the user compact closed specs into the system specification (`SYSTEM-SPEC.md`), which is the cumulative behavioral record of everything the project does and why.

This skill has two modes:

- **`/spec compact --all`** — Bootstrap mode. Processes all `closed` specs in chronological order.
- **`/spec compact {spec-name}`** — Single-spec mode. Compacts one named spec on demand.

---

## Mode 1: `/spec compact --all` (Bootstrap)

### Process

0. **Worktree redirect check**: Run the **Worktree Redirect Check** from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`. If on main and specs exist in worktrees, inform the user that `--all` compaction should run on main after features are merged. Recommend staying on main for this operation. If the user insists on a worktree, use that path as the base.

1. **Read project config**: Read `.claude/sdlc.local.md` to get the `spec_dir` path (default: `docs/specs`).

2. **Detect the system-spec layout**: per `${CLAUDE_PLUGIN_ROOT}/lib/system-spec-layout.md` — **split** when `{spec_dir}/SYSTEM-SPEC.md` contains a valid Domains table or any `{spec_dir}/SYSTEM-SPEC-*.md` sibling exists; **single-file** otherwise (detection degrades safely to single-file on ambiguity). Bootstrap regenerates whichever layout is detected:
   - **Single-file**: regenerate the one `SYSTEM-SPEC.md`, exactly as before — unchanged.
   - **Split**: regenerate the split layout — the index (Domains table, no behavior entries) plus the per-domain `SYSTEM-SPEC-<domain>.md` files, with every `[from: SPEC-XXX]` provenance trail preserved. Each spec's behaviors route to the domain file named by its `domain:` frontmatter, per the lib's routing rules. For any closed spec missing `domain:`, this skill is the interactive surface — prompt the author to choose an existing domain or create a new one (list the existing domains from the index's Domains table), write the choice into that spec's frontmatter before compacting it, and never guess.

3. **Collect closed specs**: Find all `{spec_dir}/*/spec.md` files where the YAML frontmatter `status` is `closed`. Skip specs with status `draft`, `approved`, or `compacted`.
   - For each candidate, read the frontmatter and extract: `id`, `status`, `date` (and `domain`, in split layout)
   - If `status: compacted`, skip with a note: `"Skipping {spec-name} — already compacted."`
   - If `status: draft` or `status: approved`, skip with a note: `"Skipping {spec-name} — only closed specs are compacted."`

4. **Sort chronologically**: Order the collected specs by their `date` field (ascending — earliest first). Earlier specs establish the baseline; later specs amend. This ordering is critical: when two specs contradict, the later one wins.

5. **Report what will be processed**: Before starting, tell the user:
   ```
   Found N closed spec(s) to compact:
     1. SPEC-001: {title} ({date})
     2. SPEC-005: {title} ({date})
     ...
   Compacting into {spec_dir}/SYSTEM-SPEC.md
   Proceed? [yes/no]
   ```
   Wait for confirmation before continuing.

6. **Process each spec sequentially**: For each spec in chronological order:
   - Tell the user: `"Compacting {spec-id}: {title}..."`
   - Invoke the `spec-compactor` agent from `${CLAUDE_PLUGIN_ROOT}/agents/spec-compactor/AGENT.md` with:
     - `spec_path`: absolute path to the spec file
     - `system_spec_path`: `{spec_dir}/SYSTEM-SPEC.md`
   - The agent detects the layout itself (per `lib/system-spec-layout.md`) and merges the spec's behaviors with provenance trails — into SYSTEM-SPEC.md (single-file) or into `SYSTEM-SPEC-<domain>.md` plus the index's Domains-table row (split; behavior entries never land in the index)
   - **Conflict handling**: When the agent encounters a contradiction with an earlier spec, the later spec wins. The provenance trail records both: `[from: SPEC-005, amended by SPEC-012]`
   - If the agent fails for a particular spec (including a split-layout halt on a still-missing `domain:`), log the failure and continue to the next — do not abort the entire run. Report failures in the final summary.

7. **Update spec frontmatter**: After all specs are successfully compacted, update each compacted spec's YAML frontmatter:
   - `status: compacted`
   - `compacted_into: SYSTEM-SPEC`
   - `compacted_date: {today's date in YYYY-MM-DD}`
   - Do NOT modify any other content in the spec files.

8. **Commit all changes**: Stage and commit:
   - `{spec_dir}/SYSTEM-SPEC.md` (and, in split layout, all `{spec_dir}/SYSTEM-SPEC-*.md` domain files)
   - All updated spec files (frontmatter changes only)
   - Commit message: `chore(sdlc): bootstrap SYSTEM-SPEC.md from N closed specs`

9. **Report results**: Show a summary:
   ```
   Bootstrap complete.
     Specs processed: N
     Specs skipped: M (already compacted or wrong status)
     Domains created: K
     Total behaviors: B
     File: {spec_dir}/SYSTEM-SPEC.md
   ```
   Include any failures or warnings. In split layout, list the domain files updated or created.

---

## Mode 2: `/spec compact {spec-name}` (Single Spec)

### Process

0. **Worktree redirect check**: Run the **Worktree Redirect Check** from `${CLAUDE_PLUGIN_ROOT}/lib/spec-resolution.md`. If on main and the named spec exists in a worktree, warn the user that single-spec compaction should run after the feature is merged to main. If they want to proceed anyway, use the worktree path as the base.

1. **Read project config**: Read `.claude/sdlc.local.md` to get the `spec_dir` path.

2. **Locate the named spec**: Look for `{spec_dir}/{spec-name}/spec.md`. If not found, check if the user passed a full path — try it directly.
   - If the spec does not exist, tell the user and stop.

3. **Verify status**: Read the spec's YAML frontmatter.
   - If `status: compacted` → tell the user: `"This spec is already compacted (compacted_into: {compacted_into}, compacted_date: {compacted_date}). Nothing to do."` Stop.
   - If `status: draft` or `status: approved` → tell the user: `"Only closed specs can be compacted. This spec has status: {status}. Close the spec first with /sdlc close."` Stop.
   - If `status: closed` → proceed.

4. **Detect the system-spec layout and resolve the domain**: Detect the layout per `${CLAUDE_PLUGIN_ROOT}/lib/system-spec-layout.md` (split when `{spec_dir}/SYSTEM-SPEC.md` has a valid Domains table or any `SYSTEM-SPEC-*.md` sibling exists; single-file otherwise — degrade safely to single-file on ambiguity).
   - **Single-file** → no domain handling; proceed to step 5 unchanged.
   - **Split** with `domain:` declared in the spec's frontmatter → proceed; the compactor routes behaviors to `SYSTEM-SPEC-<domain>.md`.
   - **Split** with no `domain:` declared → never guess:
     - **Interactive** (a human invoked `/spec compact`): prompt the author to choose an existing domain or create a new one — list the existing domains from the index's Domains table — and write the choice into the spec's frontmatter before proceeding.
     - **Autonomous** (invoked from a pipeline with no human to prompt): halt compaction and escalate with the existing domains, e.g. `"Compaction halted: no domain: declared in spec frontmatter — existing domains: {list}. Add domain: <name> to the spec and re-run /spec compact {spec-name}."` Write nothing.

5. **Invoke the spec-compactor agent**: Launch the `spec-compactor` agent from `${CLAUDE_PLUGIN_ROOT}/agents/spec-compactor/AGENT.md` with:
   - `spec_path`: absolute path to the spec file
   - `system_spec_path`: `{spec_dir}/SYSTEM-SPEC.md`

6. **Update spec frontmatter**: After the agent completes successfully, update the spec's YAML frontmatter:
   - `status: compacted`
   - `compacted_into: SYSTEM-SPEC`
   - `compacted_date: {today's date in YYYY-MM-DD}`
   - Do NOT modify any other content in the spec file.

7. **Commit changes**: Stage and commit:
   - `{spec_dir}/SYSTEM-SPEC.md` (and, in split layout, any modified or created `{spec_dir}/SYSTEM-SPEC-*.md` domain files)
   - The updated spec file (frontmatter change only)
   - Commit message: `chore(sdlc): compact {spec_id} into SYSTEM-SPEC.md`

8. **Report**: Tell the user what was done:
   ```
   Compacted {spec_id}: {title}
     Added/updated behaviors in SYSTEM-SPEC.md
     Spec status updated to: compacted
   ```
   In split layout, name the domain file instead: `Added/updated behaviors in SYSTEM-SPEC-{domain}.md (index row maintained)`.

---

## Do NOT

- Compact specs with status `draft` or `approved` — only `closed` specs are compacted
- Compact specs already in `compacted` status — skip with a note, do not error
- Guess a `domain:` for a spec that doesn't declare one in a split-layout project — prompt the author (interactive) or halt and escalate listing the existing domains (autonomous), per `lib/system-spec-layout.md`
- Write behavior entries to the split-layout index — the index is navigation only; behaviors live in `SYSTEM-SPEC-<domain>.md` files
- Modify spec body content — only update frontmatter status fields (`status`, `compacted_into`, `compacted_date`, and a `domain:` chosen by the author when prompted in split layout)
- Run `--all` from within a worktree — bootstrap should run on main after features are merged
- Skip the worktree redirect check
- Abort the entire `--all` run if a single spec fails — log the failure and continue
- Proceed with `--all` without user confirmation of the spec list
