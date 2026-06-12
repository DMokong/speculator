#!/usr/bin/env bash
# Copilot CLI adapter for spec-bench
# Interface: --prd <path> --template <path> [--prompt <path>] --model <id> --output-dir <path> [--superpowers <path>]
set -euo pipefail

PRD=""
TEMPLATE=""
PROMPT_FILE=""
MODEL=""
OUTPUT_DIR=""
SUPERPOWERS=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --prd)        PRD="$2";         shift 2 ;;
    --template)   TEMPLATE="$2";   shift 2 ;;
    --prompt)     PROMPT_FILE="$2"; shift 2 ;;
    --model)      MODEL="$2";       shift 2 ;;
    --output-dir) OUTPUT_DIR="$2";  shift 2 ;;
    --superpowers) SUPERPOWERS="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# Validate required args
for var in PRD TEMPLATE MODEL OUTPUT_DIR; do
  if [[ -z "${!var}" ]]; then
    echo "Error: --${var,,} is required" >&2
    exit 1
  fi
done

mkdir -p "$OUTPUT_DIR"

# Build the full prompt
PRD_CONTENT=$(cat "$PRD")
TEMPLATE_CONTENT=$(cat "$TEMPLATE")

if [[ -n "$PROMPT_FILE" ]]; then
  PROCESS_PROMPT=$(cat "$PROMPT_FILE")
  FULL_PROMPT="${PROCESS_PROMPT}

---

## PRD

${PRD_CONTENT}

---

## Output Template

${TEMPLATE_CONTENT}"
else
  # Superpowers mode — no explicit process prompt; let the plugin drive
  FULL_PROMPT="## PRD

${PRD_CONTENT}

---

## Output Template

${TEMPLATE_CONTENT}"
fi

SESSION_LOG="$OUTPUT_DIR/session.log"
SPEC_FILE="$OUTPUT_DIR/spec.md"
METRICS_FILE="$OUTPUT_DIR/metrics.json"

# Build copilot command
COPILOT_CMD=(copilot -p "$FULL_PROMPT" --model "$MODEL" --yolo --autopilot --no-ask-user --no-custom-instructions)

if [[ -n "$SUPERPOWERS" ]]; then
  COPILOT_CMD+=(--plugin-dir "$SUPERPOWERS")
fi

# Capture wall clock time
START_TIME=$(date +%s%N)

set +e
"${COPILOT_CMD[@]}" 2>&1 | tee "$SESSION_LOG"
EXIT_CODE=${PIPESTATUS[0]}
set -e

END_TIME=$(date +%s%N)
WALL_CLOCK_SECONDS=$(echo "scale=3; ($END_TIME - $START_TIME) / 1000000000" | bc)

# Extract spec.md from session log
grep -v "^>" "$SESSION_LOG" | grep -A 999999 "^# Spec:" | head -999999 > "$SPEC_FILE" || true

if [[ ! -s "$SPEC_FILE" ]]; then
  cp "$SESSION_LOG" "$SPEC_FILE"
fi

# Extract token counts from session log if present. Copilot CLI has no JSON
# usage envelope, so when the scrape finds nothing the counts are null —
# never 0, because zeros masquerade as measurements.
TOKENS_IN=null
TOKENS_OUT=null

if grep -q "input tokens" "$SESSION_LOG" 2>/dev/null; then
  TOKENS_IN=$(grep "input tokens" "$SESSION_LOG" | grep -oE '[0-9]+' | head -1 || echo null)
fi
if grep -q "output tokens" "$SESSION_LOG" 2>/dev/null; then
  TOKENS_OUT=$(grep "output tokens" "$SESSION_LOG" | grep -oE '[0-9]+' | head -1 || echo null)
fi

# bc emits sub-second values without a leading zero (".042"), which is
# invalid JSON — pad it.
[[ "$WALL_CLOCK_SECONDS" == .* ]] && WALL_CLOCK_SECONDS="0$WALL_CLOCK_SECONDS"

# Write metrics
cat > "$METRICS_FILE" <<EOF
{
  "tokens_in": ${TOKENS_IN},
  "tokens_out": ${TOKENS_OUT},
  "wall_clock_seconds": ${WALL_CLOCK_SECONDS}
}
EOF

echo "Copilot CLI adapter complete. Output in: $OUTPUT_DIR" >&2

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "Error: copilot exited with code $EXIT_CODE" >&2
  exit $EXIT_CODE
fi
