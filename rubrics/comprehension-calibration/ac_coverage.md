# Gate 2c Calibration Corpus — ac_coverage

Band-verified calibration examples for the `ac_coverage` dimension of `rubrics/comprehension.md`.
Each example was generated grounded in real Gate 2c artifacts or domain-varied synthetic
scenarios, then adversarially band-verified by a blind judge (proposed band hidden) —
only band-accurate examples were kept. See ../comprehension-calibration/README.md for usage.

## Band 1-3

### ac-cov-multiple-missing-3 — score 3 (synthetic)

**Scenario:** An OAuth integration spec with 5 ACs: authorize redirect with PKCE (AC1), token exchange (AC2), proactive refresh before expiry (AC3), token revocation on logout (AC4), and an error page on consent denial (AC5). The artifact contains exactly the three entries shown — AC4 and AC5 have no entries at all.

**Artifact excerpt (what the judge sees):**

```yaml
comprehension_entries:
  - ac_id: AC1
    ac_text: "Given a login request, when the user is redirected to the provider, then the request carries a PKCE S256 challenge"
    implementation_summary: >
      oauth/authorize.ts:buildAuthorizeUrl() generates the code_verifier, stores
      it in the session keyed by state, and redirects with the S256
      code_challenge derived from it.
    code_locations:
      - file: src/oauth/authorize.ts
        function: buildAuthorizeUrl
    coverage: full

  - ac_id: AC2
    ac_text: "Given the provider callback, when the code is valid, then it is exchanged for tokens which are persisted"
    implementation_summary: >
      oauth/callback.ts:exchangeCode() posts code + verifier to the token
      endpoint and persists access/refresh tokens via TokenStore.save().
    code_locations:
      - file: src/oauth/callback.ts
        function: exchangeCode
      - file: src/oauth/token-store.ts
        function: save
    coverage: full

  - ac_id: AC3
    ac_text: "Given a stored token near expiry, when an API call needs it, then it is refreshed before use"
    implementation_summary: >
      token-store.ts:getAccessToken() refreshes when expiry is within 60s,
      single-flighted via an in-memory promise cache so concurrent callers share
      one refresh.
    code_locations:
      - file: src/oauth/token-store.ts
        function: getAccessToken
    coverage: full
```

**Why band 1-3:** Two of five ACs (revocation on logout, consent-denial error page) have no entry whatsoever — "multiple ACs have no entry" is the explicit 1-3 anchor, and the 4-6 band's floor ("every AC has an entry") is not met, so this cannot leave the bottom band no matter how good the present entries are. And they ARE good — function-granular, mechanism-aware, band-7 grade individually — which is exactly the trap: a lazy judge keys on entry quality and scores 6-7. A calibrated judge counts coverage before reading prose. Score 3, the top of poor, BECAUSE the present entries are strong; the same artifact with paraphrase entries would be a 2. Pairs with the deceptive-omission case to teach the gradient: one silent missing AC caps at ~5, two or more force 1-3.

### ac-cov-grounded-gutted-2 — score 2 (grounded-real-corrupted)

**Scenario:** SPEC-002 (Gate 2c wiring) — the same 8-AC spec and diff as real seed #1. This artifact contains exactly the three entries shown; AC2, AC4, AC5, AC6, and AC8 have no entries. (The real artifact for this identical diff covered all 8 ACs with line-verified entries and scored 8.)

**Artifact excerpt (what the judge sees):**

