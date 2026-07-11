import { describe, expect, test } from "bun:test";
import { CLI_USAGE, renderQuizBankHtml, renderQuizHtml } from "../src/quiz-render";
import type { GroupCoverage } from "../src/quiz-sample";
import type { QuizQuestion } from "../src/quiz-types";

const SAMPLE: QuizQuestion[] = [
  {
    id: "q1",
    category: "security",
    prompt: "What happens on an expired token?",
    options: [
      { text: "Raises AuthError", correct: true },
      { text: "Returns null", correct: false },
      { text: "Refreshes silently", correct: false },
      { text: "Logs and continues", correct: false },
    ],
    citations: ["src/auth.ts#validateToken"],
    explanation: "Per src/auth.ts#validateToken.",
  },
];

const COVERAGE: Record<string, GroupCoverage> = {
  security: { available: 5, requested: 5, taken: 5, shortfall: 0 },
  db: { available: 1, requested: 3, taken: 1, shortfall: 2 },
};

describe("renderQuizHtml", () => {
  const html = renderQuizHtml("pr-diff", SAMPLE, COVERAGE);

  test("is a single self-contained document with no external resource references", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  test("embeds all question/option/citation data inline as parseable JSON", () => {
    const match = html.match(/const QUIZ_DATA = (\{.*\});/);
    expect(match).not.toBeNull();
    const data = JSON.parse(match?.[1] ?? "{}");
    expect(data.scope).toBe("pr-diff");
    expect(data.questions).toHaveLength(1);
    expect(data.questions[0].citations).toEqual(["src/auth.ts#validateToken"]);
  });

  test("surfaces a category shortfall notice for under-populated categories", () => {
    expect(html).toContain("db");
    expect(html).toContain("shortfall");
  });

  test("renders every option's text somewhere in the document", () => {
    for (const opt of SAMPLE[0]?.options ?? []) {
      expect(html).toContain(opt.text);
    }
  });

  test("escapes </script> and unescaped < in category/prompt to prevent script-breakout and HTML injection", () => {
    const malicious: QuizQuestion[] = [
      {
        id: "q-breakout",
        category: "generics<T>",
        prompt: 'What does this do? </script><script>alert(1)</script>',
        options: [
          { text: "Normal option", correct: true },
          { text: "Injected option", correct: false },
        ],
        citations: ["src/test.ts"],
        explanation: "Test explanation with <tag>.",
      },
    ];
    const coverage: Record<string, GroupCoverage> = {
      generics: { available: 1, requested: 1, taken: 1, shortfall: 0 },
    };

    const maliciousHtml = renderQuizHtml("pr-diff", malicious, coverage);

    // Bug 1 fix: verify </script><script> does NOT appear unescaped in the rendered output
    // If the fix didn't work, we'd see literal "</script><script>" which would break script parsing
    // After the fix, < is escaped as < in the JSON, preventing breakout
    expect(maliciousHtml).not.toContain('</script><script>alert');

    // Extract and parse the QUIZ_DATA to verify escaping worked and data is intact
    const match = maliciousHtml.match(/const QUIZ_DATA = (\{.*?\});/);
    expect(match).not.toBeNull();
    const parsedData = JSON.parse(match?.[1] ?? "{}");

    // Verify Bug 1 fix: data round-trips correctly after escaping
    // The < character should be escaped in JSON but parse back to < at runtime
    expect(parsedData.questions[0]?.category).toBe("generics<T>");
    expect(parsedData.questions[0]?.prompt).toBe('What does this do? </script><script>alert(1)</script>');
    expect(parsedData.questions[0]?.explanation).toBe("Test explanation with <tag>.");

    // Verify Bug 2 fix: verify escaped output contains the safe escapes, not unescaped markup
    // The JSON in the HTML should show < for < (not the literal < that would break HTML/JS)
    const jsonPart = maliciousHtml.match(/const QUIZ_DATA = ({.*?});/)?.[1] ?? "";
    expect(jsonPart).toContain("\\u003c");
    // And should NOT contain the unescaped sequence that would break script parsing
    expect(jsonPart).not.toContain("</script><script>");

    // Bug 3 fix: verify no .innerHTML assignments exist in the rendered code
    // This static check catches reintroduction of innerHTML-based string concatenation for titles
    expect(maliciousHtml).not.toContain(".innerHTML");
  });
});

function makeBankQuestion(id: string, category: string): QuizQuestion {
  return {
    id,
    category,
    prompt: `Prompt for ${id}?`,
    options: [
      { text: `${id} right`, correct: true },
      { text: `${id} wrong A`, correct: false },
      { text: `${id} wrong B`, correct: false },
      { text: `${id} wrong C`, correct: false },
    ],
    citations: [`src/${category}.ts#thing`],
    explanation: `Because ${id}.`,
  };
}

describe("renderQuizBankHtml (claw-gr4s bank mode)", () => {
  const POOL: QuizQuestion[] = [
    ...[1, 2, 3, 4, 5].map((i) => makeBankQuestion(`sec-${i}`, "security")),
    ...[1, 2, 3, 4].map((i) => makeBankQuestion(`db-${i}`, "db")),
    ...[1, 2, 3].map((i) => makeBankQuestion(`ui-${i}`, "ui")),
  ];
  const html = renderQuizBankHtml("pr-diff", POOL, 4);

  test("is a single self-contained document with no external resource references", () => {
    expect(html).toContain("<!doctype html>");
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link[^>]+href="https?:/i);
    expect(html).not.toMatch(/https?:\/\//);
  });

  test("embeds the FULL bank (not just one draw) inline as parseable JSON with the draw count", () => {
    const match = html.match(/const QUIZ_BANK = (\{.*\});/);
    expect(match).not.toBeNull();
    const bank = JSON.parse(match?.[1] ?? "{}");
    expect(bank.scope).toBe("pr-diff");
    expect(bank.questions).toHaveLength(POOL.length);
    expect(bank.drawCount).toBe(4);
  });

  test("carries client-side stratified draw + redraw machinery (fresh draw per load)", () => {
    expect(html).toContain("function stratifiedDraw");
    expect(html).toContain('id="redraw-btn"');
    // the draw must run on load, not be baked in: no pre-sampled QUIZ_DATA constant
    expect(html).not.toMatch(/const QUIZ_DATA =/);
  });

  test("renders every pool question's option text somewhere in the document (bank superset)", () => {
    for (const q of POOL) {
      for (const opt of q.options) {
        expect(html).toContain(opt.text);
      }
    }
  });

  test("escapes </script> breakout in bank mode too", () => {
    const malicious = [
      {
        ...makeBankQuestion("q-evil", "generics<T>"),
        prompt: 'Break out? </script><script>alert(1)</script>',
      },
    ];
    const evil = renderQuizBankHtml("pr-diff", malicious, 1);
    expect(evil).not.toContain("</script><script>alert");
    const bank = JSON.parse(evil.match(/const QUIZ_BANK = (\{.*\});/)?.[1] ?? "{}");
    expect(bank.questions[0]?.prompt).toBe('Break out? </script><script>alert(1)</script>');
    expect(evil).not.toContain(".innerHTML");
  });

  test("CLI usage documents both fixed-sample and bank modes", () => {
    expect(CLI_USAGE).toContain("--sample");
    expect(CLI_USAGE).toContain("--pool");
    expect(CLI_USAGE).toContain("--count");
  });
});
