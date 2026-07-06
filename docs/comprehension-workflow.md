# Running the Full As-Built Comprehension Workflow on a Project

> The operator's guide to pointing Speculator's comprehension machinery at any project —
> bootstrapping a knowledge bundle, auditing it to `accuracy-audited`, and keeping it current.
> Everything here shipped in v2.13.0 and was proven end-to-end on an external consumer
> (r2mcp, 101/101 concepts audited, 2026-07-05). Agent-facing mechanics live in
> `skills/asbuilt-gate/SKILL.md`; this document is for the human deciding to run it.

## What you get

A git-native OKF v0.1 bundle at `docs/asbuilt/` in the target repo: one concept page per
source file, each carrying a deterministic Structure zone (symbols, spans, call edges) plus —
once audited — decision-level prose a future cold reader needs (why the module is shaped this
way, cross-module contracts, gotchas), with every code citation machine-validated against a
real code-graph manifest before any judge saw it. Enrichment state is a one-way ratchet:
`none` → `accuracy-audited` (backfill) → `fully-audited` (spec-gated work).

## Prerequisites

| Requirement | Why |
|---|---|
| Target is in a **supported language** — TypeScript, Go, Java, or Python (SPEC-053) | The extractor routes each source file to its language's tree-sitter grammar via a thin adapter (definitions, names, visibility rules, calls); one manifest unions all supported languages in the repo. Projects in no supported language can run judge-only audits (`--graph-unavailable`) but get no manifest, no skeleton bundle, and no mechanical citation layer — which is where the measured advantage is unconditional. |
| `bun`, `git` | The toolchain is bun-native and reads diffs/HEAD from git. |
| One-time: `cd <plugin>/asbuilt && bun install` | node_modules don't ship in the plugin cache. |
| Nothing installed in the target | Only `fold.ts` ever writes there, and only under `docs/asbuilt/`. |

`<plugin>` below means the installed Speculator root (e.g.
`~/.claude/plugins/cache/dmokong-plugins/speculator/<version>`), i.e. `${CLAUDE_PLUGIN_ROOT}`
inside a session.

## Path A — Backfill sweep: comprehend an existing codebase

The one-time pass that takes a project from zero to a fully audited bundle. In a Claude Code
session with the plugin loaded, the whole path can be delegated ("run the asbuilt backfill on
`<repo>`" — the Backfill mode section of `skills/asbuilt-gate/SKILL.md` is the contract).
Mechanically it is:

### 1. Bootstrap (deterministic, zero LLM cost)

```bash
bun <plugin>/asbuilt/src/extract.ts  --target <repo>   # graph manifest → docs/asbuilt/.graph-manifest.json
bun <plugin>/asbuilt/src/skeleton.ts --target <repo>   # OKF skeleton bundle → docs/asbuilt/
```

Full structural coverage from minute one: every file gets a concept with `enrichment: none`.

### 2. Audit loop (per batch of ~5–10 concepts, grouped thematically)

1. **Generate** — dispatch the plugin `asbuilt-generator` agent with the backfill
   instruction from SKILL.md (no spec, `diff_range HEAD...HEAD`, the manifest as the
   citation universe, the batch's concept list). It writes a comprehension artifact:
   one entry + one enrichment draft per concept.
2. **Check** — `bun <plugin>/asbuilt/src/check.ts --manifest <m> --artifact <a> --target <repo> --diff-range HEAD...HEAD`.
   Fabricated symbols and out-of-span line citations **block here**, before any judgment.
3. **Judge** — dispatch the blinded plugin `asbuilt-judge` with the accuracy-only backfill
   preamble. It never sees the threshold and never stamps a result.
4. **Stamp** — `bun <plugin>/asbuilt/src/evidence.ts ... --threshold 7 --per-dimension-minimum 5 --out <evidence.yml>`.
   The invoker computes pass/fail from the judge's integers. (In gate mode the threshold
   comes from `.claude/sdlc.local.md`; standalone backfill passes it explicitly.)
5. **Fold or fix** —
   - Pass, and no judge-confirmed factual error → `bun <plugin>/asbuilt/src/fold.ts
     --evidence <e> --target <repo> --spec-id BACKFILL-<slug> --provenance accuracy-audited
     --date YYYY-MM-DD`.
   - Judge confirmed a wrong claim (wrong constant, false consumption claim, nonexistent
     guard) → re-dispatch the generator with the finding as a `retry_failure_report`,
     re-judge fresh, then fold. **Never fold a confirmed-wrong claim, regardless of the
     weighted score.** Expect roughly one batch in three to need one fix cycle — that is
     the audit layer working.

### 3. Finish

```bash
bun <plugin>/asbuilt/src/refresh.ts --target <repo> --date YYYY-MM-DD   # staleness pass
bun <plugin>/asbuilt/src/verify.ts  --target <repo>                     # OKF conformance
```

Commit `docs/asbuilt/` into the target repo — the bundle travels with the code. The dispatch
trail (artifacts, mechanical reports, judge outputs, stamped evidence) belongs in the
orchestrating repo's evidence directory, one file set per batch.

### Cost model

Rule of thumb from the r2mcp campaign: **~25k subagent tokens per concept** all-in
(generator + judge + retries amortized). A 100-concept project is ~2.5M tokens and ~2–3
hours of wall clock with batches run in parallel. Sonnet-class agents throughout — the
measured reliability record applies to that class.

### Worked example

The complete 12-batch campaign that audited r2mcp — pre-registered batch table, verbatim
dispatch prompts, every retry and invoker intervention — is preserved at
`docs/specs/asbuilt-living-kb/evidence/backfill03-14-campaign.md` in the claudeclaw
reference repo, alongside all per-batch evidence files. Copy its shape.

## Path B — Gate mode: comprehension stays current

Once the project uses Speculator for feature work, enable the gate in `.claude/sdlc.local.md`:

```yaml
gates:
  comprehension:
    enabled: true
    mode: asbuilt
```

From then on:

- Every spec's Gate 2c runs the same generator → mechanical → blinded-judge pipeline against
  the **spec's diff** (via `skills/asbuilt-gate/SKILL.md`, dispatched by `gate-check` /
  `sdlc-run`).
