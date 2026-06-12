---
id: SPEC-003
feature: system-spec-domain-split
status: approved
risk_level: medium
impact_rating: extends
created: 2026-06-12
owner: Dustin Cheng
---

# SYSTEM-SPEC Domain Split — Native Plugin Support (SPEC-042 Phase 2)

## Problem Statement

Projects that accumulate many compacted specs outgrow a single SYSTEM-SPEC.md. The consumer project ClaudeClaw already runs a split layout (SPEC-042 Phase 1, 2026-05-03): an index file with a Domains table plus per-domain `SYSTEM-SPEC-<domain>.md` files. But the plugin's own tooling doesn't understand that layout — the spec-compactor, spec-scorer impact validation, eval-authoring conflict check, and the spec-compact skill all assume one file. Phase 1 bridged the gap with a human-readable "Routing Note" in the index that asks whichever agent reads it to route manually; the note itself says the bridge ends "when the Speculator-side tooling update lands (Phase 2)." This spec is Phase 2: every SYSTEM-SPEC consumer in the plugin natively detects the layout and handles both, with zero behavior change for single-file projects.

## Requirements

- **R1 — Layout detection, defined once**: A project's system spec is **split** when `{spec_dir}/SYSTEM-SPEC.md` contains a Domains table (an index) or any `{spec_dir}/SYSTEM-SPEC-*.md` sibling exists; otherwise **single-file**. A *valid Domains table* is a markdown table whose header row contains `Domain` and `File` columns (the Phase 1 index format). A SYSTEM-SPEC.md whose table is malformed or absent, with no domain siblings, is treated as single-file — detection degrades safely, never errors. The detection rule lives in one place (`lib/system-spec-layout.md`) and every consumer references it rather than restating it.
- **R2 — Compactor routes by domain**: In split layout, the spec-compactor reads the closing spec's `domain:` frontmatter and appends behaviors to `{spec_dir}/SYSTEM-SPEC-<domain>.md`, creating the domain file and adding its row to the index's Domains table when new. Behavior entries are NEVER written to the index file itself. (This natively enforces the Phase 1 index's "Routing Note for /sdlc close Compaction" — after this ships, that note becomes documentation of automatic behavior rather than an instruction to the reading agent.)
- **R3 — Missing domain never guessed**: In split layout with no `domain:` frontmatter — interactive contexts prompt the author for the domain; autonomous contexts (sdlc-run Phase 5) halt compaction and escalate with the list of existing domains. Guessing is prohibited.
- **R4 — Cross-domain behaviors**: A behavior spanning domains is placed in its primary owner's file with a prose cross-reference to the related domain — never duplicated across files (duplication breaks provenance audits).
- **R5 — Scorer reads the relevant subset**: In split layout, spec-scorer impact validation reads the index plus only the domain file(s) matching the spec's declared `domain:` (all domain files when the spec declares none — the conservative default: a domainless spec costs a full-corpus read, which is itself a gentle pressure to declare a domain; correctness is never traded for the token saving). Single-file behavior unchanged.
- **R6 — Eval-authoring conflict check is split-aware**: The Gate 2a SYSTEM-SPEC compatibility check reads the index plus the relevant domain file(s) using the same R1 detection and R5 subset rule.
- **R7 — spec-compact skill handles both layouts**: Single-spec mode routes per R2/R3. `--all` bootstrap mode regenerates the split layout (index + domain files, provenance preserved) when the project is split, and the single file otherwise.
- **R8 — Single-file projects untouched, no forced migration**: A project without an index or domain siblings sees byte-for-byte identical tooling behavior. Speculator's own SYSTEM-SPEC.md stays single-file until the ~300-line ROADMAP trigger. (SPEC-042's original R6 — deleting Speculator's "redundant" root copy — is recorded obsolete: the copy moved to `docs/specs/` in v2.9.0 and is now this repo's canonical living spec.)
- **R9 — Template support**: `templates/spec-template.md` gains an optional `domain:` frontmatter field with a comment explaining it's required at close time in split-layout projects.

## Acceptance Criteria

