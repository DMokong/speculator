# Spec Quality Rubric

You are evaluating a software specification for quality. Score each dimension 1-10 using the criteria below.

## Anti-Inflation Guidance

A score of 7 means "good — ready for implementation with minor improvements." A score of 8 means "strong — well-crafted spec." Scores of 9-10 should be rare and reserved for exceptionally thorough, production-grade specifications. Most first-draft specs should score 5-7. Resist the urge to inflate.

---

## Completeness (1-10)

Does the spec contain all required sections with enough substance to guide implementation?

- **1-3 (Poor):** Missing multiple required sections (Problem Statement, Requirements, Acceptance Criteria). What's present is vague stubs.
- **4-6 (Adequate):** All required sections present but some are thin — fewer than 2 sentences, or use placeholder language ("TBD", "TODO").
- **7-8 (Good):** All sections are substantive. Requirements are specific and enumerated. Acceptance criteria cover the main scenarios. Constraints and out-of-scope are defined.
- **9-10 (Excellent):** Comprehensive. Covers edge cases, error scenarios, and boundary conditions. Out-of-scope explicitly prevents scope creep. Requirements are traceable to acceptance criteria.

### Calibration Examples

**Score 2-3:**
```
Requirements:
- Must work correctly
- Should be fast
- Needs to integrate with our system
```

**Score 5-6:**
```
Requirements:
- Add image upload support to Slack bot
- Handle common image formats
- Show confirmation when upload succeeds
(Problem statement present but thin; no constraints or out-of-scope section)
```

**Score 7-8:**
```
R1: Install maheshcr/image-gen-mcp v1.2.0, configure in ~/.config/image-gen-mcp/config.yaml with model: gemini-2.5-flash-image
R2: Bot detects image file paths in tool_result blocks from Write/NotebookEdit tool_use
R3: Upload cap of 10 images per tool invocation
Out-of-scope: Custom /imagine plugin (deferred to Phase 2)
```

**Score 9-10:**
```
R1: Install maheshcr/image-gen-mcp v1.2.0...
R2: Detection covers Write, NotebookEdit, and Bash tool outputs...
R3: Upload cap of 10 images per invocation, excess logged with warning...
R4: Requires files:write OAuth scope on Slack app...
AC1-AC6 each trace to specific requirements. Edge cases: oversized files (>20MB), unsupported formats, expired tokens. Error scenarios enumerated with expected behavior.
```

---

## Clarity (1-10)

Could two engineers read this spec independently and build the same thing?

- **1-3 (Poor):** Rampant ambiguity. Weasel words ("should probably", "might need to"). Vague quantities ("fast", "secure", "scalable"). Multiple valid interpretations for core requirements.
- **4-6 (Adequate):** Mostly clear but contains some vague terms. A careful reader could infer intent, but shouldn't have to. Some requirements need follow-up questions.
- **7-8 (Good):** Specific and unambiguous. Concrete values instead of vague ranges. Clear behavioral descriptions. Scope boundaries are explicit.
- **9-10 (Excellent):** Crystal clear. Every requirement has one obvious interpretation. Terminology is consistent. Technical constraints are precise (exact versions, limits, formats).

### Calibration Examples

**Score 2-3:**
```
The system should handle errors gracefully and respond quickly.
Authentication should be secure and user-friendly.
```

**Score 5-6:**
```
The webhook endpoint should respond within a reasonable time.
Retry failed requests a few times before giving up.
Use standard authentication.
```

**Score 7-8:**
```
The /webhook endpoint returns 200 within 500ms for payloads under 1MB.
Retry failed HTTP requests up to 3 times with exponential backoff (1s, 2s, 4s).
Authenticate via OAuth 2.0 bearer token in the Authorization header.
```

**Score 9-10:**
```
The /webhook endpoint returns HTTP 200 with Content-Type: application/json within 500ms p99 for payloads <= 1MB.
Retry failed requests (HTTP 429, 500, 502, 503) up to 3 times with exponential backoff (1s, 2s, 4s) plus jitter (0-500ms).
Authenticate via OAuth 2.0 bearer token (RFC 6750) in the Authorization header; reject with HTTP 401 if missing or expired.
```

