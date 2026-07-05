# Handoff — Comprehension Modules: post-v2.13.0 continuation

> Written 2026-07-05 at the end of the As-Built delivery session, for a fresh session to
> continue work on Speculator's comprehension modules specifically. Read this first, then the
> "Key artifacts" list at the bottom. Work is tracked in the **claudeclaw** beads workspace
> (this repo's local tracker was retired 2026-06-13).

## Where things stand (the short version)

The entire As-Built plan shipped in one arc, 2026-07-04 → 2026-07-05, as four claudeclaw specs:

| Spec | Delivered | Where |
|---|---|---|
| SPEC-048 | Shadow comprehension gate: deterministic code-graph manifest (web-tree-sitter), OKF skeleton bundles, mechanical citation checks (`symbol_exists`/`span_valid` blocking, computed unexplained list), generator/judge split with blinding + invoker stamping | claudeclaw `scripts/asbuilt/` (reference impl) |
| SPEC-049 | Living KB: fold-in (sole enriched-zone writer, provenance ratchet), staleness refresh, backfill mode, real-Graphify cross-validation lane (`graphifyy==0.9.6`), OKF completions (log.md/citations/tags), fence-aware markdown scanning | same, + live bundles |
| SPEC-050 | Validation campaign: calibration vs the 47-example corpus (mean divergence 0.5, **no needs_tuning**, misses err strict-never-charitable), test-retest sigma **0.162** (accuracy & spec_fidelity zero-variance across 5 reps; safety factor 7.8), legacy-vs-shadow comparison (shadow 68/68 citations machine-valid vs legacy 21/43 + 4 genuine span errors), Gate-3 consumption contract | claudeclaw `docs/specs/asbuilt-validation/evidence/` |
| SPEC-051 | **Speculator v2.13.0 released** (repo tag + marketplace + local cache): `gates.comprehension.mode: legacy \| asbuilt`, legacy default byte-inert, self-contained `asbuilt/` package port, plugin agents + `asbuilt-gate` skill, rubric As-Built section with the measured record | this repo |

Live proof points: the gate failed SPEC-050's own campaign artifact at 6.8 (caught a VALIDATION.md
overclaim + an undisclosed sampling limitation), passed 7.9 after substance fixes; the released
plugin tooling gated its own port at 7.5; r2mcp's bundle (101 concepts, 2 accuracy-audited) is
merged to its main. All repos pushed; all four specs compacted into claudeclaw's
`SYSTEM-SPEC-speculator.md` (~250 lines, incl. one amendment: SPEC-051 superseded the
claudeclaw-local-only constraint).

## The two-copies reality (read before writing any code)

The toolchain now exists **twice**:

- **Reference implementation:** claudeclaw `scripts/asbuilt/` + `.claude/agents/asbuilt-*` +
  `.claude/skills/asbuilt-gate/` — where the four specs developed it.
- **Shipped copy:** this repo's `asbuilt/` + `agents/asbuilt-*/` + `skills/asbuilt-gate/` —
  ported at claudeclaw SHA `7f81a6b` (recorded in the T1 port commit), fidelity-verified
  module-by-module, with a portability hygiene test (no claudeclaw strings).

**No sync mechanism exists.** SPEC-051 recorded the source SHA and called divergence "a
documented follow-up burden, not an accident" — but the burden is now real: any further
comprehension work must decide, per change, whether it lands (a) plugin-first (this repo is now
the product home; claudeclaw consumes the plugin eventually), (b) reference-first + re-port, or
(c) plugin-only with the reference frozen as a historical artifact. **Recommendation: decide
this ONCE at the start of the next session and write it into the first new spec** — option (a)
plugin-first with claudeclaw migrating to consume the plugin copy is the natural end-state, but
it needs claudeclaw's gate flow repointed and is its own small spec.

## Open work, prioritized (all tracked in claudeclaw beads)

