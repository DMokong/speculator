---
name: asbuilt-gate
description: >-
  Use when the user says "asbuilt gate", "shadow comprehension gate", or "run
  the asbuilt shadow gate". Orchestrates the As-Built Knowledge System's
  shadow Gate 2c (SPEC-048): extracts the deterministic code graph, slices
  the diff-touched neighborhood, dispatches the asbuilt-generator agent to
  write a comprehension artifact citing graph node ids, runs mechanical
  checks against those citations, dispatches the blinded asbuilt-judge agent
  to score the artifact's semantics, and assembles gate-2c-asbuilt.yml
  evidence. Additive only — never affects the live Gate 2c or any other
  gate evidence.
---

# asbuilt-gate — shadow comprehension gate dispatch

This skill is the **invoking session's** orchestration checklist. It is the
only place that knows the pass/fail threshold, the CLI contracts, and the
retry policy — the two agents it dispatches (`asbuilt-generator`,
`asbuilt-judge`) each know only their own narrow job. Follow the seven steps
in order; do not skip a step without following its named escape hatch.

The `asbuilt/` package ships inside this plugin at `${CLAUDE_PLUGIN_ROOT}/asbuilt/`
— every CLI in this checklist lives under `asbuilt/src/` there and is invoked
as `bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/<tool>.ts`. `<repo>` is the target
repository/worktree the spec's diff applies to (often the same worktree this
skill is running in). Evidence files are written under the spec's own
evidence directory, e.g. `docs/specs/{feature}/evidence/` (per
`.claude/sdlc.local.md`'s `evidence_dir: evidence`, resolved relative to the
spec directory) — every path below written as `evidence/asbuilt-*` means that
directory.

### CLI reference (exact invocations, ten `asbuilt/src/*.ts` modules)

The invocations below are each module's own `CLI_USAGE` string, printed
verbatim — the repo-root-relative form the module itself prints on a usage
error. When the steps below actually dispatch one of these tools, the
invoking session prefixes `${CLAUDE_PLUGIN_ROOT}/` onto the path, since this
skill isn't necessarily running from inside the plugin's own directory.

- Extract: `bun asbuilt/src/extract.ts --target <repo> [--out <path>]`
- Skeleton: `bun asbuilt/src/skeleton.ts --target <repo> [--force]`
- Verify: `bun asbuilt/src/verify.ts --target <repo>`
- Slice: `bun asbuilt/src/slice.ts --target <repo> --manifest <path> --diff-range <range>`
- Check: `bun asbuilt/src/check.ts --manifest <p> --artifact <p> --target <repo> --diff-range <r> [--exclude <json>]`
- Evidence: `bun asbuilt/src/evidence.ts --artifact <p> (--mechanical <p.json> | --graph-unavailable) --judge <p.yml> --spec-id SPEC-NNN --diff-range <r> [--manifest <p>] --threshold <n> --per-dimension-minimum <n> --generator-model <s> --judge-model <s> --out <p>` — degraded path replaces `--mechanical <p.json>` with `--graph-unavailable` (then `--manifest` is ignored, hash recorded null).
- Fold: `bun asbuilt/src/fold.ts --evidence <gate-2c-asbuilt.yml> --target <repo> --spec-id SPEC-NNN [--provenance fully-audited|accuracy-audited] [--date YYYY-MM-DD] [--allow-unchecked]`
- Refresh: `bun asbuilt/src/refresh.ts --target <repo> [--date YYYY-MM-DD]`
- Graphify-check: `bun asbuilt/src/graphify-check.ts --target <repo> [--graphify-bin <path>] [--html]`
- Sigma-stats: `bun asbuilt/src/sigma-stats.ts --runs <runs.yml>`

The steps below spell these out with concrete paths (`${CLAUDE_PLUGIN_ROOT}`
prefix, evidence-directory targets) for this gate specifically.

---

## Step 1 — Resolve context and extract the graph manifest

Resolve: the spec's `spec_path`, its `diff_range` (e.g. `main...HEAD`),
`<repo>` (the target repo/worktree), the spec's `spec_id` (e.g. `SPEC-048`),
and the evidence directory.