---

## Testability (1-10)

Can every acceptance criterion be objectively verified by a human or automated test?

- **1-3 (Poor):** Acceptance criteria are subjective ("looks good", "feels responsive", "is user-friendly"). No measurable outcomes.
- **4-6 (Adequate):** Some ACs are testable, others are vague. Mix of objective and subjective criteria. Missing Given/When/Then or equivalent structure.
- **7-8 (Good):** All ACs describe observable, measurable outcomes. Use Given/When/Then or equivalent. Each AC could become a test case.
- **9-10 (Excellent):** ACs are directly translatable to automated tests. Include specific inputs, expected outputs, and error conditions. Cover happy path and edge cases.

### Calibration Examples

**Score 2-3:**
```
AC1: The feature works as expected.
AC2: Performance is acceptable.
AC3: The UI looks correct.
```

**Score 5-6:**
```
AC1: User can upload an image and see it in the channel.
AC2: Errors are handled properly.
AC3: The upload completes in a reasonable time.
```

**Score 7-8:**
```
AC1: Given a PNG file <5MB, when the bot detects it in tool output, then it uploads to the active Slack thread and posts a confirmation message.
AC2: Given a file >20MB, when upload is attempted, then the bot logs a warning and skips the file without crashing.
```

**Score 9-10:**
```
AC1: Given a PNG file (test-image.png, 2.4MB), when tool_result contains path /tmp/test-image.png, then Slack files.uploadV2 is called with channel_id and thread_ts, returns ok:true, and the file appears in-thread within 5s.
AC2: Given 15 image paths in a single tool_result, when detection runs, then exactly 10 are uploaded and 5 are skipped with log: "Upload cap reached: 5 images skipped".
AC3: Given an expired bot token, when upload is attempted, then Slack returns 401, bot logs "Token expired, skipping upload", and processing continues for non-image tasks.
```

---

## Feasibility (1-10)

Are dependencies real and available? Is the proposed architecture sound? Are technical assumptions validated? Are there known blockers or risks called out?

- **1-3 (Poor):** Proposes impossible or contradictory requirements. Depends on APIs/tools that don't exist. No risk awareness.
- **4-6 (Adequate):** Technically possible but assumptions unverified. Missing key dependency research. Risks acknowledged but not mitigated.
- **7-8 (Good):** Dependencies verified. Architecture fits existing system. Key risks identified with mitigation strategies.
- **9-10 (Excellent):** All assumptions validated with evidence (links, docs, prototypes). Architecture reviewed against existing patterns. Risk mitigations are concrete and actionable.

### Calibration Examples

**Score 2-3:**
```
Use the Slack file.upload API to send images.
(API was deprecated in 2024; no mention of files.uploadV2 replacement)
Requirement: real-time streaming via WebSockets AND polling simultaneously — contradictory.
```

**Score 5-6:**
```
Use Gemini API for image generation. Cost is "probably low."
Architecture: add a new MCP server (no research into whether one exists or needs to be built).
Risk: "API rate limits might be an issue."
```

**Score 7-8:**
```
Use maheshcr/image-gen-mcp (verified: GitHub repo exists, last commit 2 weeks ago, supports gemini-2.5-flash-image).
Architecture: MCP server configured in claude_desktop_config.json, consistent with existing server pattern.
Risk: Gemini API requires billing enabled even for free tier — mitigation: document setup step, verify in AC.
```

**Score 9-10:**
```
Dependency: maheshcr/image-gen-mcp v1.2.0 (link: github.com/..., tested locally, confirmed compatible).
Cost: $0.039/image verified via 10-image test run against gemini-2.5-flash-image.
Architecture: follows existing MCP server pattern (see: config/mcp-servers.json lines 12-18 for precedent).
Risk: Google AI Studio quota=0 without billing — mitigation: setup guide includes billing verification step; AC3 tests for quota error handling.
Alternative evaluated: Imagen 3 (rejected: paid-only, $0.04/image, no free tier).
```

