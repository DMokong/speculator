import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { checkQuizPool } from "../src/quiz-check";
import type { QuizPool } from "../src/quiz-types";

const FIXTURE = new URL("fixtures/quiz/candidates-mixed.json", import.meta.url).pathname;
const KNOWN_CITATIONS = new Set(["src/auth.ts#validateToken"]);

describe("checkQuizPool", () => {
  const pool = JSON.parse(readFileSync(FIXTURE, "utf8")) as QuizPool;
  const report = checkQuizPool(pool, KNOWN_CITATIONS);

  test("the one valid candidate survives", () => {
    expect(report.valid.map((q) => q.id)).toEqual(["q-valid"]);
  });

  test("every failure fixture case is dropped with a named reason", () => {
    const byId = new Map(report.failures.map((f) => [f.id, f]));
    expect(byId.get("q-missing-correct")?.reason).toBe("missing_correct");
    expect(byId.get("q-multiple-correct")?.reason).toBe("multiple_correct");
    expect(byId.get("q-empty-option")?.reason).toBe("empty_option");
    expect(byId.get("q-duplicate-option")?.reason).toBe("duplicate_option");
    expect(byId.get("q-unknown-citation")?.reason).toBe("unknown_citation");
  });

  test("exactly 5 fixture cases fail and 1 survives (6 total)", () => {
    expect(pool.questions.length).toBe(6);
    expect(report.valid.length).toBe(1);
    expect(report.failures.length).toBe(5);
  });

  test("a question with zero citations is dropped as unknown_citation", () => {
    const noCitations: QuizPool = {
      scope: "pr-diff",
      questions: [
        {
          id: "q-no-citations",
          category: "db",
          prompt: "...",
          options: [
            { text: "A", correct: true },
            { text: "B", correct: false },
            { text: "C", correct: false },
            { text: "D", correct: false },
          ],
          citations: [],
          explanation: "...",
        },
      ],
    };
    const r = checkQuizPool(noCitations, KNOWN_CITATIONS);
    expect(r.valid.length).toBe(0);
    expect(r.failures[0]?.reason).toBe("unknown_citation");
  });

  test("a question with 3 options is dropped as wrong_option_count", () => {
    const wrongCount: QuizPool = {
      scope: "pr-diff",
      questions: [
        {
          id: "q-wrong-count",
          category: "db",
          prompt: "...",
          options: [
            { text: "A", correct: true },
            { text: "B", correct: false },
            { text: "C", correct: false },
          ],
          citations: ["src/auth.ts#validateToken"],
          explanation: "...",
        },
      ],
    };
    const r = checkQuizPool(wrongCount, KNOWN_CITATIONS);
    expect(r.valid.length).toBe(0);
    expect(r.failures[0]?.reason).toBe("wrong_option_count");
    expect(r.failures[0]?.detail).toBe("expected 4 options, got 3");
  });

  test("claw-1vm8: malformed candidate shapes drop with named findings, never crash the batch", () => {
    // Simulates LLM-JSON trust-boundary breakage: fields missing entirely
    // (not just wrong-length). Cast through unknown because these shapes
    // deliberately violate the QuizQuestion contract.
    const malformed = {
      scope: "pr-diff",
      questions: [
        { id: "q-no-options", category: "db", prompt: "?", citations: ["src/auth.ts#validateToken"], explanation: "" },
        {
          id: "q-optionless-text",
          category: "db",
          prompt: "?",
          options: [
            { correct: true },
            { text: "B", correct: false },
            { text: "C", correct: false },
            { text: "D", correct: false },
          ],
          citations: ["src/auth.ts#validateToken"],
          explanation: "",
        },
        {
          id: "q-no-citations-field",
          category: "db",
          prompt: "?",
          options: [
            { text: "A", correct: true },
            { text: "B", correct: false },
            { text: "C", correct: false },
            { text: "D", correct: false },
          ],
          explanation: "",
        },
        {
          category: "db",
          prompt: "no id at all",
          options: [
            { text: "A" },
            { text: "B", correct: false },
            { text: "C", correct: false },
            { text: "D", correct: false },
          ],
          citations: ["src/auth.ts#validateToken"],
          explanation: "",
        },
      ],
    } as unknown as QuizPool;

    const r = checkQuizPool(malformed, KNOWN_CITATIONS);
    expect(r.valid.length).toBe(0);
    expect(r.failures.length).toBe(4);
    const byId = new Map(r.failures.map((f) => [f.id, f.reason]));
    expect(byId.get("q-no-options")).toBe("wrong_option_count");
    expect(byId.get("q-optionless-text")).toBe("empty_option");
    expect(byId.get("q-no-citations-field")).toBe("unknown_citation");
    expect(byId.get("(missing id)")).toBe("missing_correct");
  });

  test("claw-1vm8: a pool with no questions field yields an empty report, not a throw", () => {
    const r = checkQuizPool({ scope: "pr-diff" } as unknown as QuizPool, KNOWN_CITATIONS);
    expect(r.valid).toEqual([]);
    expect(r.failures).toEqual([]);
  });
});
