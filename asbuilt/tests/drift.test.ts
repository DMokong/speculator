// Standing drift test (SPEC-049 Task 6, AC9; extended to ten modules by
// SPEC-050 Task 1): mechanically compares asbuilt-gate/SKILL.md's documented
// CLI invocations against the actual `CLI_USAGE` strings exported by each of
// the ten src/*.ts CLI modules. SKILL.md is a prose document a human can
// edit without touching source, and src/*.ts is source a human can edit
// without touching prose — this test is what keeps the two from silently
// drifting apart, on either side.
//
// Only the "CLI reference" bullet list at the top of SKILL.md spells out
// invocations as literal `bun scripts/asbuilt/src/<tool>.ts ...` text; every
// other runnable example in the doc uses the `$EXT/src/<tool>.ts` shorthand
// (`EXT=scripts/asbuilt`, defined once near the top) and is therefore
// invisible to this test's regex by construction — this test only polices
// the one place where the literal, copy-pasteable path is spelled out.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { CLI_USAGE as CHECK_USAGE } from "../src/check";
import { CLI_USAGE as EVIDENCE_USAGE } from "../src/evidence";
import { CLI_USAGE as EXTRACT_USAGE } from "../src/extract";
import { CLI_USAGE as FOLD_USAGE } from "../src/fold";
import { CLI_USAGE as GRAPHIFY_CHECK_USAGE } from "../src/graphify-check";
import { CLI_USAGE as REFRESH_USAGE } from "../src/refresh";
import { CLI_USAGE as SIGMA_STATS_USAGE } from "../src/sigma-stats";
import { CLI_USAGE as SKELETON_USAGE } from "../src/skeleton";
import { CLI_USAGE as SLICE_USAGE } from "../src/slice";
import { CLI_USAGE as VERIFY_USAGE } from "../src/verify";

const SKILL_PATH = new URL("../../skills/asbuilt-gate/SKILL.md", import.meta.url).pathname;

const USAGES = [
  EXTRACT_USAGE,
  SKELETON_USAGE,
  VERIFY_USAGE,
  SLICE_USAGE,
  CHECK_USAGE,
  EVIDENCE_USAGE,
  FOLD_USAGE,
  REFRESH_USAGE,
  GRAPHIFY_CHECK_USAGE,
  SIGMA_STATS_USAGE,
];

const INVOCATION_RE = /bun scripts\/asbuilt\/src\//;

/**
 * Pure drift comparator (AC9's "in-test mutation" helper). For every line in
 * `skillText` that literally mentions `bun scripts/asbuilt/src/` somewhere,
 * extracts the line's backtick-quoted span(s) and keeps only the ones that
 * themselves look like an invocation (contain that same literal prefix) —
 * a documentation line may carry other, unrelated backtick-quoted flag
 * fragments in its surrounding prose (e.g. "`--manifest`"), and those aren't
 * invocations to verify.
 *
 * Each qualifying span must either equal one of `usages` exactly, or contain
 * one of them as a substring (an invocation line may append trailing prose
 * inside the same backtick span). A span satisfying neither is reported. A
 * matching line with NO qualifying backtick span at all (the literal path
 * text appears outside of any backticks) is reported as the whole line —
 * there's no span to verify it against, so it can't be cleared.
 *
 * Returns the list of problem strings (drifted spans, or whole lines when no
 * span could be extracted) — empty means no drift detected.
 *
 * AC9 (SPEC-049 Task 6) requires this comparator to be "a pure exported
 * helper ... in the test file itself" so the mutation-check assertions below
 * can exercise it directly.
 *
 * SPEC-051 T1 port note: this export no longer needs a
 * `lint/suspicious/noExportsInTest` suppression — Biome's test-file
 * detection keys off a top-level `describe`/`test` call, and the one in
 * this file now lives inside the `if (existsSync(SKILL_PATH))` guard below
 * (necessary so T1 lands green before Task 2 creates SKILL.md), so Biome no
 * longer classifies this module as a test file for that rule. Verified via
 * `bunx biome check` before and after the guard was introduced.
 */
export function findDrift(skillText: string, usages: string[]): string[] {
  const problems: string[] = [];
  for (const line of skillText.split("\n")) {
    if (!INVOCATION_RE.test(line)) continue;
    const spans = [...line.matchAll(/`([^`]*)`/g)].map((m) => m[1] ?? "");
    const invocationSpans = spans.filter((span) => INVOCATION_RE.test(span));
    if (invocationSpans.length === 0) {
      problems.push(line);
      continue;
    }
    for (const span of invocationSpans) {
      const known = usages.some((usage) => span.includes(usage));
      if (!known) problems.push(span);
    }
  }
  return problems;
}

// SPEC-051 T1 (port-only): skills/asbuilt-gate/SKILL.md doesn't exist yet in
// this repo — Task 2 of the port creates it. Guard the whole suite on its
// presence so T1 lands green standalone; T2's file creation un-gates this
// naturally with no further edit needed here.
if (existsSync(SKILL_PATH)) {
  describe("AC9: SKILL.md CLI reference drift", () => {
    const skillText = readFileSync(SKILL_PATH, "utf8");

    test("every CLI_USAGE string (all ten modules) appears verbatim in SKILL.md", () => {
      for (const usage of USAGES) {
        expect(skillText).toContain(usage);
      }
    });

    test("no `bun scripts/asbuilt/src/` invocation in SKILL.md is unknown to the ten CLI_USAGE strings", () => {
      expect(findDrift(skillText, USAGES)).toEqual([]);
    });

    test("mutation check: findDrift is empty on the real doc, but non-empty once a pinned flag is mutated", () => {
      expect(findDrift(skillText, USAGES)).toEqual([]);

      // "--target <repo>" appears in most of the ten CLI_USAGE strings.
      // String.prototype.replace with a string (non-regex) needle rewrites
      // only the FIRST occurrence in the whole document — here, the "Extract"
      // bullet in the CLI reference block — so this mutates exactly one
      // invocation line's verbatim match without touching any other.
      const mutated = skillText.replace("--target <repo>", "--target <path>");
      expect(findDrift(mutated, USAGES)).not.toEqual([]);
    });
  });
} else {
  console.log(
    "[drift.test.ts] Skipping: skills/asbuilt-gate/SKILL.md not yet created (SPEC-051 Task 2) — findDrift stays exported and unit-tested by import elsewhere once the file lands.",
  );
}