---

## Scope (1-10)

Is this right-sized for a single feature branch? Neither too broad (risk) nor too narrow (ceremony overhead)?

- **1-3 (Poor):** Tries to do 3+ unrelated things. Could be split into independent specs. Or: trivial change wrapped in heavy ceremony (1 config line, full spec).
- **4-6 (Adequate):** Scope is defensible but pushing boundaries. Some requirements feel like separate features. Or: slightly over-specified for the actual change.
- **7-8 (Good):** Cohesive, single-purpose. Requirements all serve one goal. Right amount of spec for the complexity.
- **9-10 (Excellent):** Perfectly scoped. Every requirement is essential, nothing is missing, nothing is extraneous. Spec complexity matches implementation complexity.

### Calibration Examples

**Score 2-3:**
```
Spec title: "Add image generation, redesign Slack bot architecture, and migrate to new config format"
(Three independent features bundled into one spec)
OR: Full spec with problem statement, 5 requirements, and 4 ACs for: "Change log level from INFO to DEBUG in config.yaml"
```

**Score 5-6:**
```
Spec: "Add Slack image upload support" but also includes R5: "Refactor bot message formatting for consistency" and R6: "Add health-check endpoint to bot"
(Core feature is cohesive, but R5-R6 are tangential improvements that could ship independently)
```

**Score 7-8:**
```
Spec: "Add Slack image upload support"
R1-R4 all directly serve the goal of uploading generated images to Slack threads.
Out-of-scope cleanly defers related-but-separate work (custom /imagine plugin, image editing).
```

**Score 9-10:**
```
Spec: "Add Slack image upload support"
Every requirement is necessary (remove any one and the feature doesn't work).
Spec depth matches implementation complexity (~2-3 files changed, 1-2 day effort).
Out-of-scope is precise and justified. No gold-plating, no padding.
```

---

## Intent Verifiability (1-10)

Does the spec capture the underlying purpose and protect against implementations that meet the letter but miss the spirit?

- **1-3 (Poor):** No stated purpose beyond "build X." Requirements describe behavior without explaining why. No anti-patterns or rejected approaches. Success criteria are purely behavioral ("button does X") with no connection to outcomes. Critical user journeys not considered. An autonomous agent could satisfy every AC while completely missing the point.
- **4-6 (Adequate):** Problem statement implies purpose but doesn't state it explicitly. Some requirements hint at underlying intent. No anti-patterns documented. Success criteria mix behavioral and outcome-oriented. Critical user journeys mentioned but not traced through requirements.
- **7-8 (Good):** Purpose clearly stated — "we're solving X because Y." Anti-patterns or rejected approaches documented (what NOT to do). Success criteria tied to outcomes, not just surface behavior. Critical user journeys identified and their key touchpoints covered by requirements. Harder for an implementation to game — meeting the spec likely means meeting the intent.
- **9-10 (Excellent):** Crystal clear intent that would survive context loss. Anti-patterns with reasoning ("don't do X because it leads to Y"). Success criteria explicitly distinguish between "letter" and "spirit" compliance. Critical user journeys traced end-to-end with specific acceptance criteria at each touchpoint. A future developer reading this spec would understand not just what to build but what problem they're solving and what failure looks like even when all tests pass.

### Calibration Examples

**Score 2-3:**
```
Problem Statement: Build an email triage system.
Requirements:
- Sort emails into categories
- Mark important emails
- Show results in Slack
(No stated purpose. Why triage? What outcome? No anti-patterns. "Important" is undefined.)
```

**Score 5-6:**
```
Problem Statement: Build an email triage system to reduce time spent on email.
Requirements:
- Categorize emails by urgency (high/medium/low)
- Post high-urgency emails to #cc-email within 5 minutes
(Purpose implied but vague — "reduce time" by how much? No anti-patterns. No user journey.)
```

