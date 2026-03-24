# Changelog

All notable changes to this project will be documented in this file.

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