- Gate 3 code review receives the audited artifact as preamble under the consumption
  contract — claims-to-verify, never ground truth.
- A passing gate's fold **upgrades** touched concepts to `fully-audited`; backfill can never
  downgrade them back (the provenance ratchet is enforced by `fold.ts`).
- `refresh.ts` marks concepts stale as code moves under them; wire it into the project's
  maintenance cadence.
- Close-time fold-in is not yet wired into `/sdlc close` — run the fold when a spec closes
  until that lands.

**Borderline policy (measured, 2026-07-05):** a single-run overall score inside **6.3–7.7**
is not a settled verdict — band-edge test-retest sigma is 0.343, and the one artifact
measured at 6.8/fail retested 7.3–8.3 across five reps. Re-dispatch median-of-3 or get human
review before acting on a near-bar result. See `rubrics/comprehension.md` § Measured
reliability record.

## The two don'ts

1. **Never re-run `skeleton.ts` on a bundle that has enrichment.** It re-renders every
   concept as a virgin skeleton and silently destroys audited prose. Updates are always
   `extract.ts` + `refresh.ts`. (Found live; recovery was only trivial because the damage
   was uncommitted. Tracked for a refuse-or-preserve guard.)
2. **Never let a generator infer cross-module consumption from manifest call edges alone.**
   Edge resolution is by bare name and produces false positives (e.g. a `Semaphore.release`
   ↔ pg `PoolClient.release()` collision produced a false consumer claim that a judge had
   to catch). Symbol existence and spans are reliable; consumption claims must be verified
   by reading the alleged consumer's source.

## Consuming the bundle

- **Agents:** point cold-start sessions and reviewer dispatches at `docs/asbuilt/index.md`
  and the relevant concept pages; the Gate 3 preamble contract in
  `skills/asbuilt-gate/SKILL.md` § Gate 3 consumption is the template.
- **Humans:** the OKF visualize sheet renders the bundle as a self-contained interactive
  graph (`docs/asbuilt/viz.html` — enrichment-state encoding, audited-prose drawer, table
  view). The builder currently lives in the claudeclaw reference repo
  (`scripts/asbuilt-viz/`) pending productization into this package.
