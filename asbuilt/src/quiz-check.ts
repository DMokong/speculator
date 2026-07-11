// Mechanical, no-LLM validity + citation checker for quiz candidates
// (SPEC-058, R3/AC4). Mirrors check.ts's precedent (SPEC-048) of routing
// deterministic questions to a script rather than an LLM: every question
// gets exactly one check pass here before it's ever shown to
// quiz-verifier, so the adversarial LLM step spends its budget on
// candidates that are at least structurally sound.

import { readFileSync, writeFileSync } from "node:fs";
import { argValue } from "./cli";
import type { QuizPool, QuizQuestion } from "./quiz-types";

export interface QuizCheckFailure {
  id: string;
  reason: "wrong_option_count" | "missing_correct" | "multiple_correct" | "empty_option" | "duplicate_option" | "unknown_citation";
  detail: string;
}

export interface QuizCheckReport {
  valid: QuizQuestion[];
  failures: QuizCheckFailure[];
}

export function checkQuizPool(pool: QuizPool, knownCitations: Set<string>): QuizCheckReport {
  const valid: QuizQuestion[] = [];
  const failures: QuizCheckFailure[] = [];

  // Defensive access throughout (claw-1vm8): the pool is LLM-generated JSON
  // — a candidate with a missing field must become a named drop, never an
  // uncaught throw that takes the whole batch down. Mirrors check.ts's
  // handling of the same trust boundary.
  for (const q of pool.questions ?? []) {
    const id = typeof q.id === "string" && q.id.length > 0 ? q.id : "(missing id)";
    const options = q.options ?? [];
    if (options.length !== 4) {
      failures.push({ id, reason: "wrong_option_count", detail: `expected 4 options, got ${options.length}` });
      continue;
    }

    const correctCount = options.filter((o) => o?.correct === true).length;
    if (correctCount === 0) {
      failures.push({ id, reason: "missing_correct", detail: "no option marked correct" });
      continue;
    }
    if (correctCount > 1) {
      failures.push({ id, reason: "multiple_correct", detail: `${correctCount} options marked correct` });
      continue;
    }

    const texts = options.map((o) => (typeof o?.text === "string" ? o.text.trim() : ""));
    if (texts.some((t) => t.length === 0)) {
      failures.push({ id, reason: "empty_option", detail: "one or more options is empty or not a string" });
      continue;
    }
    if (new Set(texts).size !== texts.length) {
      failures.push({ id, reason: "duplicate_option", detail: "two or more options are identical" });
      continue;
    }

    const citations = q.citations ?? [];
    const unknown = citations.find((c) => !knownCitations.has(c));
    if (citations.length === 0 || unknown) {
      failures.push({
        id,
        reason: "unknown_citation",
        detail: unknown ? `citation "${unknown}" not found` : "question has no citations",
      });
      continue;
    }

    valid.push(q);
  }

  return { valid, failures };
}

export const CLI_USAGE =
  "bun asbuilt/src/quiz-check.ts --pool <path> --citations <path> --out <path>";

if (import.meta.main) {
  const poolPath = argValue("--pool");
  const citationsPath = argValue("--citations");
  const outPath = argValue("--out");
  if (!poolPath || !citationsPath || !outPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const pool = JSON.parse(readFileSync(poolPath, "utf8")) as QuizPool;
  const citations = JSON.parse(readFileSync(citationsPath, "utf8")) as string[];
  const report = checkQuizPool(pool, new Set(citations));
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`${report.valid.length} valid, ${report.failures.length} dropped`);
  if (report.valid.length === 0) {
    console.error("quiz-check: zero candidates survived mechanical validation");
    process.exit(1);
  }
  process.exit(0);
}
