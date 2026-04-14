# Eval Quality Gate (Gate 2b) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Gate 2b (Eval Quality Scoring) to the Speculator pipeline — an opt-in gate that scores whether test suites are faithful instruments of spec acceptance criteria, using a 7-dimension LLM-as-judge rubric.

**Architecture:** A new `eval-quality-scorer` agent reads the spec + test files, scores them against a 7-dimension rubric (`rubrics/eval-quality.md`), and emits `evidence/gate-2b-eval-quality.yml`. The gate-check skill routes `gate=eval-quality` to this agent. The sdlc-run pipeline detects the missing evidence artifact and runs Gate 2b after Gate 2 (if enabled in config).

**Tech Stack:** Markdown rubric files, YAML evidence artifacts, AGENT.md frontmatter pattern (same as spec-scorer), Bash for smoke testing.

**Design reference:** `docs/superpowers/specs/2026-04-15-anti-dark-code-pipeline-design.md`
**Research reference:** `docs/plans/2026-04-10-eval-quality-scoring-research.md`

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Create | `rubrics/eval-quality.md` | 7-dimension rubric with scoring criteria and calibration examples |
| Create | `agents/eval-quality-scorer/AGENT.md` | Agent that reads spec + tests, scores, emits YAML artifact |
| Create | `skills/sdlc-run/references/phase-eval-quality.md` | How to run Gate 2b in the autonomous pipeline |
| Modify | `skills/gate-check/SKILL.md` | Add `eval-quality` to valid gates, add evidence check and collection guidance |
| Modify | `skills/sdlc-run/SKILL.md` | Add Gate 2b to phase detection table |
| Modify | `.claude/sdlc.local.md` | Add `gates.eval-quality` config block |
| Modify | `templates/spec-template.md` | Add AC-to-test traceability note |

---

## Task 1: Write the Eval Quality Rubric

This is the primary deliverable. Everything else wires it in. The rubric content determines how reliably the gate catches low-quality test suites — do not skip calibration examples.

**Files:**
- Create: `rubrics/eval-quality.md`

- [ ] **Step 1: Create the rubric file**

```markdown
# Eval Quality Rubric

You are evaluating a test suite's quality as an instrument for detecting violations of a software specification's acceptance criteria. Your job is to assess whether each test faithfully captures the specified behavior — not whether the implementation is correct.

**Critical framing:** Assume the implementation is correct. A low-scoring test suite means the tests would fail to detect spec violations even when violations exist. A high-scoring test suite would reliably catch any deviation from spec intent.

## Anti-Inflation Guidance

A score of 7 means "tests are good instruments — most ACs are well-covered with behavioral assertions." A score of 8 means "strong eval suite — tests would reliably catch spec violations." Scores of 9-10 should be rare, reserved for test suites where every assertion is behavioral, intent-faithful, and discriminating. Most first-pass test suites land between 4 and 7.

---

## Dimension 1 — AC Coverage (weight: 0.25)

Does every acceptance criterion have at least one test mapped to it? And does that mapping have quality — not just a test that exists, but a test that actually exercises the AC?

- **1-3 (Poor):** Multiple ACs have no corresponding test at all. The test suite covers features not in the spec while leaving specified behaviors untested.
- **4-6 (Adequate):** All ACs have at least one test mapped, but many mappings are nominal — the test name references the AC but the assertions don't verify the AC's observable outcome.
- **7-8 (Good):** All ACs have tests with clear observable assertions. Each test name communicates which AC it covers. A reviewer can trace each AC to a specific test with a specific assertion.
- **9-10 (Excellent):** All ACs have tests with assertions + descriptions connecting test intent to AC intent. Tests for related ACs are grouped logically. Coverage of the full AC set is unambiguous.

### Calibration Examples

**Score 2-3:**
```
# Spec has ACs: AC1 (login), AC2 (logout), AC3 (session expiry), AC4 (rate limiting)
# Tests:
test_login()          # ✓ maps to AC1
test_logout()         # ✓ maps to AC2
# AC3 and AC4 have no tests at all
```

**Score 5-6:**
```
# All ACs mapped, but mappings are thin:
def test_login():
    response = client.post("/login", data={"user": "a", "pass": "b"})
    assert response.status_code == 200    # exists but doesn't verify AC1's intent
                                          # (AC1: "user receives a session token")

def test_session_expiry():
    # test name maps to AC3 but only checks that the endpoint exists
    response = client.get("/session")
    assert response.status_code != 500
```

**Score 7-8:**
```
def test_ac1_login_returns_session_token():
    response = client.post("/login", data={"user": "alice", "pass": "correct"})
    assert response.status_code == 200
    assert "session_token" in response.json()
    assert len(response.json()["session_token"]) > 0   # observable AC1 behavior

def test_ac3_session_expires_after_timeout():
    token = login_and_get_token()
    advance_clock(hours=25)    # beyond 24h session limit per spec
    response = client.get("/protected", headers={"Authorization": token})
    assert response.status_code == 401   # observable AC3 behavior
