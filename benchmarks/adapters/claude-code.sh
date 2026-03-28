#!/usr/bin/env bash
# Claude Code adapter for spec-bench
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

# Build claude command
# Use CLAUDE_BIN if set, otherwise find claude in standard locations (avoid node_modules/.bin shadowing)
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude 2>/dev/null || echo "$HOME/.local/bin/claude")}"
if [[ "$CLAUDE_BIN" == *"node_modules"* ]]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
fi

CLAUDE_CMD=("$CLAUDE_BIN" -p "$FULL_PROMPT" --model "$MODEL" --dangerously-skip-permissions)

if [[ -n "$SUPERPOWERS" ]]; then
  CLAUDE_CMD+=(--plugin-dir "$SUPERPOWERS")
fi

# Capture wall clock time
START_TIME=$(date +%s%N)

set +e
"${CLAUDE_CMD[@]}" 2>&1 | tee "$SESSION_LOG"
EXIT_CODE=${PIPESTATUS[0]}
set -e

END_TIME=$(date +%s%N)
WALL_CLOCK_SECONDS=$(echo "scale=3; ($END_TIME - $START_TIME) / 1000000000" | bc)

# Extract spec.md from session log — look for a markdown block or the whole output
# Claude Code with -p outputs the assistant response directly
grep -v "^>" "$SESSION_LOG" | grep -A 999999 "^# Spec:" | head -999999 > "$SPEC_FILE" || true

if [[ ! -s "$SPEC_FILE" ]]; then
  # Fallback: treat entire log as the spec output (minus any log prefix lines)
  cp "$SESSION_LOG" "$SPEC_FILE"
fi

# Extract token counts from session log if present (claude -p outputs cost/token info to stderr)
TOKENS_IN=0
TOKENS_OUT=0

if grep -q "input tokens" "$SESSION_LOG" 2>/dev/null; then
  TOKENS_IN=$(grep "input tokens" "$SESSION_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)
fi
if grep -q "output tokens" "$SESSION_LOG" 2>/dev/null; then
  TOKENS_OUT=$(grep "output tokens" "$SESSION_LOG" | grep -oE '[0-9]+' | head -1 || echo 0)
fi

# Write metrics
cat > "$METRICS_FILE" <<EOF
{
  "tokens_in": ${TOKENS_IN},
  "tokens_out": ${TOKENS_OUT},
  "wall_clock_seconds": ${WALL_CLOCK_SECONDS}
}
EOF

echo "Claude Code adapter complete. Output in: $OUTPUT_DIR" >&2

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "Error: claude exited with code $EXIT_CODE" >&2
  exit $EXIT_CODE
fi
