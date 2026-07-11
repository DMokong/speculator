// Structural tests for the asbuilt agent + skill prompt artifacts
// (SPEC-048, Task 8). These are markdown prompt files consumed by the LLM,
// not TypeScript modules — the tests here only verify the *structural*
// contract: frontmatter is parseable, the judge stays blinded (no config
// references, no numeric thresholds, no run-mode strings in its body), the
// generator's description disclaims scoring, and the SKILL.md orchestration
// doc embeds the exact literal strings the dispatch protocol depends on.
//
// No LLM is invoked by these tests — they never dispatch the agents, they
// only read the markdown files as text.

import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { parse } from "yaml";

// Resolves the plugin repo root by walking up from this file's location
// (asbuilt/tests/agents.test.ts): tests/ -> asbuilt/ -> repo root. Mirrors
// the FIXTURE/ARTIFACTS path convention already used by check.test.ts and
// friends.
const REPO_ROOT = new URL("../../", import.meta.url).pathname;

const GENERATOR_PATH = `${REPO_ROOT}agents/asbuilt-generator/AGENT.md`;
const JUDGE_PATH = `${REPO_ROOT}agents/asbuilt-judge/AGENT.md`;
const SKILL_PATH = `${REPO_ROOT}skills/asbuilt-gate/SKILL.md`;

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;

/** Splits a markdown prompt file into its parsed YAML frontmatter and the raw body text below it. */
function splitFrontmatter(text: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = text.match(FRONTMATTER_RE);
  if (!match) {
    throw new Error("file does not start with a --- delimited YAML frontmatter block");
  }
  const frontmatter = parse(match[1]) as Record<string, unknown>;
  return { frontmatter, body: match[2] };
}