```

**Score 9-10:**
```
# Same tests as 7-8, PLUS:
# - Test description strings explain which AC and why
# - AC4 (rate limiting) has 3 tests: happy path, boundary (99 req), exceeded (101 req)
# - Tests are grouped in a class named TestAC1_Login, TestAC3_SessionExpiry etc.
# - Each test has a docstring: "AC3: session token must be rejected after 24h per spec"
```

---

## Dimension 2 — Behavioral Specificity (weight: 0.25)

Does each test verify a behavior described in the AC, or an incidental implementation artifact? A behaviorally specific test would fail if the specified behavior broke, even if the implementation changed.

Anti-patterns (low scores):
- Asserting internal/private state or method call counts without behavioral motivation
- Asserting class names, module paths, or import structure
- Asserting response shape (e.g., "response is a list") without asserting content
- Mock assertions that check "function was called" without checking observable system behavior

Good signals (high scores):
- Assertions are at the system's public interface or observable output
- The test would fail if the specified behavior broke even if the implementation was completely rewritten
- No dependency on implementation internals visible in assertions

- **1-3 (Poor):** Most tests assert implementation internals. Tests would pass even if the specified behavior was broken, as long as the internal structure is preserved.
- **4-6 (Adequate):** Mix of behavioral and structural assertions. Some tests catch behavior; others would miss behavioral regressions.
- **7-8 (Good):** Most assertions are behavioral. Tests assert observable system outputs, not internal mechanics. A complete implementation rewrite wouldn't break the tests as long as behavior is preserved.
- **9-10 (Excellent):** All assertions are behavioral. Zero implementation leakage. Tests read like a behavioral specification, not a code audit.

### Calibration Examples

**Score 2-3:**
```python
def test_email_notification():
    notifier = EmailNotifier()
    notifier.send("user@test.com", "Hello")
    # Asserts implementation internals, not observable behavior:
    assert notifier._smtp_client.send_message.call_count == 1
    assert notifier._queue.empty() == True
    assert isinstance(notifier._last_message, EmailMessage)
```

**Score 5-6:**
```python
def test_email_notification():
    with mail_server_mock() as server:
        send_notification("user@test.com", "Hello")
        # Mixes behavioral and structural:
        assert server.received_count == 1          # behavioral ✓
        assert server.last_message["to"] == "user@test.com"  # behavioral ✓
        assert "EmailNotifier" in str(type(mailer))  # structural ✗
```

**Score 7-8:**
```python
def test_email_notification():
    with mail_capture() as captured:
        send_notification("user@test.com", "Hello")
        # All behavioral:
        assert len(captured.sent) == 1
        assert captured.sent[0]["to"] == "user@test.com"
        assert "Hello" in captured.sent[0]["body"]
```

**Score 9-10:**
```python
def test_email_notification_delivers_to_recipient():
    """AC2: notification must arrive at recipient's inbox within 30s"""
    with mail_capture() as captured:
        send_notification("user@test.com", subject="Hello", body="World")
        assert len(captured.sent) == 1, "exactly one email sent"
        msg = captured.sent[0]
        assert msg["to"] == "user@test.com"    # correct recipient
        assert msg["subject"] == "Hello"        # correct subject
        assert "World" in msg["body"]           # correct content
        assert msg["delivered_at"] <= now() + timedelta(seconds=30)  # latency AC
```

---

## Dimension 3 — Intent Fidelity (weight: 0.20)

Does the test capture the *spirit* of the AC, not just the letter? The canonical failure mode: AC says "users can delete their account," test asserts `HTTP 200 on DELETE /account` — letter satisfied, spirit missed (data not actually deleted).

- **1-3 (Poor):** Tests verify the literal surface behavior but would pass even when the underlying intent is violated. Letter-testing masquerading as behavioral coverage.
- **4-6 (Adequate):** Tests get the main intent but miss important consequences. "Happy path spirit" captured; edge cases and secondary outcomes ignored.
- **7-8 (Good):** Tests capture both the primary outcome and the important consequences. The spec's "why" is reflected in what gets asserted.
- **9-10 (Excellent):** Tests would catch any plausible violation of the AC's intent, including subtle ones. Reading the tests, you understand the purpose, not just the mechanics.

### Calibration Examples

**Score 2-3:**
```
# AC: "Users can delete their account and all associated data"
def test_account_deletion():
    response = client.delete("/account/123")
    assert response.status_code == 200   # letter only — data might still exist
```

**Score 5-6:**
```
# Same AC
def test_account_deletion():
    response = client.delete("/account/123")
    assert response.status_code == 200
    # Checks account is gone but misses "all associated data":
    assert client.get("/account/123").status_code == 404
    # user's posts, comments, profile still exist — spirit partially missed
