---
id: SPEC-005
status: draft
author: Dustin Cheng (shaped interactively; conducted by Cindy/Fable)
date: 2026-07-19
epic: claw-j65u
worktree: asbuilt-semantic-types
risk_level: low
impact_rating: low
domain:
amends: []
---

## Problem Statement

Every non-test As-Built concept carries `type: Module` — the OKF type field
holds no architectural role (service, model, handler, config...). Field
evidence: the sdlc-clients bundle has 68 concepts typed Module, 42 Test,
zero anything else; the origin bundle is the same shape. The cause is
structural: `conceptType()` derives type from filename patterns only
(correct for the pure-machine skeleton stage), and the enrichment agent's
output contract (`EnrichmentDraft { concept, explanation, decisions }`)
never asks for a classification — so the agent's correctly-identified roles
in Explanation prose are produced and then discarded. The sticky path
already exists unfed: `reclassifyType()` (asbuilt/src/concept.ts:173)
preserves any non-Module/Test type across both fold and refresh.

Two consequences: (1) type-based filtering/reading of a bundle is useless
beyond test-vs-non-test; (2) already-enriched bundles can never improve
organically, because refresh's hash-equality early-return (claw-nb9j) skips
unchanged resources, so no re-fold ever happens for them.

## Requirements

- [ ] R1: The asbuilt-generator enrichment contract gains an optional
      per-draft `suggested_type` field carrying the agent's judgment of the
      concept's architectural role, guided by a curated core vocabulary
      with open fallback (OKF v0.1: consumers MUST tolerate unknown types).
- [ ] R2: Fold applies `suggested_type` in place of the mechanical Module
      default. First-semantic-wins: a suggestion never overwrites an
      existing semantic (non-Module/non-Test) type, and never overrides the
      machine-owned Test classification.
- [ ] R3: A reclassification artifact format plus a mechanical applier CLI
      (`asbuilt/src/reclassify.ts`) backfills types onto already-enriched
      concepts: frontmatter-only writes, no content re-enrichment,
      byte-deterministic given the artifact.
- [ ] R4: Semantic types survive refresh unchanged (pin the existing
      `reclassifyType` preserve behavior with tests).
- [ ] R5: Absent `suggested_type`, every path behaves byte-identically to
      today (backward compatible with existing gate-2c-asbuilt.yml
      artifacts and bundles).

## Acceptance Criteria

- [ ] AC1: Given a generator artifact (the file referenced by
      gate-2c-asbuilt.yml's `generator.artifact` pointer) whose
      `enrichment_drafts` entry for a concept carries `suggested_type: "Service"` and that concept's
      frontmatter type is `Module`, when fold applies the draft, then the
      folded concept's frontmatter `type` is `Service` and the rest of the
      frontmatter field order (SPEC-049) is unchanged.
- [ ] AC2: Given a concept whose frontmatter type is already semantic (e.g.
      `Model`), when a later draft carries a different `suggested_type`,
      then fold preserves the existing `Model` (first-semantic-wins) and
      the fold summary counts it as preserved, not applied.
- [ ] AC3: Given a draft with no `suggested_type` field, when fold runs,
      then the folded concept is byte-identical to today's output (the
      mechanical `reclassifyType` path), proven by a fixture round-trip.
- [ ] AC4: Given a test-classified resource (filename test pattern), when a
      draft carries any `suggested_type`, then the folded type remains
      `Test` — the machine owns test classification.
- [ ] AC5: Given a folded concept carrying a semantic type, when refresh
      processes its resource (changed or unchanged), then the semantic type
      survives in the rewritten frontmatter.
- [ ] AC6: Given a reclassification artifact (YAML list of
      `{concept, suggested_type}` entries) and a bundle, when
      `bun asbuilt/src/reclassify.ts --target <repo> --artifact <path>`
      runs, then every listed concept that is enriched (enrichment != none)
      AND currently typed `Module` gets exactly its frontmatter `type`
      rewritten — body bytes unchanged — and the CLI prints applied /
      preserved / skipped counts and exits 0.
- [ ] AC7: Given entries for a skeleton-only concept, a concept with an
      existing semantic type, or an unknown concept path, when reclassify
      runs, then the first two are skipped with per-entry reasons (exit 0)
      and the unknown path fails the run with a nonzero exit before any
      write (all-or-nothing validation pass first).