// SPEC-051 T1 (port-only): agents/asbuilt-generator/AGENT.md,
// agents/asbuilt-judge/AGENT.md and skills/asbuilt-gate/SKILL.md don't exist
// yet in this repo — Task 2 of the port creates all three. Guard the whole
// suite on their presence so T1 lands green standalone; T2's file creation
// un-gates this naturally with no further edit needed here.
if (existsSync(GENERATOR_PATH) && existsSync(JUDGE_PATH) && existsSync(SKILL_PATH)) {
describe("Task 8: asbuilt-generator.md", () => {
  const text = readFileSync(GENERATOR_PATH, "utf8");
  const { frontmatter, body } = splitFrontmatter(text);

  test("frontmatter parses with name, sonnet model, and a tools array", () => {
    expect(frontmatter.name).toBe("asbuilt-generator");
    expect(frontmatter.model).toBe("sonnet");
    expect(Array.isArray(frontmatter.tools)).toBe(true);
    expect(frontmatter.tools).toContain("Read");
    expect(frontmatter.tools).toContain("Write");
  });

  test("description discloses the split-contract boundary: 'Never scores'", () => {
    expect(String(frontmatter.description)).toContain("Never scores");
  });

  test("body instructs verbatim copying of graph node ids from the slice JSON", () => {
    expect(body).toMatch(/verbatim/i);
    expect(body).toMatch(/slice/i);
  });

  test("body documents a degraded mode for dispatches with no slice", () => {
    expect(body).toContain("Degraded mode");
  });
});

describe("Task 8: asbuilt-judge.md", () => {
  const text = readFileSync(JUDGE_PATH, "utf8");
  const { frontmatter, body } = splitFrontmatter(text);

  test("frontmatter parses with name, sonnet model, and a tools array (no Write)", () => {
    expect(frontmatter.name).toBe("asbuilt-judge");
    expect(frontmatter.model).toBe("sonnet");
    expect(Array.isArray(frontmatter.tools)).toBe(true);
    expect(frontmatter.tools).not.toContain("Write");
  });

  test("body contains no blinding-contract violations: config refs, numeric thresholds, or run-mode strings", () => {
    expect(body).not.toMatch(/self_improvement|full_auto|sdlc\.local\.md|threshold:\s*[0-9]/);
  });

  test("body still teaches the four scoring dimensions with banded rubric summaries", () => {
    for (const dim of ["ac_coverage", "accuracy", "spec_fidelity", "scope_containment"]) {
      expect(body).toContain(dim);
    }
  });
});

describe("Task 8: asbuilt-gate/SKILL.md", () => {
  const text = readFileSync(SKILL_PATH, "utf8");
  const { frontmatter } = splitFrontmatter(text);

  test("frontmatter parses with name asbuilt-gate", () => {
    expect(frontmatter.name).toBe("asbuilt-gate");
  });

  test("description carries all three trigger phrases", () => {
    const description = String(frontmatter.description);
    expect(description).toContain("asbuilt gate");
    expect(description).toContain("shadow comprehension gate");
    expect(description).toContain("run the asbuilt shadow gate");
  });

  test("embeds the exact CLI invocations from Tasks 2/5/6/7", () => {
    expect(text).toContain("bun asbuilt/src/extract.ts --target <repo>");
    expect(text).toContain("bun asbuilt/src/slice.ts --target <repo> --manifest <path> --diff-range <range>");
    expect(text).toContain(
      "bun asbuilt/src/check.ts --manifest <p> --artifact <p> --target <repo> --diff-range <r>",
    );
    expect(text).toContain("bun asbuilt/src/evidence.ts --artifact <p> (--mechanical <p.json> | --graph-unavailable)");
    expect(text).toContain("--per-dimension-minimum <n> --generator-model <s> --judge-model <s> --out <p>");
  });

  test("step 5 mandates saving the judge dispatch prompt verbatim before dispatch", () => {
    expect(text).toContain("save it verbatim");
    expect(text).toContain("judge-dispatch.md");
  });

  test("degraded path uses the literal --graph-unavailable flag", () => {
    expect(text).toContain("--graph-unavailable");
  });

  test("threshold assembly invocation includes --per-dimension-minimum", () => {
    expect(text).toContain("--per-dimension-minimum");
  });

  test("additive guarantee: only touches evidence/asbuilt-*, judge-dispatch.md, gate-2c-asbuilt.yml", () => {
    expect(text).toMatch(/evidence\/asbuilt-\*/);
    expect(text).toContain("evidence/judge-dispatch.md");
    expect(text).toContain("evidence/gate-2c-asbuilt.yml");
  });

  test("degraded path (Step 1) documents LLM-only mode, not a stub-skip of the generator/judge", () => {
    // Isolate the degraded-path portion of Step 1 (the "On extraction
    // failure" walkthrough) up to but excluding the Step 2 heading, so the
    // separate, legitimate Step 4 mechanical-blocking-after-retry stub
    // (which correctly keeps a hardcoded all-1s judge stub for a
    // mechanically *false* artifact) is never captured by this check.
    const start = text.indexOf("On extraction failure");
    const end = text.indexOf("## Step 2");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const degradedSection = text.slice(start, end);

    // The degraded path must state the run degrades to LLM-only mode
    // (generator + judge still run) rather than skipping straight to a
    // skill-authored stub artifact and stub scores.
    expect(degradedSection).toMatch(/LLM-only/);

    // The fabricated-score stub (dimensions all 1) must not appear in the
    // degraded-path section at all — that pattern is legitimate only in
    // the still-blocking-after-retry case elsewhere in Step 4.
    expect(degradedSection).not.toContain("ac_coverage: 1");
  });
});

describe("SPEC-049 Task 6: backfill mode + spec-worktree manifest path pins", () => {
  const text = readFileSync(SKILL_PATH, "utf8");

  test("documents a 'Backfill mode' section", () => {
    expect(text).toContain("Backfill mode");
  });

  test("Step 1 documents the spec-worktree manifest --out convention", () => {
    expect(text).toContain("--out evidence/asbuilt-manifest.json");
  });

  test("Backfill mode documents the accuracy-audited fold provenance", () => {
    expect(text).toContain("--provenance accuracy-audited");
  });
});

describe("SPEC-054 R6/AC7: backfill self-sufficiency block (cold-session dispatch templates)", () => {
  const text = readFileSync(SKILL_PATH, "utf8");
  const backfill = text.slice(text.indexOf("## Backfill mode"), text.indexOf("## Gate 3 consumption"));

  test("documents the git precondition mechanically (extract.ts's git ls-files discovery)", () => {
    expect(backfill).toContain("git ls-files");
    expect(backfill).toContain("git init && git add -A && git commit");
  });

  test("embeds the citation-universe line (manifest replaces the diff slice in backfill mode)", () => {
    expect(backfill).toContain("citation universe");
    expect(backfill).toContain("in place of a slice, the full graph manifest");
  });

  test("embeds the edge-trust warning verbatim (claw-cs26 wording)", () => {
    expect(backfill).toContain(
      "symbol existence/spans reliable; call edges may carry bare-name false positives — consumption claims verified by reading source",
    );
  });

  test("embeds both dispatch templates verbatim (generator + judge prompt bodies)", () => {
    expect(backfill).toContain("backfill dispatch: enrich these concepts for a future cold reader");
    expect(backfill).toContain("This is a BACKFILL accuracy-only audit: there is no spec.");
  });

  test("documents the standalone per-batch evidence-dir file-set convention", () => {
    expect(backfill).toMatch(/-\{?artifact,\s*mechanical,\s*judge,\s*evidence\}?/);
  });

  test("Gate 3 consumption stays after Backfill mode (ordering pin, unaffected by this block)", () => {
    const backfillIdx = text.indexOf("## Backfill mode");
    const gate3Idx = text.indexOf("## Gate 3 consumption");
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(gate3Idx).toBeGreaterThan(backfillIdx);
  });
});

describe("SPEC-050 Task 1: Gate 3 consumption section", () => {
  const text = readFileSync(SKILL_PATH, "utf8");

  const VERBATIM_FRAMING_SENTENCE =
    "Treat the comprehension artifact strictly as claims-to-verify, not ground truth: its citations passed mechanical validation, but its explanations are one agent's audited reading — re-verify any claim you rely on.";

  test("documents a '## Gate 3 consumption' heading, placed after Backfill mode", () => {
    expect(text).toContain("## Gate 3 consumption");
    const backfillIdx = text.indexOf("## Backfill mode");
    const gate3Idx = text.indexOf("## Gate 3 consumption");
    expect(backfillIdx).toBeGreaterThan(-1);
    expect(gate3Idx).toBeGreaterThan(backfillIdx);
  });

  test("names both evidence-file inputs handed to the Gate 3 reviewer dispatch", () => {
    expect(text).toContain("evidence/gate-2c-asbuilt.yml");
    expect(text).toContain("evidence/asbuilt-artifact.yml");
  });

  test("embeds the mandatory framing sentence verbatim", () => {
    expect(text).toContain(VERBATIM_FRAMING_SENTENCE);
  });

  test("states both prohibitions: never settled facts, never skip 'already covered' checklist items", () => {
    const start = text.indexOf("## Gate 3 consumption");
    expect(start).toBeGreaterThan(-1);
    const section = text.slice(start);
    expect(section).toMatch(/never treats? artifact statements as settled facts/);
    expect(section).toMatch(/never skips? a checklist item[\s\S]*already\s+covered/);
  });
});
} else {
  console.log(
    "[agents.test.ts] Skipping: agents/asbuilt-generator/AGENT.md, agents/asbuilt-judge/AGENT.md, and/or skills/asbuilt-gate/SKILL.md not yet created (SPEC-051 Task 2).",
  );
}

