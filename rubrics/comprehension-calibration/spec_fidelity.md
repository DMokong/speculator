# Gate 2c Calibration Corpus — spec_fidelity

Band-verified calibration examples for the `spec_fidelity` dimension of `rubrics/comprehension.md`.
Each example was generated grounded in real Gate 2c artifacts or domain-varied synthetic
scenarios, then adversarially band-verified by a blind judge (proposed band hidden) —
only band-accurate examples were kept. See ../comprehension-calibration/README.md for usage.

## Band 1-3

### fidelity-lvs-session-hide — score 2 (letter-vs-wrong)

**Scenario:** Auth module spec. Problem statement: support discovered stolen session tokens being replayed days after victims were 'logged out by timeout' — sessions must stop being usable 30 minutes after last activity. Spec anti-pattern: 'Client-side-only expiry is NOT acceptable — the token itself must die server-side.' AC1: given 30 minutes of inactivity, when the user makes a request through the web app, then they are redirected to login. The diff confirms every claim in the entry.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Given 30 minutes of inactivity, when the user makes a request through the web app, then they are redirected to login"
  implementation_summary: >
    session-middleware.ts:checkActivity() (lines 41-63) compares the
    last_active timestamp in the session cookie against SESSION_IDLE_MS
    (= 1_800_000, config/auth.ts:9). On expiry the middleware clears the
    cookie and responds 302 to /login. The session record in Redis is
    retained unchanged so the audit trail and the mobile API's /v2/refresh
    flow keep working; last_active is only advanced by web requests.
  code_locations:
    - file: src/session-middleware.ts
      function: checkActivity
      lines: "41-63"
  coverage: full
```

**Why band 1-3:** The tell is inside the explanation itself: 'the session record in Redis is retained unchanged' and '/v2/refresh ... keeps working' — the token stays alive server-side, which is exactly the stolen-token replay surface the problem statement exists to close and the anti-pattern names as forbidden (edge-only expiry IS client-side-only expiry in effect). The AC's web-redirect letter is fully satisfied and every file:line claim is accurate — that accuracy belongs to the Accuracy dimension, not this one. A lazy judge keys on the precision and the plausible 'audit trail' rationale and scores 7; a calibrated judge scores the described BEHAVIOR against intent, notes the anti-pattern names the chosen implementation (blocking-flag territory), and lands at 2.

### fidelity-lvs-ratelimit-queue — score 2 (letter-vs-spirit)

**Scenario:** API gateway rate-limiting spec. Problem statement: a single tenant's burst traffic starved shared workers during the March incident; we need per-tenant backpressure that sheds load. Spec anti-pattern: 'Do NOT buffer over-limit requests — deferred load is still load, and clients that never see an error never back off.' AC2: given a tenant exceeding 100 req/min, over-limit requests are not forwarded to the worker pool within that window. The diff matches the entry exactly, including the deferral queue.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  ac_text: "Given a tenant exceeding 100 req/min, when the limit is hit, then over-limit requests are not forwarded to the worker pool within that window"
  implementation_summary: >
    gateway/limiter.ts:acquire() (lines 27-58) tracks a per-tenant sliding
    window. Requests over the 100/min threshold are placed on a per-tenant
    deferral queue (limiter.ts:71) and drained into the worker pool as the
    window rolls forward, preserving request order. Callers see normal 200
    responses with elevated latency rather than errors, so no client retry
    logic is triggered. Load tests confirm zero over-limit requests reach
    workers inside the window.
  coverage: full
```

**Why band 1-3:** Letter perfectly satisfied — load-test evidence proves no over-limit request reaches workers inside the window. But the spec's anti-pattern forbids buffering verbatim, and the entry advertises the intent-defeating property ('callers see normal 200 responses ... no client retry logic is triggered') as a benefit: clients never receive the back-off signal the problem statement demands, and deferred load still lands on shared capacity. This is the dark-code shape exactly: passing evidence + accurate prose + defeated purpose. A lazy judge rewards the 'load tests confirm' sentence and scores 7-8. A calibrated judge sees a spec anti-pattern naming the chosen implementation as forbidden — blocking flag, score 2.

### fidelity-lvs-retry-swallow — score 3 (letter-vs-spirit)