```

**Score 7-8:**
```
# Same AC
def test_account_deletion():
    user_id = create_user_with_data()  # creates account + posts + profile
    client.delete(f"/account/{user_id}")
    # Checks the primary outcome AND the data consequence:
    assert client.get(f"/account/{user_id}").status_code == 404
    assert db.query(Post).filter_by(user_id=user_id).count() == 0
    assert db.query(Profile).filter_by(user_id=user_id).count() == 0
```

**Score 9-10:**
```
# Same AC — also covers the "why" (GDPR compliance, user trust):
def test_account_deletion_removes_all_pii():
    """AC: account deletion must purge all PII per spec intent (not soft-delete)"""
    user_id = create_user_with_full_profile()
    original_email = get_user_email(user_id)
    client.delete(f"/account/{user_id}")
    # Verifies hard delete, not soft delete:
    assert not db.execute("SELECT * FROM users WHERE id=?", user_id).fetchone()
    assert not db.execute("SELECT * FROM user_data WHERE user_id=?", user_id).fetchone()
    # Verifies PII is not in audit logs either:
    assert original_email not in get_audit_log_text()
```

---

## Dimension 4 — Sensitivity / Discriminability (weight: 0.15)

Would this test fail if the specified behavior broke? Not "would it catch any bug" but "would it catch a bug that violates THIS AC?" A test that always passes regardless of input has zero discriminability.

- **1-3 (Poor):** Tests pass regardless of whether the specified behavior exists. Empty assertions, trivially true conditions, or tests that never exercise the actual behavior path.
- **4-6 (Adequate):** Tests would catch obvious, complete failures (feature entirely absent) but would miss subtle violations (feature present but wrong).
- **7-8 (Good):** Tests have precise expected values that would fail on any plausible AC-violating behavior. Input/output pairs are specific enough that a correct implementation is required to pass.
- **9-10 (Excellent):** Tests include boundary cases and adversarial inputs where the specified behavior is most likely to break. Multiple discriminating assertions per AC.

### Calibration Examples

**Score 2-3:**
```python
def test_rate_limiting():
    # AC: "reject requests exceeding 100/minute"
    for _ in range(5):
        response = client.get("/api/data")
    assert response.status_code in [200, 429]  # always true — no discriminability
```

**Score 5-6:**
```python
def test_rate_limiting():
    for _ in range(200):
        client.get("/api/data")
    response = client.get("/api/data")
    assert response.status_code == 429   # catches complete absence, but:
    # - Doesn't verify the EXACT threshold (100) — would pass with limit=50 or 150
    # - Doesn't verify the reset window (1 minute)
```

**Score 7-8:**
```python
def test_rate_limit_enforced_at_threshold():
    # Sends exactly 100 requests — should all succeed
    for _ in range(100):
        r = client.get("/api/data")
        assert r.status_code == 200, f"request {_+1} should succeed under limit"
    # Request 101 should be rejected:
    r = client.get("/api/data")
    assert r.status_code == 429, "request 101 should be rate-limited"
```

**Score 9-10:**
```python
def test_rate_limit_enforced_at_threshold():
    for i in range(100):
        r = client.get("/api/data")
        assert r.status_code == 200

    r = client.get("/api/data")
    assert r.status_code == 429
    assert r.json()["retry_after"] > 0   # spec requires retry-after header

def test_rate_limit_resets_after_window():
    for _ in range(101):
        client.get("/api/data")
    advance_clock(seconds=61)           # past the 1-minute window
    r = client.get("/api/data")
    assert r.status_code == 200, "rate limit should reset after 1 minute"
```

---

## Dimension 5 — Scenario Completeness (weight: 0.10)

An AC often implies multiple scenarios — happy path plus error conditions, edge cases, and boundary values. Does the test suite cover the scenario space the AC implies?

- **1-3 (Poor):** Only the happy path. Error conditions, boundaries, and edge cases in the AC's scenario space are untested.
- **4-6 (Adequate):** Happy path covered, some error conditions covered. Obvious boundaries (empty input, max value) tested but uncommon edge cases missed.
- **7-8 (Good):** Happy path + primary error conditions + boundaries covered. The scenario space the AC explicitly describes is covered.
- **9-10 (Excellent):** Complete scenario coverage — happy path, all error conditions, boundaries, and edge cases that the AC implies (even if not explicitly stated). Parameterized tests used where appropriate.

### Calibration Examples

**Score 2-3:**
```
# AC: "file upload supports PNG, JPG, GIF; rejects other formats; rejects files >20MB"
def test_file_upload():
    upload(png_file)
    assert success    # happy path only — 1/6 scenarios covered
