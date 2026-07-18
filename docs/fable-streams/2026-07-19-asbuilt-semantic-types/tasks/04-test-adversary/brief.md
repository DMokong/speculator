---
tier: standard
---

# 04-test-adversary — prove the SPEC-005 suite's sensitivity

## Goal

Attack the newly authored SPEC-005 test suite (fold suggested_type application, reclassify applier, agent contract pins) with deliberately-wrong implementation variants, each violating one named AC while trying to pass the suite unmodified. A variant that survives is a sensitivity gap routed back to test-author for hardening.

## Surface

- Implementation under attack (copy to scratch, NEVER modify in place): `asbuilt/src/fold.ts`, `asbuilt/src/reclassify.ts`, `agents/asbuilt-generator/AGENT.md`
- Suite: `bun test asbuilt/tests/fold.test.ts asbuilt/tests/reclassify.test.ts asbuilt/tests/refresh.test.ts asbuilt/tests/agents.test.ts` from the checkout root
- ACs: docs/specs/asbuilt-semantic-types/spec.md (AC1-AC10 + AC9a). High-value targets: first-semantic-wins precedence (AC2), Test machine-ownership (AC4), frontmatter-only writes (AC6), all-or-nothing validation ordering (AC7), idempotence (AC10), AC9a no-op semantics.

## Working-directory contract

- Checkout: /Users/dustincheng/projects/speculator/.claude/worktrees/asbuilt-semantic-types, branch asbuilt-semantic-types. Verify with `git rev-parse` before acting; escalate broken_harness on mismatch. Real implementation and tests are READ-ONLY.

## Report obligation

Append stamped sections to /Users/dustincheng/projects/speculator/docs/fable-streams/2026-07-19-asbuilt-semantic-types/tasks/04-test-adversary/report.md per the contracts: each variant as {variant, violatedAC, howItPasses|caughtBy, evidence tail}.
