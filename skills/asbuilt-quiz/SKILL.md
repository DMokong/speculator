---
name: asbuilt-quiz
description: >-
  Generates or regenerates a throwaway, self-contained multiple-choice
  comprehension quiz from As-Built material — either a diff range's
  graph slice (--scope=pr-diff, works on any git range, PR or not), or a
  sample of the accumulated docs/asbuilt/ bundle (--scope=codebase). Bank
  mode (default) embeds the full verified pool so every page load deals a
  fresh draw; regeneration re-renders from the persisted local bank for
  free, or re-runs the pipeline for brand-new questions. Standalone side
  tool: no gate wiring, no committed question bank (all output gitignored).
  Use when a reviewer wants to self-check their understanding before
  approving, when onboarding someone new to a codebase, or when asked to
  regenerate/re-deal an existing quiz.
---

# asbuilt-quiz — comprehension quiz dispatch

Mines As-Built comprehension material (SPEC-048/049) into a self-contained
HTML quiz. Standalone: never touches gate evidence, never blocks anything,
never persists questions to the repo. Two scopes share one pipeline; only
Step 1 differs.

The `asbuilt/` package ships inside this plugin at
`${CLAUDE_PLUGIN_ROOT}/asbuilt/` — every CLI below lives under
`asbuilt/src/` there. `<target>` is the repository being quizzed (often the
current worktree). Quiz output goes to `<target>/docs/asbuilt/.quiz/`,
which is kept out of the target's committed history (Step 5 ensures the
ignore).

### CLI reference (exact invocations)

The invocations below are each module's own `CLI_USAGE` string, printed
verbatim — the repo-root-relative form the module itself prints on a usage
error. When the steps below actually dispatch one of these tools, the
invoking session prefixes `${CLAUDE_PLUGIN_ROOT}/` onto the path, since this
skill isn't necessarily running from inside the plugin's own directory.

- Slice (existing, SPEC-048): `bun asbuilt/src/slice.ts --target <repo> --manifest <path> --diff-range <range>`
- Concepts: `bun asbuilt/src/quiz-concepts.ts --bundle <docs/asbuilt-dir> --max <n> [--seed <n>] --out <path>`
- Check: `bun asbuilt/src/quiz-check.ts --pool <path> --citations <path> --out <path>`
- Sample: `bun asbuilt/src/quiz-sample.ts --pool <path> --group-by <category> --count <n> --seed <n> --out <path>`
- Render (bank mode default): `bun asbuilt/src/quiz-render.ts (--sample <path> | --pool <path> [--count <n>]) --scope <pr-diff|codebase> --out <path>`

---

## Step 1 — Resolve scope and build the citation universe

**`--scope=pr-diff <target> <diff-range>`:**

