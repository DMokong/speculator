#!/usr/bin/env bash
# verify-evidence.sh — deterministic verification of a spec's evidence package.
#
# Mechanizes the binary checklist in rubrics/evidence-package.md (required-gate
# checks 1, 2, 6, 7; conditional opt-in checks 3-5) plus integrity checks an LLM
# gate cannot do reliably. NOTE: enabled-but-missing opt-in evidence is WARN here
# (the gate may have been enabled after the spec closed) but BLOCKING in the
# rubric checklist that gate-check also runs — the stricter rubric result governs;
# use --strict to make this script match the rubric.
# Integrity checks:
#   - required evidence files exist (gate-1-scorecard.yml, gate-2-quality.yml,
#     gate-3-review.yml), parse as YAML, and have a `result` field
#   - every gate result is `pass` (or carries a recorded override with justification)
#   - no unresolved blocking flags (`flags.blocking` / `blocking_issues`)
#   - scorecard overall recomputed from the weights RECORDED IN THE EVIDENCE FILE
#     (tolerance ±0.05 for rounding conventions; SKIP when the file records no
#     weights — older evidence schemas don't)
#   - recorded result consistent with recorded threshold + per-dimension minimums
#   - gate-2 has a non-empty test command/rationale field; recorded test commands
#     are NEVER re-executed (cross-repo / DB-dependent / sometimes manual)
#   - opt-in gates enabled in .claude/sdlc.local.md (eval-intent, eval-quality,
#     comprehension) must have their evidence file (gate-2a/2b/2c). A missing
#     file is a WARN by default — a policy gap, since the gate may have been
#     enabled after the spec closed — and a FAIL with --strict.
#
# Usage: scripts/verify-evidence.sh [--strict] <spec-dir>
#   e.g. scripts/verify-evidence.sh docs/specs/my-feature
#
# Exit 0: all checks pass (SKIP/WARN lines allowed). Exit 1: one or more ❌ failures.
# Dependencies: bash + python3 with PyYAML (degrades to grep-level structural
# checks when no python3 with PyYAML is found).

set -u

usage() {
  echo "usage: $0 [--strict] <spec-dir>   (e.g. docs/specs/my-feature)" >&2
}

STRICT=0
SPEC_DIR=""
for arg in "$@"; do
  case "$arg" in
    --strict) STRICT=1 ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "unknown flag: $arg" >&2; usage; exit 2 ;;
    *) SPEC_DIR="${arg%/}" ;;
  esac
done

if [ -z "$SPEC_DIR" ]; then
  usage
  exit 2
fi

if [ ! -d "$SPEC_DIR" ]; then
  echo "❌ spec directory not found: $SPEC_DIR"
  exit 1
fi

# Project config: cwd first, then git repo root.
CONFIG=".claude/sdlc.local.md"
if [ ! -f "$CONFIG" ]; then
  GIT_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$GIT_ROOT" ] && [ -f "$GIT_ROOT/.claude/sdlc.local.md" ]; then
    CONFIG="$GIT_ROOT/.claude/sdlc.local.md"
  fi
fi

# Find a python3 with PyYAML (PATH python3 may lack it while the system one has it).
PYBIN=""
for candidate in python3 /usr/bin/python3 /usr/local/bin/python3 /opt/homebrew/bin/python3; do
  if command -v "$candidate" >/dev/null 2>&1 && "$candidate" -c 'import yaml' >/dev/null 2>&1; then
    PYBIN="$(command -v "$candidate")"
    break
  fi
done

# ---------------------------------------------------------------------------
# Full verification (python3 + PyYAML)
# ---------------------------------------------------------------------------
if [ -n "$PYBIN" ]; then
  exec "$PYBIN" - "$SPEC_DIR" "$CONFIG" "$STRICT" <<'PY'
import os
import sys

import yaml

spec_dir, config_path, strict = sys.argv[1], sys.argv[2], sys.argv[3] == "1"

passes = failures = skips = warns = 0


def ok(msg):
    global passes
    passes += 1
    print(f"✅ {msg}")


def fail(msg):
    global failures
    failures += 1
    print(f"❌ {msg}")


def skip(msg):
    global skips
    skips += 1
    print(f"⏭️  SKIP {msg}")


def warn(msg):
    global warns
    warns += 1
    print(f"⚠️  WARN {msg}")


def load_frontmatter(path):
    """Parse the YAML frontmatter of a markdown file. Returns dict or None."""
    try:
        with open(path, encoding="utf-8") as f:
            lines = f.read().splitlines()
    except OSError:
        return None
    if not lines or lines[0].strip() != "---":
        return None
    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return None
    try:
        data = yaml.safe_load("\n".join(lines[1:end]))
    except yaml.YAMLError:
        return None
    return data if isinstance(data, dict) else None


