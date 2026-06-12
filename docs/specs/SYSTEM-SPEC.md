# System Specification

<!-- This document is automatically maintained by the spec-compactor agent. -->
<!-- Do not edit manually — changes will be overwritten at next compaction. -->
<!-- Each behavior entry includes a [from: SPEC-XXX] provenance trail. -->

## Pipeline Gates

- Gate 2b (Eval Quality Scoring) is an opt-in LLM-as-judge gate that runs between Gate 2 and Gate 3, scoring test suites as faithful instruments of their spec's acceptance criteria. [from: SPEC-001]
- Gate 2b is opt-in via `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`; it is disabled by default. [from: SPEC-001]
- When `gates.eval-quality.enabled: false` (default), the `sdlc-run` pipeline skips Gate 2b and proceeds directly from Gate 2 to Gate 3. [from: SPEC-001]
- When `gates.eval-quality.enabled: true`, the `sdlc-run` pipeline detects Gate 2 evidence and, if no `gate-2b-eval-quality.yml` artifact exists, dispatches the `eval-quality-scorer` agent before proceeding to Gate 3. [from: SPEC-001]
- Gate 2c (Comprehension Gate) is an opt-in, experimental LLM-as-judge gate that runs as Phase 3b, positioned between Gate 2b (eval quality) and Gate 3 (review). [from: SPEC-002]
- Gate 2c is opt-in via a global `gates.comprehension.enabled` flag (default `false`); it is disabled by default and labeled experimental. [from: SPEC-002]
- When `gates.comprehension.enabled: false` (default) or absent, `sdlc-run` position detection skips Phase 3b entirely; Gate 4 records `n/a` for Gate 2c and no comprehension evidence is required anywhere in the pipeline. [from: SPEC-002]
- When `gates.comprehension.enabled: true`, Gate 2b is satisfied or disabled, and no `gate-2c-comprehension.yml` exists, `sdlc-run` position detection selects Phase 3b and drives the phase from `references/phase-comprehension.md`. [from: SPEC-002]
- `sdlc-run` position detection gains a failed-2c resume row that mirrors the 2a/3a retry pattern, in addition to the Phase 3b entry row. [from: SPEC-002]

## Eval Quality Scorer

- The `eval-quality-scorer` agent reads the spec and test files, scores the test suite against `rubrics/eval-quality.md`, and emits a YAML evidence artifact at `evidence/gate-2b-eval-quality.yml`. [from: SPEC-001]
- The `gate-2b-eval-quality.yml` artifact contains all 7 dimension scores, an overall weighted score, a pass/fail result against the 6.5 threshold, and blocking/recommended/advisory flags. [from: SPEC-001]
- A test suite that tests only implementation artifacts (e.g., HTTP status codes rather than behavioral outcomes) scores below 6.5 and generates blocking or recommended flags citing behavioral specificity or intent fidelity concerns. [from: SPEC-001]
- A test suite with comprehensive behavioral assertions mapped to each acceptance criterion scores >= 6.5 with all 7 dimensions scoring >= 4. [from: SPEC-001]

## Eval Quality Rubric

