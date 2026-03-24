#!/bin/bash
# Test: Mandatory Secrets Scan patterns from code-reviewer AGENT.md
# Validates that grep patterns catch real secrets and don't false-positive on clean code.
#
# Uses grep -E (POSIX extended regex) for portability — no rg/ggrep dependency.
#
# Usage: bash tests/test-secrets-scan.sh
# Exit code: 0 = all tests pass, 1 = failures detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
FIXTURES="$SCRIPT_DIR/fixtures"
FAKE="$FIXTURES/fake-secrets.js"
CLEAN="$FIXTURES/clean-code.js"

PASS=0
FAIL=0
TOTAL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
bold() { printf "\033[1m%s\033[0m\n" "$1"; }

# expect_match: pattern MUST match in the fake-secrets file
expect_match() {
  local name="$1"
  local pattern="$2"
  TOTAL=$((TOTAL + 1))
  local count
  count=$(grep -Ec -e "$pattern" "$FAKE" 2>/dev/null || true)
  if [ -n "$count" ] && [ "$count" -gt 0 ]; then
    green "  PASS: $name ($count matches in fake-secrets.js)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $name — no matches in fake-secrets.js"
    FAIL=$((FAIL + 1))
  fi
}

# expect_no_match: pattern must NOT match in the clean-code file
expect_no_match() {
  local name="$1"
  local pattern="$2"
  TOTAL=$((TOTAL + 1))
  local count
  count=$(grep -Ec -e "$pattern" "$CLEAN" 2>/dev/null || true)
  if [ -n "$count" ] && [ "$count" -gt 0 ]; then
    red "  FAIL: $name — $count false positive(s) in clean-code.js"
    grep -En -e "$pattern" "$CLEAN" 2>/dev/null | sed 's/^/         /' || true
    FAIL=$((FAIL + 1))
  else
    green "  PASS: $name (0 false positives in clean-code.js)"
    PASS=$((PASS + 1))
  fi
}

bold "============================================"
bold " Speculator Secrets Scan — Pattern Tests"
bold "============================================"
echo ""

# ─── Category 1: High-entropy secret assignments ────────────────────
bold "Category 1: High-entropy secret assignments"
# Note: \s not available in POSIX ERE, use [[:space:]] instead
PATTERN_1='(api_key|apikey|api_secret|secret_key|access_key|private_key|auth_token|password|passwd|credential|client_secret|app_secret)[[:space:]]*[:=]'

expect_match "Catches secret variable assignments" "$PATTERN_1"

echo ""

# ─── Category 2: Known API key formats ──────────────────────────────
bold "Category 2: Known API key formats"

expect_match "AWS access key (AKIA...)"      'AKIA[0-9A-Z]{16}'
expect_match "GitHub PAT (ghp_...)"          'ghp_[a-zA-Z0-9]{36}'
expect_match "GitHub OAuth (gho_...)"        'gho_[a-zA-Z0-9]{36}'
expect_match "Slack tokens (xox[bpas]-...)"  'xox[bpas]-[a-zA-Z0-9-]+'
expect_match "OpenAI/Stripe keys (sk-...)"   'sk-[a-zA-Z0-9]{20,}'
expect_match "Anthropic keys (sk-ant-...)"   'sk-ant-[a-zA-Z0-9-]{20,}'
expect_match "Google API keys (AIza...)"     'AIza[0-9A-Za-z_-]{35}'
expect_match "Private keys (BEGIN...)"       '-----BEGIN[[:space:]]*(RSA |EC |OPENSSH )?PRIVATE KEY-----'

echo ""

# ─── Category 3: Connection strings ─────────────────────────────────
bold "Category 3: Connection strings with embedded credentials"

expect_match "postgres:// with creds"  'postgres://[^/ ]+:[^/ ]+@'
expect_match "mongodb:// with creds"   'mongodb://[^/ ]+:[^/ ]+@'
expect_match "redis:// with creds"     'redis://[^/ ]+:[^/ ]+@'
expect_match "mysql:// with creds"     'mysql://[^/ ]+:[^/ ]+@'
expect_match "amqp:// with creds"      'amqp://[^/ ]+:[^/ ]+@'

echo ""

# ─── Category 4: Inline bearer tokens ───────────────────────────────
bold "Category 4: Inline bearer tokens and authorization headers"

expect_match "Bearer token"       'Bearer[[:space:]]+[a-zA-Z0-9_.~+/-]{20,}'
expect_match "Authorization header" 'Authorization.*[A-Za-z]+[[:space:]]+[a-zA-Z0-9_.~+/-]{20,}'

echo ""

# ─── Category 5: Base64-encoded secrets ──────────────────────────────
bold "Category 5: Base64-encoded secrets in assignments"

expect_match "Base64 secret assignment" '(secret|key|token|password|credential).*["'"'"'=][[:space:]]*[A-Za-z0-9+/]{40,}=*'

echo ""

# ─── False positive checks against clean code ───────────────────────
bold "============================================"
bold " False Positive Checks (clean-code.js)"
bold "============================================"
echo ""

bold "Category 2: Known API key formats (should NOT match clean code)"
expect_no_match "No AWS keys in clean code"      'AKIA[0-9A-Z]{16}'
expect_no_match "No GitHub PATs in clean code"    'ghp_[a-zA-Z0-9]{36}'
expect_no_match "No Slack tokens in clean code"   'xox[bpas]-[a-zA-Z0-9-]+'
expect_no_match "No OpenAI keys in clean code"    'sk-[a-zA-Z0-9]{20,}'
expect_no_match "No Google keys in clean code"    'AIza[0-9A-Za-z_-]{35}'
expect_no_match "No private keys in clean code"   '-----BEGIN[[:space:]]*(RSA |EC |OPENSSH )?PRIVATE KEY-----'

echo ""
bold "Category 3: Connection strings (should NOT match clean code)"
expect_no_match "No connection string creds in clean code" '(postgres|mysql|mongodb|redis|amqp)://[^/ ]+:[^/ ]+@'

echo ""
bold "Category 4: Bearer tokens (should NOT match clean code)"
expect_no_match "No bearer tokens in clean code"  'Bearer[[:space:]]+[a-zA-Z0-9_.~+/-]{20,}'

echo ""

# ─── Summary ────────────────────────────────────────────────────────
bold "============================================"
bold " Summary"
bold "============================================"
echo ""
echo "  Total: $TOTAL  |  Pass: $PASS  |  Fail: $FAIL"
echo ""

if [ "$FAIL" -gt 0 ]; then
  red "RESULT: $FAIL test(s) FAILED"
  exit 1
else
  green "RESULT: All $TOTAL tests PASSED"
  exit 0
fi