- **AC1** (R1): Given a project whose `{spec_dir}` contains `SYSTEM-SPEC.md` with a Domains table (or any `SYSTEM-SPEC-*.md` sibling), when any SYSTEM-SPEC consumer runs, then it operates in split mode; given neither marker, it operates in single-file mode.
- **AC2** (R2): Given a split-layout project and a closing spec with `domain: memory`, when compaction runs, then new behavior lines (with `[from: SPEC-NNN]` provenance) land in `SYSTEM-SPEC-memory.md` and the index file gains no behavior entries.
- **AC3** (R2): Given a closing spec declaring a domain with no existing file, when compaction runs, then the domain file is created AND the index's Domains table gains a row for it.
- **AC4** (R3): Given a split-layout project and a closing spec with no `domain:` field, when compaction runs autonomously, then compaction halts with an escalation listing the existing domains — no file is modified; when run interactively, the author is prompted to choose or create a domain.
- **AC5** (R5, R6): Given a split-layout project and a spec declaring `domain: memory`, when Gate 1 impact validation or the Gate 2a conflict check runs, then the agent reads the index and `SYSTEM-SPEC-memory.md` — not every domain file.
- **AC6** (R7): Given a split-layout project, when `/spec compact --all` runs, then the regenerated output is the split layout (index + domain files) with all provenance trails intact.
- **AC7** (R8): Given a single-file project (Speculator's own repo), when any of the updated skills/agents run end-to-end, then their SYSTEM-SPEC reads and writes are identical to v2.10.0 behavior — no index is created, no domain prompts appear.
- **AC8** (R9): When an author creates a spec from the template, then the frontmatter shows the optional `domain:` field with guidance on when it matters.

## Critical User Journey

A ClaudeClaw-style project closes a memory-subsystem spec. The author declared `domain: memory` at creation (template nudged them). At close, the compactor detects the split layout, folds the behaviors into `SYSTEM-SPEC-memory.md` with provenance, and leaves the index untouched. Months later a new spec amends a memory behavior: Gate 1's impact validation reads the index plus only the memory domain file, flags the `amends` requirement, and the Gate 2a conflict check sees the same subset. Nobody hand-routes anything — the Phase 1 Routing Note in the index becomes documentation of what the tooling now does itself.

The failure path: a teammate forgets the `domain:` field and lets an autonomous run reach close. Compaction halts with "no domain declared — existing domains: speculator, memory, slack-bot, pipelines, observability, core", nothing is written, and the run's escalation message tells them exactly which field to add. One frontmatter line later, resume completes the close.

## Anti-Patterns

- Do NOT guess a domain when the frontmatter is silent — a behavior filed in the wrong domain is worse than a halted compaction; it corrupts the provenance map that future impact checks rely on.
- Do NOT write behavior entries to the index — the index is navigation, not storage. Mixing them breaks the "index stays small, domains absorb growth" scaling property.
- Do NOT force single-file projects to migrate — the split is an opt-in scaling tool, not a new default.
- Do NOT duplicate a cross-domain behavior into multiple files — one owner plus cross-references, or audits double-count.

## Constraints

- Prompt-only changeset (skills/agents/lib/template markdown). Gate 2 satisfied per the prompt-only N/A-rationale rule.
- This spec **extends** SYSTEM-SPEC-recorded behaviors of the Compactor, Scorer impact-validation, and Conditional Gate Surfaces domains ([from: SPEC-001/SPEC-002] entries are untouched — new layout-handling behaviors are added alongside them, which is why `impact_rating: extends` is declared).
- The detection rule must work from prose instructions alone — no executable layout-probe script in this phase.

## Out of Scope

- Migrating Speculator's own SYSTEM-SPEC.md to split layout (single-file until the ~300-line trigger; it's at ~100).
- Automated domain inference from spec content (explicitly prohibited by R3 — future work could *suggest*, never silently choose).
- ClaudeClaw-side changes — its Phase 1 layout is already conformant; this makes the plugin meet it.

## Risks

1. **Detection ambiguity on hand-rolled layouts** — a project with a nonstandard index might be misdetected. Mitigation: two independent markers (Domains table OR sibling files); single-file is the fallback on ambiguity.
2. **Compactor prompt complexity** — the routing rules add branching to an agent that must never drop behaviors. Mitigation: the rules live in lib/ as a single reference; the structural test suite asserts every consumer cites it.
3. **Index drift** — domain files added without index rows. Mitigation: R2 makes index-row maintenance part of the same compaction step that creates the file.
