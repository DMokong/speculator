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
