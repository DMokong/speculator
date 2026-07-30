#!/usr/bin/env python3
"""Deterministic Gate 1 pre-commit warning for the Speculator PreToolUse hook.

Reads a PreToolUse hook payload on stdin. Prints nothing unless an active spec
lacks a passing Gate 1 scorecard, in which case it prints a single JSON object
carrying a `systemMessage`. Always exits 0 — this is a warning, never a block.

Invoked by hooks/sdlc-gate-check.sh, which handles the fast-path bail so the
common case (any Bash call that is not a commit) never reaches this file.

Usage: sdlc-gate-check.py <project-dir>   # payload on stdin
"""

import json
import os
import shlex
import sys


def emit_and_exit(message=None):
    if message:
        print(json.dumps({
            "hookSpecificOutput": {"permissionDecision": "allow"},
            "systemMessage": message,
        }))
    raise SystemExit(0)


# git global options that consume the FOLLOWING token as their value. Without
# this, `git -C /repo commit` reads /repo as the subcommand and the commit is
# missed. The `--opt=value` spellings need no entry — they are a single token.
GIT_VALUE_OPTS = {
    "-C", "-c", "--git-dir", "--work-tree", "--namespace",
    "--exec-path", "--super-prefix", "--config-env",
}


def is_git_commit(cmd):
    """True if any shell segment of `cmd` is a `git ... commit` invocation.

    Splits on shell operators so `npm test && git commit -m x` is caught, and
    tokenizes so a `git commit` inside a quoted string is not.
    """
    for sep in ("&&", "||", ";", "|", "\n"):
        cmd = cmd.replace(sep, "\x00")
    for segment in cmd.split("\x00"):
        try:
            tokens = shlex.split(segment)
        except ValueError:
            tokens = segment.split()
        # Skip env-var prefixes: FOO=bar git commit ...
        while tokens and "=" in tokens[0] and not tokens[0].startswith("-"):
            tokens = tokens[1:]
        if not tokens or os.path.basename(tokens[0]) != "git":
            continue
        # Walk past git's global options to reach the subcommand.
        rest = tokens[1:]
        i = 0
        while i < len(rest):
            tok = rest[i]
            if tok in GIT_VALUE_OPTS:
                i += 2  # skip the option and its value
                continue
            if tok.startswith("-"):
                i += 1
                continue
            return tok == "commit"
        # A bare `git` with only global options is not a commit.
    return False


def frontmatter(path):
    """Minimal top-level YAML frontmatter reader. Returns {} on any problem.

    Deliberately not a YAML parser: it reads flat `key: value` pairs from the
    leading `---` block and ignores nested structure, which is all this hook
    needs (`spec_dir`, `evidence_dir`, `status`). No third-party dependency.
    """
    try:
        with open(path, "r", encoding="utf-8", errors="replace") as fh:
            if fh.readline().strip() != "---":
                return {}
            out = {}
            for line in fh:
                if line.strip() in ("---", "..."):
                    break
                if line.startswith((" ", "\t", "#")) or ":" not in line:
                    continue
                key, _, value = line.partition(":")
                out[key.strip()] = value.strip().strip("\"'")
            return out
    except OSError:
        return {}


def gate1_passed(scorecard_path):
    """True only if the scorecard exists and records a top-level `result: pass`."""
    try:
        with open(scorecard_path, "r", encoding="utf-8", errors="replace") as fh:
            for line in fh:
                if line.startswith("result:"):
                    return line.split(":", 1)[1].strip().strip("\"'").lower() == "pass"
    except OSError:
        return False
    return False


def main():
    project_dir = sys.argv[1] if len(sys.argv) > 1 else os.getcwd()

    try:
        payload = json.load(sys.stdin)
    except Exception:
        emit_and_exit()

    if not isinstance(payload, dict) or payload.get("tool_name") != "Bash":
        emit_and_exit()

    command = (payload.get("tool_input") or {}).get("command")
    if not isinstance(command, str) or not is_git_commit(command):
        emit_and_exit()

    config = frontmatter(os.path.join(project_dir, ".claude", "sdlc.local.md"))
    if not config:
        emit_and_exit()  # not a Speculator project, or unreadable — stay quiet

    spec_root = os.path.join(project_dir, config.get("spec_dir") or "docs/specs")
    evidence_dir = config.get("evidence_dir") or "evidence"

    try:
        entries = sorted(os.scandir(spec_root), key=lambda e: e.name)
    except OSError:
        emit_and_exit()

    pending = []
    for entry in entries:
        if not entry.is_dir():
            continue
        spec_md = os.path.join(entry.path, "spec.md")
        if not os.path.isfile(spec_md):
            continue
        # Active == not yet closed. An absent/unreadable status counts as active
        # so a malformed spec surfaces rather than silently passing.
        if (frontmatter(spec_md).get("status") or "").lower() == "closed":
            continue
        if not gate1_passed(os.path.join(entry.path, evidence_dir, "gate-1-scorecard.yml")):
            pending.append(entry.name)

    if not pending:
        emit_and_exit()

    names = ", ".join('"%s"' % name for name in pending)
    label = "Specs" if len(pending) > 1 else "Spec"
    emit_and_exit(
        "SDLC Gate Warning: %s %s has not passed Gate 1 (spec quality). "
        "Run /sdlc score to evaluate the spec before committing. "
        "This is a warning, not a block — the commit will proceed."
        % (label, names)
    )


if __name__ == "__main__":
    main()