```

**Score 5-6:**
```
def test_png_upload(): assert upload(png_file).ok
def test_jpg_upload(): assert upload(jpg_file).ok
def test_invalid_format(): assert upload(pdf_file).status == 422
# Missing: GIF, >20MB file, exactly 20MB boundary, 0-byte file
```

**Score 7-8:**
```
def test_png_upload(): assert upload(png_file).ok
def test_jpg_upload(): assert upload(jpg_file).ok
def test_gif_upload(): assert upload(gif_file).ok
def test_invalid_format_pdf(): assert upload(pdf_file).status == 422
def test_oversized_file(): assert upload(21mb_file).status == 413
# Missing: exactly 20MB boundary, 0-byte file
```

**Score 9-10:**
```python
@pytest.mark.parametrize("file,expected", [
    (png_1mb,   200),   # valid format, under limit
    (jpg_5mb,   200),   # valid format, under limit
    (gif_10mb,  200),   # valid format, under limit
    (png_20mb,  200),   # exactly at limit — boundary
    (png_21mb,  413),   # just over limit — boundary
    (pdf_1mb,   422),   # invalid format
    (exe_1mb,   422),   # invalid format
    (empty_png, 422),   # 0-byte edge case
])
def test_file_upload_scenario(file, expected):
    assert upload(file).status_code == expected
```

---

## Dimension 6 — Assertion Density (weight: 0.03)

Does each test have substantive assertions, or does it just run the code? Tests with no assertions or only trivially-true assertions have zero discriminability.

- **1-3 (Poor):** Many tests have no assertions, or only `assert True`, `assertNotNull`/`is not None`, or `assert result` without checking the value.
- **4-6 (Adequate):** Most tests have at least one real assertion, but many are presence checks without value verification.
- **7-8 (Good):** Tests have 2-3 targeted assertions that verify the specific behavior claimed, not just that something returned.
- **9-10 (Excellent):** Assertions are precise and exhaustive for the behavior claimed. No vacuous assertions.

### Calibration Examples

**Score 2-3:**
```python
def test_create_user():
    result = create_user("alice", "alice@example.com")
    assert result is not None   # vacuous — any non-None return passes
```

**Score 5-6:**
```python
def test_create_user():
    result = create_user("alice", "alice@example.com")
    assert result["id"] > 0     # presence check — doesn't verify content
    assert result["name"]       # truthy check
```

**Score 7-8:**
```python
def test_create_user():
    result = create_user("alice", "alice@example.com")
    assert result["name"] == "alice"
    assert result["email"] == "alice@example.com"
    assert isinstance(result["id"], int) and result["id"] > 0
```

**Score 9-10:**
```python
def test_create_user():
    result = create_user("alice", "alice@example.com")
    assert result["name"] == "alice"
    assert result["email"] == "alice@example.com"
    assert result["id"] > 0
    assert result["created_at"] is not None
    assert result["status"] == "active"   # spec: new users start active
    # Verify persistence:
    fetched = get_user(result["id"])
    assert fetched["email"] == "alice@example.com"
```

---

## Dimension 7 — Test Independence (weight: 0.02)

Do tests share state in ways that could produce false positives? Tests that depend on execution order can pass in CI while hiding actual failures.

- **1-3 (Poor):** Tests share mutable global state or a database without cleanup. Test order determines pass/fail.
- **4-6 (Adequate):** Most tests are independent, but some share state. Test suite may be order-sensitive in a few places.
- **7-8 (Good):** Tests use isolated fixtures or setup/teardown. Each test starts from a clean state. No obvious order dependencies.
- **9-10 (Excellent):** Tests are fully isolated. Fixtures are explicit. Parallelization-safe. Running a single test in isolation produces the same result as running the full suite.

### Calibration Examples

**Score 2-3:**
```python
# Shared mutable global:
created_user_id = None

def test_create_user():
    global created_user_id
    created_user_id = db.insert("alice")  # order-dependent

def test_delete_user():
    db.delete(created_user_id)   # fails if run before test_create_user
    assert db.get(created_user_id) is None
```

**Score 5-6:**
```python
class TestUserFlow:
    def setup_method(self):
        self.db = get_test_db()   # fresh db per test ✓
        # But seeds some global data that accumulates:
        seed_reference_data(self.db)  # appends, doesn't clear ✗
```

**Score 7-8:**
```python
@pytest.fixture
def db():
    database = create_test_database()
    yield database
    database.drop_all_tables()   # clean slate after each test

def test_create_user(db):
    result = db.create_user("alice")
    assert result["name"] == "alice"
```

**Score 9-10:**
```python
# Same as 7-8 PLUS: tests can run in parallel
@pytest.fixture
def db():
    # Uses a unique schema per test worker:
    schema = f"test_{uuid4().hex[:8]}"
    database = create_test_database(schema=schema)
    yield database
    database.drop_schema(schema)
