# Acceptance Criteria Quality Rubric

You are evaluating whether the acceptance criteria in a spec are well-formed and verifiable.

## For Each Acceptance Criterion, Check:

### Structure (pass/fail)
- Does it describe a specific scenario with preconditions, actions, and expected results?
- Is it atomic (tests one thing, not a compound condition)?

### Measurability (pass/fail)
- Can the outcome be objectively observed (not "feels fast" or "looks good")?
- Are specific values given where quantities matter (timeouts, limits, counts)?

### Verification Evidence
- For each AC, what evidence would prove it passed?
  - Automated test output
  - Manual test result with specific steps
  - System metric or log entry

## Output

For each AC, produce:

```yaml
- ac_id: AC1
  structure: pass | fail
  measurability: pass | fail
  verification_method: "automated test" | "manual test" | "metric" | "log"
  notes: "any observations"
```

Overall: all ACs must have structure=pass and measurability=pass for the gate to pass.