**Measurement follow-ups (block umbrella `claw-l5pa`; VALIDATION.md condition 5):**
1. `claw-u806` — **band-edge sigma study.** Sigma 0.162 was measured on a strong 8.x artifact;
   near-threshold (6.8–7.2) variance is unmeasured, and the rubric's borderline caveat exists
   because of exactly this gap. Protocol is mechanical: reuse
   `docs/specs/asbuilt-validation/evidence/dispatches/` (claudeclaw) with a borderline-band
   artifact (the corpus's 4-6-band examples, or a deliberately mediocre real artifact).
2. `claw-6yst` — **human anchoring of the accuracy corpus subset.** The corpus is LLM-generated
   and LLM-band-verified; Dustin hand-verifying even the 4 plausible-but-wrong accuracy cases +
   letter-vs-spirit fidelity cases converts consistency evidence into ground truth. This one
   needs the human — prepare the excerpts for review, don't simulate it.
3. `claw-e36v` — **9-10-band calibration** for spec_fidelity/ac_coverage/scope_containment
   (the deterministic sample only included the 9-10 band for accuracy; the gate's own judge
   caught this omission — that's how it got disclosed).

**Polish (P4, small):**
- `claw-0vix` — verify-evidence.sh prefers the legacy evidence filename when both exist (should
  read `gates.comprehension.mode`); add a `grep -F` wiring guard for the rubric's verbatim
  borderline sentence (currently heading-only pin).
- `claw-xpgk` — symlink-aware `snapshotDir` in the non-interference test; graphify-check
  JSON.parse diagnostics; suppress the zero-count Refresh log bullet on sha-only manifest change.
- `claw-n3e4` — fold-time warning when a draft's explanation contains a raw enriched-heading
  line outside a fence.

**Unwired ops (claudeclaw side):**
- `refresh.ts` is NOT yet a step in `memory-graph-refresh.sh` — staleness only updates on
  manual runs or gate passes. One-line ops change + health-check run (offered, deferred).

**Bigger directions (no spec yet — candidates for the next `/sdlc start`):**
- **Close-time fold-in wiring:** the plugin's `/sdlc close` does NOT invoke `fold.ts` — the
  living-KB loop (gate → audit → fold at close) ran manually in claudeclaw. Wiring fold into
  `sdlc-close`/`asbuilt-gate` when `mode: asbuilt` + a bundle exists is the missing piece that
  makes knowledge accrual automatic for plugin consumers.
- **Plugin-first consolidation** (the two-copies decision above) + repoint claudeclaw's local
  skill/agents at `${CLAUDE_PLUGIN_ROOT}`.
- **Legacy scorer retirement path:** VALIDATION condition 4 keeps legacy available; a future
  default-flip (`mode: asbuilt` default, or asbuilt-only) is a product decision that should wait
  for the band-edge sigma + at least one external consumer run.
- **Risk-level-bound enablement** (ROADMAP backlog): auto-enable Gate 2c for
  `risk_level: high|critical` — pairs naturally with the measured mode.
- **Bundle-consuming preamble for ALL reviews:** Gate 3 consumption contract exists; extending
  concept-reads to sessions/other gates (the "token tax" win) is unexplored in the plugin.
- Pipeline-wide findings from the 2026-07-04 review that are *adjacent* but not comprehension:
  2a/2b judges still unblinded + self-stamping; Gate-2 evidence never re-executed. Don't scope-
  creep them into comprehension work, but don't forget them either.

## Hard constraints / gotchas (do not relearn these)

- **MANIFESTO.md (modified, unstaged) and PRINCIPLES.md (untracked) in this repo are Dustin's
  in-progress reframe rewrite. NEVER stage, commit, format, or touch them.** Every SPEC-051
  commit was staged by explicit path for this reason; pre/post hashes live in claudeclaw
  `docs/specs/asbuilt-upstream/reframe-docs-pre-hashes.txt`.
- **Three-step release** (RELEASE.md): repo tag → marketplace (`~/projects/claude-plugins`) →
  local cache + `installed_plugins.json`. Docs-only changes need no bump. Current cache: 2.13.0
  only (older versions pruned 2026-07-05).
- **The drift test is merciless by design:** any CLI flag change must update the module's
  `CLI_USAGE` export AND `skills/asbuilt-gate/SKILL.md` together (`asbuilt/tests/drift.test.ts`).
- **Blinding is mechanically enforced:** the judge agent file must never contain threshold
  digits or config references (grep-pinned); the evidence assembler exits 2 on judge files
  carrying `threshold`/`result` keys at any nesting depth. Invoker stamps results, always.
- **Study discipline** (now crystallized in SYSTEM-SPEC-speculator via SPEC-050): pre-register
  samples before dispatching, blind the inputs (strip band/score mentions from corpus prose —
  calib-11 leaked via inline prose last time), persist every dispatch under
  `evidence/dispatches/`, record failed dispatches, budget with headroom.
- **Determinism rules:** no timestamps in generated artifacts (log.md is the one dated file,
  via `--date`); codepoint sort, never localeCompare; exact integer arithmetic for weighted
  scores (IEEE754 summation mis-rounds 8.4% of dim combinations); fence-aware heading scanning
  via `md.ts` everywhere.
- **The nested fixture repo** (`asbuilt/tests/fixtures/fixture-repo`) self-seeds via `seed.sh`;
  never commit its `.git` (gitlink hazard — run tests only after staging, or re-add as files).
- **graphifyy is `pip install graphifyy` (0.9.6), CLI name `graphify`** — the npm package named
  graphify is an unrelated 2015 library. Its id normalization: lowercase + collapse every
  punctuation run to a single underscore, single pass (empirically pinned in graphify-check.ts).
- **bun quirk:** `execFileSync` needs `env: process.env` passed explicitly when tests mutate env.
- Speculator work is tracked in **claudeclaw beads** (`bd` from claudeclaw); this repo's
  `.beads/` is retired.

## Key artifacts to read at session start

1. This repo: `rubrics/comprehension.md` (§ As-Built mode), `skills/asbuilt-gate/SKILL.md`,
   `lib/gates.md` (comprehension row + touchpoints), `CHANGELOG.md` (2.13.0 entry).
2. claudeclaw: `docs/specs/SYSTEM-SPEC-speculator.md` (the crystallized behavior record —
   Comprehension Shadow Gate section + its three subsections), and
   `docs/specs/asbuilt-validation/evidence/VALIDATION.md` (the verdict + five conditions).
3. Design source: claudeclaw `docs/superpowers/specs/2026-07-04-asbuilt-knowledge-system-design.md`.
4. Campaign raw data (for any new study): claudeclaw
   `docs/specs/asbuilt-validation/evidence/{calibration-run.yml,judge-sigma.yml,legacy-shadow-comparison.md}`.
5. `bd show claw-l5pa` for the live dependency tree of open follow-ups.

## State snapshot (2026-07-05, end of session)

- Repos: speculator main `85447d2` (docs sync, post-v2.13.0 tag `6353068`) · claude-plugins
  `e3f4273` · claudeclaw `098e8fe` · r2mcp `c17102f` — all pushed, all clean (except the two
  reframe docs, intentionally).
- Worktrees/branches: all As-Built worktrees and branches cleaned up; claudeclaw retains only
  `worktree-r2mcp-phase-5-breadcrumbs` (unrelated, in-flight).
- Plugin cache: 2.13.0 only; `installed_plugins.json` points at it. **Sessions started before
  the release still hold the 2.12.0 skill set — new sessions load 2.13.0 automatically.**
- Bundles live: claudeclaw `docs/asbuilt/` (52 concepts, 5 fully-audited), r2mcp `docs/asbuilt/`
  (101 concepts, 2 accuracy-audited, merged to main).
