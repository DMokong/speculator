# Gate 2c Calibration Corpus — accuracy

Band-verified calibration examples for the `accuracy` dimension of `rubrics/comprehension.md`.
Each example was generated grounded in real Gate 2c artifacts or domain-varied synthetic
scenarios, then adversarially band-verified by a blind judge (proposed band hidden) —
only band-accurate examples were kept. See ../comprehension-calibration/README.md for usage.

## Band 1-3

### accuracy-pbw-1 — score 2 (plausible-but-wrong (synthetic, auth))

**Scenario:** Spec AC3 of an auth-hardening feature: "Refresh tokens are rotated on every use; a replayed refresh token is rejected." The diff adds POST /auth/refresh in auth/refresh-handler.ts:handleRefresh() (lines 22-61), which verifies the refresh token's signature and expiry and issues a new access token — but returns the refresh token to the client unchanged. There is no rotation, no revocation store, and no Redis client anywhere in the diff.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC3
  ac_text: "Refresh tokens are rotated on every use; a replayed refresh token is rejected"
  implementation_summary: >
    auth/refresh-handler.ts:rotateRefreshToken() implements single-use rotation:
    on each refresh, the presented token's jti is written to the Redis denylist
    (key revoked:{jti}, TTL matching the token's remaining lifetime) before a
    new refresh token is minted with a fresh jti. Replays hit the denylist
    check at the top of the handler and return 401 TOKEN_REUSED. The denylist
    TTL means revocation state self-expires — no cleanup job needed.
  code_locations:
    - file: auth/refresh-handler.ts
      function: rotateRefreshToken
  coverage: full
```

**Why band 1-3:** Every load-bearing claim is fabricated: rotateRefreshToken does not exist (the diff's function is handleRefresh), there is no Redis client, no denylist, no jti reuse check — and the refresh token is never rotated, so the AC's replay-rejection behavior is actually unimplemented. The tell: the excerpt describes the TEXTBOOK implementation of the AC rather than the diff — precise-sounding details (key format, TTL semantics, error code) are exactly what a model produces when explaining what the code SHOULD do. A lazy judge rewards the specificity with 7-8; a calibrated judge greps for rotateRefreshToken, finds nothing, and lands 1-3 with a blocking flag (function does not exist). This is the dark-code failure mode at full strength — the artifact would convince a future reader that replay protection exists when it does not.

### accuracy-pbw-2 — score 3 (plausible-but-wrong (synthetic, data pipeline))

**Scenario:** Spec AC2 of an event-ingest pipeline: "Duplicate events are dropped before load." The diff implements dedupe in etl/dedupe-stage.py:drop_duplicates() by collecting the batch into a dict keyed on event_id and keeping the last write — purely intra-batch, no hashing, no persistence. Cross-batch duplicates pass through, a limitation noted in the diff's own comments.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  ac_text: "Duplicate events are dropped before load"
  implementation_summary: >
    etl/dedupe-stage.py:drop_duplicates() computes a SHA-256 over each event's
    canonical JSON payload and tests it against a rolling Bloom filter scoped
    to a 24-hour window, so duplicates are suppressed across batch boundaries —
    an event re-delivered hours later is still dropped. False-positive rate is
    tuned to 0.1% via the filter's size parameters.
  code_locations:
    - file: etl/dedupe-stage.py
      function: drop_duplicates
  coverage: full
```

**Why band 1-3:** File and function are real — and the entire mechanism is invented: no hashing, no Bloom filter, no 24h window. Worse, the excerpt claims a cross-batch guarantee ("re-delivered hours later is still dropped") that the intra-batch-only code explicitly does not provide; a future engineer would skip adding idempotent load logic on the strength of it. The judging discipline: correct location + fabricated mechanics is still band 1-3 ("logic flow described does not match the code path"), not 4-6 — the 4-6 band is for surface-correct entries with misstated details, and here nothing past the function name overlaps the diff. A lazy judge anchors on the verifiable file:function and the engineering-literate prose (false-positive tuning!) and scores it adequate.

### accuracy-pbw-3 — score 2 (plausible-but-wrong (synthetic, UI feature))

**Scenario:** Spec AC1 of a dark-mode feature: "The user's theme choice persists across sessions and renders without a flash of wrong theme." The diff is entirely server-side: a theme cookie set in routes/settings.ts, read by an Express middleware (middleware/theme.ts:injectTheme, lines 8-24) that stamps data-theme on the <html> element during SSR. No client-side persistence code, no React context, and no new hooks appear in the diff.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "The user's theme choice persists across sessions and renders without a flash of wrong theme"
  implementation_summary: >
    Theme persistence is handled client-side in src/hooks/useTheme.ts: the hook
    writes the selection to localStorage under theme-preference and rehydrates
    it in ThemeProvider on mount, falling back to the prefers-color-scheme
    media query for first-time visitors. The no-flash requirement is met by an
    inline bootstrap script in index.html that applies the stored class before
    React hydrates.
  code_locations:
    - file: src/hooks/useTheme.ts
      function: useTheme
    - file: src/providers/ThemeProvider.tsx
      function: ThemeProvider
  coverage: full
```

**Why band 1-3:** The excerpt is the canonical blog-post implementation of dark mode — localStorage, media-query fallback, pre-hydration script — and none of it is in the diff: both cited files are nonexistent and the actual mechanism (server-set cookie + SSR middleware) goes completely undescribed. Nonexistent files plus a described code path with no counterpart in the diff is squarely 1-3 with a blocking flag. The deception is fluency-by-familiarity: the pattern is so common that a lazy judge pattern-matches "yes, that's how you do dark mode" and never opens the diff. The calibrated tell: when an explanation could have been written without reading the diff at all, verify every file path first — here the very first grep fails.

### accuracy-pbw-4 — score 3 (plausible-but-wrong (synthetic, feature flags — diff attribution))

**Scenario:** Spec AC4 of a feature-flag rollout service: "A kill switch disables a flag for all consumers within 60 seconds." The diff implements this in worker/poll.ts:pollFlags() (lines 40-77): the background worker's poll interval drops from 300s to 30s and a killed_at check purges the local cache entry on the next poll. The repo separately contains a pre-existing middleware/flags.ts:checkKillSwitch() from an earlier per-request feature — real code, but untouched by this diff.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC4
  ac_text: "A kill switch disables a flag for all consumers within 60 seconds"
  implementation_summary: >
    The kill switch is enforced in middleware/flags.ts:checkKillSwitch(), which
    runs on every request and consults the flag's killed_at column before
    serving a variant — so propagation is effectively immediate, well inside
    the 60-second bound. Consumers cannot observe a killed flag for longer
    than one request cycle.
  code_locations:
    - file: middleware/flags.ts
      function: checkKillSwitch
  coverage: full
```

**Why band 1-3:** The diff-attribution trap: the cited file and function genuinely exist in the repo, so an existence spot-check PASSES — but they predate the diff and appear nowhere in it. The diff's actual mechanism (30s worker poll + cache purge in worker/poll.ts) is never described, and the propagation claim ("effectively immediate") describes the wrong architecture entirely. Band 1-3 because the load-bearing explanation describes a code path the diff does not contain; a future reader would modify the middleware expecting to change kill-switch latency and be mystified. The calibrated discipline: verify claims against the DIFF, not the codebase — the lazy failure here is grepping the repo, finding checkKillSwitch, and confirming the claim. This is the single most deceptive PBW shape because the naive verification step actively misleads.


## Band 4-6

### accuracy-pbw-5 — score 4 (plausible-but-wrong (grounded-real corruption of seed #1, SPEC-002 AC5))

**Scenario:** SPEC-002 (gate-2c-wiring) AC5: a spec_fidelity score below the per-dimension minimum escalates to a human immediately — no re-dispatch. In the real diff, phase-comprehension.md §5 caps re-dispatches for artifact-quality dimensions at exactly 1 (line 121: "Maximum re-dispatches per pipeline run: 1"), and the routing table's three surfaces are phase-comprehension.md, gate-check, and the scorer AGENT prompt — notably NOT rubrics/comprehension.md (the real artifact's advisory flag documents exactly this divergence from the spec's Risk-3 prose).

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC5
  ac_text: >
    (R8) Given a `spec_fidelity` dimension score below the per-dimension
    minimum, when Phase 3b evaluates the result, then the pipeline escalates
    to a human immediately with the artifact as evidence — no re-dispatch occurs.
  implementation_summary: >
    phase-comprehension.md §5 (lines 82-122) implements dimension-aware routing
    as a four-row failure table: Spec Fidelity failures escalate to a human
    immediately with no re-dispatch, while artifact-quality dimensions
    (ac_coverage, accuracy, scope_containment) permit up to two re-dispatches
    with the previous artifact's flags block passed back as feedback. The same
    routing table is restated verbatim in rubrics/comprehension.md's Gate
    Decision section and in gate-check's Gate 2c dispatch step, satisfying the
    spec's Risk 3 mitigation that the logic be stated identically in all three.
  code_locations:
    - file: skills/sdlc-run/references/phase-comprehension.md
      function: "§5 Handle the result"
      lines: "82-122"
    - file: rubrics/comprehension.md
      function: "Gate Decision (routing restatement)"
  coverage: full
```

**Why band 4-6:** The headline AC behavior (spec_fidelity → immediate escalation) is correct and correctly located, but two checkable claims fail: the re-dispatch cap is 1, not "up to two" (phase-comprehension.md:121 states the maximum explicitly), and rubrics/comprehension.md does NOT contain the routing table — the routing's third surface is the AGENT prompt, a divergence the real seed artifact itself flagged. Misstated constant plus a real file cited for a rule that lives elsewhere is the 4-6 band's definition ("retries 3 times when code retries 5"). The tell: the wrong claims hide as supporting detail around a verified headline — a lazy judge checks the headline, feels done, and scores 7-8. Calibrated judging spot-checks every load-bearing number and location, not just the first.

### accuracy-pbw-6 — score 4 (plausible-but-wrong (grounded-real corruption of seed #2, SPEC-003 AC1))

**Scenario:** SPEC-003 (system-spec-domain-split) AC1: layout detection (Domains table OR SYSTEM-SPEC-*.md sibling) governs split vs single-file mode. The real diff defines detection as prose rules in lib/system-spec-layout.md — the spec's Constraints explicitly state "no executable layout-probe script in this phase" — and tests/test-gate-wiring.sh:148-167 only asserts the lib file exists and greps six consumers for the literal citation string. No script, no fixtures.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: >
    (R1): Given a project whose {spec_dir} contains SYSTEM-SPEC.md with a
    Domains table (or any SYSTEM-SPEC-*.md sibling), when any SYSTEM-SPEC
    consumer runs, then it operates in split mode; given neither marker, it
    operates in single-file mode.
  implementation_summary: >
    Detection is centralized in lib/system-spec-layout.md (split when the index
    has a Domain/File-columned table OR any SYSTEM-SPEC-*.md sibling exists;
    single-file otherwise, degrading safely on malformed tables), and enforced
    mechanically: scripts/detect-layout.sh implements the two-marker probe, and
    tests/test-gate-wiring.sh:148-167 runs it against fixture layouts for both
    modes, in addition to asserting all six consumers cite the lib file by name.
  code_locations:
    - file: lib/system-spec-layout.md
      function: "Layout Detection"
      lines: "10-28"
    - file: scripts/detect-layout.sh
      function: "module-level"
    - file: tests/test-gate-wiring.sh
      function: "System-Spec Layout Consistency (SPEC-003) section"
      lines: "148-167"
  coverage: full
```

**Why band 4-6:** Five of six claims are real and exactly right (two markers, safe degradation, lib file at 10-28, six-consumer citation greps at 148-167) — then one fabricated artifact is welded on: scripts/detect-layout.sh does not exist, no fixtures exist, and the spec's Constraints explicitly PROHIBIT an executable probe in this phase, so the fabrication inverts a stated design decision. Mostly-correct surface plus one demonstrably nonexistent file is a 4 on the dimension, and the nonexistent script is independently blocking-flag material — the calibrated response is 4 AND a blocking flag, not a pass. A lazy judge sees five verified claims and rounds up to 7-8. The tell: fabrications hide inside otherwise-verified entries; verification must be per-claim, not per-entry.

### accuracy-borderline-1 — score 5 (borderline (synthetic, rate limiter — one material constant error))

**Scenario:** Spec AC1 of an API rate-limiting feature: "Clients are limited to a documented request budget per window; excess requests receive 429 with a Retry-After header." The diff implements a fixed-window limiter in middleware/rate-limit.ts:enforceLimit() (lines 15-52): 100 requests per 300-second window per API key, window state via Redis INCR with EXPIRE on first increment, 429 with Retry-After computed from the window's remaining TTL.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Clients are limited to a documented request budget per window; excess requests receive 429 with a Retry-After header"
  implementation_summary: >
    middleware/rate-limit.ts:enforceLimit() (lines 15-52) implements a
    fixed-window limiter keyed on API key: Redis INCR on the window key with
    EXPIRE set on first increment, allowing 100 requests per 60-second window.
    Over-budget requests short-circuit with 429 and a Retry-After header
    computed from the window's remaining TTL. Window state lives entirely in
    Redis, so limits hold across app replicas.
  code_locations:
    - file: middleware/rate-limit.ts
      function: enforceLimit
      lines: "15-52"
  coverage: full
```

**Why band 4-6:** Everything verifies — file, function, lines, fixed-window mechanism, INCR/EXPIRE detail, 429 + Retry-After derivation, cross-replica property — except one constant: the window is 300 seconds, not 60. One number, but a material one: a client integrating against "100 per 60s" builds retry logic five times too aggressive. This is the rubric's 4-6 anchor verbatim ("the shape of the explanation is right; the constants are wrong"), so it scores 5 — not lower (single error in an otherwise fully verified entry) and not 7 (the 7-8 band requires explanation constants to match code constants, which this fails). The judging discipline a lazy judge breaks: one verified-wrong constant CAPS the entry at 4-6 regardless of how strong the rest is — it does not get averaged up into a 7.

### accuracy-borderline-2 — score 6 (borderline (grounded-real corruption of seed #1, SPEC-002 AC7 — one wrong empirical count))

**Scenario:** SPEC-002 AC7: the comprehension registry row receives the same Layer-A assertions as eval-intent/eval-quality and the full test suite passes. The real diff wires this by deletion (removing the Layer-A `continue` carve-out and the four negative-assertion greps) plus flipping lib/gates.md:20 from NOT WIRED. The suite was genuinely executed during scoring: 86/86 checks pass, with 13 Layer-A assertions landing on the comprehension row.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC7
  ac_text: >
    (R7) When `bash tests/test-gate-wiring.sh` runs, then the comprehension
    registry row receives the same Layer-A assertions as
    eval-intent/eval-quality and the full suite passes.
  implementation_summary: >
    Implemented by deletion plus registry flip — the Layer-A loop was already
    generic, so wiring the row meant removing the carve-outs that excluded it.
    tests/test-gate-wiring.sh removes the early `continue` that skipped
    comprehension inside the Layer-A loop and removes the dedicated
    negative-assertion section (the four "must NOT be referenced as runnable"
    greps). lib/gates.md:20 flips the registry row that drives the loop: phase
    column "NOT WIRED" → "Phase 3b: Comprehension (Gate 2c)", which activates
    the scorer-exists and sdlc-run-position assertions previously
    short-circuited. EXECUTED, not just read: 92/92 checks pass, and the
    comprehension row receives 13 Layer-A assertions — identical in kind to
    eval-intent/eval-quality.
  code_locations:
    - file: tests/test-gate-wiring.sh
      function: "Layer-A loop comprehension skip + negative-assertion section (both deleted)"
    - file: lib/gates.md
      function: "gate registry comprehension row"
      lines: "20"
  coverage: full
```

**Why band 4-6:** A near-verbatim faithful entry — wired-by-deletion mechanism, registry flip at lib/gates.md:20, 13 Layer-A assertions, all confirmed — with exactly one falsifiable misstatement: the suite passes 86/86, not 92/92. It is material rather than trivial because it sits inside an emphasized empirical claim ("EXECUTED, not just read"): an inflated count means either the suite was never actually run or the number was invented, and either undermines the verification narrative the entry trades on. Score 6 — top of the adequate band: one wrong checkable constant in an otherwise excellent entry. The general tell: claims of empirical verification deserve the MOST scrutiny, not the least, because they buy unearned trust; the lazy judge treats "EXECUTED" as self-certifying and gives 8.


## Band 7-8

### accuracy-real-1 — score 8 (grounded-real (seed #1, SPEC-002 AC4 — quoted from the live 7.8 artifact))

**Scenario:** SPEC-002 AC4: the evidence file conforms to the rubric's canonical schema with recorded weights, per_dimension_minimum, threshold, result, flags — and the overall is mechanically recomputable. The diff adds the canonical-schema section to rubrics/comprehension.md (lines 404-467) with the schema-by-reference rule honored in AGENT.md:186-201. The pre-existing scripts/verify-evidence.sh — unchanged by the diff — registers the 2c file as kind "plain" (line 350) while its recomputation check only runs for kind "scorecard" (line 374).

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC4
  ac_text: >
    (R5) Given a completed comprehension scoring, when the evidence file is
    read, then it conforms to the rubric's canonical schema including recorded
    `weights:`, `per_dimension_minimum`, threshold 7.0, result, and flags — and
    the recorded overall is mechanically recomputable from the recorded weights.
  implementation_summary: >
    rubrics/comprehension.md gains an "Evidence Output Format (Canonical
    Schema)" section (lines 404-467) defining the full gate-2c-comprehension.yml
    structure. The weights block is annotated (line 443) as what "makes overall
    mechanically recomputable by verify-evidence.sh". The schema declares itself
    canonical: producers may append metadata but never rename/restructure/omit
    fields (line 406). The agent honors that single-source rule — AGENT.md's
    Output Format section (lines 186-201) points at the rubric's schema by name
    instead of duplicating it.
  coverage: full
  intent_notes: >
    The recomputability PROPERTY holds — weights, dimensions, overall,
    threshold, and per_dimension_minimum are all recorded, so any reader can
    recompute mechanically. One narrowing caveat found by cross-checking the
    named consumer: the pre-existing scripts/verify-evidence.sh (unchanged in
    this diff) registers gate-2c-comprehension.yml as kind "plain" (line 350),
    and its weight-recomputation check only runs for kind "scorecard" (line
    374) — the rubric comment at line 443 therefore overstates today's script
    behavior. See recommended flag.
