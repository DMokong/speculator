# Code Review Rubric

Gate 3 checks whether the implementation has been reviewed for correctness, maintainability, and safety. This gate uses a checklist model: each check is pass/fail, and all six must pass with no blocking issues for the gate to pass.

Unlike Gate 2 (automated quality signals), Gate 3 is a judgment call — a human or agent reads the code and evaluates it against the spec and engineering standards.

> **Rubric path:** `${CLAUDE_PLUGIN_ROOT}/rubrics/review.md`
> **Evidence artifact:** `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`

---

## Checks

### 1. Correctness

Does the implementation actually do what the spec says it should do?

Things to look for:
- **Spec intent match**: Walk through each requirement in the spec and confirm the code implements the described behavior, not just something that superficially resembles it. Pay attention to boundary values, ordering, and conditional logic.
- **All code paths covered**: Check that branches, edge cases, and error returns produce the correct outcome. If the spec says "retry 3 times," confirm the code retries exactly 3 times (not 2, not unbounded).
- **Data integrity**: Confirm that data transformations (parsing, mapping, serialization) preserve meaning. A field renamed during refactoring but not updated in all consumers is a correctness bug.

```
correctness: pass | fail
```

### 2. Error Handling

Are failure modes addressed? Do errors surface clearly rather than being swallowed silently?

Things to look for:
- **No silent failures**: Catch blocks should log, return an error, or re-throw — never swallow exceptions with an empty catch or a bare `pass`. Check for ignored return values from functions that signal failure via return codes.
- **User-facing errors are actionable**: When an error reaches the user (or an upstream caller), the message should identify what went wrong and suggest what to do. "Upload failed" is bad; "Upload failed: file exceeds 20MB limit" is good.
- **Graceful degradation**: When a non-critical dependency fails (e.g., a metrics endpoint is down), the primary operation should still succeed. Check that the code distinguishes between fatal and non-fatal errors.

```
error_handling: pass | fail
```

### 3. Readability

Could another developer understand this code without the author explaining it?

Things to look for:
- **Naming and structure**: Variables, functions, and files have names that convey purpose. Logic flows top-to-bottom without requiring the reader to jump between distant sections to understand a single operation. Functions do one thing.
- **Comments explain "why," not "what"**: Code should be self-documenting for what it does. Comments should explain non-obvious decisions, workarounds, or constraints that would otherwise puzzle a future reader.
- **Consistency with codebase conventions**: New code should follow the patterns already established in the project (naming conventions, file organization, error handling style). Deviations from convention need a justifying reason.

```
readability: pass | fail
```

### 4. Security

Are there obvious vulnerabilities introduced by this change?

Things to look for:
- **Injection and unsanitized input**: User-supplied data used in SQL queries, shell commands, file paths, or HTML without escaping or parameterization. Check for template string interpolation with untrusted input.
- **Authentication and authorization gaps**: New endpoints or operations that skip auth checks. Elevation-of-privilege paths where a regular user can access admin functionality. CORS or token validation that is too permissive.
- **Secret exposure**: API keys, tokens, passwords, or credentials hardcoded in source, logged to stdout, or included in error messages. Check that secrets come from environment variables or secret managers, not from code or committed config files.

```
security: pass | fail
```

### 5. Performance

Does the implementation avoid introducing unnecessary bottlenecks?

Things to look for:
- **N+1 queries and unbounded loops**: Database calls or API requests inside a loop that could be batched. Loops over collections with no upper bound or pagination that could grow without limit in production.
- **Unnecessary work**: Repeated computation that could be cached or hoisted out of a loop. Loading entire datasets into memory when only a subset is needed. Synchronous blocking where async is available and appropriate.
- **Resource cleanup**: File handles, database connections, and network sockets that are opened but not closed in all code paths (including error paths). Missing timeouts on external calls that could hang indefinitely.

```
performance: pass | fail
```

### 6. Spec Alignment

Does every spec requirement have corresponding implementation, and is there anything implemented that the spec didn't ask for?

Things to look for:
- **Requirement traceability**: For each requirement (R1, R2, ...) and acceptance criterion (AC1, AC2, ...) in the spec, identify where in the code it is implemented. Any requirement without a clear implementation is a gap.
- **No gold-plating**: Features, options, or behaviors that weren't in the spec should be flagged. Extra work increases surface area for bugs and maintenance burden without the review that spec-driven work receives. "Nice to have" additions belong in a future spec.
- **Out-of-scope compliance**: Check that the implementation respects the spec's out-of-scope section. If the spec explicitly deferred something (e.g., "Phase 2: custom plugin"), the implementation should not include it.

```
spec_alignment: pass | fail
```

---

## Gate Decision

The gate passes only when **both conditions** are met:

1. **All 6 checks pass** (correctness, error_handling, readability, security, performance, spec_alignment)
2. **`blocking_issues` is empty** — no unresolved blocking issues remain

If either condition fails: `result: fail`

If both conditions pass: `result: pass`

When requesting changes, clearly identify which checks failed and list blocking issues so the author knows exactly what to fix.

---

## Evidence Output Format

Write evidence to `{spec_dir}/{spec_name}/evidence/gate-3-review.yml`:

```yaml
gate: review
reviewer: "<name or agent>"
review_method: "manual" | "agent-assisted" | "pr-review"
timestamp: 2026-03-07T12:00:00Z
result: pass | fail
checks:
  correctness: pass | fail
  error_handling: pass | fail
  readability: pass | fail
  security: pass | fail
  performance: pass | fail
  spec_alignment: pass | fail
observations:
  - "..."
blocking_issues:
  - "..."  # must be empty for gate to pass
```

### Field Definitions

- **reviewer**: The person or agent who performed the review. Use a name, not a role.
- **review_method**: How the review was conducted:
  - `manual` — A human read the code and evaluated it
  - `agent-assisted` — An AI agent performed the review (e.g., via `/sdlc review`)
  - `pr-review` — Review was done as part of a GitHub PR review workflow
- **timestamp**: ISO 8601 timestamp of when the review was completed.
- **result**: `pass` if all checks pass and no blocking issues; `fail` otherwise.
- **checks**: Pass/fail for each of the 6 review dimensions.
- **observations**: Noteworthy findings — things the reviewer noticed that are worth recording, whether positive or negative. Not all observations are blocking.
- **blocking_issues**: Issues that must be resolved before the gate can pass. These are distinct from observations: an observation might note "error messages could be more descriptive" (non-blocking), while a blocking issue would be "catch block on line 42 silently swallows database connection failures" (must fix).