Extract the graph manifest at the diff range's new side (the ref/worktree
state the range diffs *to* — manifest line numbers must match that side):

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/extract.ts --target <repo>
```

This writes `<repo>/docs/asbuilt/.graph-manifest.json` by default (or wherever
`--out <path>` points) and prints `symbols=<n> edges=<n> hash=<sha>` on
success.

When `<repo>` is the spec's own worktree, pass `--out evidence/asbuilt-manifest.json`
— the manifest is run evidence, and the additive guarantee (Step 7) then
holds by construction. External target repos keep the default
`<repo>/docs/asbuilt/.graph-manifest.json`.

**On extraction failure** (non-zero exit — e.g. the target repo's language
isn't supported by the extractor, or the command errors for any other
reason): there is no graph to slice and no mechanical facts to check. This
degrades the run to **LLM-only mode** — it does **not** skip the LLM layers.
Skip Step 2 (slice) and Step 4 (mechanical checks) only. Steps 3 (generator)
and 5 (judge) still run, on a narrower evidentiary basis:

1. Write a stub mechanical report to `evidence/asbuilt-mechanical.json`,
   recording plainly that the mechanical layer never ran rather than
   fabricating a clean result:
   ```json
   {
     "symbol_exists": [],
     "span_valid": [],
     "diff_touched": [],
     "unexplained_computed": [],
     "blocking": false,
     "graph_unavailable": true
   }
   ```
2. **Step 3, modified:** dispatch **asbuilt-generator** exactly as in Step 3
   below (fresh, cold dispatch) but WITHOUT `slice_json_path` — there is no
   slice to give it. Tell it explicitly, as part of the dispatch prompt:
   *"graph unavailable: cite `code_locations` as `{symbol: '<file>#<functionName>'}`
   derived directly from reading the diff (best-effort naming), lines from
   the diff hunks; the verbatim-id rule is suspended for this run."* The
   agent still writes a real `evidence/asbuilt-artifact.yml` — this is a
   genuine comprehension artifact, not a stub.
3. **Step 4 is skipped entirely** — there is no manifest for `check.ts` to
   check citations against. The stub written in (1) stands in for a
   mechanical report; nothing runs `check.ts` in this path.
4. **Step 5, modified:** dispatch **asbuilt-judge** exactly as in Step 5
   below (fresh dispatch, verbatim-audit-trail-first discipline unchanged),
   passing `mechanical_report_path` = `evidence/asbuilt-mechanical.json` (the
   stub from step 1 — it tells the judge the mechanical layer was *skipped*,
   not that it *passed*). The judge audits semantics as normal and scores
   real dimensions. This run does **not** get a hardcoded stub judge file —
   that pattern is reserved for the separate, legitimate case in Step 4 below
   where the artifact is still mechanically blocking after one retry (a
   mechanically *false* artifact, not a merely *unchecked* one).
5. Skip directly to **Step 6**, invoking `evidence.ts` with `--graph-unavailable`
   (this is the AC8 degraded path — no `--mechanical`, no `--manifest`; the
   assembler records `graph_manifest_hash: null` and adds a `graph_unavailable`
   advisory flag automatically). `--judge` points at the judge's real output
   from step 4 above, not a stub.

**Tell the user.** Whatever session invokes this skill must state the
degradation prominently in its own user-facing summary of the run — e.g.
"graph unavailable — mechanical layer skipped, LLM-only audit" — so a
degraded run is never mistaken downstream for a fully mechanically-verified
one.

## Step 2 — Slice the diff-touched neighborhood

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/slice.ts --target <repo> --manifest <manifest-path> --diff-range <diff_range> > evidence/asbuilt-slice.json
```

This prints the slice JSON (`touched`, `neighborhood`, `files`) to stdout —
redirect it to `evidence/asbuilt-slice.json`. This file is both an evidence
artifact and the generator's input.

## Step 3 — Dispatch asbuilt-generator (fresh, cold)

