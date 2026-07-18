# Design — asbuilt semantic concept types (claw-j65u)

Shaped interactively with Dustin, 2026-07-19. Three product decisions settled:

## 1. Scope: forward path + backfill
- **Forward:** asbuilt-generator's output schema gains optional
  `suggested_type` per enrichment draft; fold.ts applies it in place of the
  mechanical Module default when folding an enrichment.
- **Backfill:** a one-shot reclassify mode for already-enriched bundles — an
  agent reads each enriched concept's existing prose (Explanation/Decisions)
  and suggests a type; the write is frontmatter-only (type field), no
  re-enrichment, no content change. Needed because refresh's hash-equality
  early-return (claw-nb9j) means unchanged bundles never re-fold; without
  this, sdlc-clients (68×Module) and the origin bundle never improve.
  Skeleton-only (unenriched) concepts are OUT of backfill scope — no prose
  to judge from; they stay Module until enriched.

## 2. Vocabulary: curated core + open fallback
Generator/backfill prompts carry a curated core list — service, model,
handler, repository, config, cli, util, ui-component, schema, script (final
list fixed in the spec) — with guidance: prefer these; coin a new type only
when none fits; lowercase single tokens. OKF v0.1 is open-vocab (consumers
MUST tolerate unknown types), so no fold-time enum rejection; Module/Test
remain the mechanical defaults and Test stays machine-owned
(filename-derived, never LLM-overridden — test detection feeds viz styling
and filters).

## 3. Stickiness: first semantic wins
`suggested_type` only ever upgrades FROM Module (the mechanical default).
An existing semantic (non-Module/non-Test) type is never overwritten by a
later suggestion — no churn, human corrections survive. reclassifyType()'s
existing preserve behavior is the enforcement point; the spec pins it with
tests. Misclassifications are fixed by humans editing frontmatter (which
then sticks) or a future curation pass.

## Non-goals
- Viz visual encoding by type (shape/color) — type already flows to node
  data/tooltip/table as text; visual mapping is future polish.
- Changing test-vs-non-test classification.
- Re-enrichment of content during backfill.

## Sequencing
Independent of PR #2 (no file overlap: fold.ts, generator agent contract,
new reclassify CLI + tests; viz untouched). Branches off speculator main.
