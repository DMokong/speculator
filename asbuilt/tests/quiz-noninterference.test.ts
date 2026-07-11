// Fixture-based end-to-end dry run (mirrors noninterference.test.ts's
// sandboxing pattern, SPEC-049 Task 6 AC10). Runs the deterministic half
// of the quiz pipeline (mechanical check -> stratified sample -> render)
// against mocked-but-realistic generator/verifier output — no LLM
// dispatch — and proves programmatically that only the intended output
// path is created.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { checkQuizPool } from "../src/quiz-check";
import { renderQuizBankHtml, renderQuizHtml } from "../src/quiz-render";
import { makeRng, stratifiedSample } from "../src/quiz-sample";
import type { QuizPool } from "../src/quiz-types";

const GENERATOR_OUTPUT = new URL("fixtures/quiz/mock-generator-output.json", import.meta.url)
  .pathname;
const VERDICTS = new URL("fixtures/quiz/mock-verifier-verdicts.yml", import.meta.url).pathname;

function snapshotDir(dir: string): Set<string> {
  const files = new Set<string>();
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.add(`${full}:${statSync(full).mtimeMs}`);
    }
  };
  walk(dir);
  return files;
}

describe("quiz pipeline non-interference (mocked generator/verifier)", () => {
  test("check -> sample -> render produces exactly one output file, sandbox untouched elsewhere", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "quiz-e2e-"));
    try {
      const evidenceDir = join(sandbox, "evidence");
      const bundleDir = join(sandbox, "docs", "asbuilt");
      mkdirSync(bundleDir, { recursive: true }); // pre-existing bundle dir, as a real target repo would have
      const before = snapshotDir(sandbox);

      const pool = JSON.parse(readFileSync(GENERATOR_OUTPUT, "utf8")) as QuizPool;
      const knownCitations = new Set(pool.questions.flatMap((q) => q.citations));
      const checked = checkQuizPool(pool, knownCitations);
      expect(checked.valid.length).toBe(8); // all mechanically well-formed

      const verdicts = (parse(readFileSync(VERDICTS, "utf8")) as { verdicts: { id: string; keep: boolean }[] })
        .verdicts;
      const keepIds = new Set(verdicts.filter((v) => v.keep).map((v) => v.id));
      const verifiedPool = checked.valid.filter((q) => keepIds.has(q.id));
      expect(verifiedPool.length).toBe(7); // q8 rejected by the verifier

      const { sample, coverage } = stratifiedSample(verifiedPool, (q) => q.category, 6, makeRng(42));
      expect(sample.length).toBe(6);

      const outPath = join(sandbox, "docs", "asbuilt", ".quiz", "quiz-pr-diff-test.html");
      const html = renderQuizHtml("pr-diff", sample, coverage);
      mkdirSync(join(sandbox, "docs", "asbuilt", ".quiz"), { recursive: true });
      writeFileSync(outPath, html);

      const after = snapshotDir(sandbox);
      const added = [...after].filter((f) => !before.has(f));
      expect(added.length).toBe(1);
      expect(added[0]?.startsWith(outPath)).toBe(true);

      // evidence/ and docs/asbuilt/ (outside .quiz/) were never created or touched
      expect(existsSync(evidenceDir)).toBe(false);
      const bundleFiles = existsSync(bundleDir) ? readdirSync(bundleDir) : [];
      expect(bundleFiles).toEqual([".quiz"]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  test("bank-mode flow (claw-gr4s): check -> persist bank -> render produces exactly two files, both under .quiz/", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "quiz-bank-e2e-"));
    try {
      const evidenceDir = join(sandbox, "evidence");
      const bundleDir = join(sandbox, "docs", "asbuilt");
      mkdirSync(bundleDir, { recursive: true });
      const before = snapshotDir(sandbox);

      const pool = JSON.parse(readFileSync(GENERATOR_OUTPUT, "utf8")) as QuizPool;
      const knownCitations = new Set(pool.questions.flatMap((q) => q.citations));
      const checked = checkQuizPool(pool, knownCitations);

      const verdicts = (parse(readFileSync(VERDICTS, "utf8")) as { verdicts: { id: string; keep: boolean }[] })
        .verdicts;
      const keepIds = new Set(verdicts.filter((v) => v.keep).map((v) => v.id));
      const verifiedPool = checked.valid.filter((q) => keepIds.has(q.id));

      const quizDir = join(bundleDir, ".quiz");
      mkdirSync(quizDir, { recursive: true });
      const bankPath = join(quizDir, "quiz-bank-pr-diff-test.json");
      const htmlPath = join(quizDir, "quiz-pr-diff-test.html");
      writeFileSync(bankPath, JSON.stringify(verifiedPool));
      writeFileSync(htmlPath, renderQuizBankHtml("pr-diff", verifiedPool, 6));

      const after = snapshotDir(sandbox);
      const added = [...after].filter((f) => !before.has(f));
      expect(added.length).toBe(2);
      for (const f of added) {
        expect(f.includes(`${quizDir}/`) || f.startsWith(`${quizDir}:`)).toBe(true);
      }

      // the rendered bank embeds the FULL verified pool, not one draw
      const html = readFileSync(htmlPath, "utf8");
      const bank = JSON.parse(html.match(/const QUIZ_BANK = (\{.*\});/)?.[1] ?? "{}");
      expect(bank.questions).toHaveLength(verifiedPool.length);
      expect(bank.drawCount).toBe(6);

      // evidence/ and docs/asbuilt/ (outside .quiz/) were never created or touched
      expect(existsSync(evidenceDir)).toBe(false);
      const bundleFiles = existsSync(bundleDir) ? readdirSync(bundleDir) : [];
      expect(bundleFiles).toEqual([".quiz"]);
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });
});