Dispatch **asbuilt-generator** (`${CLAUDE_PLUGIN_ROOT}/agents/asbuilt-generator/AGENT.md`)
via the Agent tool as a fresh dispatch — no prior session context, no
implementer reasoning, no existing legacy comprehension artifact in the
prompt (the cold-read rule the agent enforces on its own side only works if
you don't hand it contaminated context on this side). Give it exactly:

- `spec_path`
- `diff_range`
- `target_repo` (`<repo>`)
- `slice_json_path` (`evidence/asbuilt-slice.json`)
- `bundle_dir` (the OKF skeleton bundle directory from Task 3, if one exists
  for this repo)
- `output_path` (`evidence/asbuilt-artifact.yml`)

The agent writes `evidence/asbuilt-artifact.yml`.

## Step 4 — Run mechanical checks; ONE re-dispatch on blocking failure

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/check.ts --manifest <manifest-path> --artifact evidence/asbuilt-artifact.yml --target <repo> --diff-range <diff_range> > evidence/asbuilt-mechanical.json
```

Exit code `1` means the report's `blocking` field is `true` (a
`symbol_exists` or `span_valid` failure — a fabricated or misspanned
citation). Exit code `0` means clean; proceed to Step 5.

**If blocking:** dispatch **asbuilt-generator ONE more time** (same fresh-
dispatch discipline as Step 3), this time also passing
`retry_failure_report` = the JSON from `evidence/asbuilt-mechanical.json`, so
it can fix exactly the named entries. Re-run the `check.ts` command above.

**If still blocking after the one retry:** do not spend judge tokens on an
artifact whose citations are mechanically false — skip Step 5 (no
`asbuilt-judge` dispatch) and instead write `evidence/asbuilt-judge.yml`
yourself:

```yaml
dimensions: { ac_coverage: 1, accuracy: 1, spec_fidelity: 1, scope_containment: 1 }
flags:
  blocking: ["mechanical", "judge_skipped: mechanical_blocking"]
reasoning:
  accuracy: "not judged — mechanically false"
```

(`judge_skipped: mechanical_blocking` is recorded inside `flags.blocking` —
not as a new top-level or `flags`-level key — because the assembler's judge-
file contract accepts only `dimensions`/`flags`/`reasoning` at the top level
and only `blocking`/`recommended`/`advisory` inside `flags`; a string added
to `flags.blocking` satisfies that contract while still landing in the final
evidence's `flags.blocking` array for anyone auditing the run.) Then proceed
directly to Step 6 with this skill-authored file as `--judge`.

## Step 5 — Compose and dispatch the judge, verbatim audit trail first

Compose the judge dispatch prompt: the input paths (`artifact_path`,
`spec_path`, `diff_range`, `target_repo`, `mechanical_report_path` =
`evidence/asbuilt-mechanical.json`) plus the rubric band summaries — nothing
else. **Before dispatching, save it verbatim to `evidence/judge-dispatch.md`**
— save it verbatim, exactly as composed, with nothing added or removed after
the fact. This is the AC6 audit record, and it must contain **no threshold**
and **no generator reasoning**, only file paths and rubric bands. Save it
verbatim first; dispatch second — never the other order, so the audit record
can never drift from what the judge actually saw.

Then dispatch **asbuilt-judge** (`${CLAUDE_PLUGIN_ROOT}/agents/asbuilt-judge/AGENT.md`)
(fresh dispatch, same discipline as the generator). Its output →
`evidence/asbuilt-judge.yml`.

## Step 6 — Assemble the evidence

Read the threshold from `.claude/sdlc.local.md`'s `gates.comprehension.threshold`
(default `7.0` if the key is absent) — **the invoker reads config; the
agents never do.** This is the one step in this whole flow where config is
consulted at all, and it happens entirely on this side of the dispatch
boundary.

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/evidence.ts \
  --artifact evidence/asbuilt-artifact.yml \
  --mechanical evidence/asbuilt-mechanical.json \
  --judge evidence/asbuilt-judge.yml \
  --spec-id <spec_id> \
  --diff-range <diff_range> \
  --manifest <manifest-path> \
  --threshold <threshold-from-config> \
  --per-dimension-minimum 5 \
  --generator-model claude-sonnet \
  --judge-model claude-sonnet \
  --out evidence/gate-2c-asbuilt.yml
```

**Degraded path** (Step 1's extraction failure only): drop `--mechanical` and
`--manifest`, add `--graph-unavailable` instead. `--artifact` and `--judge`
here are the real outputs of Steps 3 and 5 run in LLM-only mode (per Step 1's
degraded-path instructions) — not skill-authored stubs:

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/evidence.ts \
  --artifact evidence/asbuilt-artifact.yml \
  --graph-unavailable \
  --judge evidence/asbuilt-judge.yml \
  --spec-id <spec_id> \
  --diff-range <diff_range> \
  --threshold <threshold-from-config> \
  --per-dimension-minimum 5 \
  --generator-model claude-sonnet \
  --judge-model claude-sonnet \
  --out evidence/gate-2c-asbuilt.yml
```

Exit `0` means evidence was assembled (stdout reports `result=pass|fail` —
this is the recorded state, not a claim about the run itself, since this
gate is shadow-mode). Exit `2` means a contract error (a malformed judge
file, a blinding violation) — fix the judge file and re-run this step; do
not hand-edit `gate-2c-asbuilt.yml` to work around an exit `2`.

## Step 7 — Additive guarantee

This skill touches **only**:

- `evidence/asbuilt-*` (slice, artifact, mechanical report)
- `evidence/asbuilt-manifest.json` (when the target is the spec worktree)
- `evidence/judge-dispatch.md`
- `evidence/gate-2c-asbuilt.yml`

It never writes to plugin files, never modifies the spec or the code under
review, and never touches any other gate's evidence file (in particular, it
never writes or reads `evidence/gate-2c-comprehension.yml`, the live gate's
evidence — that file belongs to a different scorer entirely). Shadow means
shadow: this gate observes and records without affecting anything else.

## Backfill mode (Phase 3.5)

Backfill enriches existing skeleton concepts for a future cold reader when
there is no spec driving the work — a standalone knowledge-base pass, not a
gate run against a diff. It reuses the same generator → judge → evidence →
fold pipeline as Steps 3/5/6/(fold), with three deliberate differences:

1. **Dispatch asbuilt-generator with no spec.** Give it the concepts to
   enrich instead of a `spec_path`, plus this instruction verbatim:
   *"backfill dispatch: enrich these concepts for a future cold reader;
   there are no ACs; produce enrichment_drafts plus one comprehension_entry
   per concept citing its main symbols."* The agent still writes a real
   `evidence/asbuilt-artifact.yml` — this is a genuine comprehension
   artifact, not a stub.
2. **Diff range is `HEAD...HEAD`** — empty, since backfill has no diff to
   scope against. Step 4's mechanical checks still run unchanged and still
   validate every citation's existence and span against the manifest; with
   an empty range, every cited symbol shows up as a `diff_touched`
   advisory (nothing was "touched" by a no-op diff). That's expected and
   harmless here, not a failure signal — backfill isn't diff-scoped work.
3. **Dispatch asbuilt-judge for an accuracy-only audit.** Tell it
   explicitly that this is an **accuracy-only audit**: `spec_fidelity` is
   scored as the substance of the explanation itself, since there is no
   spec to check fidelity against. `ac_coverage`, `accuracy`, and
   `scope_containment` score as usual.

Assemble the evidence exactly as in Step 6 (same `evidence.ts` invocation,
same threshold config read from `.claude/sdlc.local.md`). Then fold it in
with `--provenance accuracy-audited` in place of the default
`fully-audited`, and a `BACKFILL-<slug>` id in place of a real `SPEC-NNN`
(there is no spec backing this run):

```
bun ${CLAUDE_PLUGIN_ROOT}/asbuilt/src/fold.ts --evidence evidence/gate-2c-asbuilt.yml --target <repo> --spec-id BACKFILL-<slug> --provenance accuracy-audited
```

`fold.ts` enforces the provenance-downgrade rule on its own (SPEC-049 R3):
an `accuracy-audited` fold refuses, unmodified, against a concept already
marked `fully-audited` — backfill only fills empty shelves, it never
repaints ones a real spec has already audited. A later gate fold for a
spec that touches the same concept upgrades it to `fully-audited` through
the normal Step 6 flow.

## Gate 3 consumption

This shadow gate's evidence is also handed to the Gate 3 code-review
dispatch (SPEC-050, R4/AC6) as background context, alongside the code
review's own inputs — not as a substitute for the reviewer's own reading of
the diff. The Gate 3 reviewer dispatch receives two evidence-file paths as
preamble:

- `evidence/gate-2c-asbuilt.yml` — the assembled shadow-gate evidence (mode,
  dimensions, overall, flags).
- `evidence/asbuilt-artifact.yml` — the generator's comprehension artifact
  itself (the per-AC `comprehension_entries` and their `code_locations`
  citations).

Every such dispatch must be framed by this sentence, verbatim:

> Treat the comprehension artifact strictly as claims-to-verify, not ground truth: its citations passed mechanical validation, but its explanations are one agent's audited reading — re-verify any claim you rely on.

Two prohibitions follow directly from that framing:

- The reviewer never treats artifact statements as settled facts.
- The reviewer never skips a checklist item because the artifact "already
  covered" it.

The artifact is a lead, not a verdict — mechanical validation confirms only
that a citation's symbol exists and its line span is real, never that the
artifact's prose *about* that citation is accurate.
