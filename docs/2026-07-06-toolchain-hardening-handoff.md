# Handoff — As-Built Toolchain Hardening (SPEC-054 candidate)

> Written 2026-07-06 at the end of the multi-language/backfill arc, for a fresh session to
> fix the three critical toolchain issues found live during real campaigns. Read this first;
> work is tracked in the **claudeclaw** beads workspace. Every issue below has a live,
> documented reproduction — none of this is speculative.

## Standing context (decided — do not relitigate)

- **Plugin-first (2026-07-05):** this repo (`~/projects/speculator`) is the product home; all
  toolchain changes land in `asbuilt/` here. claudeclaw `scripts/asbuilt/` is a frozen
  reference — never re-port to it.
- **Pipeline:** run this as a spec (`/sdlc start` from `~/projects/claudeclaw`; next id
  SPEC-054; spec + evidence live in claudeclaw `docs/specs/`, claudeclaw worktree isolation,
  implementation on a speculator feature branch, merge at close). Gates 1/2/2a/2b/2c-shadow/3/4
  all ran for SPEC-052/053 — copy that shape. Full-auto bar 8.3, Gate 1 threshold 7.0.
- **Current version 2.15.0** (tag + marketplace + cache all agree). This work releases as
  **2.16.0** via RELEASE.md's three steps: repo tag → marketplace (`~/projects/claude-plugins`
  `.claude-plugin/marketplace.json`) → local cache copy + `~/.claude/plugins/installed_plugins.json`.
  Version must bump in `.claude-plugin/plugin.json` AND `CHANGELOG.md` in the same commit.
- **Untouchable:** `MANIFESTO.md` (modified) and `PRINCIPLES.md` (untracked) in this repo are
  Dustin's in-progress rewrite. Stage by explicit path only; never `git add -A` at repo root.
- **Test surfaces:** `cd asbuilt && bun test tests/` (216+), root `bun test tests/` (prime
  pins), release suites `bash tests/test-eval-intent-structure.sh`, `bash tests/test-secrets-scan.sh`,
  `(cd benchmarks && uv run pytest -q)`. The drift test (`asbuilt/tests/drift.test.ts`) pins
  every module's `CLI_USAGE` against `skills/asbuilt-gate/SKILL.md` — **any CLI flag change
  must update both together**.
- **Fixture determinism:** lang fixtures under `asbuilt/tests/fixtures/lang/` are committed
  plain files with empirically-pinned snapshot tables in `asbuilt/tests/lang-extract.test.ts`
  — never re-pin without hand-verifying new output. No timestamps in generated artifacts;
  codepoint sort; `--date` flags for dated output.
- **Live bundles that any manifest-affecting change touches:** r2mcp `docs/asbuilt/` (101
  concepts), claude-code-slack-bot `docs/asbuilt/` (35, on branch `claw-gxzq-continuous-relay`),
  claudeclaw `docs/asbuilt/` (52). Their frontmatter pins `graph_hash` (whole-manifest hash).

## The issues (scope of SPEC-054)

### 1. `claw-nybt` — fold.ts explains-merge retains dead symbol ids (functional bug, bites every repo that deletes code)

**Live repro:** claude-code-slack-bot `docs/asbuilt/src/file-handler.md` — its `explains:`
list still contains `src/file-handler.ts#FileHandler.getSupportedFileTypes` after that method
was deleted (0 hits in the manifest). `refresh.ts` therefore flags the concept
`stale: "changed: …getSupportedFileTypes"` **forever**, and no re-audit can clear it: fold
merges the new artifact's citations into the existing `explains` instead of rebuilding, so
the dead id survives every re-fold (verified live during BACKFILL-slackbot-06).

**Fix direction:** at fold time, drop `explains` entries absent from the manifest the
evidence was mechanically checked against — or rebuild `explains` from the artifact's
citations outright (decide in the spec; rebuilding is cleaner but changes semantics for
partial re-audits that only cover some of a concept's symbols). Check the adjacent
`stale_reason` merge logic (`parseChangedIds` in refresh.ts) for the same dead-id survival.

**Tests:** fixture flow — fold, delete a cited symbol from the fixture source, re-extract,
re-fold, assert the dead id is gone from `explains` and a subsequent `refresh` reports the
concept clean. **After the fix ships:** one re-fold (or scripted explains cleanup) on the
slack-bot's `file-handler.md` clears the live case — verify with refresh there.

### 2. `claw-i7fn` — skeleton.ts silently destroys enriched bundles on re-run (data-loss footgun)

**Live repro:** happened on r2mcp 2026-07-05 — `skeleton.ts --target` against the enriched
bundle re-rendered every concept as a virgin skeleton (enrichment frontmatter reset AND
audited prose deleted). Recovery was only trivial because the damage was uncommitted.

**Fix direction:** `generateBundle`/CLI refuses when the target bundle contains any concept
with `enrichment != none`, listing the enriched concepts it would destroy; add `--force` to
override. **Drift-test consequence:** a new flag changes `CLI_USAGE` → update
`skills/asbuilt-gate/SKILL.md` in the same change or `drift.test.ts` fails. Also update the
docs that currently carry this safety as prose (docs/comprehension-workflow.md "two don'ts",
prime template caution in `skills/sdlc-prime/SKILL.md` — prime's contract pins live in
`tests/prime-registration.test.ts`, check them before rewording).

**Tests:** fixture — skeleton a repo, fold an enrichment, re-run skeleton → assert refusal +
intact prose; `--force` → assert regeneration.

### 3. `claw-cs26` — extract.ts bare-name call-edge false positives (deterministic layer emits false facts)

**Live repros:** r2mcp — `Semaphore.release` resolved as callee of `db.ts`/`migrations.ts`
which actually call pg `PoolClient.release()`; this fed a false consumption claim into a
generator artifact that a judge had to catch (BACKFILL-r2mcp-09 round 1 failed accuracy 4).
Slack-bot — `kill` collisions (`copilot-handler`→`run-via-webterm#kill`), caught at
generation time only because the dispatch prompts now carry an edge-trust warning. Same
family: `lang.ts`'s four adapter object-literal methods share bare names (`classify`,
`nameOf`…) and self-extraction collapses them (SPEC-053 2c artifact, unexplained_behaviors).