```

---

## Scoring

Calculate weighted overall score:

| Dimension | Weight |
|-----------|--------|
| AC Coverage | 0.25 |
| Behavioral Specificity | 0.25 |
| Intent Fidelity | 0.20 |
| Sensitivity | 0.15 |
| Scenario Completeness | 0.10 |
| Assertion Density | 0.03 |
| Test Independence | 0.02 |

Round overall score to one decimal.

### Per-Dimension Minimum

Each dimension must score >= 4 individually (configurable via `gates.eval-quality.per_dimension_minimum`). A single dimension below 4 fails the gate regardless of overall score.

### Gate Decision

Passes when ALL three conditions hold:
1. Overall score >= 6.5 (configurable via `gates.eval-quality.threshold`)
2. Every dimension >= 4 (configurable via `gates.eval-quality.per_dimension_minimum`)
3. No blocking flags

### Flags

**Blocking:**
- Any AC with zero test coverage (Dimension 1 failure)
- Any test where the assertion demonstrably cannot catch the AC's violation
- Test order dependency that produces false positives (Dimension 7 severe failure)

**Recommended:**
- Tests asserting implementation internals (behavioral specificity < 5)
- ACs with only happy-path coverage (scenario completeness < 5)
- Vacuous assertions (assertion density < 5)

**Advisory:**
- Opportunities to add parameterized tests for boundary cases
- Missing test descriptions connecting tests to ACs
- Tests that could be grouped by AC for better traceability
```

- [ ] **Step 2: Verify the file was created**

```bash
ls -la rubrics/eval-quality.md
wc -l rubrics/eval-quality.md
```
Expected: file exists, ~250+ lines.

- [ ] **Step 3: Commit**

```bash
git add rubrics/eval-quality.md
git commit -m "feat: add eval-quality rubric (Gate 2b, 7 dimensions)"
```

---

## Task 2: Create the Eval Quality Scorer Agent

Follows the same pattern as `agents/spec-scorer/AGENT.md`. Reads spec + test files, scores against the eval-quality rubric, emits YAML evidence artifact.

**Files:**
- Create: `agents/eval-quality-scorer/AGENT.md`

- [ ] **Step 1: Create the agent directory and file**

```bash
mkdir -p agents/eval-quality-scorer
```

Write `agents/eval-quality-scorer/AGENT.md`:

