#!/usr/bin/env bash
# tests/test-risk-binding.sh — SPEC-057: risk-level-bound gate enablement.
#
# Exercises scripts/verify-evidence.sh's activation predicate against disposable
# fixture projects: `gates.<id>.enabled` + `risk_levels:` allowlist vs the spec
# frontmatter's `risk_level`. The predicate under test is defined in
# lib/gates.md "Risk-level binding": a gate is active for a spec iff
# enabled: true AND (risk_levels absent OR effective risk_level in the list);
# effective risk_level defaults to medium; out-of-enum values are fail-safe.
#
# Requires python3 + PyYAML (same dependency as the full verify path — the
# grep fallback does not evaluate the predicate). Exits nonzero on any failure.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERIFY="$ROOT/scripts/verify-evidence.sh"
PASSED=0
FAILED=0

pass() { PASSED=$((PASSED+1)); printf '  PASS: %s\n' "$1"; }
failt() { FAILED=$((FAILED+1)); printf '  FAIL: %s\n' "$1"; }

# assert_run <desc> <expected-exit> <dir> [--strict]
# Runs verify-evidence.sh from inside the fixture project; stores output in OUT.
OUT=""
assert_run() {
  local desc="$1" expected="$2" dir="$3"; shift 3
  OUT="$( (cd "$dir" && bash "$VERIFY" "$@" docs/specs/fx) 2>&1 )"
  local rc=$?
  if [ "$rc" -eq "$expected" ]; then pass "$desc (exit $rc)"; else
    failt "$desc — expected exit $expected, got $rc"; printf '%s\n' "$OUT" | sed 's/^/    | /'
  fi
}

assert_out() { # <desc> <grep -E pattern>
  if printf '%s\n' "$OUT" | grep -qE "$2"; then pass "$1"; else
    failt "$1 — pattern not found: $2"; printf '%s\n' "$OUT" | sed 's/^/    | /'
  fi
}

assert_not_out() { # <desc> <grep -E pattern>
  if printf '%s\n' "$OUT" | grep -qE "$2"; then
    failt "$1 — pattern unexpectedly present: $2"; printf '%s\n' "$OUT" | sed 's/^/    | /'
  else pass "$1"; fi
}

# fixture <dir> <comprehension-config-lines> <risk_level-value-or-empty>
fixture() {
  local dir="$1" cfg="$2" risk="$3"
  mkdir -p "$dir/.claude" "$dir/docs/specs/fx/evidence"
  {
    echo '---'
    echo 'spec_dir: docs/specs'
    echo 'gates:'
    printf '%s\n' "$cfg"
    echo '---'
  } > "$dir/.claude/sdlc.local.md"
  {
    echo '---'
    echo 'id: SPEC-FX'
    [ -n "$risk" ] && echo "risk_level: $risk"
    echo '---'
  } > "$dir/docs/specs/fx/spec.md"
  # Minimal passing required-gate evidence so only the opt-in path is under test.
  printf 'result: pass\n' > "$dir/docs/specs/fx/evidence/gate-1-scorecard.yml"
  printf 'result: pass\nchecks:\n  tests_pass:\n    command: "bash tests/run.sh"\n' \
    > "$dir/docs/specs/fx/evidence/gate-2-quality.yml"
  printf 'result: pass\n' > "$dir/docs/specs/fx/evidence/gate-3-review.yml"
}

CFG_BOUND='  comprehension:
    enabled: true
    risk_levels: [medium, high, critical]'
CFG_DISABLED_FULL_LIST='  comprehension:
    enabled: false
    risk_levels: [low, medium, high, critical]'
CFG_UNBOUND='  comprehension:
    enabled: true'

TMPROOT="$(mktemp -d)"
trap 'rm -rf "$TMPROOT"' EXIT

echo "=== Case 1 (AC1): enabled + bound, spec risk low, no 2c evidence -> silent legitimate skip ==="
D="$TMPROOT/c1"; fixture "$D" "$CFG_BOUND" "low"
assert_run "bound-out gate does not fail the package" 0 "$D"
assert_out  "bound-out skip is recorded" "skipped by risk binding"
assert_not_out "no missing-evidence warn for bound-out gate" "evidence file is missing"

echo "=== Case 2 (AC1 strict): same under --strict -> still exit 0 (binding is not a policy gap) ==="
D="$TMPROOT/c2"; fixture "$D" "$CFG_BOUND" "low"
assert_run "bound-out gate passes under --strict" 0 "$D" --strict
assert_not_out "no missing-evidence failure under --strict" "evidence file is missing"

echo "=== Case 3 (AC2): enabled false + full allowlist -> allowlist inert, gate stays off ==="
D="$TMPROOT/c3"; fixture "$D" "$CFG_DISABLED_FULL_LIST" "high"
assert_run "disabled gate with allowlist does not run or warn" 0 "$D"
assert_not_out "no missing-evidence warn for disabled gate" "evidence file is missing"
assert_not_out "allowlist on a disabled gate produces no risk-binding line" "risk binding"

echo "=== Case 4 (AC3): enabled, NO risk_levels key -> pre-existing behavior unchanged ==="
D="$TMPROOT/c4"; fixture "$D" "$CFG_UNBOUND" "low"
assert_run "unbound enabled gate with missing evidence warns (non-strict)" 0 "$D"
assert_out  "missing-evidence warn preserved" "evidence file is missing"
D="$TMPROOT/c4s"; fixture "$D" "$CFG_UNBOUND" "low"
assert_run "unbound enabled gate with missing evidence fails under --strict" 1 "$D" --strict