**Fix direction (the spec's key decision):** make resolution conservative — e.g. method-name
callees (or all cross-file matches with >1 candidate… today only exactly-1-candidate
resolves, but the single candidate can still be *wrong*, as Semaphore.release shows) resolve
only same-file, else `resolved: null`. Current logic is in `extractGraph`'s edge mapping
(`byName` + `sameFile` preference).

**⚠️ The design tension nobody has written down until now:** any resolution change **changes
manifest bytes** → `manifestHash` moves → every live bundle's `graph_hash` pins go stale-ish
and the golden fixture manifests + `lang-extract.test.ts` edge pins must be re-pinned. This
collides with the "TS wobble" anti-pattern from SPEC-053 — but that anti-pattern guards
against *accidental* churn; a semantic correction is legitimate **if done as a declared,
coordinated migration**: (a) re-pin golden fixtures + lang edge tables deliberately with
hand-verification, (b) plan a refresh pass across the three live bundles (refresh regenerates
machine zones and updates `graph_hash` pins; enriched prose and staleness flags are
content-hash-based and should NOT churn — verify that claim on one bundle before running all
three), (c) the SPEC-053-style old-vs-new byte-identity check will legitimately FAIL for
edges — the spec must say so and pin the *symbols* section as unchanged instead. Also decide
whether viz's file-links (built from resolved edges) need a rebuild note.

### 4. Test-source classification (Dustin's find, filed same day — fits the same migration)

Concepts don't classify test sources: co-located tests (slack-bot `src/file-handler.test.md`)
render as `type: Module, tags: [src, …]` — indistinguishable from business logic to any
structured consumer; r2mcp's tests are distinguishable only by directory-name accident. Fix
via per-language test-convention predicates in `lang.ts` (TS `*.test.ts`/`*.spec.ts`/test
dirs; Go `*_test.go`; Java `src/test/`/`*Test.java`; Python `test_*.py`/`tests/`), stamped
either in the manifest (schema evolution — same migration class as cs26, decide together) or
at render time (`type: Test` + `test` tag; OKF §4.1 permits producer-defined types; needs the
same coordinated bundle-regeneration pass cs26 already requires). Viz must then badge/group by
classification, not its `startsWith("tests/")` path heuristic. See the beads issue filed
2026-07-06 for the full write-up. **Recommendation: make this the 4th AC — it rides cs26's
migration for free.**

## Out of scope (tracked, don't scope-creep — unless the session finds them nearly free)

- Backfill self-sufficiency: embed the verbatim backfill generator/judge dispatch templates
  (incl. the edge-trust warning + citation-universe-replaces-slice line), the `git init`
  precondition, and the standalone evidence-dir convention into `skills/asbuilt-gate/SKILL.md`
  § Backfill mode. (Currently only in claudeclaw campaign records; a cold session off this
  machine re-derives them. Cheap and high-value — natural 4th AC if it fits.)
- refresh.ts baseline guard (extract-first erases drift detection — docs fixed at be2ef33;
  a tool-level warning would be better).
- `prime --compact` variant; non-TS judge calibration campaign; claw-efne viz productization;
  claw-dp14 (claudeclaw evidence hygiene, not this repo).

## Verification recipes that already exist (reuse, don't reinvent)

- **Byte-identity check:** run old extractor (`git show main:asbuilt/src/extract.ts` +
  siblings, or a main checkout) and branch extractor against `~/projects/r2mcp` at the same
  HEAD; `cmp` the outputs. **Commit before A/B checkout games** — an uncommitted refactor was
  destroyed by exactly this dance once (2026-07-06).
- **Backfill/audit loop:** speculator `docs/comprehension-workflow.md`; worked example with
  every retry documented: claudeclaw `docs/specs/asbuilt-living-kb/evidence/backfill03-14-campaign.md`
  (+ `slackbot-campaign.md` incl. the re-audit addendum).
- **Gate mechanics for the spec run:** SPEC-052/053 evidence dirs in claudeclaw
  `docs/specs/{sdlc-prime,asbuilt-multilang}/evidence/` — including gate-3-review.yml's
  three-round history (evidence records must reproduce on branch tip; the reviewer re-runs
  your commands).

## Session boot checklist

1. `bd show claw-nybt claw-i7fn claw-cs26` (+ `bd ready` for anything new).
2. `cd ~/projects/claudeclaw && /sdlc start` → SPEC-054 "asbuilt toolchain hardening"
   (worktree, epic = a fresh umbrella or reuse the three issues as stories at implement time).
3. Spec the three fixes with the cs26 migration plan as a first-class section (it's the one
   with blast radius); Gates 1→2a→implement→2/2b/2c-shadow/3→4→close→release 2.16.0.
4. After release: re-fold/cleanup pass on the slack-bot live case (nybt), and if cs26 shipped,
   the coordinated bundle refresh pass (r2mcp, slack-bot, claudeclaw) + fixture re-pin audit.
