---
parallel_safe: true
testable: true
tier: standard
---

# 02-reclassify-cli — mechanical backfill applier for already-enriched bundles (SPEC-005 AC6, AC7, AC9, AC9a, AC10)

## Goal

Ship the backfill half of SPEC-005: a reclassification artifact format plus a new mechanical applier CLI at `asbuilt/src/reclassify.ts` that rewrites ONLY the frontmatter `type` of listed, enriched, Module-typed concepts. This is how already-enriched bundles (blocked from organic re-folds by refresh's hash-equality early-return) ever get semantic types. The applier is byte-deterministic and offline: LLM judgment arrives exclusively via the artifact; the CLI applies it mechanically. Covers AC6 (application + counts), AC7 (skip-with-reason for skeleton-only and already-semantic; all-or-nothing validation with nonzero exit on unknown concepts, before any write), AC9 (open vocabulary accepted as-is; malformed values rejected by the validation pass), AC9a (literal `Module`/`Test` treated as absent — skipped, not an error, not a semantic assignment), AC10 (byte-determinism + idempotence: second run applies zero).

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/reclassify.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run typecheck && bun run lint
```

with tests named `test_ac6_*`, `test_ac7_*`, `test_ac9_*`, `test_ac9a_*`, `test_ac10_*` present and green.

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types` (you inherit the conductor's cwd, which is a DIFFERENT repo — `cd` there first)
- Expected branch: `asbuilt-semantic-types`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-semantic-types" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types"`

Create/modify ONLY:

- `asbuilt/src/reclassify.ts` (new — implementer)
- `asbuilt/tests/reclassify.test.ts` (new — test-author)

Wave siblings own `asbuilt/src/fold.ts`, `asbuilt/tests/fold.test.ts`, `asbuilt/tests/refresh.test.ts`, `agents/asbuilt-generator/AGENT.md`, `asbuilt/tests/agents.test.ts` — do not touch them. You may READ concept.ts helpers (`parseFrontmatter`, `renderFrontmatter`, `splitConcept`, `reclassifyType`) and import them — do not modify concept.ts (if a needed helper is missing there, build it locally in reclassify.ts; task 01 may be editing shared surfaces).

## Required content

1. **Artifact format:** YAML file with a top-level `reclassifications` list of `{concept, suggested_type}` entries, where `concept` is the bundle-relative concept path used by the bundle's other machinery (match how fold identifies concepts — read the code and mirror it). Parse with the `yaml` dependency already in asbuilt/package.json. Document the format in a doc comment at the top of reclassify.ts.
2. **CLI:** `bun asbuilt/src/reclassify.ts --target <repo> --artifact <path>` with an `import.meta.main` entry guard and a `CLI_USAGE` export, matching the conventions of the existing CLIs (see viz-era style in fold.ts/refresh.ts on this branch). Exit 0 on success (including all-skips), nonzero on validation failure, with a clear message.
3. **Two-phase run:** (a) VALIDATION over the whole artifact first — unknown concept path, empty/multi-line/non-string suggested_type → collect all violations, print them, exit nonzero, write NOTHING; (b) APPLY — for each valid entry: skeleton-only concept (`enrichment` frontmatter = none) → skip with reason; existing semantic (non-Module/non-Test) type → skip with reason (`preserved`); literal `Module`/`Test` suggestion → skip with reason (AC9a); enriched + Module-typed → rewrite exactly the frontmatter `type` field, preserving SPEC-049 field order and every body byte. Print applied/preserved/skipped counts.
4. **Frontmatter-only writes:** the concept file after application differs from before by exactly the type line. Prove it with a body-byte-equality assertion in tests.
5. **Determinism + idempotence (AC10):** no clock reads, no randomness; process entries in a codepoint-sorted deterministic order; running twice with the same inputs → byte-identical bundle and second-run `applied: 0`.
6. **Open vocabulary (AC9):** any well-formed single-token type outside the curated list is applied as-is — no enum check, no normalization.
7. Tests build small temp-dir bundle fixtures (follow existing test idioms for sandbox construction) and name tests after AC ids.

## Inputs

Read before acting:

- `docs/specs/asbuilt-semantic-types/spec.md` — ACs 6, 7, 9, 9a, 10 verbatim
- `asbuilt/src/concept.ts` — `parseFrontmatter`, `renderFrontmatter` (SPEC-049 field order), `splitConcept`, `reclassifyType`
- `asbuilt/src/fold.ts` + `asbuilt/src/refresh.ts` — CLI entry-guard conventions, how concepts are located/identified in a bundle, frontmatter rewrite pattern
- `asbuilt/tests/fold.test.ts` — sandbox fixture idioms
- One real concept file shape: any `*.md` under a test fixture bundle in `asbuilt/tests/fixtures/`

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/reclassify.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-19-asbuilt-semantic-types/tasks/02-reclassify-cli/report.md`. Test-author shows the AC6 application test failing red before reclassify.ts exists. Every claim adjacent to a ≤30-line command-output tail.

## Out of scope

- The agent that PRODUCES reclassification artifacts (a prompt-contract concern — task 03 documents the duty; orchestration belongs to the claw-8b8v backfill skill)
- fold.ts and the enrichment-draft path (task 01)
- Any content/body rewrite, tag changes, or re-enrichment
- Batch orchestration, progress UI, or network access of any kind