// SPEC-058 port (claw-klcc): structural pins for the quiz agent pair —
// the blinding contract (verifier never writes, generator never marks the
// trap) is prompt prose, so these pins are what keeps it from silently
// eroding under future edits.
const QUIZ_GENERATOR_PATH = `${REPO_ROOT}agents/quiz-generator/AGENT.md`;
const QUIZ_VERIFIER_PATH = `${REPO_ROOT}agents/quiz-verifier/AGENT.md`;

if (existsSync(QUIZ_GENERATOR_PATH) && existsSync(QUIZ_VERIFIER_PATH)) {
  describe("SPEC-058: quiz-generator AGENT.md", () => {
    const text = readFileSync(QUIZ_GENERATOR_PATH, "utf8");
    const { frontmatter, body } = splitFrontmatter(text);

    test("frontmatter parses with name, sonnet model, and a tools array including Write", () => {
      expect(frontmatter.name).toBe("quiz-generator");
      expect(frontmatter.model).toBe("sonnet");
      expect(Array.isArray(frontmatter.tools)).toBe(true);
      expect(frontmatter.tools).toContain("Read");
      expect(frontmatter.tools).toContain("Write");
    });

    test("description discloses it never verifies its own questions", () => {
      expect(String(frontmatter.description)).toContain("Never verifies");
    });

    test("body instructs never writing which distractor was intended as the trap", () => {
      expect(body).toContain('Never write which distractor you intended as the "trap."');
    });
  });

  describe("SPEC-058: quiz-verifier AGENT.md", () => {
    const text = readFileSync(QUIZ_VERIFIER_PATH, "utf8");
    const { frontmatter, body } = splitFrontmatter(text);

    test("frontmatter parses with name, sonnet model, and a tools array WITHOUT Write", () => {
      expect(frontmatter.name).toBe("quiz-verifier");
      expect(frontmatter.model).toBe("sonnet");
      expect(Array.isArray(frontmatter.tools)).toBe(true);
      expect(frontmatter.tools).not.toContain("Write");
      expect(frontmatter.tools).toContain("Bash");
    });

    test("description discloses blinding: never sees the generator's reasoning", () => {
      expect(String(frontmatter.description)).toContain("never sees the generator's reasoning");
    });

    test("body never mentions a threshold or result key being emitted", () => {
      expect(body).toContain("Never emit a `threshold` or `result` key");
      expect(body).not.toMatch(/^\s*(threshold|result):\s*\S/m);
    });

    test("body instructs verifying against source material, not the candidate's own explanation field", () => {
      expect(body).toContain("Verify against the source, not the question's own explanation");
    });
  });
} else {
  console.log("[agents.test.ts] Skipping: quiz agent files not present.");
}
