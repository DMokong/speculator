# Phase 1: Spec Scoring — Mechanical Steps

These are the procedural steps for Phase 1. The trust ladder, self-improvement philosophy, and boundary constraints are in the main SKILL.md.

## Read Configuration

Read the project config from `.claude/sdlc.local.md` and look for a `run:` block. If no `run:` block exists, use these defaults:

```yaml
run:
  self_improvement_trigger: 8.0
  full_auto_threshold: 7.8
  guided_threshold: 7.0
  max_spec_retries: 3
  max_code_retries: 3
  intent_verifiability_min: 8
```

## Score the Spec

Invoke the `spec-score` skill → produces `evidence/gate-1-scorecard.yml`.

**Scorer context hygiene**: the `spec-score` skill dispatches the spec-scorer agent with ONLY the scoring weights and dimension minimum (`scoring.weights`, `scoring.dimension_minimum`) — never the config file path, the gate threshold, or the `run:` trust-ladder values. A judge that reads the pass threshold before scoring invites score-attraction bias. The skill stamps `threshold` and `result` into the scorecard post-dispatch. The `run:` block read above is for THIS orchestrator's trust decision only — do not forward it to any scoring agent.

Read the scorecard and extract:
- `overall` score (weighted average)
- `intent_verifiability` dimension score
- All `flags` (blocking, recommended, advisory)

Read the spec YAML frontmatter and extract:
- `risk_level` (default: `medium` if absent)

## Record Trust Decision

Update the spec's YAML frontmatter with the trust evaluation result:

```yaml
autonomy_mode: full_auto | guided | stopped
trust_score: 8.3
trust_attempts: 1
```

## If Stopped

When the pipeline stops due to insufficient spec quality:

1. Create a beads issue tagged `spec-rework`:
   ```bash
   beads create --title "Spec rework needed: {spec_title}" \
     --description "Score: {score}, unresolved flags: {flag_list}, weakest: {dimensions}" \
     --priority P1
   ```
2. Exit with a message listing:
   - The final score
   - Unresolved blocking flags
   - The weakest dimensions with their scores
   - Suggestion: "Revise the spec and run `/sdlc run` again to resume."

## Commit

Commit all scorecard(s) and spec updates from this phase:
```
chore(sdlc): gate 1 — spec scored {score}, mode: {autonomy_mode}
```