echo "=== Case 5 (AC4a): bound gate, spec omits risk_level -> default medium => active => warn ==="
D="$TMPROOT/c5"; fixture "$D" "$CFG_BOUND" ""
assert_run "absent risk_level treated as medium (gate active)" 0 "$D"
assert_out  "missing-evidence warn (gate active at default medium)" "evidence file is missing"
assert_not_out "no bound-out skip at default medium" "skipped by risk binding"

echo "=== Case 6 (AC4b): bound gate, out-of-enum risk_level -> fail-safe active + named warning ==="
D="$TMPROOT/c6"; fixture "$D" "$CFG_BOUND" "experimental"
assert_run "out-of-enum risk_level is fail-safe (non-strict exit 0)" 0 "$D"
assert_out  "fail-safe warning names the situation" "fail-safe: treating gate as active"
assert_out  "gate treated active -> missing-evidence warn" "evidence file is missing"

echo "=== Case 7: bound-out but evidence file present -> integrity still verified ==="
D="$TMPROOT/c7"; fixture "$D" "$CFG_BOUND" "low"
printf 'result: pass\n' > "$D/docs/specs/fx/evidence/gate-2c-comprehension.yml"
assert_run "present evidence for a bound-out gate is verified" 0 "$D"
assert_out  "the 2c file was checked" "gate-2c-comprehension\.yml"

echo "=== Case 8 (AC8, Section B): 2a evidence WITH weights recomputes; WITHOUT weights skips ==="
# The claw-b834 contract: eval-intent/eval-quality scorecards record the weights
# they used, so check_scorecard recomputes their overall instead of skipping.
CFG_2A_ON='  eval-intent:
    enabled: true'
D="$TMPROOT/c8"; fixture "$D" "$CFG_2A_ON" "medium"
cat > "$D/docs/specs/fx/evidence/gate-2a-eval-intent.yml" << 'EOF'
gate: eval-intent
result: pass
dimensions:
  intent_coverage: 7
  anti_pattern_detection: 9
  journey_completeness: 6
  implementation_independence: 7
weights:
  intent_coverage: 0.30
  anti_pattern_detection: 0.25
  journey_completeness: 0.25
  implementation_independence: 0.20
overall: 7.3
threshold: 6.5
per_dimension_minimum: 4
EOF
assert_run "2a evidence with recorded weights verifies clean" 0 "$D"
assert_out  "2a overall recomputed from recorded weights (no skip)" "gate-2a-eval-intent\.yml: recorded overall 7\.3 matches recomputed"
assert_not_out "no 'no weights recorded' skip for the weights-bearing 2a file" "gate-2a-eval-intent\.yml: no weights recorded"

D="$TMPROOT/c8b"; fixture "$D" "$CFG_2A_ON" "medium"
cat > "$D/docs/specs/fx/evidence/gate-2a-eval-intent.yml" << 'EOF'
gate: eval-intent
result: pass
dimensions:
  intent_coverage: 7
  anti_pattern_detection: 9
  journey_completeness: 6
  implementation_independence: 7
overall: 7.3
threshold: 6.5
per_dimension_minimum: 4
EOF
assert_run "2a evidence without weights still verifies (legacy schema)" 0 "$D"
assert_out  "weights-less 2a file skips recomputation (the pre-SPEC-057 gap)" "gate-2a-eval-intent\.yml: no weights recorded"

CFG_2B_ON='  eval-quality:
    enabled: true'
D="$TMPROOT/c8c"; fixture "$D" "$CFG_2B_ON" "medium"
cat > "$D/docs/specs/fx/evidence/gate-2b-eval-quality.yml" << 'EOF'
gate: eval-quality
result: pass
dimensions:
  ac_coverage: 7
  behavioral_specificity: 6
  intent_fidelity: 7
  sensitivity: 6
  scenario_completeness: 6
  assertion_density: 8
  test_independence: 8
weights:
  ac_coverage: 0.20
  behavioral_specificity: 0.15
  intent_fidelity: 0.20
  sensitivity: 0.15
  scenario_completeness: 0.10
  assertion_density: 0.10
  test_independence: 0.10
overall: 6.8
threshold: 6.5
per_dimension_minimum: 4
EOF
assert_run "2b evidence with recorded weights verifies clean" 0 "$D"
assert_out  "2b overall recomputed from recorded weights (no skip)" "gate-2b-eval-quality\.yml: recorded overall 6\.8 matches recomputed"
assert_not_out "no 'no weights recorded' skip for the weights-bearing 2b file" "gate-2b-eval-quality\.yml: no weights recorded"

echo "=== Case 9 (R1): empty allowlist -> gate never runs (legal; doctor lint owns the nudge) ==="
CFG_EMPTY='  comprehension:
    enabled: true
    risk_levels: []'
D="$TMPROOT/c9"; fixture "$D" "$CFG_EMPTY" "critical"
assert_run "empty risk_levels binds out every level (even critical)" 0 "$D"
assert_out  "empty-list skip recorded as risk binding" "skipped by risk binding"
assert_not_out "no missing-evidence warn under an empty allowlist" "evidence file is missing"

echo
echo "=== Results ==="
echo "Passed: $PASSED  Failed: $FAILED"
if [ "$FAILED" -gt 0 ]; then exit 1; fi
echo "All risk-binding tests passed."
