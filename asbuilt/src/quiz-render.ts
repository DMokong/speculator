// Self-contained HTML renderer for the As-Built Comprehension Quiz
// Generator (SPEC-058, R5/AC7). Single file, no build step, no server, no
// external resource references — question data embedded as a JS variable
// (same pattern as skill-creator's eval_review.html template), client-side
// scoring only.
//
// Two modes (claw-gr4s):
// - fixed  (renderQuizHtml): embeds one pre-sampled draw — reproducible,
//   every viewer sees the same questions. The original SPEC-058 behavior.
// - bank   (renderQuizBankHtml): embeds the FULL verified pool and deals a
//   fresh stratified draw client-side on every page load (F5 = new quiz).
//   A sidecar fetch() is impossible from file:// (CORS), so the bank rides
//   inline — the single-file/offline contract (AC7) holds for both modes.

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { argValue } from "./cli";
import type { GroupCoverage } from "./quiz-sample";
import type { QuizQuestion } from "./quiz-types";

/** Shared client-side core: render current QUIZ_DATA + score on submit.
 * Both modes reference a QUIZ_DATA binding (const in fixed mode, let in
 * bank mode) holding { scope, coverage, questions }. */
const CLIENT_CORE_JS = `
function renderShortfallNote() {
  const existing = document.getElementById("shortfall-note");
  if (existing) existing.remove();
  const shortfalls = Object.entries(QUIZ_DATA.coverage).filter(function (e) { return e[1].shortfall > 0; });
  if (shortfalls.length > 0) {
    const note = document.createElement("p");
    note.id = "shortfall-note";
    note.className = "shortfall";
    note.textContent = "Category coverage shortfall: " + shortfalls
      .map(function (e) { return e[0] + " (" + e[1].taken + "/" + e[1].requested + ")"; })
      .join(", ");
    document.getElementById("meta").after(note);
  }
}

function render() {
  document.getElementById("meta").textContent =
    "Scope: " + QUIZ_DATA.scope + " \\u2014 " + QUIZ_DATA.questions.length + " questions";
  renderShortfallNote();

  const container = document.getElementById("quiz");
  QUIZ_DATA.questions.forEach(function (q, qi) {
    const div = document.createElement("div");
    div.className = "question";
    const title = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = "Q" + (qi + 1) + " [" + q.category + "]:";
    title.appendChild(strong);
    title.append(" " + q.prompt);
    div.appendChild(title);

    q.options.forEach(function (opt, oi) {
      const label = document.createElement("label");
      label.className = "option";
      const input = document.createElement("input");
      input.type = "radio";
      input.name = "q" + qi;
      input.value = String(oi);
      input.addEventListener("change", function () { picked[qi] = oi; });
      label.appendChild(input);
      label.append(" " + opt.text);
      div.appendChild(label);
    });

    const exp = document.createElement("p");
    exp.className = "citation";
    exp.style.display = "none";
    exp.textContent = q.explanation + " (citations: " + q.citations.join(", ") + ")";
    div.appendChild(exp);
    container.appendChild(div);
  });
}

function submit() {
  let correct = 0;
  const divs = document.querySelectorAll(".question");
  QUIZ_DATA.questions.forEach(function (q, qi) {
    const div = divs[qi];
    const correctIdx = q.options.findIndex(function (o) { return o.correct; });
    const pickedIdx = picked[qi];
    const labels = div.querySelectorAll(".option");
    if (labels[correctIdx]) labels[correctIdx].classList.add("correct");
    if (pickedIdx !== undefined && pickedIdx !== correctIdx && labels[pickedIdx]) {
      labels[pickedIdx].classList.add("wrong-picked");
    }
    if (pickedIdx === correctIdx) correct++;
    const citeEl = div.querySelector(".citation");
    if (citeEl) citeEl.style.display = "block";
  });
  document.getElementById("score").textContent = "Score: " + correct + " / " + QUIZ_DATA.questions.length;
}

document.getElementById("submit-btn").addEventListener("click", submit);
`;

/** Client-side port of quiz-sample.ts's stratifiedSample: largest-remainder
 * proportional allocation by category, per-group shuffle-and-take, final
 * presentation shuffle — Math.random in place of the seeded RNG, because
 * the whole point of bank mode is a different draw every load. */
