// SPEC-058 AC8: loud refusal on degraded input. R7 splits refusal ownership
// across two surfaces: the quiz-* CLIs own the "skeleton-only bundle" and
// "zero candidates survived" refusals (deterministic exit-1 paths, spawned
// and asserted here), while the asbuilt-quiz SKILL.md orchestration owns the
// "graph extraction unavailable" and "zero diff-touched symbols" refusals
// (prose instructions to the orchestrating agent, pinned structurally here;
// their deterministic predicates — empty touched for a no-op range, empty
// enriched-concept list — are unit-tested in slice.test.ts and
// quiz-concepts.test.ts respectively).
import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { QuizPool } from "../src/quiz-types";

const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
const QUIZ_SKILL_PATH = new URL("../../skills/asbuilt-quiz/SKILL.md", import.meta.url).pathname;

function writeConcept(dir: string, relPath: string, frontmatter: Record<string, unknown>) {
  const full = join(dir, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: ${v}`))
    .join("\n");
  writeFileSync(full, `---\n${fm}\n---\n\n# Structure\n\nsome machine content\n`);
}

describe("AC8: quiz-concepts CLI refuses a skeleton-only bundle", () => {
  test("exit 1, names the reason, recommends backfill, writes no output file", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "quiz-refusal-"));
    try {
      const bundleDir = join(sandbox, "docs", "asbuilt");
      writeConcept(bundleDir, "src/alpha.ts.md", {
        type: "Module",
        enrichment: "none",
        resource: "src/alpha.ts",
        tags: ["src", "module"],
      });
      const outPath = join(sandbox, "concepts.json");

      const result = Bun.spawnSync(
        ["bun", "src/quiz-concepts.ts", "--bundle", bundleDir, "--max", "30", "--out", outPath],
        { cwd: ASBUILT_ROOT },
      );

      expect(result.exitCode).toBe(1);
      const stderr = result.stderr.toString();
      expect(stderr).toContain("no concepts with enrichment != none");
      expect(stderr).toContain("run backfill first");
      expect(existsSync(outPath)).toBe(false);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("missing required args: exit 1 with usage, no output written", () => {
    const result = Bun.spawnSync(["bun", "src/quiz-concepts.ts", "--max", "30"], { cwd: ASBUILT_ROOT });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("bun asbuilt/src/quiz-concepts.ts");
  });
});

describe("AC8: quiz-check CLI refuses when zero candidates survive", () => {
  test("exit 1 and names the reason; the report is diagnostics, not a quiz", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "quiz-refusal-"));
    try {
      const pool: QuizPool = {
        scope: "pr-diff",
        questions: [
          {
            id: "q-fabricated",
            category: "auth",
            prompt: "What does the token validator return?",
            options: [
              { text: "A", correct: true },
              { text: "B", correct: false },
              { text: "C", correct: false },
              { text: "D", correct: false },
            ],
            citations: ["src/made-up.ts#neverExisted"],
            explanation: "...",
          },
        ],
      };
      const poolPath = join(sandbox, "pool.json");
      const citationsPath = join(sandbox, "citations.json");
      const reportPath = join(sandbox, "checked.json");
      writeFileSync(poolPath, JSON.stringify(pool));
      writeFileSync(citationsPath, JSON.stringify(["src/auth.ts#validateToken"]));

      const result = Bun.spawnSync(
        ["bun", "src/quiz-check.ts", "--pool", poolPath, "--citations", citationsPath, "--out", reportPath],
        { cwd: ASBUILT_ROOT },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stderr.toString()).toContain("zero candidates survived mechanical validation");
      // The check report (drop diagnostics) is written for debuggability, but
      // it contains no surviving questions — nothing downstream can render.
      const report = JSON.parse(readFileSync(reportPath, "utf8"));
      expect(report.valid).toEqual([]);
      expect(report.failures.length).toBe(1);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("missing required args: exit 1 with usage", () => {
    const result = Bun.spawnSync(["bun", "src/quiz-check.ts", "--pool", "x.json"], { cwd: ASBUILT_ROOT });
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString()).toContain("bun asbuilt/src/quiz-check.ts");
  });
});

describe("AC8/AC3: SKILL.md-owned refusals and blinding are pinned structurally", () => {
  const skillText = readFileSync(QUIZ_SKILL_PATH, "utf8");

  test("graph-extraction-failure refusal is present (R7 case 1)", () => {
    expect(skillText).toContain("Refuse loudly (R7) if graph extraction/reuse fails");
  });

  test("zero-diff-touched refusal is present (R7 case 2)", () => {
    expect(skillText).toContain("Refuse loudly (R7) if `touched` is empty");
  });

  test("zero-survivors refusal is present (no fallback to unverified candidates)", () => {
    expect(skillText).toContain("do not\nfall back to unverified candidates");
  });

  test("verifier dispatch blinding sentence is present (AC3)", () => {
    expect(skillText).toContain("**never** the generator's own dispatch prompt or reasoning");
  });
});
