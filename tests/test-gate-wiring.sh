#!/bin/bash
# Test: gate wiring consistency — registry-driven structural test
# Parses the canonical gate fact table in lib/gates.md and asserts, in both
# directions, that every gate is consistently wired across the plugin:
#
#   Layer A (registry -> touchpoints): for each registry row, the rubric file,
#     scorer agent, evidence filename, config key, doctor template block, and
#     sdlc-run pipeline position all exist where they must.
#   Layer B (touchpoints -> registry, closure): every gate evidence filename and
#     "Gate N" label found anywhere in skills/, agents/, or rubrics/ must have a
#     registry row — catches a future half-wired gate that lands WITHOUT
#     updating the registry (the actual Gate 2c failure mode).
#
# Does NOT invoke an LLM — structural checks only.
#
# Usage: bash tests/test-gate-wiring.sh
# Exit code: 0 = all tests pass, 1 = failures detected

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(dirname "$SCRIPT_DIR")"

REGISTRY="$ROOT/lib/gates.md"
GATE_CHECK="$ROOT/skills/gate-check/SKILL.md"
SDLC_STATUS="$ROOT/skills/sdlc-status/SKILL.md"
SDLC_RUN="$ROOT/skills/sdlc-run/SKILL.md"
SDLC_DOCTOR="$ROOT/skills/sdlc-doctor/SKILL.md"
EVIDENCE_RUBRIC="$ROOT/rubrics/evidence-package.md"

# Allowlist for Layer B: filenames matching the gate evidence pattern that are
# legitimately NOT gates (none currently — gate-4-summary.yml IS a gate row:
# evidence-package). Add one filename per line if a non-gate match ever appears.
ALLOWLIST="
"

PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\033[1m%s\033[0m\n" "$1"; }

check() {
  local name="$1"
  local condition="$2"
  if eval "$condition" > /dev/null 2>&1; then
    green "  PASS: $name"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

# Extract column N (1-based, ignoring the leading empty field) from a table row,
# trimming surrounding whitespace.
col() {
  awk -F'|' -v n="$(( $2 + 1 ))" '{ gsub(/^[ \t]+|[ \t]+$/, "", $n); print $n }' <<< "$1"
}

bold "=== Registry Structure ==="
check "registry file exists" "[ -f '$REGISTRY' ]"
check "registry declares enforcement by this test" "grep -q 'test-gate-wiring.sh' '$REGISTRY'"
check "registry warns against runtime dereferencing" "grep -qi 'inline' '$REGISTRY'"
check "registry says add the row FIRST when adding a gate" "grep -q 'FIRST' '$REGISTRY'"

# Pull data rows from between the table markers: skip header + separator rows.
TABLE=$(sed -n '/GATE-TABLE-START/,/GATE-TABLE-END/p' "$REGISTRY" || true)
ROWS=$(grep -E '^\| [a-z][a-z-]+ \|' <<< "$TABLE" || true)
ROW_COUNT=$(grep -c . <<< "$ROWS" || true)
check "registry has exactly 7 gate rows" "[ '$ROW_COUNT' -eq 7 ]"

bold "=== Layer A: Registry → Touchpoints ==="
while IFS= read -r row; do
  [ -z "$row" ] && continue
  id=$(col "$row" 1)
  label=$(col "$row" 2)
  evidence=$(col "$row" 3)
  config=$(col "$row" 4)
  threshold=$(col "$row" 5)
  phase=$(col "$row" 6)
  rubric=$(col "$row" 7)
  scorer=$(col "$row" 8)

  # Fact checks that apply to every row, including comprehension:
  check "[$id] rubric file exists ($rubric)" "[ -f '$ROOT/$rubric' ]"
  # Threshold lives in invoker-facing surfaces (registry + doctor --init template),
  # NOT necessarily in the rubric — the Gate 1 rubric's Gate Decision section is
  # invoker-only and the blinded scorer skips it, so do not require the threshold
  # literal in rubric files (that would cement a blinding leak).
  if [[ "$threshold" =~ ^[0-9]+\.[0-9]+$ ]]; then
    check "[$id] threshold $threshold appears in gate registry" "grep -qF '$threshold' '$REGISTRY'"
  fi

  # Scorer agent exists (when the registry names one)
  case "$scorer" in
    *none*|*"NOT WIRED"*) : ;;
    *) check "[$id] scorer agent exists (agents/$scorer/AGENT.md)" "[ -f '$ROOT/agents/$scorer/AGENT.md' ]" ;;
  esac

  # Evidence filename appears in every consumer surface
  check "[$id] evidence file '$evidence' in gate-check" "grep -qF '$evidence' '$GATE_CHECK'"
  check "[$id] evidence file '$evidence' in sdlc-status" "grep -qF '$evidence' '$SDLC_STATUS'"
  check "[$id] evidence file '$evidence' in evidence-package rubric" "grep -qF '$evidence' '$EVIDENCE_RUBRIC'"

  # Opt-in gates: config key wired everywhere + doctor template block
  if [[ "$config" == *".enabled"* ]]; then
    keyre="gates\.$id\.enabled"
    check "[$id] config key gates.$id.enabled in gate-check" "grep -qE '$keyre' '$GATE_CHECK'"
    check "[$id] config key gates.$id.enabled in sdlc-status" "grep -qE '$keyre' '$SDLC_STATUS'"
    check "[$id] config key gates.$id.enabled in evidence-package rubric" "grep -qE '$keyre' '$EVIDENCE_RUBRIC'"
    check "[$id] gate block in sdlc-doctor --init template" "grep -qF '$id:' '$SDLC_DOCTOR'"
  fi

  # Threshold appears in the doctor --init template for score-thresholded gates
  if [[ "$threshold" =~ ^[0-9]+\.[0-9]+$ ]]; then
    check "[$id] threshold '$threshold' in sdlc-doctor --init template" "grep -qF 'threshold: $threshold' '$SDLC_DOCTOR'"
  fi

  # Gates with a pipeline phase appear in sdlc-run's position-detection section
  if [[ "$phase" != *"NOT WIRED"* ]]; then
    check "[$id] evidence file '$evidence' in sdlc-run position detection" "grep -qF '$evidence' '$SDLC_RUN'"
    check "[$id] phase string '$phase' in sdlc-run" "grep -qF '$phase' '$SDLC_RUN'"
  fi
done <<< "$ROWS"

bold "=== Layer B: Touchpoints → Registry (closure) ==="
# Every gate evidence filename referenced anywhere must have a registry row.
DISCOVERED_FILES=$(grep -rhoE 'gate-[0-9][abc]?-[a-z-]+\.yml' "$ROOT/skills" "$ROOT/agents" "$ROOT/rubrics" 2>/dev/null | sort -u || true)
while IFS= read -r f; do
  [ -z "$f" ] && continue
  if grep -qFx "$f" <<< "$ALLOWLIST"; then
    green "  SKIP (allowlisted): $f"
    continue
  fi
  check "closure: evidence file '$f' has a registry row" "grep -qF '| $f |' '$REGISTRY'"
done <<< "$DISCOVERED_FILES"

# Every "Gate N[abc]" label referenced anywhere must have a registry row.
DISCOVERED_LABELS=$(grep -rhoE 'Gate [0-9][abc]?' "$ROOT/skills" "$ROOT/agents" "$ROOT/rubrics" 2>/dev/null | sort -u || true)
while IFS= read -r lbl; do
  [ -z "$lbl" ] && continue
  n="${lbl#Gate }"
  check "closure: label '$lbl' has a registry row" "grep -qE '^\| [a-z][a-z-]+ \| $n \|' '$REGISTRY'"
done <<< "$DISCOVERED_LABELS"

bold "=== Gate 2c As-Built Mode Routing (SPEC-051 T3) ==="
# gates.comprehension.mode: asbuilt is an additive routing option on top of
# the legacy Gate 2c dispatch — these assertions confirm the routing text,
# the shadow-gate skill/agents it dispatches to, and the rubric section it
# cites all exist, without re-parsing the registry table (mode is a value
# within the existing comprehension row, not a new gate row).
PHASE_COMPREHENSION="$ROOT/skills/sdlc-run/references/phase-comprehension.md"
ASBUILT_GATE_SKILL="$ROOT/skills/asbuilt-gate/SKILL.md"
ASBUILT_GENERATOR_AGENT="$ROOT/agents/asbuilt-generator/AGENT.md"
ASBUILT_JUDGE_AGENT="$ROOT/agents/asbuilt-judge/AGENT.md"
COMPREHENSION_RUBRIC="$ROOT/rubrics/comprehension.md"

check "gate-check SKILL.md mentions mode: asbuilt routing" "grep -q 'mode: asbuilt' '$GATE_CHECK'"
check "phase-comprehension.md mentions mode: asbuilt routing" "grep -q 'mode: asbuilt' '$PHASE_COMPREHENSION'"
check "skills/asbuilt-gate/SKILL.md exists" "[ -f '$ASBUILT_GATE_SKILL' ]"
check "agents/asbuilt-generator/AGENT.md exists" "[ -f '$ASBUILT_GENERATOR_AGENT' ]"
check "agents/asbuilt-judge/AGENT.md exists" "[ -f '$ASBUILT_JUDGE_AGENT' ]"
check "rubrics/comprehension.md contains 'As-Built mode' heading" "grep -q '## As-Built mode' '$COMPREHENSION_RUBRIC'"

# Gate 4's authoritative evidence checks must also recognize gate-2c-asbuilt.yml
# as an alternative to gate-2c-comprehension.yml — otherwise a spec running
# gates.comprehension.mode: asbuilt would fail Gate 4 / show wrong status
# despite a passing shadow gate (the SPEC-051 T3 review gap this guards against).
check "rubrics/evidence-package.md mentions gate-2c-asbuilt.yml" "grep -qF 'gate-2c-asbuilt.yml' '$EVIDENCE_RUBRIC'"
check "scripts/verify-evidence.sh mentions gate-2c-asbuilt.yml" "grep -qF 'gate-2c-asbuilt.yml' '$ROOT/scripts/verify-evidence.sh'"
check "skills/sdlc-status/SKILL.md mentions gate-2c-asbuilt.yml" "grep -qF 'gate-2c-asbuilt.yml' '$SDLC_STATUS'"

bold "=== System-Spec Layout Consistency (SPEC-003) ==="
# Single-source rule (SPEC-003 R1 / Risk 2): the split-vs-single-file detection
# markers and domain routing rules live ONLY in lib/system-spec-layout.md, and
# every SYSTEM-SPEC consumer must cite that file by name rather than restate
# the rules — restated copies would drift.
LAYOUT_REF="$ROOT/lib/system-spec-layout.md"
check "layout reference exists (lib/system-spec-layout.md)" "[ -f '$LAYOUT_REF' ]"

LAYOUT_CONSUMERS="
agents/spec-compactor/AGENT.md
agents/spec-scorer/AGENT.md
agents/eval-intent-scorer/AGENT.md
skills/eval-authoring/SKILL.md
skills/spec-compact/SKILL.md
skills/sdlc-close/SKILL.md
"
while IFS= read -r consumer; do
  [ -z "$consumer" ] && continue
  check "layout consumer cites system-spec-layout.md ($consumer)" "grep -qF 'system-spec-layout.md' '$ROOT/$consumer'"
done <<< "$LAYOUT_CONSUMERS"

bold "=== Results ==="
TOTAL=$((PASS + FAIL))
echo "Passed: $PASS / $TOTAL"
[ "$FAIL" -eq 0 ] && green "All tests passed." || { red "$FAIL test(s) failed."; exit 1; }