**Scenario:** Data-pipeline ingestion spec. Problem statement: analytics undercounting was traced to silently dropped batches — nothing may be lost without an operator finding out. Requirements prose says persistent failures 'surface to the on-call,' but the only written AC pins retry mechanics: given a transient warehouse failure, the batch write is retried up to 3 times with exponential backoff. The diff confirms the retry schedule, the debug-level log, and the offset commit; the artifact's other entries are sound.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC3
  ac_text: "Given a transient warehouse failure, when a batch write fails, then the write is retried up to 3 times with exponential backoff"
  implementation_summary: >
    ingest/writer.ts:writeBatch() (lines 102-131) retries failed writes 3
    times at 2s/4s/8s. After the third failure the batch is serialized to
    the debug log (logger.debug, writer.ts:128) and the Kafka offset is
    committed so the consumer group is never blocked by a poison batch —
    pipeline liveness is preserved under sustained warehouse outages.
  coverage: full
```

**Why band 1-3:** Every written AC is satisfied — retry count and backoff match. The tell is 'logger.debug ... and the Kafka offset is committed': after retries exhaust, the batch is acked and dropped at a log level nobody pages on, which is precisely the silent-loss failure the problem statement opens with ('nothing may be lost without an operator finding out'). The entry presents the durability-vs-liveness conflict as resolved instead of surfacing it. Score 3 rather than 2 because no anti-patterns section names ack-and-drop verbatim and liveness is a real concern the spec under-specified — but the spec's stated purpose is still defeated. A lazy judge pattern-matches 'retries with exponential backoff' to the AC text and scores 7.

### fidelity-lvs-banner-localstorage — score 3 (letter-vs-spirit)

**Scenario:** UI feature spec for dismissing a 'what's new' banner. Problem statement: users report the banner reappearing after dismissal — across devices and after browser updates — and call it disrespectful; dismissal must be permanent. AC1: given a user dismisses the banner, when they reload the page, then it does not reappear. The diff confirms the localStorage write and the Playwright reload test.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Given a user dismisses the banner, when they reload the page, then the banner does not reappear"
  implementation_summary: >
    Banner.tsx:handleDismiss() (lines 22-29) writes
    localStorage["banner_dismissed_v3"] = "1"; the render guard at
    Banner.tsx:14 returns null when the key is present. The flag is
    namespaced per banner version so future banners are unaffected by old
    dismissals. Playwright coverage reloads the page and asserts the
    banner stays hidden.
  coverage: full
```

**Why band 1-3:** The AC letter passes — same browser, reload, banner gone. But the problem statement names cross-device and post-browser-state recurrence as the exact complaint, and localStorage cannot deliver account-level permanence by construction: the user buys a new laptop and the 'disrespectful' banner is back. The version-namespacing detail makes the entry read thoughtful, which is the trap. Score 3: single entry, no anti-patterns section to trip a blocking flag, but the spec's central purpose (permanent, per-user) is missed and unflagged. A lazy judge sees 'persisted', a passing e2e test, and a tidy namespacing rationale, and scores 7.


## Band 4-6

### fidelity-lvs-killswitch-pinned — score 4 (letter-vs-spirit)

**Scenario:** Feature-flag kill switch for a checkout recommendation widget. Problem statement: during the April incident the widget's vendor API hung checkout for 40 minutes; ops needs to disable it instantly without a deploy. AC5: given kill_switch=false is set, when a user STARTS A NEW SESSION, then the widget is not served. The artifact has six entries; the other five are intent-clean. The diff confirms flags are fetched once at session creation and pinned for the session's lifetime.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC5
  ac_text: "Given kill_switch=false is set, when a user starts a new session, then the widget is not served"
  implementation_summary: >
    flags/provider.ts:resolveFlags() (lines 33-47) fetches the flag set
    once at session creation and pins it in the session context for the
    session's lifetime, giving each user a consistent experience and
    cutting flag-service traffic by ~95%. New sessions created after the
    switch flips never render the widget.
  intent_notes: >
    Honors the spec's no-deploy disable intent: flipping the flag requires
    only a config write and takes effect without any code release.
  coverage: full
  rejected_alternatives: []