def override_justification(data):
    """Return the override justification string if a valid override is recorded."""
    o = data.get("override")
    if isinstance(o, dict) and o.get("overridden"):
        j = str(o.get("justification") or "").strip()
        if j:
            return j
    return None


def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_common(name, path):
    """Exists / parses / result field / result pass / blocking flags.

    Returns the parsed dict, or None if deeper checks are impossible.
    """
    if not os.path.isfile(path):
        fail(f"{name}: missing (required evidence file)")
        return None
    ok(f"{name}: present")
    try:
        with open(path, encoding="utf-8") as f:
            data = yaml.safe_load(f)
    except yaml.YAMLError as e:
        fail(f"{name}: does not parse as YAML ({type(e).__name__})")
        return None
    if not isinstance(data, dict):
        fail(f"{name}: YAML root is not a mapping")
        return None
    ok(f"{name}: parses as YAML")

    if "result" not in data:
        fail(f"{name}: no result field")
    else:
        result = str(data.get("result") or "").strip().lower()
        if result == "pass":
            ok(f"{name}: result: pass")
        else:
            j = override_justification(data)
            if j:
                ok(f"{name}: result '{data.get('result')}' overridden — {j[:80]}")
            else:
                fail(f"{name}: result is '{data.get('result')}' (expected pass; no recorded override)")

    blocking = []
    flags = data.get("flags")
    if isinstance(flags, dict) and flags.get("blocking"):
        blocking.extend(flags["blocking"])
    if data.get("blocking_issues"):
        blocking.extend(data["blocking_issues"])
    if blocking:
        j = override_justification(data)
        if j:
            ok(f"{name}: {len(blocking)} blocking flag(s) resolved by recorded override")
        else:
            fail(f"{name}: {len(blocking)} unresolved blocking flag(s)")
    else:
        ok(f"{name}: no unresolved blocking flags")
    return data


def check_scorecard(name, data):
    """Recompute weighted overall from weights recorded in the evidence file,
    and check recorded result against recorded threshold + dimension minimums."""
    scores = data.get("scores") if isinstance(data.get("scores"), dict) else {}
    dims = {k: v for k, v in scores.items()
            if is_num(v) and k not in ("overall", "overall_score")}
    overall = scores.get("overall", data.get("overall", data.get("overall_score")))
    weights = data.get("weights")
    if not isinstance(weights, dict):
        scoring = data.get("scoring")
        weights = scoring.get("weights") if isinstance(scoring, dict) else None

    # (c) overall recomputation — only from weights recorded in the file itself
    if not isinstance(weights, dict) or not weights:
        skip(f"{name}: no weights recorded in evidence file — overall recomputation skipped")
    elif not is_num(overall):
        fail(f"{name}: weights recorded but no numeric overall to compare against")
    else:
        missing = [d for d in weights if d not in dims]
        if missing:
            fail(f"{name}: weighted dimension(s) missing from scores: {', '.join(missing)}")
        else:
            computed = sum(dims[d] * float(weights[d]) for d in weights)
            if abs(computed - float(overall)) <= 0.05 + 1e-9:
                ok(f"{name}: recorded overall {overall} matches recomputed {computed:.3f} (±0.05)")
            else:
                fail(f"{name}: recorded overall {overall} != recomputed {computed:.3f} (tolerance ±0.05)")

    # result consistency vs recorded threshold + per-dimension minimums
    threshold = data.get("threshold")
    dim_min = data.get("dimension_minimum", data.get("per_dimension_minimum"))
    result = str(data.get("result") or "").strip().lower()
    if not is_num(overall) or not is_num(threshold):
        skip(f"{name}: overall/threshold not both recorded — result-consistency check skipped")
        return
    expected = "pass" if float(overall) >= float(threshold) else "fail"
    low = []
    if is_num(dim_min) and dims:
        low = sorted(d for d, v in dims.items() if v < float(dim_min))
        if low:
            expected = "fail"
    if result == expected or (expected == "fail" and override_justification(data)):
        detail = f"overall {overall} vs threshold {threshold}"
        if is_num(dim_min):
            detail += f", dimension minimum {dim_min}"
        ok(f"{name}: recorded result '{result}' consistent with {detail}")
    else:
        why = f"overall {overall} vs threshold {threshold}"
        if low:
            why += f"; dimension(s) below minimum {dim_min}: {', '.join(low)}"
        fail(f"{name}: recorded result '{result}' inconsistent — expected '{expected}' ({why})")