```markdown
---
name: eval-quality-scorer
description: >-
  Evaluates a test suite's quality as an instrument for detecting spec violations —
  scores 7 dimensions (AC coverage, behavioral specificity, intent fidelity,
  sensitivity, scenario completeness, assertion density, test independence),
  emits blocking/advisory flags, and writes the Gate 2b evidence artifact.
  Invoked by /sdlc gate eval-quality and by the sdlc-run pipeline.
tools:
  - Read
  - Write
  - Glob
  - Bash
model: sonnet
---

You are an eval quality evaluator. Your job is to objectively score a test suite against the eval-quality rubric and determine whether the tests are good instruments for detecting violations of the spec's acceptance criteria.

## Inputs

You will be told:
1. The path to the spec file
2. The path to the project config (`.claude/sdlc.local.md`) for thresholds
3. The base directory to search for test files

## Process

1. Read the spec file — extract the problem statement and all acceptance criteria
2. Read the rubric at `${CLAUDE_PLUGIN_ROOT}/rubrics/eval-quality.md`
3. Read the project config for threshold and per-dimension minimum
4. Locate test files:
   - Use Glob to find test files: `**/test_*.py`, `**/*.test.ts`, `**/*.spec.ts`, `**/test_*.sh`, `**/*_test.go`
   - If no test files found: emit a blocking flag "no test files found" and write a fail scorecard
5. For each acceptance criterion, find the test(s) that map to it (by name, comment, or logical inference)
6. Score each of the 7 dimensions against the rubric criteria
7. Calculate the weighted overall score
8. Determine pass/fail against the threshold
9. Categorize flags into blocking, recommended, and advisory
10. Write the completed scorecard to the spec's evidence directory

## Scoring Context Package

For each AC you evaluate, use this context:
- The AC's full text from the spec
- The test's full content (not just assertions — context helps judge intent fidelity)
- The spec's problem statement (for Dimension 3 — intent fidelity requires knowing the "why")

## Judge Instructions

**For Dimensions 2, 3, 4, 5 (LLM-scored):** Ask: "If the behavior described in this AC broke in a plausible way, would this test catch it?" This is the core question. Assume the implementation is currently correct — you are evaluating the test as a detection instrument, not evaluating the implementation.

**For Dimension 1 (AC Coverage):** Check each AC against the test file list. An AC is "covered" only if a test with a meaningful assertion maps to it — not just a test that exercises the same endpoint incidentally.

**For Dimensions 6, 7 (Deterministic):** Count assertions per test; look for shared mutable state or global variables. These don't require deep LLM judgment — verify mechanically.

## Output

Write the completed scorecard YAML to:
`{spec_dir}/{spec_name}/evidence/gate-2b-eval-quality.yml`

Create the evidence directory if it doesn't exist.

```yaml
gate: eval-quality
spec_id: {spec_id from frontmatter}
timestamp: {ISO 8601}
test_files_evaluated:
  - path/to/test_file.py
  - path/to/another.test.ts
ac_count: {N}
dimensions:
  ac_coverage: {1-10}
  behavioral_specificity: {1-10}
  intent_fidelity: {1-10}
  sensitivity: {1-10}
  scenario_completeness: {1-10}
  assertion_density: {1-10}
  test_independence: {1-10}
overall: {weighted average, 1 decimal}
threshold: {from config, default 6.5}
per_dimension_minimum: {from config, default 4}
result: pass | fail
flags:
  blocking: []
  recommended: []
  advisory: []
reasoning:
  ac_coverage: "1-2 sentence justification"
  behavioral_specificity: "1-2 sentence justification"
  intent_fidelity: "1-2 sentence justification"
  sensitivity: "1-2 sentence justification"
  scenario_completeness: "1-2 sentence justification"
  assertion_density: "1-2 sentence justification"
  test_independence: "1-2 sentence justification"
```

## Rules

- Be objective. Use the rubric criteria exactly as written.
- Scores must be integers 1-10.
- Overall score is rounded to one decimal place.
- Always include at least one flag, even for high-scoring suites — there's always an improvement opportunity.
- Each dimension must meet the per-dimension minimum. If any dimension scores below the minimum, result is fail.
- If any blocking flags exist, result is fail regardless of score.
- Never modify the spec or test files. Only produce the scorecard.
- If test files span multiple frameworks (e.g., pytest + Playwright), evaluate each framework's tests with appropriate context for that framework's idioms.
```

- [ ] **Step 2: Verify agent file exists and has valid frontmatter**

```bash
head -15 agents/eval-quality-scorer/AGENT.md
```
Expected: shows YAML frontmatter block with `name: eval-quality-scorer`.

- [ ] **Step 3: Commit**

```bash
git add agents/eval-quality-scorer/AGENT.md
git commit -m "feat: add eval-quality-scorer agent (Gate 2b)"
```

---

## Task 3: Create the Phase Reference Doc

The `sdlc-run` skill references phase docs for each gate. Create the phase doc for Gate 2b so the autonomous pipeline knows how to run it.

**Files:**
- Create: `skills/sdlc-run/references/phase-eval-quality.md`

- [ ] **Step 1: Create the phase reference file**

Write `skills/sdlc-run/references/phase-eval-quality.md`:

```markdown
# Phase 3a: Eval Quality (Gate 2b)

This phase runs only when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

1. **Dispatch the `eval-quality-scorer` agent** from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with:
   - Spec path
   - Project config path (`.claude/sdlc.local.md`)
   - Worktree base directory (for test file discovery)
   - Output path: `{spec_dir}/{spec_name}/evidence/gate-2b-eval-quality.yml`

2. **If blocking flags found** → one self-fix cycle:
   1. Read the blocking flags from `gate-2b-eval-quality.yml`
   2. Present the flags to the user with clear remediation guidance:
      - Missing AC coverage: "Add tests for: {uncovered ACs}"
      - Low behavioral specificity: "Tests asserting implementation internals: {test names}"
      - Intent fidelity failures: "Tests that check letter but miss spirit: {AC and description}"
   3. If in guided mode: stop and ask the user to improve tests, then re-run
   4. If in full_auto mode: attempt to improve test coverage for blocking issues, then re-dispatch

3. **If still blocking after self-fix** → escalate to human:
   ```
   Gate 2b (eval quality) found blocking issues after auto-fix attempt:
   {blocking_flags}
   Tests need improvement before the pipeline can continue.
   Guidance: {per-AC remediation from flags}
   ```

4. **Commit** evidence:
   ```
   chore(sdlc): gate 2b — eval quality {pass|fail} ({score})
   ```
```

- [ ] **Step 2: Verify file exists**

```bash
ls skills/sdlc-run/references/
```
Expected: `phase-eval-quality.md` appears in the listing alongside other `phase-*.md` files.

- [ ] **Step 3: Commit**

```bash
git add skills/sdlc-run/references/phase-eval-quality.md
git commit -m "feat: add sdlc-run phase reference for Gate 2b eval quality"
```

---

## Task 4: Update the Gate-Check Skill

The gate-check skill needs to recognize `eval-quality` as a valid gate and know how to check/collect evidence for it.

**Files:**
- Modify: `skills/gate-check/SKILL.md`

- [ ] **Step 1: Read the current gate-check skill**

```bash
cat skills/gate-check/SKILL.md
```

- [ ] **Step 2: Add `eval-quality` to the valid gates list**

In the `## Process` section, step 2 ("Identify the gate"), the valid gates list currently reads:
```
   - `spec-quality` (Gate 1) — check if scorecard exists with `result: pass`
   - `code-quality` (Gate 2) — check test results and coverage evidence
   - `review` (Gate 3) — check if review evidence exists
   - `evidence-package` (Gate 4) — check if all prior gates passed
```

Add after `code-quality`:
```
   - `eval-quality` (Gate 2b, opt-in) — check if eval quality scorecard exists with `result: pass`
```

- [ ] **Step 3: Add Gate 2b to the evidence check table**

In step 3 ("Check gate status"), the evidence lookup table currently reads:
```
   - Gate 1: `gate-1-scorecard.yml` with `result: pass`
   - Gate 2: `gate-2-quality.yml` with all required checks passing
   - Gate 3: `gate-3-review.yml` with approval recorded
   - Gate 4: `gate-4-summary.yml` with all gates listed as passed
```

Add after Gate 2:
```
   - Gate 2b: `gate-2b-eval-quality.yml` with `result: pass` (only checked if `gates.eval-quality.enabled: true`)
```

- [ ] **Step 4: Add Gate 2b missing-evidence guidance**

In step 4 ("If gate evidence is missing"), add after the Gate 2 entry:
```
   - Gate 2b missing → dispatch eval-quality-scorer agent from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with spec path, config path, and worktree base
```

- [ ] **Step 5: Add a Gate 2b collection section**

After the existing `## Gate 2: Collecting Code Quality Evidence` section (and before `## Gate 3`), add:

```markdown
## Gate 2b: Collecting Eval Quality Evidence

This gate is opt-in. Only run it when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

When running Gate 2b:

1. Read the rubric at `${CLAUDE_PLUGIN_ROOT}/rubrics/eval-quality.md`
2. Read the project config for threshold (default 6.5) and per-dimension minimum (default 4)
3. Dispatch the `eval-quality-scorer` agent from `${CLAUDE_PLUGIN_ROOT}/agents/eval-quality-scorer/AGENT.md` with:
   - The spec file path
   - The project config path
   - The worktree/project base directory (for test file discovery)
4. After the agent produces `gate-2b-eval-quality.yml`, read it and present results:
   - Show each dimension score with one-line reasoning
   - Show overall score and pass/fail against threshold
   - Show all flags as actionable feedback
   - If passed: suggest proceeding to Gate 2c (if enabled) or Gate 3
   - If failed: explain which dimensions need improvement and how
```

- [ ] **Step 6: Verify the edit looks correct**

```bash
grep -n "eval-quality\|Gate 2b" skills/gate-check/SKILL.md
```
Expected: multiple lines mentioning `eval-quality` and `Gate 2b`.

- [ ] **Step 7: Commit**

```bash
git add skills/gate-check/SKILL.md
git commit -m "feat: add Gate 2b eval-quality routing to gate-check skill"
```

---

## Task 5: Update the sdlc-run Phase Detection

The autonomous pipeline detects what phase to resume from by checking for evidence files. Add Gate 2b to this detection.

**Files:**
- Modify: `skills/sdlc-run/SKILL.md`

- [ ] **Step 1: Read the current phase detection table**

```bash
grep -n "Phase\|gate-2\|gate-3\|evidence" skills/sdlc-run/SKILL.md | head -30
```

- [ ] **Step 2: Locate the phase detection table**

The table currently looks like (line numbers will vary):
```
| Check | Condition | Phase to start |
|-------|-----------|----------------|
| 1 | No `evidence/gate-1-scorecard.yml` | Phase 1: Scoring |
| 2 | Scorecard exists, no plan in `docs/plans/` matching this spec | Phase 2: Planning |
| 3 | Plan exists, no `evidence/gate-2-quality.yml` | Phase 3: Implementation + Gate 2 |
| 4 | Gate 2 exists, no `evidence/gate-3-review.yml` | Phase 4: Review |
| 5 | Gate 3 exists, no `evidence/gate-4-summary.yml` | Phase 5: Close |
| 6 | All gates exist | Pipeline complete — nothing to do |
```

- [ ] **Step 3: Replace the phase detection table**

Replace the existing table with:

```
| Check | Condition | Phase to start |
|-------|-----------|----------------|
| 1 | No `evidence/gate-1-scorecard.yml` | Phase 1: Scoring |
| 2 | Scorecard exists, no plan in `docs/plans/` matching this spec | Phase 2: Planning |
| 3 | Plan exists, no `evidence/gate-2-quality.yml` | Phase 3: Implementation + Gate 2 |
| 3a | Gate 2 exists, `eval-quality.enabled: true`, no `evidence/gate-2b-eval-quality.yml` | Phase 3a: Eval Quality (Gate 2b) |
| 4 | Gate 2 exists (and 2b if enabled), no `evidence/gate-3-review.yml` | Phase 4: Review |
| 5 | Gate 3 exists, no `evidence/gate-4-summary.yml` | Phase 5: Close |
| 6 | All required gates exist | Pipeline complete — nothing to do |
```

- [ ] **Step 4: Find the Phase 4 description in sdlc-run/SKILL.md and add Phase 3a reference**

Search for where Phase 4 is described in the skill and add a reference to Phase 3a before it:

```
## Phase 3a: Eval Quality (Gate 2b)

Run only when `gates.eval-quality.enabled: true` in `.claude/sdlc.local.md`.

Follow the steps in `${CLAUDE_PLUGIN_ROOT}/skills/sdlc-run/references/phase-eval-quality.md`.
```

- [ ] **Step 5: Verify the changes**

```bash
grep -n "3a\|eval-quality\|2b" skills/sdlc-run/SKILL.md
```
Expected: shows the new table row and Phase 3a section.

- [ ] **Step 6: Commit**

```bash
git add skills/sdlc-run/SKILL.md
git commit -m "feat: add Gate 2b phase detection to sdlc-run pipeline"
```

---

## Task 6: Update sdlc.local.md with Gate 2b Config Block

The project config needs to document the new optional gate so future specs can enable it.

**Files:**
- Modify: `.claude/sdlc.local.md`

- [ ] **Step 1: Read current config**

```bash
cat .claude/sdlc.local.md
```

- [ ] **Step 2: Add the eval-quality gates block**

In the `gates:` section, after the `code-quality:` block, add:

```yaml
  eval-quality:
    enabled: false          # opt-in: set to true to run Gate 2b on this project
    threshold: 6.5          # overall score required to pass (1-10)
    per_dimension_minimum: 4  # each dimension must meet this minimum
```

The full updated `gates:` section should look like:
```yaml
gates:
  spec-quality:
    threshold: 7.0
    required: true
  code-quality:
    tests_required: true
    coverage_threshold: 80
    ac_traceability: false
    build_required: false
    lint_required: false
    type_check_required: false
    required: true
  eval-quality:
    enabled: false
    threshold: 6.5
    per_dimension_minimum: 4
  review:
    required: true
  evidence-package:
    required: true
```

- [ ] **Step 3: Verify the edit**

```bash
grep -A3 "eval-quality" .claude/sdlc.local.md
```
Expected: shows the three-line `eval-quality` block with `enabled: false`.

- [ ] **Step 4: Commit**

```bash
git add .claude/sdlc.local.md
git commit -m "chore: add eval-quality gate config to sdlc.local.md (disabled by default)"
```

---

## Task 7: Update Spec Template with AC Traceability Note

Gate 2b Dimension 1 (AC Coverage) scores higher when test names explicitly reference their target AC. Add a note to the spec template encouraging this.

**Files:**
- Modify: `templates/spec-template.md`

- [ ] **Step 1: Read the current template**

```bash
cat templates/spec-template.md
```

- [ ] **Step 2: Add AC traceability note to the Acceptance Criteria section**

Find the Acceptance Criteria section:
```markdown
## Acceptance Criteria

- [ ] AC1: Given [precondition], when [action], then [expected result]
- [ ] AC2: Given [precondition], when [action], then [expected result]
```

Replace with:
```markdown
## Acceptance Criteria

<!-- Gate 2b tip: name your tests after these AC IDs (e.g., test_ac1_...) to help
     the eval-quality scorer map tests to criteria. Each AC should have at least
     one test that verifies its observable outcome, not just its surface behavior. -->
- [ ] AC1: Given [precondition], when [action], then [expected result]
- [ ] AC2: Given [precondition], when [action], then [expected result]
```

- [ ] **Step 3: Verify the edit**

```bash
grep -A5 "Gate 2b tip" templates/spec-template.md
```
Expected: shows the AC traceability comment.

- [ ] **Step 4: Commit**

```bash
git add templates/spec-template.md
git commit -m "docs: add Gate 2b AC traceability tip to spec template"
```

---

## Task 8: End-to-End Smoke Test

Verify the wiring is correct by running a minimal gate check against a real spec in the repo.

**Files:** (read-only validation, no changes)

- [ ] **Step 1: Find an existing spec to test against**

```bash
find docs/specs -name "spec.md" | head -5
```
Pick any spec that has corresponding test files in the repo.

- [ ] **Step 2: Confirm the agent can be found by the plugin system**

```bash
ls agents/eval-quality-scorer/AGENT.md
grep "^name:" agents/eval-quality-scorer/AGENT.md
```
Expected: `name: eval-quality-scorer`

- [ ] **Step 3: Confirm the rubric is present and well-formed**

```bash
grep "^## Dimension" rubrics/eval-quality.md | wc -l
```
Expected: `7` (all 7 dimensions present)

- [ ] **Step 4: Confirm gate-check skill references eval-quality**

```bash
grep "eval-quality" skills/gate-check/SKILL.md | wc -l
```
Expected: 4 or more lines (valid gates list, evidence check, collection section heading, agent dispatch)

- [ ] **Step 5: Confirm sdlc-run phase table includes row 3a**

```bash
grep "3a\|eval-quality" skills/sdlc-run/SKILL.md
```
Expected: shows the phase 3a table row and the Phase 3a section.

- [ ] **Step 6: Confirm sdlc.local.md has the eval-quality block**

```bash
grep -c "eval-quality" .claude/sdlc.local.md
```
Expected: `1` (the block is there exactly once)

- [ ] **Step 7: Final commit — push the branch**

```bash
git log --oneline -8
git push
```
Expected: git log shows 7-8 clean commits for this feature. Push succeeds.