```

**Why band 4-6:** Intent-washing: the intent_notes claim is a partial truth — no-deploy is genuinely honored, but the spec's purpose is INSTANT disablement during an incident, and session-pinned flags leave the hung widget live for every in-flight session, potentially for hours mid-incident. The AC's own 'starts a new session' wording invited the narrowing, which is why this sits at the band floor (4) rather than 1-3: one entry of six, the spec letter is fully satisfied, and the AC text shares blame. The calibrated tell: presence of intent_notes is not intent fidelity — verify the claim against the problem statement's timeline (40-minute incident vs session-length staleness). A lazy judge sees intent vocabulary engaging with the spec and scores 8-9, exactly the charitable drift this example exists to punish.

### fidelity-syn-dedup-window — score 5 (synthetic)

**Scenario:** Event-pipeline dedup spec. Problem statement: replays and producer retries double-count events in daily revenue aggregates; ingestion must be idempotent so a replayed event never changes an aggregate. The critical user journey explicitly includes a 7-day backfill replay from the retention buffer. AC2: given the same event_id ingested twice, when daily aggregation runs, then the event contributes exactly once. The diff confirms the 1-hour Redis TTL.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  ac_text: "Given the same event_id is ingested twice, when daily aggregation runs, then the event contributes exactly once"
  implementation_summary: >
    dedup/store.ts:seen() (lines 18-36) records event_ids in a Redis set
    with a 1-hour TTL; ingest/consumer.ts:74 drops events whose id is
    already present. Producer-retry duplicates arrive within seconds, so
    the 1-hour window covers them with two orders of magnitude of headroom
    while keeping the dedup set's memory footprint flat.
  coverage: full
```

**Why band 4-6:** Classic defensible-but-narrower-unflagged, mid-band. The headroom argument is quantitatively rigorous about the wrong duplicate source: producer retries (seconds) are covered, but the spec's journey names 7-day backfill replays, which sail past a 1-hour TTL and double-count revenue — the precise outcome the problem statement forbids. The engineering choice is defensible (memory footprint), but the entry neither tests the replay path nor flags the narrowing, so a future reader believes idempotency is total. Score 5, not 2-3: the dominant duplicate source IS handled and intent is partially served. A lazy judge is disarmed by 'two orders of magnitude of headroom' and scores 7; a calibrated judge checks the headroom claim against the OTHER source the spec names.

### fidelity-syn-autosave-blur — score 5 (synthetic)

**Scenario:** Document-editor autosave spec. Problem statement: users lose work to crashes and accidental tab closes; no more than 30 seconds of work may ever be lost. AC1: given active editing, when 30 seconds elapse since the last save, then changes are persisted. The diff confirms the visibility-aware timer and the beforeunload flush.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Given active editing, when 30 seconds elapse since the last save, then changes are persisted"
  implementation_summary: >
    useAutosave.ts (lines 12-44) schedules a save every 30s via a
    visibility-aware timer: the interval runs while the document tab is
    focused and is suspended on blur to avoid competing with other tabs
    for the save endpoint, resuming on refocus. A final flush fires on the
    beforeunload event.
  coverage: full
```

**Why band 4-6:** Reading 'active editing' as 'tab focused' is defensible — but the spec's loss budget ('no more than 30 seconds, ever') is anchored to crashes and OS kills, where beforeunload never fires and a blurred tab with unsaved dictation or paste-in edits can lose unbounded work. The suspension-on-blur optimization narrows the guarantee exactly where the problem statement lives, and the entry doesn't flag the interpretation or its gap. Score 5: implementation serves intent in the common path, one consequential unflagged narrowing. The lazy-judge trap is that 'visibility-aware timer' reads as extra diligence rather than as the narrowing itself.

### fidelity-syn-lockout-ambiguity — score 6 (synthetic)

**Scenario:** Auth lockout spec. Problem statement: credential-stuffing runs are getting unlimited guesses. AC1: given 5 failed login attempts for an account, when a 6th occurs, then the account is locked for 15 minutes. The spec is silent on which failures count; the diff shows the counter increments only on password failures — the OTP-verification failure path (login.ts:67) bypasses recordFailure entirely. The artifact's other entries align with intent.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Given 5 failed login attempts for an account, when a 6th attempt occurs, then the account is locked for 15 minutes"
  implementation_summary: >
    auth/lockout.ts:recordFailure() (lines 21-49) increments a per-account
    counter in Redis; at the threshold the account enters a locked state
    enforced by login.ts:31 for LOCKOUT_WINDOW_MS (= 900_000).
    lockout.test.ts covers the 5-then-locked sequence and the 15-minute
    release.
  coverage: full
```

**Why band 4-6:** Nothing described is wrong, and the AC behavior is genuinely delivered — that is what makes this a severity-collapse trap in the other direction. The spec's threat model (stuffing = unlimited guesses) makes 'which failures count' intent-bearing, and the diff's narrower reading (password failures only; OTP failures uncounted, leaving a second guess channel) is never called out. The 7-8 band requires that where the spec is ambiguous the entry states the interpretation and the alternative; this entry is silent, so the judge cannot confirm intent-match on the spec's central threat. Cap at 6 — top of Adequate. A lazy judge scores 7-8 because no violation is visible; the calibrated tell is what's MISSING from the entry, not what's in it.


