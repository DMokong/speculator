# Impact Awareness Rubric

This is a **separate validation**, not a scoring dimension. It runs after the 6-dimension spec-quality scoring and does not affect the overall score or weighted average. It evaluates whether a spec correctly declares its impact on existing behavior captured in `SYSTEM-SPEC.md`.

---

## Purpose

A spec that modifies existing system behavior — but doesn't acknowledge it — is one of the most common sources of silent regressions. The implementation proceeds in good faith, the spec scores well on quality dimensions, and the damage only becomes visible when something that used to work stops working.

Impact awareness validation exists to catch this class of problem at spec time, when the cost of correction is lowest. It does not penalize a spec for having broad impact — only for failing to declare it.

---

## When to Run

Run impact validation after 6-dimension scoring, but only when `SYSTEM-SPEC.md` is present and parseable in the project root or spec directory. Impact validation is **skipped** (silently) when:

- No `SYSTEM-SPEC.md` exists (greenfield project)
- `SYSTEM-SPEC.md` exists but contains 0 domain headers and 0 behavior entries (equivalent to greenfield)
- `SYSTEM-SPEC.md` is malformed (see edge cases)

---

## How Overlap Is Detected

Use semantic LLM analysis — not keyword matching. Analyze the spec's **problem statement**, **requirements**, and **acceptance criteria** against the domain headers (`##` sections) and behavior entries (`-` list items) in `SYSTEM-SPEC.md`.

The question is: **"Does this spec describe behavior that would change, replace, or conflict with a documented behavior in SYSTEM-SPEC.md?"**

This is the same pattern as risk signal detection — you're reasoning about behavioral equivalence and semantic conflict, not surface-level text similarity. Two requirements can use entirely different words and still refer to the same system behavior.

**What constitutes overlap:**

- A spec requirement would change how a documented behavior works (modification)
- A spec requirement replicates a behavior that already exists (duplication, potential conflict)
- A spec requirement disables, removes, or gates an existing behavior (suppression)
- A spec requirement changes a precondition or postcondition of an existing behavior (side-effect)

**What does NOT constitute overlap:**

- Thematic similarity without behavioral conflict ("both involve scoring" is not overlap unless the scoring logic itself is being changed)
- Mentions of the same domain without touching its behaviors
- Implementation details that share a file but change separate behaviors

---

## Decision Matrix

| Detected Domain Overlap | Declared `impact_rating` | `amends` Field | Result |
|------------------------|--------------------------|----------------|--------|
| None | `none` | Empty | Pass |
| None | `low`+ | Any | Pass (conservative declaration is fine) |
| 1+ domains | `none` | Empty | `impact_mismatch` — **blocking** |
| 1+ domains | `low`+ | Empty | `impact_underspecified` — **recommended** |
| 1+ domains | `low`+ | Populated, covers detected domains | Pass |
| 1+ domains | `low`+ | Populated, misses detected domains | `impact_incomplete` — **recommended** |
| N/A (no `SYSTEM-SPEC.md` exists) | Any | Any | Skip validation (greenfield) |

---

## Flag Definitions

### `impact_mismatch` (blocking)

The spec affects existing behavior but declares `impact_rating: none` (or omits it entirely). The implementation will proceed without awareness that it is changing documented behavior. This is the most dangerous case — silent modification with no amendment protocol triggered.

When raising this flag, identify the **specific behavior entry** in `SYSTEM-SPEC.md` that the spec would change. Vague domain overlap is insufficient to block; the scorer must name the conflict.

### `impact_underspecified` (recommended)

The spec correctly sets a non-`none` `impact_rating`, but the `amends` field is empty. The intent to amend is signaled but the substance is missing — reviewers and implementers won't know which behaviors to update in `SYSTEM-SPEC.md` after the feature ships.

Non-blocking. Surface the gap so the spec author can enumerate affected behaviors before implementation begins.

### `impact_incomplete` (recommended)

The spec has an `amends` field with content, but one or more detected domain overlaps are not represented in it. This could mean the author missed some behaviors, or the LLM detected overlap that the author consciously excluded. Either way, it's worth surfacing.

Non-blocking. List the unrepresented domains so the author can either add them to `amends` or consciously confirm they're out of scope.

### `system_spec_malformed` (advisory)

`SYSTEM-SPEC.md` exists and is non-empty, but contains no `##` domain headers and no `-` behavior entries — it can't be parsed against the spec. Validation is skipped, but the author should know the system spec is in an unusable state.

Advisory only. Does not block. Does not affect scoring.

---

## Trust-Erosion Rules

The severity hierarchy is intentional: blocking requires specificity, non-blocking tolerates ambiguity.

**For `impact_mismatch` (blocking):** The scorer must identify a specific behavior entry in `SYSTEM-SPEC.md` that the new spec would change. A line like:

> "Specs score against 6 quality dimensions: completeness, clarity, testability, feasibility, scope, intent_verifiability"

...can be specifically cited. A general claim that "both specs are about scoring" cannot.

If the scorer can only demonstrate thematic overlap — similar domains, shared terminology, adjacent concerns — that is NOT sufficient to raise a blocking flag. Downgrade to `impact_underspecified` (recommended) or omit the flag entirely.

**For `impact_underspecified` and `impact_incomplete` (recommended):** These tolerate ambiguity. They exist to surface potential issues without stopping the pipeline. If there's any plausible behavioral overlap, surface it. The author can resolve it in the next iteration. Getting a recommended flag is not a failure — it's information.

**Calibration:** When in doubt about whether to raise `impact_mismatch` vs `impact_underspecified`, ask:

> "Can I point to a specific sentence in SYSTEM-SPEC.md and say: this new spec would make that sentence false or incomplete?"

If yes → `impact_mismatch` is appropriate. If no → use `impact_underspecified` at most.

---

## Edge Cases

**No `SYSTEM-SPEC.md` → skip validation entirely.**
Greenfield projects haven't compacted their behavior into a system spec yet. No validation is possible or appropriate.

**Empty `SYSTEM-SPEC.md` (0 domains, 0 behavior entries) → skip validation.**
This is functionally equivalent to greenfield. There's nothing to compare against.

**Malformed `SYSTEM-SPEC.md` (file exists, non-empty, but no `##` headers or `-` behavior entries) → skip validation, emit `system_spec_malformed` advisory.**
The file exists but can't be parsed. Validation is skipped so a malformed system spec doesn't silently block all new feature work. The advisory flags the issue for the project maintainer.

**Spec has `impact_rating: none` and `amends` is empty, with no detected overlap → Pass.**
This is the common greenfield-like case for a feature in an established project. Clean pass, no flags.

**Spec declares `impact_rating: high` with populated `amends` but LLM detects no overlap → Pass.**
Conservative declarations are always fine. The author may have domain knowledge the scorer doesn't. No flag for over-declaring.

---

## Evidence Format

```yaml
evidence_type: impact-awareness
system_spec_present: true | false
system_spec_parseable: true | false
domains_detected:
  - scoring-dimensions
  - gate-thresholds
impact_rating_declared: none | low | medium | high
amends_populated: true | false
amends_entries:
  - "6-dimension scoring rubric: add impact_awareness as 7th dimension"
flags:
  - id: impact_mismatch
    severity: blocking
    detail: "SYSTEM-SPEC.md entry 'Specs score against 6 quality dimensions...' conflicts with requirement R3 which adds a 7th dimension without amending this entry"
result: pass | fail | skip
```