const CLIENT_DRAW_JS = `
function shuffleArr(items) {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
  }
  return arr;
}

function stratifiedDraw(items, targetCount) {
  const groups = new Map();
  items.forEach(function (item) {
    const key = item.category;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  });

  const total = items.length;
  const clampedTarget = Math.min(targetCount, total);
  const keys = Array.from(groups.keys()).sort();

  const shares = keys.map(function (key) {
    const size = groups.get(key).length;
    const exact = total === 0 ? 0 : (size / total) * clampedTarget;
    return { key: key, size: size, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let allocated = shares.reduce(function (sum, s) { return sum + s.floor; }, 0);
  const byRemainder = shares.slice().sort(function (a, b) {
    return b.remainder - a.remainder || (a.key < b.key ? -1 : 1);
  });
  for (let i = 0; allocated < clampedTarget && i < byRemainder.length; i++) {
    const share = shares.find(function (s) { return s.key === byRemainder[i].key; });
    if (share) { share.floor += 1; allocated += 1; }
  }

  const coverage = {};
  let sample = [];
  shares.forEach(function (share) {
    const groupItems = groups.get(share.key) || [];
    const taken = Math.min(share.floor, share.size);
    sample = sample.concat(shuffleArr(groupItems).slice(0, taken));
    coverage[share.key] = {
      available: share.size,
      requested: share.floor,
      taken: taken,
      shortfall: Math.max(0, share.floor - taken),
    };
  });

  return { sample: shuffleArr(sample), coverage: coverage };
}

function newDraw() {
  const drawn = stratifiedDraw(QUIZ_BANK.questions, QUIZ_BANK.drawCount);
  QUIZ_DATA = { scope: QUIZ_BANK.scope, coverage: drawn.coverage, questions: drawn.sample };
  Object.keys(picked).forEach(function (k) { delete picked[k]; });
  document.getElementById("quiz").replaceChildren();
  document.getElementById("score").textContent = "";
  render();
}
`;

function htmlDocument(scope: string, extraControls: string, scriptBody: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>As-Built Comprehension Quiz — ${scope}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 720px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; }
  .question { border: 1px solid #ccc; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
  .option { display: block; margin: 0.4rem 0; cursor: pointer; }
  .option.correct { color: #0a7a2f; font-weight: 600; }
  .option.wrong-picked { color: #b3261e; text-decoration: line-through; }
  .citation { font-size: 0.85em; color: #555; }
  #score { font-size: 1.2rem; font-weight: 700; margin: 1rem 0; }
  .shortfall { color: #a15c00; }
  .bank-note { font-size: 0.85em; color: #555; }
  #redraw-btn { margin-left: 0.5rem; }
</style>
</head>
<body>
<h1>As-Built Comprehension Quiz</h1>
<p id="meta"></p>
<div id="quiz"></div>
<button id="submit-btn">Submit</button>${extraControls}
<div id="score"></div>
<script>
${scriptBody}
</script>
</body>
</html>
`;
}

function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/** Fixed mode: one pre-sampled draw baked in — every viewer, every load,
 * the same quiz. Reproducible via the sampler's seed. */
export function renderQuizHtml(
  scope: "pr-diff" | "codebase",
  sample: QuizQuestion[],
  coverage: Record<string, GroupCoverage>,
): string {
  const dataJson = embedJson({ scope, coverage, questions: sample });
  const script = `const QUIZ_DATA = ${dataJson};
const picked = {};
${CLIENT_CORE_JS}
render();
`;
  return htmlDocument(scope, "", script);
}

/** Bank mode (claw-gr4s): the full verified pool rides inline; every page
 * load deals a fresh stratified draw of `drawCount` questions client-side.
 * F5 or the "New draw" button re-deals without regenerating the file. */
export function renderQuizBankHtml(
  scope: "pr-diff" | "codebase",
  pool: QuizQuestion[],
  drawCount: number,
): string {
  const bankJson = embedJson({ scope, drawCount, questions: pool });
  const script = `const QUIZ_BANK = ${bankJson};
let QUIZ_DATA = null;
const picked = {};
${CLIENT_CORE_JS}
${CLIENT_DRAW_JS}
document.getElementById("redraw-btn").addEventListener("click", newDraw);
const bankNote = document.createElement("p");
bankNote.className = "bank-note";
bankNote.textContent = "Question bank: " + QUIZ_BANK.questions.length +
  " \\u2014 each load deals " + Math.min(QUIZ_BANK.drawCount, QUIZ_BANK.questions.length) +
  " fresh (refresh or New draw to re-deal)";
document.getElementById("meta").after(bankNote);
newDraw();
`;
  return htmlDocument(scope, '<button id="redraw-btn">New draw</button>', script);
}

export const CLI_USAGE =
  "bun asbuilt/src/quiz-render.ts (--sample <path> | --pool <path> [--count <n>]) --scope <pr-diff|codebase> --out <path>";

if (import.meta.main) {
  const samplePath = argValue("--sample");
  const poolPath = argValue("--pool");
  const scope = argValue("--scope");
  const outPath = argValue("--out");
  const modeCount = (samplePath ? 1 : 0) + (poolPath ? 1 : 0);
  if (modeCount !== 1 || !outPath || (scope !== "pr-diff" && scope !== "codebase")) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  mkdirSync(dirname(outPath), { recursive: true });
  if (poolPath) {
    const pool = JSON.parse(readFileSync(poolPath, "utf8")) as QuizQuestion[];
    const drawCount = argValue("--count") ? Number(argValue("--count")) : 12;
    writeFileSync(outPath, renderQuizBankHtml(scope, pool, drawCount));
    console.log(`wrote ${outPath} (bank of ${pool.length}, deals ${drawCount} per load)`);
  } else {
    const { sample, coverage } = JSON.parse(readFileSync(samplePath as string, "utf8")) as {
      sample: QuizQuestion[];
      coverage: Record<string, GroupCoverage>;
    };
    writeFileSync(outPath, renderQuizHtml(scope, sample, coverage));
    console.log(`wrote ${outPath} (${sample.length} questions)`);
  }
  process.exit(0);
}