## Band 7-8

### fidelity-real-singlesource-drift — score 7 (grounded-real)

**Scenario:** Real seed #2 (SPEC-003, system-spec-domain-split). R1 requires the layout/routing rules to live in one place (lib/system-spec-layout.md) with every consumer referencing rather than restating; Risk 2's mitigation restates the single-reference principle. The shipped diff enforces all four spec anti-patterns at every surface, but three routing behaviors (amends-in-place, index repair, index creation) exist only in the compactor agent prompt and not in lib. The artifact surfaces this itself.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  intent_notes: >
    Rule 6 (AGENT.md:53) additionally routes cross-domain amendments in
    place where the amended behavior lives, keeping its original owner —
    an implementer-defined extension of this routing surface beyond the
    AC's letter; evaluated under unexplained_behaviors and spec_fidelity.
flags:
  recommended:
    - >
      Single-source drift risk: three routing behaviors exist only in
      agents/spec-compactor/AGENT.md and not in lib/system-spec-layout.md —
      rule 6 amends-in-place (line 53), rule 4's index-repair sentence
      (line 51), and the index-creation extension (line 80). R1 and the
      Risk 2 mitigation establish lib as "a single reference" for these
      rules; mirror the three into lib's Routing Rules so the canonical
      file stays complete.
```

**Why band 7-8:** Every AC's letter is delivered and all four spec anti-patterns are enforced at every surface — but three routing rules living only in the compactor prompt is a genuine deviation from R1/Risk-2's single-reference intent, and it is the exact drift mechanism the spec set out to prevent. What holds this AT 7 rather than dropping it to 5-6 is that the artifact catches and flags the deviation itself, with a concrete remediation: a flagged, small, letter-preserving deviation is the definition of 'faithful, covers every AC, matches intent' with a known nick. Two lazy-judge errors to avoid: inflating to 8-9 because the self-flagging reads as excellence (the deviation is still real and unfixed), or crashing to 5 by treating it as an unflagged narrowing (it WAS flagged — that's the band-4-6 discriminator).

### fidelity-real-recompute-overstated — score 7 (grounded-real)

**Scenario:** Real seed #1 (SPEC-002, gate-2c-wiring). AC4 requires the evidence overall to be 'mechanically recomputable from the recorded weights,' and new rubric text names verify-evidence.sh as the consumer that recomputes. The pre-existing script (unchanged in the diff) registers 2c evidence as kind 'plain' and never runs its recomputation check on it — so the data property holds but the named verification pathway does not. The artifact discovered this by reading the consumer script outside the diff.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC4
  intent_notes: >
    The recomputability PROPERTY holds — weights, dimensions, overall,
    threshold, and per_dimension_minimum are all recorded, so any reader
    can recompute mechanically (this very file demonstrates conformance).
    One narrowing caveat found by cross-checking the named consumer: the
    pre-existing scripts/verify-evidence.sh (unchanged in this diff)
    registers gate-2c-comprehension.yml as kind "plain" (line 350), and
    its weight-recomputation check (check_scorecard) only runs for kind
    "scorecard" (line 374) — 2a/2b get recomputed, 2c currently gets only
    exists/parses/result/blocking-flag checks. The rubric comment at line
    443 therefore overstates today's script behavior. See recommended flag.
```