```yaml
comprehension_entries:
  - ac_id: AC1
    ac_text: >
      Given gates.comprehension.enabled: true, Gate 2b satisfied or disabled, and
      no gate-2c-comprehension.yml, when /sdlc run performs position detection,
      then Phase 3b is selected and references/phase-comprehension.md drives the
      phase.
    implementation_summary: >
      Position detection in the sdlc-run skill now selects Phase 3b when the
      comprehension gate is enabled. The new phase reference file drives the
      phase.
    code_locations:
      - file: skills/sdlc-run/SKILL.md
    coverage: full

  - ac_id: AC3
    ac_text: >
      Given /sdlc gate comprehension with no evidence file, when gate-check runs,
      then the comprehension-scorer is dispatched cold and writes the evidence
      file.
    implementation_summary: >
      Gate-check dispatches the comprehension scorer agent, which writes the
      evidence file.
    code_locations:
      - file: skills/gate-check/SKILL.md
    coverage: full

  - ac_id: AC7
    ac_text: >
      When bash tests/test-gate-wiring.sh runs, then the comprehension registry
      row receives the same Layer-A assertions as eval-intent/eval-quality and
      the full suite passes.
    implementation_summary: >
      The gate wiring test now covers the comprehension row and the suite passes.
    code_locations:
      - file: tests/test-gate-wiring.sh
    coverage: full
```

