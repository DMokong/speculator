#!/usr/bin/env bash
# sdlc-gate-check.sh — PreToolUse Gate 1 warning for `git commit`, with no model call.
#
# Replaces the prompt-based hook this plugin shipped through v2.20.0. That hook
# was registered on matcher "Bash", so EVERY bash invocation fired a model call
# whose first instruction was "if this isn't a git commit, approve silently" —
# a round trip per bash call to decide it had nothing to do. It also inherited
# whatever thinking configuration the host's hook evaluator sends, which 400s on
# Bedrock inference profiles that don't accept `thinking: {type: "adaptive"}`.
#
# The check itself is pure file I/O — read a config, glob spec dirs, read a YAML
# field — so it never needed an LLM. Determinism also means it cannot hallucinate
# a passing gate.
#
# Contract: PreToolUse command hook. Reads the hook payload on stdin, always
# exits 0 (this is a warning in v1, never a block), and emits JSON carrying a
# `systemMessage` only when there is something to warn about.
#
# NON-BLOCKING BY CONSTRUCTION: every failure path exits 0 and stays silent. A
# broken gate check must never wedge the user's ability to commit.

set -uo pipefail  # deliberately NOT -e: an unexpected error must not block a commit

payload=$(cat 2>/dev/null || true)

# --- Fast path -----------------------------------------------------------------
# Almost every Bash call is not a commit. Bail before spawning an interpreter: if
# the literal substring "commit" appears nowhere in the payload, this cannot be a
# `git commit`. False positives fall through to the real parse, so it is a safe
# pre-filter — and it is what keeps this hook off the hot path.
case "$payload" in
  *commit*) ;;
  *) exit 0 ;;
esac

command -v python3 >/dev/null 2>&1 || exit 0

here=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
checker="$here/sdlc-gate-check.py"
[ -f "$checker" ] || exit 0

printf '%s' "$payload" | python3 "$checker" "${CLAUDE_PROJECT_DIR:-$PWD}" 2>/dev/null || exit 0
