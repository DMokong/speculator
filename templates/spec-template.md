---
id: SPEC-XXX
status: draft
author:
date:
epic:
worktree:
risk_level: medium
impact_rating: none          # none | low | moderate | high
amends: []                   # list of {section, behavior, change, reason} objects
# amends example:
#   - section: "Auth"
#     behavior: "Sessions use short-lived tokens (24h expiry)"
#     change: "Extended to 7-day refresh tokens"
#     reason: "Mobile UX"  # optional
---

## Problem Statement

What problem does this solve? Why now?

## Requirements

- [ ] R1:
- [ ] R2:
- [ ] R3:

## Acceptance Criteria

<!-- Gate 2b tip: name your tests after these AC IDs (e.g., test_ac1_...) to help
     the eval-quality scorer map tests to criteria. Each AC should have at least
     one test that verifies its observable outcome, not just its surface behavior. -->
- [ ] AC1: Given [precondition], when [action], then [expected result]
- [ ] AC2: Given [precondition], when [action], then [expected result]

## Intent & Anti-Patterns

Why does this feature exist? What outcome matters beyond the surface behavior?

### Anti-Patterns
- What approaches should be explicitly avoided?
- What would "meeting the letter but missing the spirit" look like?

### Critical User Journeys
- What user journeys must this feature support or not break?

## Constraints

## Out of Scope

## Impact Declaration

<!-- If SYSTEM-SPEC.md exists, declare what this spec changes -->
<!-- impact_rating and amends in frontmatter are auto-populated by /sdlc start -->