**Why band 7-8:** Letter of every AC satisfied; intent satisfied on 7 of 8 with one overstated verification claim — newly shipped rubric text promises a mechanical check its named consumer cannot perform, a narrowing delivery the diff does not itself flag. The artifact earns the 7 by doing exactly what the band demands: it cross-checked the claim against the actual consumer (outside the diff), separated the data property (holds) from the verification pathway (doesn't), and converted the gap into an actionable flag with a likely-one-line fix. Calibrated tell: an implementation that quietly overstates its own verifiability is an intent deviation even when every recorded field is correct. A lazy judge either never reads the consumer script and scores 8+, or fails to notice the deviation lives in the shipped text rather than merely in the artifact's prose.

### fidelity-syn-ratelimit-faithful — score 8 (synthetic)

**Scenario:** Same API-gateway rate-limiting spec as fidelity-lvs-ratelimit-queue (backpressure that sheds load; anti-pattern forbids buffering), but a faithful implementation: over-limit requests are rejected with 429 + Retry-After. The spec never defines what 'tenant' keys on (api_key vs organization); the March incident traffic came from one org spread across 14 keys. The diff confirms every claim, including the absence of any queue path.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC2
  ac_text: "Given a tenant exceeding 100 req/min, when the limit is hit, then over-limit requests are rejected"
  implementation_summary: >
    gateway/limiter.ts:acquire() (lines 27-54) enforces a per-tenant
    sliding window; over-limit requests are rejected immediately with 429
    and a Retry-After header derived from the window remainder
    (limiter.ts:49), so well-behaved clients back off instead of retrying
    hot. No queueing or deferral path exists — rejected requests never
    reach the worker pool. The spec doesn't define the tenant key; we
    keyed on organization_id rather than api_key because the March
    incident traffic came from one org spread across 14 keys — per-key
    limiting would have let the same actor recreate the incident, and was
    rejected for that reason.
  coverage: full
```

**Why band 7-8:** The described behavior delivers the spec's actual outcome (load shed, back-off signal sent), and the entry does the 7-8 band's distinctive work: the spec's ambiguity (tenant key) is explicitly called out with the chosen interpretation, the alternative, and a rationale tied to the spec's motivating incident. That ambiguity callout is what separates 8 from 7. It is not 9-10: the entry never names the spec's anti-pattern as such or shows structural protection against regression (e.g., a test asserting no buffer path can be reintroduced) — 'no queueing path exists' is an assertion, not a demonstrated guard. A severity-collapsed judge gives this the same 7 as everything else; the calibrated discriminator is the interpretation-plus-rejected-alternative, which most 7s lack.


## Band 9-10

### fidelity-syn-session-revocation — score 9 (synthetic)

**Scenario:** Same auth session-expiry spec as fidelity-lvs-session-hide (stolen tokens replayed after 'timeout'; anti-pattern: client-side-only expiry NOT acceptable), but a faithful implementation: expiry enforced in the session store via Redis TTL, with all token consumers funneled through one accessor and a replay test across every consumer. The diff confirms the lint rule, the TTL mechanics, and the four-consumer replay test.

**Artifact excerpt (what the judge sees):**

```yaml
- ac_id: AC1
  ac_text: "Given 30 minutes of inactivity, when any request presents the session token, then the request is rejected and the user must re-authenticate"
  implementation_summary: >
    Expiry is enforced in the session store itself, not at the edge:
    session-store.ts:touch() (lines 30-44) sets a Redis EXPIRE of
    SESSION_IDLE_MS on every authenticated request, so an idle session's
    record ceases to exist server-side at minute 30. All four token
    consumers (web middleware, mobile gateway, /v2/refresh,
    websocket-auth) resolve sessions exclusively through
    session-store.ts:get(), verified by the import-boundary lint rule
    (eslint-rules/session-access.js), so no surface can honor a token the
    store has expired.
  intent_notes: >
    Spec anti-pattern "client-side-only expiry is NOT acceptable" is
    structurally avoided: the cookie carries only the opaque session id —
    there is no client-readable expiry to spoof, and clearing or keeping
    the cookie has no effect on server-side validity. The AC alone could
    be gamed by rejecting at the web edge while /v2/refresh still accepted
    the token; the import-boundary rule plus session-replay.test.ts:88
    (replays an expired token against all four consumers) close that path.
  rejected_alternatives:
    - "Edge-middleware timestamp check (rejected: leaves the store record valid for non-web consumers — the exact replay window the spec exists to close)"
  coverage: full
```

**Why band 9-10:** This is the 9-10 contract executed verbatim: the entry names the spec anti-pattern and shows HOW it is structurally avoided (opaque id, store-side TTL — nothing client-side to spoof); it identifies exactly how the AC alone could be gamed (edge rejection with a live refresh path — the letter-vs-spirit twin of this example) and demonstrates the additional checks that protect against it (import-boundary lint + expired-token replay across all four consumers); and the rejected alternative is the gaming path itself, with the spec's reasoning attached. Score 9 not 10 — the rare band is earned per-entry, and one anchor should still leave headroom for an artifact that does this across every AC. The calibration purpose: a severity-collapsed judge hands this 7-8 like everything else; the discriminators that justify 9 are anti-pattern naming, the explicit gaming analysis, and verifiable guards — not prose length.

