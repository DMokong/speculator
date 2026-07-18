---
parallel_safe: true
testable: true
tier: standard
---

# 01-fold-suggested-type — fold applies the agent's suggested_type (SPEC-005 AC1-AC5, AC9a, fold half of AC9)

## Goal

Stop discarding the enrichment agent's role judgment: extend the fold path so an optional `suggested_type` field on enrichment drafts is applied to the folded concept's frontmatter `type` in place of the mechanical `Module` default, under first-semantic-wins precedence. Covers SPEC-005 AC1 (application), AC2 (existing semantic type preserved, disclosed in summary), AC3 (byte-identical backward compatibility when the field is absent), AC4 (`Test` stays machine-owned), AC5 (semantic types survive refresh — pin the existing preserve behavior with tests), AC9a (literal `Module`/`Test` suggestion is a no-op counted as skipped), and the fold half of AC9 (malformed values treated as absent + counted as skipped-invalid; never abort the other drafts, never written to a file).

## Done-check

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/fold.test.ts asbuilt/tests/refresh.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run typecheck && bun run lint
```

with new tests named `test_ac1_*` … `test_ac5_*`, `test_ac9a_*`, `test_ac9_fold_*` present and green.

## File scope

**Working-directory contract (run before any write, else stop and escalate `broken_harness`):**

- Checkout: `/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types` (you inherit the conductor's cwd, which is a DIFFERENT repo — `cd` there first)
- Expected branch: `asbuilt-semantic-types`
- Guard: `cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && test "$(git rev-parse --abbrev-ref HEAD)" = "asbuilt-semantic-types" && test "$(git rev-parse --show-toplevel)" = "/Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types"`

Modify ONLY:

- `asbuilt/src/fold.ts` (implementer)
- `asbuilt/src/concept.ts` — ONLY if a shared helper genuinely belongs there; default is fold-local
- `asbuilt/tests/fold.test.ts`, `asbuilt/tests/refresh.test.ts` (test-author; implementer only for mechanical fixes)

Wave siblings own `asbuilt/src/reclassify.ts`, `asbuilt/tests/reclassify.test.ts`, `agents/asbuilt-generator/AGENT.md`, `asbuilt/tests/agents.test.ts` — do not touch them.

## Required content

1. **Draft schema:** `EnrichmentDraft` (fold.ts ~line 45) gains optional `suggested_type?: string`. The generator artifact is the file referenced by gate-2c-asbuilt.yml's `generator.artifact` pointer — read the existing parse path in fold.ts and extend it where drafts are parsed; do not change how artifacts are located.
2. **Precedence rule at the application site** (the enriched-fold frontmatter render, ~line 230): the folded `type` is decided as: existing semantic (non-Module/non-Test) type → keep it (count `preserved`); resource is test-classified → mechanical path unchanged (`Test`; suggestion ignored, count `skipped`); suggestion present, well-formed, not literally `Module`/`Test`, existing type is Module/absent → apply suggestion (count `applied`); suggestion literally `Module`/`Test` (AC9a) or malformed (empty / contains a newline / non-string — AC9 fold half) → mechanical path, count `skipped` (AC9a) / `skipped_invalid` (malformed). Malformed values must never reach a written file.
3. **Summary disclosure:** extend the fold result/summary additively so applied / preserved / skipped / skipped-invalid type counts are visible to callers and printed by the existing CLI output path. Do not break the existing `FoldResult` consumers — additive fields only.
4. **AC3 byte-compat proof:** a test folds a fixture artifact with NO `suggested_type` fields and asserts byte-identical output to the current behavior (build the expectation from the pre-change code path's semantics, not a stale snapshot: fold the same fixture through the real pipeline and compare bytes against a re-fold — the load-bearing assertion is that adding the feature changed nothing for absent-field inputs; structure this however proves that honestly).
5. **AC5 refresh pins (tests/refresh.test.ts, additive):** a concept whose frontmatter carries a semantic type (e.g. `Service`) retains it through refresh for both a changed and an unchanged resource. Name tests `test_ac5_*`.
6. **Determinism:** no clock reads, no randomness; the byte-determinism invariant is load-bearing across the asbuilt suite.
7. Tests follow the existing fold.test.ts idioms (temp sandboxes, real artifacts) and are named after their AC ids (`test_ac1_…`) per the Gate 2b convention.

## Inputs

Read before acting:

- `docs/specs/asbuilt-semantic-types/spec.md` — ACs 1-5, 9, 9a verbatim
- `asbuilt/src/fold.ts` — whole file (draft parsing, application site, summary/CLI output)
- `asbuilt/src/concept.ts` — `reclassifyType` (~line 173), `conceptType`, `renderFrontmatter` (SPEC-049 field order)
- `asbuilt/src/refresh.ts` — the frontmatter rewrite site (~line 118)
- `asbuilt/tests/fold.test.ts`, `asbuilt/tests/refresh.test.ts` — existing idioms

## Verification commands

```
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && git rev-parse --abbrev-ref HEAD
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types && bun test asbuilt/tests/fold.test.ts asbuilt/tests/refresh.test.ts
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run typecheck
cd /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types/asbuilt && bun run lint
```

## Report obligation

Append your stamped section (`## <role> — round <N>`) to `/Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-19-asbuilt-semantic-types/tasks/01-fold-suggested-type/report.md`. Test-author shows the AC1 application test failing red against unmodified fold.ts before the implementer's round. Every claim adjacent to a ≤30-line command-output tail.

## Out of scope

- The reclassify applier CLI and its artifact format (task 02)
- `agents/asbuilt-generator/AGENT.md` and the contract test (task 03)
- Any change to refresh's hash-equality early-return (claw-nb9j), tag reclassification, or test-vs-non-test classification
- Viz changes of any kind