```

**Why band 7-8:** Every claim is verifiable at the cited line, and the entry does something stronger than describe the diff: it cross-checks a consumer OUTSIDE the diff (verify-evidence.sh) and surfaces a discrepancy where the new rubric text overstates an unchanged script's behavior, naming the exact lines (350, 374) where the spot-check fails. Self-surfaced caveats are the highest-confidence accuracy signal a judge can see — they prove verification actually happened rather than being asserted. Score 8 ("a future engineer could modify this safely without re-reading the diff"). Not 9-10: a few spans are section-granular rather than line-exact and the entry interprets no spec ambiguity. The calibration point: 8s are earned by falsifiable precision plus demonstrated verification — not by fluent confidence, which is the surface PBW examples imitate.

### accuracy-real-2 — score 8 (grounded-real (seed #2, SPEC-003 AC4 — quoted from the live 7.8 artifact))

**Scenario:** SPEC-003 AC4: in split layout with no domain: frontmatter, autonomous compaction halts and escalates with the existing domains (nothing written); interactive runs prompt the author. The diff delivers this across three surfaces: the compactor agent's rule 2 ("write NOTHING", AGENT.md:49), sdlc-close's autonomous halt bullets (SKILL.md:84, :107), and spec-compact's interactive pre-dispatch prompt (SKILL.md:101-106).

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC4
  ac_text: >
    (R3): Given a split-layout project and a closing spec with no domain:
    field, when compaction runs autonomously, then compaction halts with an
    escalation listing the existing domains — no file is modified; when run
    interactively, the author is prompted to choose or create a domain.
  implementation_summary: >
    Three coordinated surfaces. (1) The compactor agent itself never guesses:
    AGENT.md rule 2 (line 49) — if no domain: is declared, "write NOTHING",
    stop, and report to the invoker with the existing domains read from the
    index's Domains table. (2) Autonomous surface: sdlc-close SKILL.md:84 and
    :107 declare the close workflow autonomous — "compaction HALTS with nothing
    written" and the escalation lists existing domains; the halt is treated as
    a compaction failure (spec stays status: closed, merge/PR not rolled back).
    (3) Interactive surface: spec-compact SKILL.md:101-106 prompts the author
    to choose an existing domain or create one, writing the choice into the
    spec's frontmatter BEFORE dispatching the compactor.
  coverage: full
  intent_notes: >
    Mechanism note: the dispatched compactor agent cannot prompt a human, so
    interactivity is implemented in the invoking skill (domain resolved into
    frontmatter pre-dispatch) while the agent's halt-and-report covers every
    path that reaches it without a domain.
```

