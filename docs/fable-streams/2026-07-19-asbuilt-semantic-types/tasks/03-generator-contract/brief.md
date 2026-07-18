---
parallel_safe: true
testable: true
tier: standard
---

# 03-generator-contract — the agent contract asks for the judgment, testably (SPEC-005 AC8)

## Goal

Extend the asbuilt-generator agent contract (`agents/asbuilt-generator/AGENT.md`) so enrichment drafts carry the agent's architectural-role judgment: an optional `suggested_type` output duty with the curated vocabulary (Service, Model, Handler, Repository, Config, CLI, Util, UI, Schema, Script), open fallback ("coin a new single-token type only when none fits"), and an explicit omit-when-unsure instruction (a confident-sounding guess is worse than leaving Module). Pin the contract with a live-parse test in `asbuilt/tests/agents.test.ts` so contract drift fails the suite (AC8) — the suite's standing rule: tests parse the shipped file, never a hand-copy. Also document the reclassification-artifact duty for backfill use (the same judgment applied to already-enriched concepts, emitted as a `reclassifications` YAML list) so the claw-8b8v backfill skill has a documented contract to dispatch against.

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/agents.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run lint
```

with a new test named `test_ac8_*` present and green.

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types` (you inherit the conductor's cwd, which is a DIFFERENT repo — `cd` there first)
- Expected branch: `asbuilt-semantic-types`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-semantic-types" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types"`

Modify ONLY:

- `agents/asbuilt-generator/AGENT.md` (implementer)
- `asbuilt/tests/agents.test.ts` (test-author; implementer only for mechanical fixes)

Wave siblings own `asbuilt/src/fold.ts`, `asbuilt/src/reclassify.ts`, and their test files — do not touch them.

## Required content

1. **AGENT.md — enrichment-draft duty (additive):** in the section describing the enrichment_drafts output, add the optional `suggested_type` field: what it means (the concept's architectural role, judged from the code you read); the curated vocabulary listed verbatim — Service, Model, Handler, Repository, Config, CLI, Util, UI, Schema, Script; the fallback rule (prefer the curated list; coin a new capitalized single-token type only when none fits); the omission rule (omit the field entirely when not confident — never guess; Module is an honest default, a wrong Service is not); and the note that Test classification is machine-owned so suggestions on test files are ignored.
2. **AGENT.md — reclassification duty (additive, clearly marked as the backfill mode):** when dispatched to reclassify an already-enriched bundle, read each concept's existing Explanation/Decisions prose and emit a YAML artifact with a top-level `reclassifications` list of `{concept, suggested_type}` entries, same vocabulary and omission rules; never rewrite concept content in this mode.
3. **Contract test (agents.test.ts, additive):** parse the live AGENT.md and assert: the string `suggested_type` appears in the enrichment output contract; every one of the ten curated vocabulary terms appears; an omit/unsure instruction is present (match a stable phrase you introduce, e.g. "omit the field"); the `reclassifications` duty is present. Follow the existing live-parse idioms already in agents.test.ts — no hand-copied contract text blobs as expected values beyond the minimal anchor strings.
4. Keep the additions consistent with AGENT.md's existing voice and structure — additive sections/bullets, no restructuring of existing duties (the same file serves the shadow Gate 2c machinery; do not alter comprehension-artifact instructions).

## Inputs

Read before acting:

- `docs/specs/asbuilt-semantic-types/spec.md` — AC8 verbatim, plus the Intent section's mechanical/judgment boundary
- `agents/asbuilt-generator/AGENT.md` — whole file (existing structure and voice)
- `asbuilt/tests/agents.test.ts` — existing live-parse idioms
- `docs/fable-streams/2026-07-19-asbuilt-semantic-types/design.md` §2 (vocabulary policy) — in the MAIN checkout at /Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-19-asbuilt-semantic-types/design.md (read-only)

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/agents.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-19-asbuilt-semantic-types/tasks/03-generator-contract/report.md`. Test-author shows the AC8 contract test failing red against the unmodified AGENT.md. Every claim adjacent to a ≤30-line command-output tail.

## Out of scope

- Any change to comprehension-artifact duties or Gate 2c behavior in AGENT.md
- fold.ts, reclassify.ts, and their tests (tasks 01/02)
- The backfill orchestration skill itself (claw-8b8v)
- Renaming or restructuring existing AGENT.md sections
