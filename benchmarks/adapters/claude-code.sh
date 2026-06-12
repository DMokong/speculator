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
ENVELOPE_FILE="$OUTPUT_DIR/claude-output.json"

# Build claude command
# Use CLAUDE_BIN if set, otherwise find claude in standard locations (avoid node_modules/.bin shadowing)
CLAUDE_BIN="${CLAUDE_BIN:-$(command -v claude 2>/dev/null || echo "$HOME/.local/bin/claude")}"
if [[ "$CLAUDE_BIN" == *"node_modules"* ]]; then
  CLAUDE_BIN="$HOME/.local/bin/claude"
fi

# Map matrix model IDs to Claude CLI model identifiers
# Claude CLI accepts aliases (sonnet, opus) or full names (claude-sonnet-4-6)
case "$MODEL" in
  sonnet-4-6|sonnet)  CLAUDE_MODEL="sonnet" ;;
  opus-4-6|opus)      CLAUDE_MODEL="opus" ;;
  claude-*)           CLAUDE_MODEL="$MODEL" ;;  # Already a full name
  *)                  CLAUDE_MODEL="$MODEL" ;;  # Pass through as-is
esac

# --output-format json wraps the response in a JSON envelope whose `result`
# field carries the text that plain-text mode would have printed, and whose
# `usage` field carries real token counts (input + cache fields + output).
CLAUDE_CMD=("$CLAUDE_BIN" -p "$FULL_PROMPT" --model "$CLAUDE_MODEL" --dangerously-skip-permissions --output-format json)

if [[ -n "$SUPERPOWERS" ]]; then
  CLAUDE_CMD+=(--plugin-dir "$SUPERPOWERS")
fi

# Capture wall clock time
START_TIME=$(date +%s%N)

# Run Claude inside the output directory so all files are created there
cd "$OUTPUT_DIR"

set +e
"${CLAUDE_CMD[@]}" > "$ENVELOPE_FILE"
EXIT_CODE=$?
set -e

END_TIME=$(date +%s%N)
WALL_CLOCK_SECONDS=$(echo "scale=3; ($END_TIME - $START_TIME) / 1000000000" | bc)

# Parse the JSON envelope: write the `result` text to session.log (preserving
# the plain-text contract the spec extraction below depends on) and record
# real token usage in metrics.json. Mirrors scoring.py's
# _parse_claude_json_envelope: tokens_in is the FULL input-side count
# (input_tokens + cache_creation_input_tokens + cache_read_input_tokens —
# with prompt caching the cache fields dominate), tokens_in_components keeps
# the per-tier breakdown. On parse failure (e.g. an older CLI emitting plain
# text), session.log gets the raw output and tokens are null — never 0,
# because zeros masquerade as measurements.
python3 - "$ENVELOPE_FILE" "$SESSION_LOG" "$METRICS_FILE" "$WALL_CLOCK_SECONDS" <<'PYEOF'
import json
import sys

envelope_path, session_path, metrics_path, wall_clock = sys.argv[1:5]

with open(envelope_path, encoding="utf-8") as f:
    raw = f.read()

text = raw
tokens_in = None
tokens_out = None
components = None

try:
    envelope = json.loads(raw)
except json.JSONDecodeError:
    envelope = None

if isinstance(envelope, dict) and "result" in envelope:
    text = str(envelope.get("result", ""))
    usage = envelope.get("usage") or {}
    input_fields = (
        "input_tokens",
        "cache_creation_input_tokens",
        "cache_read_input_tokens",
    )
    measured = {
        name: int(usage[name])
        for name in input_fields
        if isinstance(usage.get(name), (int, float))
    }
    if measured:
        tokens_in = sum(measured.values())
        components = {name: measured.get(name, 0) for name in input_fields}
    out = usage.get("output_tokens")
    if isinstance(out, (int, float)):
        tokens_out = int(out)

with open(session_path, "w", encoding="utf-8") as f:
    f.write(text)

metrics = {
    "tokens_in": tokens_in,
    "tokens_out": tokens_out,
    "tokens_in_components": components,
    "wall_clock_seconds": float(wall_clock),
}
with open(metrics_path, "w", encoding="utf-8") as f:
    json.dump(metrics, f, indent=2)
    f.write("\n")
PYEOF

# Extract spec.md from session log — look for a markdown block or the whole output
# (session.log holds the envelope's `result` text, i.e. the assistant response)
grep -v "^>" "$SESSION_LOG" | grep -A 999999 "^# Spec:" | head -999999 > "$SPEC_FILE" || true

if [[ ! -s "$SPEC_FILE" ]]; then
  # Fallback: treat entire log as the spec output (minus any log prefix lines)
  cp "$SESSION_LOG" "$SPEC_FILE"
fi

echo "Claude Code adapter complete. Output in: $OUTPUT_DIR" >&2

if [[ $EXIT_CODE -ne 0 ]]; then
  echo "Error: claude exited with code $EXIT_CODE" >&2
  exit $EXIT_CODE
fi