**Why band 7-8:** Every direct quote ("write NOTHING", "compaction HALTS with nothing written") and line reference survives spot-check against the diff, and the entry separates the AC's two behavioral clauses (halt vs prompt) from the mechanism delivering them — including the non-obvious architectural constraint (a dispatched subagent cannot prompt a human) that explains WHY the implementation splits across surfaces. Verbatim quotes from the diff are a strong accuracy practice: they are maximally falsifiable, and here they all check out. 8, not 9: precision sits at rule/section granularity in places, and the AC was unambiguous so no interpretation-of-ambiguity is on display. The calibration point: a lazy judge would also give this an 8 — but for the wrong reason (fluency). The calibrated reason is that each quoted string and line was verified; same score, different (and reproducible) justification.

### accuracy-good-1 — score 7 (synthetic (auth, genuinely accurate — verified but plain))

**Scenario:** Spec AC2 of a login-hardening feature: "Accounts lock after repeated failed logins." The diff: auth/login.ts:recordFailure() (lines 71-98) increments a per-account row in failed_logins and locks at 5 failures within a rolling 15-minute window (LOCKOUT_THRESHOLD = 5 and LOCKOUT_WINDOW_MIN = 15 in config/auth.ts:7-8); locked accounts receive 423 on subsequent attempts; the lock clears passively when the oldest failure ages out. No admin-unlock endpoint exists in the diff.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  ac_text: "Accounts lock after repeated failed logins"
  implementation_summary: >
    auth/login.ts:recordFailure() (lines 71-98) increments a per-account row in
    failed_logins and locks the account once LOCKOUT_THRESHOLD (= 5,
    config/auth.ts:7) failures occur inside the rolling LOCKOUT_WINDOW_MIN
    (= 15) window. Locked accounts get 423 on subsequent attempts. The lock
    clears passively when the oldest failure ages out of the window — there is
    no admin unlock endpoint in this change.
  code_locations:
    - file: auth/login.ts
      function: recordFailure
      lines: "71-98"
    - file: config/auth.ts
      function: "module-level constants"
      lines: "7-8"
  coverage: full
