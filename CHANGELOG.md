# Changelog

All notable changes to this project will be documented in this file.

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