**Why band 1-3:** Five of eight ACs have no entry — well past the "multiple ACs missing" 1-3 anchor — and the three entries that exist restate AC text at file granularity (the AC1 summary is the AC's then-clause converted to present tense). Nothing here is WRONG: the files are real, the claims accurate, the YAML well-formed, and it's about a real Speculator diff — which is precisely the charitable-drift trap. A lazy judge scores accuracy-flavored goodwill into a coverage score and lands at 4-5; a calibrated judge scores what the dimension asks: completeness and substance, both absent. The calibration contrast is stark — the real artifact for this exact diff traced AC1 through rows 77-85, line 164, and a 164-line reference file. Score 2, not 1, because three entries exist and name correct files.

### ac-cov-grouped-entries-2 — score 2 (synthetic)

**Scenario:** An ETL pipeline spec with 6 ACs covering extraction from the vendor SFTP, schema validation, transformation to the warehouse model, idempotent load, scheduling, and failure alerting. The artifact contains exactly the two entries shown — AC6 (alerting) appears nowhere.

**Artifact excerpt (what the judge sees):**

```yaml
comprehension_entries:
  - ac_id: AC1-AC4
    ac_text: "Extraction, validation, transformation, and load requirements"
    implementation_summary: >
      The ingestion orchestrator handles extraction, validation, transformation,
      and loading end to end. All four criteria are satisfied by the pipeline
      run.
    code_locations: []
    coverage: full

  - ac_id: AC5
    ac_text: "Given the configured schedule, when the window elapses, then the pipeline runs automatically"
    implementation_summary: >
      Scheduling is handled by the scheduler module.
    code_locations:
      - file: etl/scheduler.py
    coverage: full
```

**Why band 1-3:** Every 1-3 marker at once: a grouped entry covering ACs 1-4 indistinguishably (the rubric's verbatim anchor), an empty code_locations array on it, "handled in the orchestrator/scheduler module" prose that names no function for any behavior, the ac_text replaced with a topic label instead of the spec's text, and AC6 absent entirely. The lazy-judge trap is structural validity: the YAML parses, coverage: full appears on every entry, and a judge anchoring on "no inaccuracies found" drifts to 4. The calibrated tell: coverage: full is the artifact's self-assertion and carries zero evidential weight — the judge scores the evidence FOR the assertion, and there is none. Which of the four grouped ACs does the orchestrator deliver, where, how? Unanswerable from this artifact. Score 2, not 1, because one entry names one real file.


## Band 4-6

### ac-cov-boundary-mixed-6 — score 6 (boundary-thin)

**Scenario:** A feature-flag evaluation service spec with 5 ACs: rules evaluated in order with first-match-wins; percentage rollouts sticky per user; environment inheritance; audit log on every flag change; 30s SDK cache TTL. The artifact covers all five; AC1, AC3, AC5 are at the grade of the first entry shown, AC2 and AC4 at the grade of the last two.

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC1
    ac_text: "Given a flag with multiple rules, when evaluated, then rules apply in order and the first match wins"
    implementation_summary: >
      evaluator.ts:evaluateFlag() walks rules in array order and returns on first
      match; rule order is preserved end-to-end from the admin API because rules
      are stored as a JSONB array rather than a join table, so "first matching
      rule wins" is a property of storage order, not a sort at read time.
    code_locations:
      - file: src/evaluator.ts
        function: evaluateFlag
    coverage: full

  - ac_id: AC2
    ac_text: "Given a percentage rollout, when the same user evaluates the flag repeatedly, then they always land in the same bucket"
    implementation_summary: >
      Percentage rollouts are sticky per user, as required by the AC.
    code_locations:
      - file: src/evaluator.ts
    coverage: full

  - ac_id: AC4
    ac_text: "Given any flag change, when it is saved, then an audit log entry records who, what, and when"
    implementation_summary: >
      Flag changes are written to the audit log.
    code_locations:
      - file: src/audit.ts
    coverage: full
```

**Why band 4-6:** Top of adequate, and the 6-vs-7 boundary case: three entries are genuinely good (AC1 names the function and explains the storage-order mechanism), but AC2 and AC4 restate their AC text with file-only locations — AC2 never names the hashing/bucketing mechanism that makes stickiness true, AC4 never says what triggers the write or what's recorded. The 7-8 band requires EVERY AC to have a substantive entry naming functions; for a completeness dimension, the weakest entries set the score. A lazy judge averages (three strong + complete list → 7); a calibrated judge checks each entry against the bar and holds at 6. The strong entries are what lift it to the top of the band rather than a 5.

### ac-cov-thin-paraphrase-5 — score 5 (synthetic)

**Scenario:** A dashboard metrics-widget spec with 4 ACs: live metrics with automatic refresh; an error state with retry; an empty state; collapsible widget with persisted collapse state. All four ACs have entries; every entry is at the grade shown.

**Artifact excerpt (what the judge sees):**

```yaml
comprehension_entries:
  - ac_id: AC1
    ac_text: "Given the dashboard, when metrics are available, then the widget shows live metrics that refresh automatically"
    implementation_summary: >
      The metrics widget displays live metrics and refreshes them automatically.
      Implemented in the widget component.
    code_locations:
      - file: src/dashboard/MetricsWidget.tsx
    coverage: full

  - ac_id: AC2
    ac_text: "Given a failed metrics fetch, when the error occurs, then the widget shows an error state with a retry button"
    implementation_summary: >
      When the metrics fetch fails, the widget shows an error state with a retry
      button, per the AC.
    code_locations:
      - file: src/dashboard/MetricsWidget.tsx
    coverage: full

  - ac_id: AC4
    ac_text: "Given the widget, when the user collapses it, then the collapsed state persists across sessions"
    implementation_summary: >
      The widget is collapsible and the collapsed state is persisted across
      sessions as described.
    code_locations:
      - file: src/dashboard/MetricsWidget.tsx
    coverage: full
```

**Why band 4-6:** Dead-center 4-6, the band's own descriptor verbatim: every AC has an entry, locations are file-granularity only, and every summary is a paraphrase of the AC text rather than an explanation. The litmus test a calibrated judge applies: delete the implementation_summary and you lose nothing the ac_text didn't already say — no refresh interval, no polling vs websocket, no persistence mechanism (localStorage? server?), no function names. A lazy judge sees a complete per-AC list in the correct YAML shape with coverage: full everywhere and drifts to 7; completeness of the LIST is the 4-6 floor, not the 7-8 floor. Score 5, not 4, because every AC is present and the file named is at least plausible and specific.

### ac-cov-grounded-thinned-4 — score 4 (grounded-real-corrupted)

**Scenario:** SPEC-003 (SYSTEM-SPEC domain split) — the same 8-AC spec and diff as the real seed #2 artifact, but the artifact drains the substance: all eight ACs get entries, at the grade shown. (The real artifact's versions of these same three entries scored 8.)

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC2
    ac_text: >
      Given a split-layout project and a closing spec with domain: memory, when
      compaction runs, then new behavior lines land in SYSTEM-SPEC-memory.md and
      the index file gains no behavior entries.
    implementation_summary: >
      The spec-compactor handles split-layout routing so behaviors land in the
      domain file and the index stays navigation-only.
    code_locations:
      - file: agents/spec-compactor/AGENT.md
    coverage: full

  - ac_id: AC3
    ac_text: >
      Given a closing spec declaring a domain with no existing file, when
      compaction runs, then the domain file is created AND the index's Domains
      table gains a row for it.
    implementation_summary: >
      Covered by the same split-layout routing rules in the compactor.
    code_locations:
      - file: agents/spec-compactor/AGENT.md
    coverage: full

  - ac_id: AC4
    ac_text: >
      Given a split-layout project and a closing spec with no domain: field, when
      compaction runs autonomously, then compaction halts with an escalation —
      no file is modified; when run interactively, the author is prompted.
    implementation_summary: >
      Missing domains are never guessed — the workflow halts or prompts as the
      AC describes. Handled across the close and compact skills.
    code_locations:
      - file: skills/sdlc-close/SKILL.md
      - file: skills/spec-compact/SKILL.md
    coverage: full
```

**Why band 4-6:** Bottom of adequate. All eight ACs are present and real files are named, so it clears the 1-3 floor — but AC3's entry ("covered by the same routing rules") is indistinguishable from AC2's, which is the grouped-entry failure wearing per-AC formatting; no rule numbers, no line spans, and AC4 never says WHICH surface halts vs WHICH prompts. The calibration pair matters here: the real artifact's versions of these exact entries — rule 2 "write NOTHING" quoted with line 49, the three-surface division of labor — scored 8. Same diff, same ACs, same files; the only difference is substance. A lazy judge gives Speculator-flavored prose with correct filenames a charitable 6; the test is whether the entry tells you anything the AC text plus a directory listing wouldn't.

### ac-cov-deceptive-duplicate-5 — score 5 (deceptive-duplicate)

**Scenario:** An account-security spec with 6 ACs: argon2id hashing (AC1), per-IP login rate limiting (AC2), lockout after 5 failed attempts in 15 minutes (AC3), lockout notification email to the account owner (AC4), time-decay unlock after 30 minutes (AC5), admin manual unlock with audit entry (AC6). All six ACs have entries; AC1, AC2, AC5, AC6 are genuinely substantive at function granularity. The excerpt shows AC3 and AC4.

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC3
    ac_text: "Given 5 failed login attempts within 15 minutes, when the 5th attempt fails, then the account is locked"
    implementation_summary: >
      lockout.ts:recordFailure() increments a per-account counter in Redis with a
      15-minute sliding window (ZADD timestamps, ZREMRANGEBYSCORE prune). When the
      pruned count reaches LOCKOUT_THRESHOLD (=5), setLocked() writes the lock
      flag with a TTL and subsequent authenticate() calls short-circuit to
      423 Locked.
    code_locations:
      - file: src/auth/lockout.ts
        function: recordFailure
      - file: src/auth/lockout.ts
        function: setLocked
    coverage: full

  - ac_id: AC4
    ac_text: "Given an account lockout, when the lock is applied, then the account owner is notified by email"
    implementation_summary: >
      lockout.ts:recordFailure() increments a per-account counter in Redis with a
      15-minute sliding window (ZADD timestamps, ZREMRANGEBYSCORE prune). When the
      pruned count reaches LOCKOUT_THRESHOLD (=5), setLocked() writes the lock
      flag with a TTL and subsequent authenticate() calls short-circuit to
      423 Locked.
    code_locations:
      - file: src/auth/lockout.ts
        function: recordFailure
      - file: src/auth/lockout.ts
        function: setLocked
    coverage: full
```

**Why band 4-6:** The high-value deceptive case for charitable drift. Surface signals all read 7-8: six ACs, six entries, function-level locations, dense mechanism prose. The tell: AC4's summary and locations are byte-identical to AC3's — and AC4 is about a notification EMAIL, which the copied text never mentions. No email-sending code is named anywhere in the artifact, yet AC4 claims coverage: full. This is the 1-3 descriptor ("one entry covering two ACs indistinguishably") laundered through per-AC formatting, and it's worse than an honest coverage: partial because it actively misrepresents. A lazy judge pattern-matches structure and scores 8; a calibrated judge diff-checks adjacent entries — duplicates under different ac_texts mean one AC is dark. Score 5: four ACs genuinely well covered, one effectively unexplained and disguised. Not 6+, because the disguise itself is the failure this gate exists to catch.

### ac-cov-deceptive-omission-5 — score 5 (deceptive-omission)

**Scenario:** A usage-based billing pipeline spec with 8 ACs: idempotent meter events (AC1), hourly aggregation (AC2), mid-cycle proration (AC3), invoice lines match aggregates (AC4), banker's rounding (AC5), Stripe sync retry with backoff (AC6), an immutable audit record on every billing mutation (AC7), and a day-level backfill command (AC8). The artifact contains seven entries — AC1-AC6 and AC8, all at the grade shown. There is no AC7 entry: not marked missing, no gap note, simply absent.

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC6
    ac_text: "Given a failed Stripe sync, when the sync errors transiently, then it is retried with exponential backoff"
    implementation_summary: >
      stripe_sync.py:push_invoice() (lines 71-104) retries on RateLimitError and
      5xx APIError up to MAX_SYNC_RETRIES (=4, config/billing.py:22) with a 2s
      base doubling backoff and full jitter. We chose full jitter over plain
      doubling because nightly sync fires ~3k invoices concurrently and
      synchronized retries re-trip Stripe's limiter; plain backoff was the
      rejected alternative (thundering herd).
    code_locations:
      - file: billing/stripe_sync.py
        function: push_invoice
        lines: "71-104"
    coverage: full
    rejected_alternatives: ["plain exponential backoff (thundering herd at nightly batch scale)"]

  - ac_id: AC8
    ac_text: "Given a backfill command for a date, when run, then that day's meter events are re-aggregated and invoices recomputed"
    implementation_summary: >
      cli/backfill.py:run() (lines 18-61) deletes the day's aggregate rows inside
      the same transaction as re-aggregation (aggregator.py:rebuild_day, lines
      90-133), so a crashed backfill leaves either the old day or the new day,
      never a half-rebuilt one. Invoice recomputation reuses the AC4 path rather
      than a parallel one — one code path to audit, by design.
    code_locations:
      - file: billing/cli/backfill.py
        function: run
        lines: "18-61"
      - file: billing/aggregator.py
        function: rebuild_day
        lines: "90-133"
    coverage: full
```

**Why band 4-6:** The other high-value deceptive case: severity collapse via brilliance. The seven present entries are genuinely 9-10 grade — file:line, decisions, rejected alternatives. The tell: enumerate entries against the spec's AC list. AC7 (immutable audit record — the compliance-critical one) has no entry, no coverage: missing marker, no gap note. The dimension's question is "does EVERY acceptance criterion have a substantive entry," so one silent omission caps the score regardless of how good the rest is. Silent absence is also worse than an honest coverage: missing — marked-missing at least triggers the rubric's blocking-flag machinery; silence sidesteps it entirely. A lazy judge averages quality across what's present and scores 9; a calibrated judge counts first, reads second. Score 5, not lower: exactly one AC is dark ("multiple ACs missing" is the 1-3 anchor) and the rest is excellent — but no higher than 5, because the artifact gives zero signal it knows the gap exists.


## Band 7-8

### ac-cov-grounded-real-8 — score 8 (grounded-real)

**Scenario:** SPEC-002 (Gate 2c wiring), the gate's first live run. AC5 requires: a spec_fidelity score below the per-dimension minimum escalates to a human immediately, no re-dispatch. The artifact has all 8 ACs covered at this grade; excerpt shows AC5 verbatim from the shipped evidence file (which scored ac_coverage 8).

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC5
    ac_text: >
      (R8) Given a spec_fidelity dimension score below the per-dimension minimum,
      when Phase 3b evaluates the result, then the pipeline escalates to a human
      immediately with the artifact as evidence — no re-dispatch occurs.
    implementation_summary: >
      phase-comprehension.md §5 (lines 82-122) implements the dimension-aware
      routing as a four-row failure table: AC Coverage, Accuracy, and Scope
      Containment are classed "Artifact-quality" (re-dispatch may succeed); Spec
      Fidelity is classed "Implementation" with the rationale stated in the table
      itself ("Re-dispatch will NOT help. The artifact correctly describes an
      implementation that misses spec intent. Escalate to human."). Lines 103-104
      make the AC's exact behavior explicit: "If ONLY Spec Fidelity is below the
      minimum: escalate immediately, do not re-dispatch." Artifact-quality-only
      failures permit exactly one re-dispatch with the previous artifact's flags
      block as feedback (lines 114-122, cap stated at line 121). The same routing
      is restated in gate-check's Gate 2c section (line 115 bullet), and the
      agent's Step B4 (AGENT.md:168-183) closes the loop on the consumer side.
    code_locations:
      - file: skills/sdlc-run/references/phase-comprehension.md
        function: "§5 Handle the result (failure table, escalation rules, re-dispatch cap)"
        lines: "82-122"
      - file: skills/gate-check/SKILL.md
        function: "Gate 2c section step 4, failure-routing bullet"
        lines: "111-116"
      - file: agents/comprehension-scorer/AGENT.md
        function: "### Step B4: Address previous-attempt feedback"
        lines: "168-183"
    coverage: full
    rejected_alternatives: []
```

**Why band 7-8:** Solid 8, top of the 7-8 band: every AC has its own entry, locations are at section/symbol granularity WITH line spans, and the entry distinguishes the AC's expected behavior (escalate, never re-dispatch) from the mechanism delivering it (the four-row classification table) — and traces the behavior through all three surfaces that state it. The tell that holds it below 9-10: rejected_alternatives is empty and the entry explains mechanisms, not decisions — a cold reader cannot recover WHY the routing is asymmetric beyond what the diff text itself says. A lazy judge keys on density and fluency and drifts to 9; a calibrated judge checks the 9-10 anchor's explicit requirement (decisions with alternatives, "we chose X because Y") and finds it absent.

### ac-cov-substantive-pipeline-7 — score 7 (synthetic)

**Scenario:** A CSV ingestion pipeline spec with 5 ACs: streaming parse for large files, dedup on natural key, malformed-row quarantine, retry on transient S3 errors, and per-batch metrics (counts and timings). The diff touches pipeline/{dedupe,writer,metrics,quarantine}.py. All five ACs have entries of the grade shown; AC5 is genuinely only half-implemented.

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC2
    ac_text: "Given a batch containing rows with duplicate order_id + line_no, when ingestion runs, then only the first occurrence is written and duplicates are counted"
    implementation_summary: >
      dedupe.py:dedupe_batch() builds a seen-set keyed on (order_id, line_no) and
      drops repeats within the batch; cross-batch duplicates are caught by the
      ON CONFLICT DO NOTHING clause in writer.py:bulk_insert(), so the AC's
      "first occurrence wins" holds within a batch via the set and across batches
      via the unique index. Duplicate counts accumulate in
      metrics.py:BatchCounters.duplicates from both paths.
    code_locations:
      - file: pipeline/dedupe.py
        function: dedupe_batch
      - file: pipeline/writer.py
        function: bulk_insert
    coverage: full

  - ac_id: AC5
    ac_text: "Given a completed batch, when ingestion finishes, then per-batch metrics (counts and timings) are emitted"
    implementation_summary: >
      metrics.py:emit_batch() publishes rows_read, rows_written, duplicates and
      quarantined counts to StatsD after writer.py:bulk_insert() returns. Batch
      latency is NOT emitted — the timer scaffolding exists in BatchCounters but
      nothing reads it.
    code_locations:
      - file: pipeline/metrics.py
        function: emit_batch
    coverage: partial
    gap_notes: "AC5 requires counts and timings; only counts are emitted. The latency timer in BatchCounters is dead scaffolding."
```

**Why band 7-8:** A clean 7 — every 7-8 floor requirement met and nothing more: own entry per AC, file+function granularity, and the AC2 entry genuinely distinguishes the expected behavior (first-occurrence-wins) from the two-layer mechanism delivering it (in-batch set vs cross-batch unique index). Partial coverage is explicitly marked with an honest gap note rather than papered over. Not an 8: no line references, and the entries wouldn't fully spare a future engineer the diff read. The instructive contrast with the 4-6 band: this entry tells you WHERE (function) and HOW (mechanism); a thin entry restates WHAT the AC already said. Honest coverage: partial should never be punished below an artifact that claims full and hides the same gap.


## Band 9-10

### ac-cov-exemplary-10 — score 10 (synthetic)

**Scenario:** A notification-preferences UI spec with 4 ACs: AC1 a channel × event-type toggle matrix; AC2 optimistic persistence with rollback on API failure; AC3 a non-destructive pause-all master switch; AC4 (cross-cutting) every new user-facing string resolves through the i18n layer. The artifact has four entries; the excerpt shows AC2 and AC4 — AC1 and AC3 are at the same grade.

**Artifact excerpt (what the judge sees):**

```yaml
comprehension_entries:
  - ac_id: AC2
    ac_text: "Given a toggle change, when the API call fails, then the UI rolls back to the pre-change state and surfaces the failure"
    implementation_summary: >
      useTogglePreference() (src/settings/hooks/useTogglePreference.ts, lines 21-58)
      applies the change optimistically, snapshotting the prior matrix map (line 27)
      before the PATCH; on rejection it restores the snapshot (line 49) and raises
      ErrorBanner. We chose snapshot-restore over refetch-on-failure because a
      refetch would clobber a second toggle made while the first PATCH was in
      flight — the snapshot is keyed per-cell, so concurrent edits to other cells
      survive a rollback.
    code_locations:
      - file: src/settings/hooks/useTogglePreference.ts
        function: useTogglePreference
        lines: "21-58"
    coverage: full
    rejected_alternatives: ["refetch-on-failure (clobbers concurrent in-flight edits)"]

  - ac_id: AC4
    ac_text: "Every user-facing string introduced by this feature is resolved through the i18n layer"
    implementation_summary: >
      Cross-cutting — traced through all four touched components:
      PreferenceMatrix.tsx (lines 52, 67, 81: column headers and toggle aria-labels
      via t('settings.matrix.*')), PauseAllSwitch.tsx (lines 14-19: label and
      confirmation copy), SaveToast.tsx (lines 8-11: success/rollback messages),
      and ErrorBanner.tsx (line 22). All 14 new keys land in locales/en.json under
      settings.notifications.* (lines 204-218) with placeholders for the 5
      supported locales. Enforcement is structural, not just discipline: the
      existing eslint-plugin-i18n no-literal-strings rule now covers
      src/settings/** via the .eslintrc override added at line 31, so a hardcoded
      string fails lint rather than shipping.
    code_locations:
      - file: src/settings/PreferenceMatrix.tsx
        function: buildMatrix
        lines: "52, 67, 81"
      - file: src/settings/PauseAllSwitch.tsx
        function: PauseAllSwitch
        lines: "14-19"
      - file: src/settings/SaveToast.tsx
        function: SaveToast
        lines: "8-11"
      - file: locales/en.json
        function: module-level
        lines: "204-218"
    coverage: full
```

**Why band 9-10:** Every 9-10 marker is present with zero gaps: file:line references on every location, every entry records a decision plus the rejected alternative plus the why (snapshot-restore vs refetch, with the concurrency rationale), and the cross-cutting AC4 is individually traced through every affected module AND names the enforcement mechanism that keeps it true. A calibrated judge asks "what question would a future engineer still have?" and finds none. 10s should be rare — this is one because the spec is small (4 ACs) and the artifact is exhaustive at every anchor; a judge should NOT extrapolate a 10 from two good entries in a large artifact without checking all of them.

### ac-cov-grounded-augmented-9 — score 9 (grounded-real-augmented)

**Scenario:** SPEC-003 (SYSTEM-SPEC domain split), a prompt-only diff making six plugin consumers layout-aware. AC4 requires: missing domain: frontmatter → autonomous runs halt with an escalation listing existing domains, nothing written; interactive runs prompt the author. All eight entries in the artifact carry this granularity; the excerpt shows AC4. (This is the real seed #2 entry with decision rationale and rejected_alternatives added — the lift the live run said it lacked.)

**Artifact excerpt (what the judge sees):**

```yaml
  - ac_id: AC4
    ac_text: >
      Given a split-layout project and a closing spec with no domain: field, when
      compaction runs autonomously, then compaction halts with an escalation
      listing the existing domains — no file is modified; when run interactively,
      the author is prompted to choose or create a domain.
    implementation_summary: >
      Three coordinated surfaces. (1) The compactor agent itself never guesses:
      AGENT.md rule 2 (line 49) — if no domain: is declared, "write NOTHING",
      stop, and report to the invoker with the existing domains read from the
      index's Domains table, message shape included. (2) Autonomous surface:
      sdlc-close SKILL.md:84 (merge strategy) and :107 (PR strategy) — "compaction
      HALTS with nothing written"; the halt is treated as a compaction failure
      (spec stays status: closed, merge/PR not rolled back). (3) Interactive
      surface: spec-compact SKILL.md:101-106 prompts the author to choose an
      existing domain or create one, writing the choice into the spec's
      frontmatter BEFORE dispatching the compactor. Interactivity lives in the
      invoking skill rather than the agent because a dispatched subagent cannot
      prompt a human — the agent's halt-and-report covers every path that reaches
      it without a domain, so both AC clauses are delivered without overlap.
    code_locations:
      - file: agents/spec-compactor/AGENT.md
        function: "Split-Layout Routing — rule 2"
        lines: "49"
      - file: skills/sdlc-close/SKILL.md
        function: "halt-never-guess bullets (both strategies)"
        lines: "84, 107"
      - file: skills/spec-compact/SKILL.md
        function: "single-spec step 4"
        lines: "101-106"
    coverage: full
    rejected_alternatives:
      - "agent-side prompting (rejected: dispatched subagents have no human channel)"
      - "defaulting to a 'misc' domain (rejected: spec anti-pattern — wrong-domain filing corrupts the provenance map)"
```

**Why band 9-10:** This clears 9: file:line references throughout, the AC's two behavioral clauses (halt vs prompt) are explicitly separated from the mechanism that delivers each (agent halt-and-report vs skill-side pre-dispatch resolution), the multi-surface requirement is traced through every affected file, and the entry now records decisions with rejected alternatives and the why. Held at 9 rather than 10 because two locations remain section-granularity and one alternative's rationale is asserted rather than tied to a diff citation. The calibration contrast: without the rejected_alternatives and the "because a subagent cannot prompt a human" decision rationale, this exact entry scored 8 in the live run — the 8→9 step is decision rationale, not more line numbers.

