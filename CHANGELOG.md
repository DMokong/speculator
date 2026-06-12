# Changelog

All notable changes to this project will be documented in this file.

## 2.10.0 — Gate 2c: Comprehension Gate, wired (SPEC-002) (2026-06-12)

The anti-dark-code gate is live: opt-in, experimental, default off. Shipped through Speculator's own pipeline — Gate 1 (8.2, blinded scorer), Gate 2a (failed 6.3 → revised evals → passed 8.0, the feedback loop working as designed), Gate 2 (prompt-only N/A rationale, 141/141 structural), **Gate 2c's first-ever live run (passed 7.8/7.0** — and the cold reader found a real verifier gap on run #1), Gate 3 (review with the comprehension artifact as preamble), Gate 4 (26/26 mechanical verification). SPEC-002 compacted into SYSTEM-SPEC.md (22 behaviors).

### Added
- **Phase 3b: Comprehension (Gate 2c)** — between eval quality and review. A fresh agent cold-reads the spec + diff (never the implementing session's reasoning), writes a per-AC explanation artifact, scores it on 4 dimensions (ac_coverage 0.30, accuracy 0.30, spec_fidelity 0.25, scope_containment 0.15; threshold 7.0). On pass, the artifact is the Gate 3 reviewer's preamble. Enable with `gates.comprehension.enabled: true`
- **Dimension-aware failure routing** — artifact-quality failures re-dispatch once with prior flags; a `spec_fidelity` failure escalates to a human immediately (re-explaining cannot fix a wrong implementation)
- **Canonical gate-2c evidence schema** with recorded weights + per-dimension minimum — mechanically recomputable by `verify-evidence.sh` (which now reads `dimensions:` maps and verifies 2a/2b/2c as scorecards)
- Position-detection rows (3b + 3b-retry), gate-check dispatch, doctor `--init` template block, Gate 4/status/PR-body/pipeline-summary conditional surfaces, registry row + 7 structural-test assertions (suite now 86)

### Changed
- **Trust-ladder thresholds raised on empirical grounds**: `full_auto_threshold` 7.8 → 8.3, `self_improvement_trigger` 8.0 → 8.5 in this repo's config. The first test-retest sigma study (`benchmarks/results/test-retest-sigma.yml`: sigma 0.18–0.24 on polished specs, 0.86 on a draft) showed the old 0.2 band gap was within scorer noise
- Comprehension enabled in Speculator's own repo config — every future spec generates a comprehension artifact, seeding the calibration corpus (the gate's open item)
- Benchmarks: spec-only ablation driver + sigma study script added; vision-judge timeout still blocks full-matrix outcome runs (tracked)

## 2.9.0 — Consolidation Release: gate registry, deterministic verification, scorer blinding (2026-06-12)

Closes out the 2026-06-12 multi-agent review. Every change below was implemented, then adversarially re-verified by six independent review lenses (6 blocking + 30 should-fix findings found and fixed before this release).

### Added
- **`lib/gates.md`** — canonical gate registry (7 gates × evidence file, config key, threshold, phase position, rubric, scorer), enforced by test rather than dereferenced at runtime
- **`tests/test-gate-wiring.sh`** — 79-assertion structural test: registry→touchpoint wiring + closure (every gate reference must have a registry row). Mutation-tested against all four historical half-wiring failure modes. Adding a gate now means one registry row + test failures enumerating every remaining touchpoint
- **`scripts/verify-evidence.sh`** — first deterministic verification layer: mechanizes Gate 4's checklist, recomputes scorecard overalls from recorded weights (±0.05), validates result/threshold/minimum consistency, honors overrides. Invoked via `${CLAUDE_PLUGIN_ROOT}` from gate-check; self-tested in CI against dogfood evidence
- **`skills/sdlc-close` + `skills/sdlc-implement`** — close/implement extracted from the router into dedicated skills (single source of truth; close ordering: beads closure → Gate 4 → status+lock release → delivery)
- **Scorer blinding (Gate 1)** — spec-scorer receives only weights, dimension minimum, spec_dir, and risk signals inline; never the config path or any threshold. The invoking skill stamps `threshold`/`result` post-dispatch. Scorecards now record weights, making `overall` mechanically recomputable
- **Opt-in gate awareness** — Gate 4 (evidence-package) requires enabled opt-in gate evidence (2a/2b, forward-compatible 2c); sdlc-status renders conditional opt-in rows; pipeline summary and PR body include enabled opt-in gates
- **Canonical evidence schemas** — gate-3 schema (with `warn` tier) lives in rubrics/review.md; gate-2 schema in rubrics/code-quality.md; schema-versioning grace rules for historical evidence
- **Prompt-only changesets** — N/A-rationale section in rubrics/code-quality.md (structural suites + documented rationale; no invented pseudo-tests)
- **README**: "What a Run Costs" (dispatch counts per phase) and "Interruption & Resume" sections
- **Doctor**: scoring-weights sum-to-1.0 config lint; WARN on unwired `gates.comprehension.enabled`
- **Spec-Bench validation prerequisites**: pinned scorer model with post-map provenance, no-feedback control arm (`improvement_mode: feedback|control|none` + `matrix/feedback-ablation.yml`), production-rubric scoring option, cache-inclusive token accounting (null over fake zeros), CLI honors `runs_per_combination`. 101 tests (34 new since 2.8.1)

### Changed
- `SYSTEM-SPEC.md` moved from repo root to `docs/specs/` — where `{spec_dir}` consumers actually look; impact-awareness and compaction machinery now active in this repo
- Position detection: resume rows for failed opt-in gate evidence (2a/2b retry)
- Phase 2a autonomy mode derives from the recorded trust decision, not re-derived from raw score
- ROADMAP: leaderboard deferred until ≥5 PRDs; drift detection preconditioned on SYSTEM-SPEC corpus; mutation-testing prerequisites documented
- Benchmark published results carry methodology caveats (same-judge feedback loop, no control arm) pending the controlled re-run

## 2.8.1 — Trust Release: distribution resync, hook fix, CI (2026-06-12)

### Fixed
- **Pre-commit gate hook never fired** — `hooks/hooks.json` used permission-rule syntax (`Bash(git commit*)`) as a PreToolUse matcher, which can never match the tool name. Matcher is now `Bash` with commit-only filtering inside the prompt (non-commit Bash calls are approved silently)
- **Doctor's plugin-wiring check was a false WARN on healthy installs** — it grepped `.claude/settings.local.json` for a hook that actually ships auto-registered via the plugin's `hooks/hooks.json`. The check now verifies the plugin hook file; the duplicate-registration `--fix` path is removed
- **README overpromised `/spec doctor --init`** — it claimed `--init` registers the pre-commit hook; the hook registers automatically with the plugin
- **Stale self-descriptions** — `sdlc-run` said "all five phases" (there are seven incl. opt-in gates); README inventory said 8 rubrics (9, incl. the Gate 2c draft); benchmark docs said 57 tests (67)
- **MANIFESTO roadmap caught up to reality** — Spec-Bench harness is shipped, not future work; drift detection's first pieces (impact validation, compaction) shipped in v2.1.0

### Added
- **CI workflow** (`.github/workflows/ci.yml`) — runs all three test suites (eval-intent structure, secrets scan, benchmark pytest) plus a version-consistency check (plugin.json ↔ CHANGELOG top entry) on every push/PR
- **RELEASE.md** — documents the three-step release process (plugin repo → marketplace repo → local cache) with the pre-release consistency checklist and known landmines

### Distribution note
- v2.8.0's "bump version" commit (6703adc) never touched `plugin.json` — the real bump landed in a later commit that was never re-released, so installed caches self-report 2.7.0 inside a 2.8.0-named directory and ship a stale doctor config template. 2.8.1 exists to resync distribution with a version label that maps to exactly one tagged commit. Releases are git-tagged from now on.

## 2.8.0 — Eval-First SDLC: Pre-Implementation Eval Authoring (SPEC-040)

### Added
- **Phase 2a: Eval Authoring** — new pipeline phase between planning and implementation; evals are intent artifacts (markdown files) describing observable user outcomes, stored in `docs/specs/{feature}/evals/`
- **`eval-intent-scorer` agent** — LLM-as-judge that scores eval sets on 4 dimensions: intent coverage, anti-pattern detection, journey completeness, implementation independence; checks SYSTEM-SPEC.md for conflicts and scans prior spec evals for regression signals
- **`eval-authoring` skill** — `/sdlc eval` command for interactive and full-auto eval authoring with feedback loop, partial session recovery, and override support
- **`rubrics/eval-intent.md`** — 4-dimension rubric with calibration bands at 1-3, 4-6, 7-8, 9-10; format matches spec-quality.md
- **`skills/sdlc-run/references/phase-eval-authoring.md`** — Phase 2a reference for the sdlc-run orchestrator
- **Gate 2a** in pipeline position detection — `gate-2a-eval-intent.yml` as the evidence artifact
- **`/sdlc eval` route** in master routing table; `eval-intent` gate in gate-check
- **Opt-in config**: `gates.eval-intent.enabled: true` in `sdlc.local.md`; threshold defaults to 6.5, max_eval_retries to 3
- **SYSTEM-SPEC.md conflict detection** — blocking conflicts with crystallized behaviors surface during authoring; three resolution paths
- **Prior eval regression scanning** — scans `docs/specs/*/evals/` from prior specs; failures are reported, not silently ignored
- **Partial session recovery** — interrupted eval authoring sessions resume from last completed AC via `.eval-session-partial` marker

### Changed
- `sdlc-run/SKILL.md` pipeline position detection table: added Phase 2a row between Phase 2 and Phase 3; Phase 3 condition now requires gate 2a satisfied (or disabled)
- `skills/sdlc/SKILL.md` routing table: added `/sdlc eval` → `eval-authoring` route
- `skills/gate-check/SKILL.md`: added `eval-intent` gate (Gate 2a) to valid gates, status check, and missing-evidence handlers

## 2.7.0 — Gate 2b: Eval Quality Scoring

### Added
- **Gate 2b: Eval Quality Scoring** — optional LLM-as-judge gate that scores the quality of evals/tests in the diff across 7 dimensions: coverage breadth, boundary coverage, negative-case coverage, isolation quality, assertion precision, repeatability, and documentation clarity
- **`eval-quality-scorer` agent** — reads test files from the diff, scores each dimension 1–5, aggregates a weighted overall score, emits blocking/advisory/pass results
- **`eval-quality` rubric** (`rubrics/eval-quality.md`) — 7-dimension scoring rubric with calibration examples and threshold guidance
- **Gate 2b phase detection** in `sdlc-run` — when `gate_2b_eval_quality` is enabled in `sdlc.local.md`, the pipeline inserts Gate 2b between Gate 2 and Gate 3
- **Gate 2b routing** in `gate-check` skill — `gate-check 2b` invokes the eval-quality-scorer agent
- **Opt-in config** — Gate 2b is disabled by default; enable with `gate_2b_eval_quality: true` in `sdlc.local.md`
- **SPEC-001 spec** and Gate 1–4 evidence package committed alongside implementation

## 2.6.0 — Gate 3: Skill Description Eval

### Added
- **Skill description check** in Gate 3 — when `SKILL.md` or `AGENT.md` files appear in the diff, Gate 3 now runs a conditional description eval: generates mental trigger queries (5 should-trigger, 5 near-miss negatives), evaluates undertrigger/overtrigger risk, rates pass/fail/skipped
- **`skill_description` field** in `gate-3-review.yml` schema — `pass | fail | skipped` (skipped when no skill files are in the diff)
- A `fail` on `skill_description` is a blocking issue — undertriggering descriptions render skills useless

### Fixed
- Gate 3 previously had no check for skill quality when specs created or modified SKILL.md/AGENT.md files — description quality was invisible to the review gate

## 2.5.0 — Security Uplift: Mandatory Secrets Scan

### Added
- **Mandatory secrets scan** in code-reviewer agent — 5 categories of grep patterns (high-entropy assignments, known API key formats, connection strings, bearer tokens, base64-encoded secrets) that MUST execute before evaluating the security dimension
- **Auto-fail rule**: Any hardcoded secret is an automatic `fail` with a blocking issue, no discretion
- **"When in doubt, flag it"** principle — false positives are inconvenient; missed secrets are incidents
- **Pass/fail examples** in the review rubric — concrete examples of what good vs bad looks like
- **Test suite**: `tests/test-secrets-scan.sh` with fixtures validating all 5 scan categories (25 tests: 17 true positive + 8 false positive checks)

### Changed
- **Security dimension** in code-reviewer agent expanded from 4 bullet points to structured sub-sections (Secrets, Injection, Auth)
- **Gate-check skill** Gate 3 section now includes explicit mandatory secrets scan step
- **Review rubric** Security section expanded with mandatory scan callout, pattern catalog, and calibration examples

### Fixed
- Code review gate could previously pass with hardcoded credentials if the reviewer didn't happen to notice them during code reading — now an active scan is required

## 2.4.0 — PR Strategy: Compaction Before PR

### Changed
- **PR close strategy**: Compaction now runs on the feature branch *before* PR creation (previously deferred to post-merge manual step)
- SYSTEM-SPEC.md updates are included in the PR diff — no manual `/spec compact` needed after merge
- Both `/sdlc close` and `/sdlc run` Phase 5 updated for the new flow

### Fixed
- Eliminated forgotten-compaction risk when using `close.strategy: pr`

## 2.1.0 — Spec Drift Detection (SPEC-013)

### Added
- **Spec compaction**: `SYSTEM-SPEC.md` as a living document that represents current system behavior
- **Impact rating**: New `impact_rating` and `amends` fields in spec frontmatter
- **Impact validation**: Spec-scorer validates impact declarations against SYSTEM-SPEC.md
- **Auto-compaction**: `/sdlc close` automatically folds shipped specs into SYSTEM-SPEC.md
- **Bootstrap**: `/spec compact --all` processes existing closed specs into initial SYSTEM-SPEC.md
- **spec-compactor agent**: New agent that maintains SYSTEM-SPEC.md integrity
- **impact-awareness rubric**: Decision matrix for impact mismatch detection

### Changed
- `/sdlc close` now produces two commits (merge + compaction)
- `/sdlc start` feeds SYSTEM-SPEC.md as context for impact-aware spec creation
- Spec template includes `impact_rating` and `amends` fields
- Status lifecycle extended: `draft → approved → closed → compacted`

## [1.3.0] — 2026-03-12

### Added
- `/sdlc run` — Autonomous end-to-end pipeline orchestrator with trust-based autonomy modes
- Trust ladder: spec quality score determines Full Auto vs Guided Autopilot vs Stop
- Self-improvement loop: specs scoring < 8.0 go through feedback-driven refinement (built-in practice, not just fallback)
- Code-reviewer agent for Gate 3 self-review (6-point checklist)
- `risk_level` field in spec template (low/medium/high/critical)
- Risk validation in spec-scorer: detects understated risk via keyword scanning
- Pipeline resume: `/sdlc run` detects existing evidence files and resumes from last incomplete phase
- Spec skeleton generation from description (`/sdlc run "feature description"`)

### Changed
- Master router (`/sdlc`) now routes `run` subcommand
- Spec-scorer agent includes risk validation step

## 1.1.0 (2026-03-07)

### Added
- Feasibility and Scope dimensions to spec-quality rubric (5 dimensions total)
- Calibration examples for all scoring bands in every dimension
- Per-dimension minimum scores (default: 5) — any dimension below minimum fails the gate
- Anti-inflation scoring guidance
- Flag severity levels: blocking (gate-failing), recommended, advisory
- Gate 3 code review rubric (`rubrics/review.md`) with 6 checklist items
- Gate 4 evidence package rubric (`rubrics/evidence-package.md`) with completeness checklist
- AC traceability check for Gate 2 (optional, maps ACs to tests)
- Build success, lint, and type checking checks for Gate 2 (optional)

### Changed
- Code-quality rubric expanded from 2 checks to 7
- Acceptance criteria rubric rewritten as Gate 2 sub-rubric for AC traceability
- Default scoring weights redistributed: completeness 0.25, clarity 0.25, testability 0.25, feasibility 0.15, scope 0.10
- Scorecard template updated with new dimension fields, dimension_minimum, and structured flag severity
- Spec-scorer agent updated for 5 dimensions, per-dimension minimums, and flag severity enforcement
- Gate-check skill references rubrics for all 4 gates
- Doctor --init template generates config with 5-dimension weights and expanded code-quality options

## [1.0.0] - 2026-03-06

### Added
- Initial standalone release extracted from claudeclaw
- 6 skills: `/sdlc`, `/sdlc start`, `/sdlc score`, `/sdlc status`, `/sdlc doctor`, gate-check
- 1 agent: spec-scorer (LLM-as-judge for spec quality)
- 3 rubrics: spec-quality, code-quality, acceptance-criteria
- 2 templates: spec template, scorecard template
- Pre-commit hook for gate enforcement warnings
- Spec resolution library with worktree awareness
- `/sdlc doctor --init` for bootstrapping new projects

### Changed
- Generalized memory wiring to work with any Claude Code project (not just claudeclaw)
- Removed claudeclaw-specific checks (SOUL.md, memory file validation)
- Simplified plugin wiring check for marketplace installs
- Added beads CLI availability check
