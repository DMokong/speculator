# SYSTEM-SPEC Layout — Detection and Domain Routing

This document defines the rules for detecting a project's system-spec layout (single-file vs split) and for routing SYSTEM-SPEC reads and writes in each layout. It is the **single canonical statement** of these rules. Every SYSTEM-SPEC consumer — the spec-compactor agent, the spec-scorer agent's impact validation, the eval-authoring skill and eval-intent-scorer agent's conflict check, the spec-compact skill, and the sdlc-close skill's compaction step — MUST reference this file rather than restating the rules. If a rule here changes, the consumers inherit the change; restated copies would drift.

## The Two Layouts

- **Single-file** — one `{spec_dir}/SYSTEM-SPEC.md` holds every domain section and behavior entry. The original layout and the default for every project.
- **Split** — `{spec_dir}/SYSTEM-SPEC.md` is an **index** (navigation only: a Domains table mapping each domain to its file) and behavior entries live in per-domain `{spec_dir}/SYSTEM-SPEC-<domain>.md` siblings. An opt-in scaling layout for projects whose system spec outgrows a single file.

## Layout Detection (run before any SYSTEM-SPEC read or write)

A project's system spec is **split** when EITHER marker is present:

1. **A valid Domains table in the index.** `{spec_dir}/SYSTEM-SPEC.md` contains a markdown table whose header row contains both a `Domain` column and a `File` column. This is the index format:

   ```markdown
   ## Domains

   | Domain | File | Description |
   |---|---|---|
   | `memory` | [SYSTEM-SPEC-memory.md](SYSTEM-SPEC-memory.md) | Memory subsystem behaviors. |
   ```

2. **Any domain sibling file.** At least one `{spec_dir}/SYSTEM-SPEC-*.md` file exists alongside `SYSTEM-SPEC.md` (e.g. `SYSTEM-SPEC-memory.md`). Either marker alone is sufficient.

If NEITHER marker is present, the project is **single-file**.

**Safe degradation:** a `SYSTEM-SPEC.md` whose Domains table is malformed or absent, with no domain siblings, is treated as single-file. Detection never errors and never blocks — on any ambiguity, fall back to single-file and proceed with the unchanged single-file behavior. Misdetecting a hand-rolled layout as single-file is recoverable; erroring out is not.

## Read Rule (subset reads in split layout)

In split layout, consumers read the index **plus only the relevant domain file(s)**:

- Spec declares `domain: <name>` in its frontmatter → read the index plus `SYSTEM-SPEC-<name>.md`.
- Spec declares no `domain:` → read the index plus **all** domain files. This is the conservative default — a domainless spec costs a full-corpus read, which is itself a gentle pressure to declare a domain; correctness is never traded for the token saving.
- Spec declares a domain that has no file yet → read the index plus all domain files (a declaration that cannot be resolved cannot be trusted to scope reads).
- The index contributes the domain inventory only — behavior entries are read from domain files, never from the index.

In single-file layout, read `SYSTEM-SPEC.md` exactly as before — no subset logic applies.

## Routing Rules (writes in split layout)

1. **Route by frontmatter.** Read the closing spec's `domain:` frontmatter and append its behavior entries (with `[from: SPEC-NNN]` provenance) to `{spec_dir}/SYSTEM-SPEC-<domain>.md`.
2. **New domain = file + index row, in the same step.** If the declared domain has no file, create `SYSTEM-SPEC-<domain>.md` AND add its row to the index's Domains table as part of the same compaction step. A domain file without an index row is drift — never create one without the other.
3. **The index is navigation, not storage.** NEVER write behavior entries to the index file. The only index edit a compaction may make is adding (or updating the description of) a Domains-table row.
4. **Missing domain: halt, never guess.** When a closing spec declares no `domain:` in a split-layout project:
   - **Interactive contexts** prompt the author to choose an existing domain or create a new one (list the existing domains from the index's Domains table), then record the choice in the spec's frontmatter.
   - **Autonomous contexts** (e.g. sdlc-run Phase 5) halt compaction and escalate with the list of existing domains, e.g.: *"Compaction halted: no `domain:` declared — existing domains: speculator, memory, slack-bot. Add `domain: <name>` to the spec frontmatter and resume."* Nothing is written before the halt.
   - Guessing a domain is prohibited in both contexts — a behavior filed in the wrong domain corrupts the provenance map that future impact checks rely on.
5. **Cross-domain behaviors have one owner.** A behavior spanning domains is placed in its primary owner's domain file with a prose cross-reference to the related domain (e.g. *"…(also consumed by the slack-bot domain — see SYSTEM-SPEC-slack-bot.md)"*). Never duplicate the entry across files — duplication breaks provenance audits.

## Single-File Projects: Untouched

In single-file layout, every consumer behaves byte-for-byte as it did before this rule existed: reads and writes go to `SYSTEM-SPEC.md`, no index is created, no domain prompt or halt ever appears, and no migration is performed or suggested as a side effect of normal operation. The split layout is an opt-in scaling tool, not a new default.