**Score 7-8:**
```
Problem Statement: Dustin spends 45min/day on email. Goal: reduce to <10min by auto-categorizing and surfacing only actionable items.
Anti-patterns: Don't auto-archive — user must see everything was triaged. Don't use subject-line-only classification (body context matters).
Critical user journey: Morning check — user opens Slack, sees categorized digest, acts on high-urgency items, trusts that nothing was silently dropped.
```

**Score 9-10:**
```
Problem Statement: [as above, plus:]
Intent: The system succeeds when Dustin trusts it enough to stop checking email directly. Failure looks like: all ACs pass, but Dustin still opens Gmail "just in case."
Anti-patterns: (1) Don't auto-archive (user must verify completeness). (2) Don't batch — latency >5min for high-urgency defeats the purpose. (3) Don't classify based on sender alone (new contacts can be urgent).
Critical user journeys:
- Morning brief: digest in #cc-email by 7am, categorized, with confidence indicators
- Urgent interrupt: high-urgency email → immediate Slack DM, not just channel post
- Weekly audit: user spot-checks 10 random emails to validate classification accuracy
Each journey traced to specific ACs (AC1→morning brief, AC2→urgent interrupt, AC5→audit).
```

---

## Scoring

### Default Weights

Calculate overall score as a weighted average using the weights from the project's `.claude/sdlc.local.md` configuration. Default weights:

| Dimension             | Weight |
|----------------------|--------|
| Completeness          | 0.20   |
| Clarity               | 0.20   |
| Testability           | 0.20   |
| Intent Verifiability  | 0.15   |
| Feasibility           | 0.15   |
| Scope                 | 0.10   |

Round the overall score to one decimal place, rounding half-up (7.25 → 7.3, 7.24 → 7.2). The overall score is the weighted sum of the dimension scores using the weights from the project config (defaults above) — it is mechanically recomputable from the dimension scores, and a scorecard whose `overall` does not match that recomputation is invalid. The scorer records the weights it used in the scorecard's `weights:` block, which is what makes the recomputation mechanically enforceable (`scripts/verify-evidence.sh` recomputes from the recorded weights).

### Per-Dimension Minimum

Each dimension must score >= 5 individually. If any dimension scores below 5, the gate fails regardless of the overall weighted average. This prevents a strong score in one area from masking a critical weakness in another.

The per-dimension minimum defaults to 5 but can be overridden in the project's `.claude/sdlc.local.md` via `scoring.dimension_minimum`.

---

## Flags

After scoring, categorize observations into three severity levels:

### Blocking

Issues that **must** be addressed before the gate can pass, even if the score meets the threshold. The presence of any blocking flag forces a `fail` result.

Examples:
- Contradictory requirements (R2 and R4 specify incompatible behaviors)
- Untestable acceptance criteria (AC has no observable outcome)
- Missing critical section (no acceptance criteria at all)
- Dependency on a nonexistent API or deprecated tool

### Recommended

Issues that **should** be addressed but are not gate-blocking. These represent meaningful improvements that would strengthen the spec.

Examples:
- Thin sections (Problem Statement is 1 sentence)
- Minor ambiguities (R3 says "common image formats" — which ones?)
- Missing edge cases (what happens when the file is 0 bytes?)
- Risks acknowledged but lacking mitigation strategies

### Advisory

Nice-to-have improvements at the author's discretion. These are suggestions, not problems.

Examples:
- Style suggestions (consider using Given/When/Then format for ACs)
- Alternative approaches worth considering
- Optional enhancements that could be added later
- Cross-references to related specs or docs

---

## Gate Decision

> **Invoker-only — not part of the scorer's reading.** This section describes how the *invoking skill* stamps `threshold` and `result` after the scorer finishes. The blinded scorer agent is instructed to skip this section: it must not see the pass threshold before scoring (score-attraction bias) and never sets `result` itself.

The gate passes only when **all three conditions** are met:

1. **Overall score >= threshold** (from project config, e.g. 7.0)
2. **Every dimension >= per-dimension minimum** (default 5)
3. **No blocking flags**

If any condition fails: `result: fail`

If all conditions pass: `result: pass`

When failing, clearly state which condition(s) caused the failure so the spec author knows exactly what to fix.