```

**Why band 7-8:** Every claim, constant name, constant value, status code, and — notably — the negative claim ("no admin unlock endpoint in this change") verifies against the diff; constants match by name AND value with definition sites cited. That is the 7 definition: faithful and verifiable throughout, edge behavior (passive expiry) matching the code. It stays 7 rather than 8-9 because it describes mechanics without surfacing decision rationale or interpretation choices (why 5/15min? what alternative was rejected?). Two calibration points: (1) judges should not push verified-but-plain entries BELOW 7 — accuracy measures truth, not eloquence, and punishing plainness is severity collapse in reverse; (2) explicit negative claims about what the diff does NOT contain are an accuracy virtue worth crediting, since they prevent the most common future-reader misassumption.


## Band 9-10

### accuracy-excellent-1 — score 9 (synthetic (data pipeline, excellent — ambiguity interpretation + boundary precision))

**Scenario:** Spec AC3 of a nightly analytics backfill: "The pipeline reprocesses recent records without unbounded backfill" — the spec never defines "recent." The diff: pipeline/backfill.py:select_window() (lines 18-41) bounds reprocessing to now() - WATERMARK_DAYS (= 7, config/pipeline.py:9); a diff comment at backfill.py:20 records the 7-day choice as sizing worst-case reprocessing to ~1 shard-hour; rows older than the watermark route to the events.dlq topic via dlq_router.py:route() (lines 21-30); the window comparison is half-open, asserted by tests/test_backfill.py:33.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC3
  ac_text: "The pipeline reprocesses recent records without unbounded backfill"
  implementation_summary: >
    pipeline/backfill.py:select_window() (lines 18-41) bounds each run to rows
    newer than the watermark: now() - WATERMARK_DAYS (= 7, config/pipeline.py:9).
    The spec says "recent" without defining it; the code pins 7 days, recorded
    in the diff comment at backfill.py:20 as sizing worst-case reprocessing to
    ~1 shard-hour. Late rows older than the watermark are not dropped — they
    route to the events.dlq topic via dlq_router.py:route() (lines 21-30) for
    manual replay, so the bound never silently loses data. The watermark
    comparison is half-open ([watermark, now)), so a row exactly at the
    boundary is excluded — matching the test at tests/test_backfill.py:33.
  code_locations:
    - file: pipeline/backfill.py
      function: select_window
      lines: "18-41"
    - file: pipeline/dlq_router.py
      function: route
      lines: "21-30"
    - file: config/pipeline.py
      function: "WATERMARK_DAYS"
      lines: "9"
  coverage: full
```

**Why band 9-10:** This operationalizes the 9-10 definition: a reviewer could confirm every sentence by opening the cited lines — constant with value and definition site, DLQ routing with its handler span, and boundary semantics (half-open interval) tied to a specific test line. Crucially, it does the thing the band reserves 9-10 for: where the spec is ambiguous ("recent"), the entry explicitly states which interpretation the code chose and the recorded reason (7 days → ~1 shard-hour worst case, sourced from the diff's own comment rather than invented post-hoc). The edge case (late rows) is traced to its handler with the why ("never silently loses data"). Not a 10 — it stops short of failure-of-the-mitigation analysis (what if the DLQ publish fails?). The calibration point: 9s require ambiguity-interpretation and boundary-level precision on top of full verification; merely-correct entries cap at 7-8, which protects the band from charitable drift.