- [ ] AC8: Given the shipped `agents/asbuilt-generator/AGENT.md`, when the
      contract test parses it live, then it finds the `suggested_type`
      output duty, the curated vocabulary (Service, Model, Handler,
      Repository, Config, CLI, Util, UI, Schema, Script), and the
      omit-when-unsure instruction — no hand-copied contract constants in
      tests.
- [ ] AC9a: Given a draft or reclassification entry whose `suggested_type`
      is literally `Module` or `Test`, when fold or reclassify applies it,
      then it is treated exactly as if the field were absent (no-op on the
      mechanical path; not an error) and counted as skipped in the summary.
- [ ] AC9: Given a reclassification artifact entry whose `suggested_type`
      is a novel single-token type outside the curated list (e.g.
      `Migration`), when reclassify or fold applies it, then it is written
      as-is (open vocabulary; no enum rejection). Malformed values (empty,
      multi-line, or non-string) are rejected by reclassify's all-or-
      nothing validation pass (nonzero exit), and on the fold path are
      treated as absent and counted as skipped-invalid in the fold summary
      (one malformed draft field must not abort applying the others).
- [ ] AC10: Given the same bundle and artifact inputs, when reclassify runs
      twice, then outputs are byte-identical and a second run over already-
      applied state is a no-op reporting zero applied (idempotent; no clock
      reads, no randomness).

## Intent & Anti-Patterns

The type field should let a reader (and eventually the viz) answer "what
KIND of thing is this?" at a glance — the judgment already exists in
enrichment prose; this spec stops discarding it. The mechanical/judgment
boundary is the design spine: CLIs stay byte-deterministic and offline;
LLM judgment enters only via artifacts (enrichment drafts, reclassification
artifacts) that mechanical code applies.

### Anti-Patterns
- LLM calls inside CLIs, or nondeterminism in appliers (clock, randomness,
  network) — the determinism invariant is load-bearing for the whole
  asbuilt suite.
- Fold-time enum rejection of unknown types — fights OKF's open-vocab
  contract; validation rejects malformed values, not unknown ones.
- Suggestion churn: re-enrichment flapping types run-to-run, or silently
  clobbering a human's manual type edit (first-semantic-wins exists to
  protect exactly that).
- Backfill that rewrites concept bodies "while it's there" — frontmatter-
  only is the contract; content changes belong to real re-enrichment.
- Tests that hand-copy the agent contract or curated vocabulary instead of
  parsing AGENT.md live (the suite's standing anti-coupling rule).

### Critical User Journeys
- A future enrichment fold lands concepts with meaningful types with zero
  operator effort (forward path just works).
- Dustin runs the backfill over sdlc-clients / the origin bundle once and
  the 68×Module wall becomes a typed inventory; re-running is a safe no-op.
- A human corrects a misclassified concept by editing frontmatter; every
  later fold/refresh/reclassify preserves the correction.

## Constraints

- Byte-determinism: no clock reads, no Math.random, codepoint sorts;
  appliers are pure functions of their inputs.
- Suite runs offline via `bun test asbuilt/tests/` from the repo root;
  coverage threshold 80% (Gate 2 config).
- Frontmatter field order per SPEC-049 (`renderFrontmatter`) is preserved.
- `Test` classification remains filename-derived and machine-owned.
- Backward compatibility: artifacts without `suggested_type` and existing
  bundles fold byte-identically to today.

## Out of Scope

- Viz visual encoding by type (shape/colour) — type already flows to the
  node data / tooltip / table as text; visual mapping is future polish.
- Orchestration of the backfill agent over a whole bundle (dispatching,
  batching) — that lands in the asbuilt backfill workflow skill
  (claw-8b8v); this spec ships the artifact contract + applier + a
  documented agent prompt duty it can consume.
- Changing test-vs-non-test classification or tag reclassification.
- Retroactive changes to refresh's hash-equality early-return (claw-nb9j).

## Impact Declaration

impact_rating: low — SYSTEM-SPEC.md on this branch carries no As-Built
fold/type behaviors to amend (the viz-era sections live on the unmerged
SPEC-004 branch). The asbuilt-generator agent contract is shared with the
shadow Gate 2c machinery; the addition is optional-field / additive, and
AC3 pins that absent the field nothing changes. amends: [].
