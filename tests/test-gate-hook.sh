#!/bin/bash
# Test: PreToolUse pre-commit gate hook (hooks/sdlc-gate-check.sh + .py)
#
# Pins the two properties that make this hook safe to run on every Bash call:
#   1. It never blocks — exit 0 on every path, including malformed input.
#   2. It stays silent unless the command is a real `git commit` AND an active
#      spec lacks a passing Gate 1 scorecard.
#
# Also pins the no-model-call contract: hooks.json must declare type "command",
# never "prompt". The prompt form (shipped through v2.20.0) fired a model call on
# every Bash invocation and 400s on inference profiles that reject the thinking
# parameters the host's hook evaluator sends.
#
# Usage: bash tests/test-gate-hook.sh
# Exit code: 0 = all tests pass, 1 = failures detected

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
HOOK="$REPO_ROOT/hooks/sdlc-gate-check.sh"
HOOKS_JSON="$REPO_ROOT/hooks/hooks.json"

PASS=0
FAIL=0
TOTAL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red() { printf "\033[31m%s\033[0m\n" "$1"; }
bold() { printf "\033[1m%s\033[0m\n" "$1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# --- fixture project -----------------------------------------------------------
PROJ="$TMP/proj"
mkdir -p "$PROJ/.claude" \
         "$PROJ/docs/specs/SPEC-001/evidence" \
         "$PROJ/docs/specs/SPEC-002/evidence" \
         "$PROJ/docs/specs/SPEC-003/evidence"
printf -- '---\nspec_dir: docs/specs\nevidence_dir: evidence\n---\n' \
  > "$PROJ/.claude/sdlc.local.md"
# SPEC-001 — draft, no scorecard        → should warn
printf -- '---\nstatus: draft\n---\n' > "$PROJ/docs/specs/SPEC-001/spec.md"
# SPEC-002 — draft, scorecard passes    → should not warn
printf -- '---\nstatus: draft\n---\n' > "$PROJ/docs/specs/SPEC-002/spec.md"
printf 'result: pass\noverall: 8.4\n' > "$PROJ/docs/specs/SPEC-002/evidence/gate-1-scorecard.yml"
# SPEC-003 — closed, no scorecard       → out of scope, should not warn
printf -- '---\nstatus: closed\n---\n' > "$PROJ/docs/specs/SPEC-003/spec.md"

# A project with no Speculator config at all.
NOCFG="$TMP/nocfg"
mkdir -p "$NOCFG"

# run_hook <project-dir> <payload> → sets HOOK_OUT / HOOK_RC
run_hook() {
  HOOK_OUT="$(printf '%s' "$2" | CLAUDE_PROJECT_DIR="$1" bash "$HOOK" 2>/dev/null)"
  HOOK_RC=$?
}

bash_payload() {
  printf '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":%s}}' \
    "$(printf '%s' "$1" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')"
}

# expect_silent <label> <command>
expect_silent() {
  TOTAL=$((TOTAL + 1))
  run_hook "$PROJ" "$(bash_payload "$2")"
  if [ "$HOOK_RC" -eq 0 ] && [ -z "$HOOK_OUT" ]; then
    green "  ✓ silent: $1"; PASS=$((PASS + 1))
  else
    red "  ✗ silent: $1 (rc=$HOOK_RC out=$HOOK_OUT)"; FAIL=$((FAIL + 1))
  fi
}

# expect_warn <label> <command>
expect_warn() {
  TOTAL=$((TOTAL + 1))
  run_hook "$PROJ" "$(bash_payload "$2")"
  if [ "$HOOK_RC" -eq 0 ] && printf '%s' "$HOOK_OUT" | grep -q "SPEC-001"; then
    green "  ✓ warns: $1"; PASS=$((PASS + 1))
  else
    red "  ✗ warns: $1 (rc=$HOOK_RC out=$HOOK_OUT)"; FAIL=$((FAIL + 1))
  fi
}

# expect_raw_silent <label> <project> <raw-payload>
expect_raw_silent() {
  TOTAL=$((TOTAL + 1))
  run_hook "$2" "$3"
  if [ "$HOOK_RC" -eq 0 ] && [ -z "$HOOK_OUT" ]; then
    green "  ✓ silent: $1"; PASS=$((PASS + 1))
  else
    red "  ✗ silent: $1 (rc=$HOOK_RC out=$HOOK_OUT)"; FAIL=$((FAIL + 1))
  fi
}

# assert_file <label> <path>
assert_file() {
  TOTAL=$((TOTAL + 1))
  if [ -f "$2" ]; then
    green "  ✓ $1"; PASS=$((PASS + 1))
  else
    red "  ✗ $1 (missing: $2)"; FAIL=$((FAIL + 1))
  fi
}

bold "== hook files ship =="
assert_file "hooks.json present"           "$HOOKS_JSON"
assert_file "sdlc-gate-check.sh present"   "$REPO_ROOT/hooks/sdlc-gate-check.sh"
assert_file "sdlc-gate-check.py present"   "$REPO_ROOT/hooks/sdlc-gate-check.py"

bold "== no-model-call contract =="
TOTAL=$((TOTAL + 1))
if grep -q '"type": *"command"' "$HOOKS_JSON"; then
  green "  ✓ PreToolUse hook is type command"; PASS=$((PASS + 1))
else
  red "  ✗ PreToolUse hook is not type command"; FAIL=$((FAIL + 1))
fi
TOTAL=$((TOTAL + 1))
if grep -q '"type": *"prompt"' "$HOOKS_JSON"; then
  red "  ✗ hooks.json still declares a prompt hook (fires a model call per Bash call)"
  FAIL=$((FAIL + 1))
else
  green "  ✓ no prompt hook remains"; PASS=$((PASS + 1))
fi
TOTAL=$((TOTAL + 1))
if grep -q 'CLAUDE_PLUGIN_ROOT' "$HOOKS_JSON"; then
  green "  ✓ hook command uses \${CLAUDE_PLUGIN_ROOT} (portable)"; PASS=$((PASS + 1))
else
  red "  ✗ hook command must reference \${CLAUDE_PLUGIN_ROOT}"; FAIL=$((FAIL + 1))
fi

bold "== stays silent (not a git commit) =="
expect_silent "plain ls"              'ls -la'
expect_silent "git status"            'git status'
expect_silent "git log"               'git log --oneline -5'
expect_silent "commit word in string" 'echo "git commit"'
expect_silent "different subcommand"  'git commitizen --help'
expect_silent "bare git + global opt" 'git -C /tmp/repo'

bold "== stays silent (commit, but nothing to warn about) =="
expect_raw_silent "non-Bash tool" "$PROJ" \
  '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"/x"}}'
expect_raw_silent "malformed payload" "$PROJ" 'not json at all, but contains commit'
expect_raw_silent "empty payload" "$PROJ" ''
expect_raw_silent "no sdlc.local.md" "$NOCFG" \
  '{"hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"git commit -m x"}}'

bold "== warns (real commit + failing Gate 1) =="
expect_warn "git commit -m"           'git commit -m "wip"'
expect_warn "chained with &&"          'npm test && git commit -m x'
expect_warn "git -C <dir> commit"      'git -C /tmp/repo commit --amend'
expect_warn "git -c k=v commit"        'git -c user.name=x commit'
expect_warn "--git-dir spaced value"   'git --git-dir /r/.git commit -m y'
expect_warn "env var prefix"           'GIT_EDITOR=true git commit'
expect_warn "absolute git path"        '/usr/bin/git commit -m z'

bold "== passing / closed specs are not warned about =="
TOTAL=$((TOTAL + 1))
run_hook "$PROJ" "$(bash_payload 'git commit -m x')"
if printf '%s' "$HOOK_OUT" | grep -q "SPEC-002"; then
  red "  ✗ warned about SPEC-002, which has result: pass"; FAIL=$((FAIL + 1))
else
  green "  ✓ SPEC-002 (result: pass) not warned about"; PASS=$((PASS + 1))
fi
TOTAL=$((TOTAL + 1))
if printf '%s' "$HOOK_OUT" | grep -q "SPEC-003"; then
  red "  ✗ warned about SPEC-003, which is closed"; FAIL=$((FAIL + 1))
else
  green "  ✓ SPEC-003 (status: closed) not warned about"; PASS=$((PASS + 1))
fi

bold "== all specs passing → silent =="
printf 'result: pass\n' > "$PROJ/docs/specs/SPEC-001/evidence/gate-1-scorecard.yml"
expect_silent "every active spec passes Gate 1" 'git commit -m x'
rm -f "$PROJ/docs/specs/SPEC-001/evidence/gate-1-scorecard.yml"

bold "== a failing scorecard still warns =="
printf 'result: fail\n' > "$PROJ/docs/specs/SPEC-001/evidence/gate-1-scorecard.yml"
expect_warn "scorecard records result: fail" 'git commit -m x'

echo
if [ "$FAIL" -eq 0 ]; then
  green "$PASS/$TOTAL checks passed"
  exit 0
else
  red "$FAIL/$TOTAL checks FAILED ($PASS passed)"
  exit 1
fi