1. Extract or reuse an existing graph manifest for `target` (same as
   `asbuilt-gate`'s Step 1 — see that skill if none exists yet).
2. **Refuse loudly (R7) if graph extraction/reuse fails for any reason** — do
   not degrade to LLM-only mode as `asbuilt-gate` does; this tool has no such
   mode and must not generate a quiz from unverified guesswork about the code
   structure.
3. Run `bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/slice.ts --target <target> --manifest <path> --diff-range <range>` to get `{ touched, neighborhood, files }`.
4. **Refuse loudly (R7) if `touched` is empty** — a docs-only or non-code
   diff has nothing to quiz. Do not proceed.
5. The citation universe is `neighborhood[].id`.
6. Check for an existing `evidence/gate-2c-asbuilt.yml` for this diff range
   — if present, pass it to `quiz-generator` as additional grounding
   context. Its absence is not an error; the quiz does not require a prior
   gate run.

**`--scope=codebase <target>`:**

1. Run `bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/quiz-concepts.ts --bundle <target>/docs/asbuilt --max 30 --out <tmp>/concepts.json`.
2. **Refuse loudly (R7) if the command exits nonzero** (zero enriched
   concepts — nothing folded yet). Recommend running backfill first. Do not
   proceed.
3. The citation universe is the sampled concepts' `resource` values.

---

## Step 2 — Dispatch `quiz-generator` (fresh, cold)

Dispatch the `quiz-generator` agent with the scope-appropriate inputs from
Step 1 (slice JSON + optional artifact for `pr-diff`; sampled concepts JSON
for `codebase`), the resolved citation universe, an optional
`.claude/asbuilt-quiz.local.md` category config if present, and
`target_count: 50`. It writes a candidate pool JSON (`QuizPool` shape).

---

## Step 3 — Run the mechanical check

```bash
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/quiz-check.ts --pool <candidates.json> --citations <citation-universe.json> --out <checked.json>
```

If this exits nonzero (zero candidates survived), refuse loudly — do not
fall back to unverified candidates.

---

## Step 4 — Dispatch `quiz-verifier` (blinded)

Dispatch the `quiz-verifier` agent with `checked.json`'s `valid` array and
the same source material the generator read (diff/slice, or sampled
concepts) — **never** the generator's own dispatch prompt or reasoning. One
dispatch covers the whole surviving pool (mirrors `asbuilt-judge`'s
single-dispatch-per-artifact pattern, not one dispatch per question). It
writes a verdicts YAML.

Filter `checked.json`'s `valid` array to only the questions whose verdict is
`keep: true` — this is the **verified pool**.

---

## Step 5 — Persist the bank and render (default: bank mode)

First, ensure the quiz directory is ignored in the target **without
touching its committed files**: if `docs/asbuilt/.quiz/` is not already
ignored there (check with `git -C <target> check-ignore docs/asbuilt/.quiz/probe`),
append `docs/asbuilt/.quiz/` to `<target>/.git/info/exclude` — the
local-only ignore file, so the additive guarantee holds even in repos whose
committed `.gitignore` never heard of this tool.

Bank mode (the default): write the **entire verified pool** to the ignored
JSON next to the quiz, then render an HTML that embeds the full bank and
deals a fresh stratified draw of 12 client-side on every page load (F5 or
the "New draw" button re-deals — no regeneration needed):

```bash
cp <verified-pool.json> <target>/docs/asbuilt/.quiz/quiz-bank-<scope>-<YYYY-MM-DD>.json
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/quiz-render.ts --pool <target>/docs/asbuilt/.quiz/quiz-bank-<scope>-<YYYY-MM-DD>.json --count 12 --scope <pr-diff|codebase> --out <target>/docs/asbuilt/.quiz/quiz-<scope>-<YYYY-MM-DD>.html
```

The bank JSON is a regeneration artifact (re-render with a different
--count, inspect the pool) — it contains answers, so it lives only in the
ignored `.quiz/` directory, same as the HTML. A sidecar `fetch()` is
impossible from `file://` (CORS), which is why the bank embeds inline —
the single-file/offline contract (AC7) holds.

**Optional fixed-draw mode** (reproducible: every viewer, every load, the
same questions — e.g. a team lead giving everyone the identical quiz):
sample server-side with a recorded seed, then render the draw:

```bash
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/quiz-sample.ts --pool <verified-pool.json> --group-by category --count 12 --seed <n> --out <sampled.json>
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/quiz-render.ts --sample <sampled.json> --scope <pr-diff|codebase> --out <target>/docs/asbuilt/.quiz/quiz-<scope>-<YYYY-MM-DD>.html
```

Target count: 12 (within the spec's 10-15 range). In fixed mode, if the
resulting `sample.length` is notably smaller than requested due to category
shortfalls (check `coverage[*].shortfall`), report this to the user rather
than silently shipping a thin quiz. (Bank mode surfaces per-draw shortfalls
in the page itself.)

Report the output path to the user. Remind them: these files are ignored
and not part of the committed bundle — theirs to upload wherever they like
(GitHub Pages, a doc server, or just opened locally). Nothing about this run
is reported back into Speculator's gates or evidence.

---

## Regeneration

When the user asks to "regenerate", "re-deal", or wants "fresh questions",
route by what fresh means:

- **Fresh draw, same questions (free, instant):** a bank-mode HTML already
  re-deals on every page load — tell the user to refresh (F5) or click
  "New draw". If they want a different draw size, re-render from the
  existing `quiz-bank-<scope>-*.json` in `docs/asbuilt/.quiz/` with a new
  `--count` — no LLM dispatch needed.
- **Fresh bank, new questions (full pipeline):** re-run from Step 1 — new
  generator and verifier dispatches. Use this when the diff range has
  moved, the bundle has grown, or the user explicitly wants questions
  they haven't seen. Runs are date-stamped; a new run writes a new
  bank+HTML pair rather than mutating the old ones (delete stale pairs
  freely — everything in `.quiz/` is throwaway by design).

---

## Additive guarantee

This flow never modifies: the graph manifest, any `docs/asbuilt/` concept
file, any `evidence/*.yml` gate evidence, or any Speculator plugin file. Its
only writes in the target are the quiz HTML and its question-bank JSON under
`docs/asbuilt/.quiz/` (both ignored), plus at most one appended line in the
target's local-only `.git/info/exclude` (never a committed file).
If any step needs to write test/scratch files, use a temp directory outside
the target repo, not `evidence/` (that directory is a committed audit
trail — writing quiz material there would defeat the whole point of not
persisting the answer key).
