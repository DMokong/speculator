// Type-precedence PARITY suite (PR #3 review wave, claw-vibp / claw-jeh5).
//
// Four precedence divergences surfaced across three audits, every one bred
// by fold.ts and reclassify.ts hand-duplicating the same decision chain:
//   1. AC9a precedence divergence (fixed 8fd6e3c)
//   2. whitespace-only malformed asymmetry (fixed 1a52cd3)
//   3. absent/null existing type — reclassify preserved, fold applied
//      (PR #3 review C4; fixed via the concept.ts decideSemanticType
//      extraction this suite guards)
//   4. malformed suggested_type — benign in fold, fatal in reclassify
//      (adjudicated INTENTIONAL — see the divergence table below)
//
// This suite drives both appliers' decision paths over ONE shared input
// matrix, so a fifth hand-duplication divergence fails here mechanically
// instead of surfacing in an audit. Intentional divergences are declared
// explicitly — an undeclared mismatch is a failure.
import { describe, expect, test } from "bun:test";
import { conceptType, decideSemanticType } from "../src/concept";
import { decideConceptType } from "../src/fold";

/** reclassify's outcome vocabulary collapsed to fold's bucket vocabulary. */
function reclassifyBucketOf(existingType: unknown, resource: unknown, suggested: string): string {
  const outcome = decideSemanticType(existingType, resource, suggested, { machineOwnedTestGuard: true });
  if (outcome === "apply") return "applied";
  if (outcome === "preserve") return "preserved";
  return "skipped";
}

const EXISTING_TYPES: unknown[] = [undefined, null, "Module", "Test", "Service"];
const RESOURCES: (string | undefined)[] = ["src/x.ts", "tests/x.test.ts", undefined];
const SUGGESTIONS: string[] = ["Handler", "Module", "Test"];

/**
 * Declared intentional divergences — the ONLY rows where the two appliers
 * may disagree. Everything else must match bucket-for-bucket.
 *
 * (1) machine-owned existing "Test" on a non-Test resource with a semantic
 *     suggestion: reclassify defers to machine ownership (skipped); fold
 *     applies. DISCLOSED at ship; pinned end-to-end by reclassify.test.ts's
 *     R12 test.
 *
 * A second intentional divergence lives OUTSIDE this matrix by design:
 * malformed suggestions (non-string/empty/multi-line) never reach the
 * shared core — fold buckets them `skippedInvalid` and keeps folding
 * siblings (LLM-draft tolerance); reclassify aborts its whole run in
 * validation (authored all-or-nothing artifact, AC9). Pinned by
 * fold.test.ts and reclassify.test.ts respectively.
 */
function declaredDivergence(existingType: unknown, resource: string | undefined, suggested: string): boolean {
  return (
    existingType === "Test" &&
    resource !== undefined &&
    resource !== "" &&
    conceptType(resource) !== "Test" &&
    suggested !== "Module" &&
    suggested !== "Test"
  );
}

describe("fold/reclassify type-precedence parity (shared decideSemanticType core)", () => {
  for (const existingType of EXISTING_TYPES) {
    for (const resource of RESOURCES) {
      for (const suggested of SUGGESTIONS) {
        const label = `existing=${JSON.stringify(existingType)} resource=${JSON.stringify(resource)} suggested=${JSON.stringify(suggested)}`;
        test(`parity: ${label}`, () => {
          // fold's caller convention: missing/non-string resource becomes ""
          const foldBucket = decideConceptType(existingType, resource ?? "", suggested).bucket;
          const reclassifyBucket = reclassifyBucketOf(existingType, resource, suggested);
          if (declaredDivergence(existingType, resource, suggested)) {
            expect(foldBucket).toBe("applied");
            expect(reclassifyBucket).toBe("skipped");
          } else {
            // String() folds the (impossible-here) null bucket into a loud
            // "null" mismatch instead of a type error — every matrix row
            // carries a well-formed suggestion, so fold always buckets.
            expect(reclassifyBucket).toBe(String(foldBucket));
          }
        });
      }
    }
  }

  test("malformed suggestions stay caller-side: fold buckets skippedInvalid without sinking siblings", () => {
    for (const bad of [42 as unknown, "", "   ", "multi\nline"]) {
      expect(decideConceptType("Module", "src/x.ts", bad).bucket).toBe("skippedInvalid");
    }
  });

  test("absent suggestion is fold-only vocabulary: no bucket at all (AC3 byte-compat)", () => {
    expect(decideConceptType("Module", "src/x.ts", undefined).bucket).toBeNull();
  });
});