def check_gate2(name, data):
    """A non-empty test command/rationale field must exist. Never re-execute it."""
    for field in ("test_command", "test_commands", "commands", "command", "rationale", "notes"):
        v = data.get(field)
        if (isinstance(v, str) and v.strip()) or (isinstance(v, (list, dict)) and v):
            ok(f"{name}: non-empty '{field}' field present (recorded commands are not re-executed)")
            return
    fail(f"{name}: no non-empty test command/rationale field "
         "(looked for: test_command, test_commands, commands, command, rationale, notes)")


config = load_frontmatter(config_path) or {}
evidence_dirname = config.get("evidence_dir") or "evidence"
ev_dir = os.path.join(spec_dir, evidence_dirname)

if not os.path.isdir(ev_dir):
    fail(f"evidence directory missing: {ev_dir}")
    print(f"\n❌ verify-evidence: 1 check FAILED for {spec_dir}")
    sys.exit(1)

# --- Required gates (evidence-package rubric checks 1, 2, 6, 7) ---
for fname, kind in (("gate-1-scorecard.yml", "scorecard"),
                    ("gate-2-quality.yml", "gate2"),
                    ("gate-3-review.yml", "plain")):
    data = check_common(fname, os.path.join(ev_dir, fname))
    if data is None:
        continue
    if kind == "scorecard":
        check_scorecard(fname, data)
    elif kind == "gate2":
        check_gate2(fname, data)

# --- Opt-in gates (gates.<name>.enabled: true in .claude/sdlc.local.md) ---
gates_cfg = config.get("gates") if isinstance(config.get("gates"), dict) else {}
if not os.path.isfile(config_path):
    skip(f"opt-in gate checks: {config_path} not found")
for gate_name, fname, kind in (("eval-intent", "gate-2a-eval-intent.yml", "scorecard"),
                               ("eval-quality", "gate-2b-eval-quality.yml", "scorecard"),
                               ("comprehension", "gate-2c-comprehension.yml", "plain")):
    g = gates_cfg.get(gate_name)
    enabled = isinstance(g, dict) and bool(g.get("enabled"))
    path = os.path.join(ev_dir, fname)
    if not enabled and not os.path.isfile(path):
        continue
    if enabled and not os.path.isfile(path):
        msg = (f"{fname}: gates.{gate_name}.enabled is true in {config_path} "
               "but the evidence file is missing")
        if strict:
            fail(msg)
        else:
            warn(msg + " — policy gap (gate may have been enabled after this spec "
                 "closed); use --strict to fail on this")
        continue
    # File present (whether or not the gate is currently enabled): verify integrity.
    data = check_common(fname, path)
    if data is not None and kind == "scorecard":
        check_scorecard(fname, data)

print()
summary = f"{passes} passed, {failures} failed, {skips} skipped, {warns} warnings"
if failures:
    print(f"❌ verify-evidence: FAILED for {spec_dir} ({summary})")
    sys.exit(1)
print(f"✅ verify-evidence: all checks passed for {spec_dir} ({summary})")
PY
fi

# ---------------------------------------------------------------------------
# Fallback: grep-level structural checks (no python3 with PyYAML available)
# ---------------------------------------------------------------------------
echo "⚠️  WARN no python3 with PyYAML found — running grep-level structural checks only"

EV_DIR="$SPEC_DIR/evidence"
FAILURES=0

if [ ! -d "$EV_DIR" ]; then
  echo "❌ evidence directory missing: $EV_DIR"
  exit 1
fi

for f in gate-1-scorecard.yml gate-2-quality.yml gate-3-review.yml; do
  path="$EV_DIR/$f"
  if [ ! -s "$path" ]; then
    echo "❌ $f: missing or empty (required evidence file)"
    FAILURES=$((FAILURES + 1))
    continue
  fi
  echo "✅ $f: present"
  if grep -qE '^result:[[:space:]]*pass[[:space:]]*$' "$path"; then
    echo "✅ $f: result: pass"
  elif grep -qE '^result:' "$path"; then
    echo "❌ $f: result field present but not 'pass'"
    FAILURES=$((FAILURES + 1))
  else
    echo "❌ $f: no top-level result field"
    FAILURES=$((FAILURES + 1))
  fi
done
echo "⏭️  SKIP YAML parse, blocking-flag, overall-recomputation, threshold-consistency,"
echo "         gate-2 rationale, and opt-in gate checks (require python3 with PyYAML)"

echo ""
if [ "$FAILURES" -gt 0 ]; then
  echo "❌ verify-evidence: FAILED for $SPEC_DIR ($FAILURES structural failure(s))"
  exit 1
fi
echo "✅ verify-evidence: structural checks passed for $SPEC_DIR (deep checks skipped)"