- `rubrics/eval-quality.md` defines a 7-dimension rubric scoring test suites on: AC coverage, behavioral specificity, intent fidelity, sensitivity, scenario completeness, assertion density, and test independence. [from: SPEC-001]
- The rubric includes scored calibration examples per dimension (band-based: low-score and high-score examples per dimension) to ensure LLM judge reliability. [from: SPEC-001]
- The pass threshold for Gate 2b is 6.5 (lower than Gate 1's 7.0 threshold, reflecting the genuine difficulty of achieving high eval quality on first pass). [from: SPEC-001]

## Gate Check Skill

- The `gate-check` skill recognizes `gate=eval-quality` as a valid gate identifier and knows how to collect evidence for it. [from: SPEC-001]
- When `gate-check` is invoked with `gate=eval-quality` and `gate-2b-eval-quality.yml` exists with `result: pass`, the skill reports the gate as passing. [from: SPEC-001]
- When `gate-check` is invoked with `gate=eval-quality` and `gate-2b-eval-quality.yml` is absent, the skill dispatches the `eval-quality-scorer` agent. [from: SPEC-001]
- The `gate-check` skill recognizes `comprehension` as a valid gate identifier and knows how to collect evidence for it. [from: SPEC-002]
- When `gate-check` is invoked with `gate=comprehension` and no `gate-2c-comprehension.yml` exists, the skill dispatches the `comprehension-scorer` agent under the cold-read contract — the agent receives the spec and the diff only, never the implementing session's reasoning. [from: SPEC-002]
- The `comprehension-scorer` agent writes its evidence artifact to `{spec_dir}/{spec_name}/evidence/gate-2c-comprehension.yml`. [from: SPEC-002]

## Spec Template

- `templates/spec-template.md` includes a comment in the Acceptance Criteria section explaining how AC IDs map to test names and why this traceability improves Gate 2b Dimension 1 (AC Coverage) scores. [from: SPEC-001]
- `templates/spec-template.md` includes an optional `domain:` frontmatter field with a comment explaining it is required at close time in split-layout projects. [from: SPEC-003]

## Comprehension Scorer

- The `comprehension-scorer` agent operates under a cold-read constraint: it receives the spec and the diff only, and must never receive the implementing session's reasoning — the cold-read constraint is the gate's core validity guarantee. [from: SPEC-002]
- The `comprehension-scorer` agent generates a per-AC explanation artifact ("what does this code do, and does it match what the spec intended?") and scores it on four dimensions. [from: SPEC-002]
- On a passing comprehension score, the artifact becomes the Gate 3 reviewer's preamble so that review starts from understanding rather than re-derivation. [from: SPEC-002]

## Comprehension Rubric

- `rubrics/comprehension.md` defines the canonical `gate-2c-comprehension.yml` schema with 4 dimension scores (`ac_coverage`, `accuracy`, `scope_containment`, `spec_fidelity`), recorded `weights:`, `per_dimension_minimum`, threshold (7.0), result, and flags. [from: SPEC-002]
- The recorded overall score in `gate-2c-comprehension.yml` is mechanically recomputable from the recorded weights and dimension scores. [from: SPEC-002]
- The `comprehension-scorer` agent references the rubric schema rather than restating it. [from: SPEC-002]

## Comprehension Failure Routing

- Failure routing for Gate 2c is dimension-aware: artifact-quality dimensions (`ac_coverage`, `accuracy`, `scope_containment`) permit exactly one re-dispatch with prior flags as feedback. [from: SPEC-002]
- A `spec_fidelity` dimension score below `per_dimension_minimum` escalates to a human immediately with the artifact as evidence; no re-dispatch occurs, because re-dispatch cannot fix an implementation that does not match spec intent. [from: SPEC-002]
- The asymmetric routing logic (re-dispatch-once vs. escalate-immediately) is stated identically in the phase reference, gate-check dispatch section, and rubric to prevent routing ambiguity. [from: SPEC-002]

## Doctor Init Template

- `sdlc-doctor --init` template includes a commented `gates.comprehension` block (`enabled: false`, `threshold: 7.0`, `per_dimension_minimum: 5`) labeled experimental. [from: SPEC-002]
- The v2.9.0 "enabled but not wired" doctor WARN for `gates.comprehension` is removed now that Gate 2c is wired. [from: SPEC-002]

## Conditional Gate Surfaces

- Gate 4 (evidence-package), `sdlc-status`, the close-flow PR-body evidence table, and the pipeline summary all conditionally include Gate 2c when `gates.comprehension.enabled: true`, mirroring the 2a/2b conditional handling. [from: SPEC-002]
- When comprehension is enabled and passing evidence exists, `/sdlc close` records the comprehension result in `gate-4-summary.yml` and includes a Gate 2c row in the PR-body evidence table. [from: SPEC-002]

## Gate Wiring Registry

- `lib/gates.md` comprehension row reflects wired-experimental status (previously "NOT wired"). [from: SPEC-002]
- `tests/test-gate-wiring.sh` applies the full Layer-A assertion set to the comprehension registry row, replacing any prior negative guards; the full suite passes. [from: SPEC-002]

## README and Roadmap

- The README presents Gate 2c in the pipeline description ("4 required + 3 opt-in"), the gate table, and a dedicated enablement subsection labeled experimental. [from: SPEC-002]
- ROADMAP status tables reflect Gate 2c as shipped-experimental, with the calibration corpus as the open item (moved from "designed, not built"). [from: SPEC-002]

## System Spec Layout

- A project's system spec is **split** when `{spec_dir}/SYSTEM-SPEC.md` contains a valid Domains table (a markdown table whose header row contains `Domain` and `File` columns) OR any `{spec_dir}/SYSTEM-SPEC-*.md` sibling exists alongside it; otherwise the project is **single-file**. [from: SPEC-003]
- Layout detection degrades safely: a `SYSTEM-SPEC.md` whose Domains table is malformed or absent, with no domain siblings, is treated as single-file; detection never errors and never blocks, and on any ambiguity falls back to single-file. [from: SPEC-003]
- The layout detection rule lives in one place (`lib/system-spec-layout.md`) and every SYSTEM-SPEC consumer references it rather than restating it; if the rule changes, all consumers inherit the change. [from: SPEC-003]
- In split layout, all SYSTEM-SPEC consumers read the index plus only the domain file(s) matching the spec's declared `domain:` frontmatter; when the spec declares no `domain:`, the consumer reads the index plus all domain files (the conservative default — correctness is never traded for the token saving). [from: SPEC-003]
- The Gate 1 spec-scorer impact validation and the Gate 2a eval-authoring conflict check both apply the same layout detection and subset read rule when operating on split-layout projects. [from: SPEC-003]

## Compactor

- In split layout, the spec-compactor reads the closing spec's `domain:` frontmatter and appends all behavior entries (with `[from: SPEC-NNN]` provenance) to `{spec_dir}/SYSTEM-SPEC-<domain>.md`; behavior entries are NEVER written to the index file. [from: SPEC-003]
- When a closing spec declares a domain with no existing domain file, the compactor creates `SYSTEM-SPEC-<domain>.md` AND adds a row for it to the index's Domains table in the same compaction step — a domain file without an index row is drift. [from: SPEC-003]
- In split layout, when a closing spec declares no `domain:` field: interactive contexts prompt the author to choose or create a domain; autonomous contexts halt compaction and escalate with the list of existing domains from the index's Domains table; no file is modified before the halt. [from: SPEC-003]
- Guessing a domain when the spec's `domain:` frontmatter is absent is prohibited in all contexts — a behavior filed in the wrong domain corrupts the provenance map that future impact checks rely on. [from: SPEC-003]
- A behavior spanning multiple domains is placed in its primary owner's domain file with a prose cross-reference to the related domain; the entry is never duplicated across files — duplication breaks provenance audits. [from: SPEC-003]
- When an `amends` entry references a behavior living in a different domain file than the closing spec's declared domain, the compactor amends the behavior in place where it lives (the behavior keeps its original owner) and extends its provenance trail there. [from: SPEC-003]
- If split layout is detected via sibling files but the index lacks a Domains table, the compactor repairs the index by adding the table with one row per existing `SYSTEM-SPEC-*.md` sibling before routing. [from: SPEC-003]
- The `spec-compact` skill's `--all` bootstrap mode regenerates the split layout (index plus all domain files, with all provenance trails intact) when the project is split, and regenerates the single file otherwise. [from: SPEC-003]
- In single-file layout, every SYSTEM-SPEC consumer behaves byte-for-byte as it did before layout detection was introduced — no index is created, no domain prompts appear, and no migration is performed or suggested as a side effect of normal operation. [from: SPEC-003]
