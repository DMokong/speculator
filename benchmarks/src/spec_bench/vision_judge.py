"""Vision judge — sends page evidence to Claude for requirement evaluation.

Uses `claude -p` to evaluate whether captured app states satisfy PRD requirements.
The judge sees: page text, accessibility tree summary, and the requirement description.
Screenshots are saved for human review but not sent to the judge (text is cheaper and
sufficient for structured evaluation).
"""

import subprocess
import json
from pathlib import Path

import yaml

from .config import DEFAULT_JUDGE_TIMEOUT_SECONDS
from .scoring import _resolve_claude_bin, _map_claude_model


JUDGE_PROMPT = """\
You are evaluating a web application against its Product Requirements Document (PRD).

For each requirement below, examine the provided evidence (page text and accessibility tree
from different app states) and determine whether the requirement is satisfied.

IMPORTANT:
- Judge based on EVIDENCE PRESENT, not on what might be hidden or broken.
- A requirement PASSES if there is clear evidence it is implemented and functioning.
- A requirement FAILS if there is no evidence or the evidence shows it is missing/broken.
- Be strict but fair — the feature must actually work, not just have placeholder text.

## Requirements to Evaluate

{requirements_yaml}

## Evidence: App States

{evidence_text}

## Output Format

Respond with ONLY a YAML block (no markdown fences) mapping each test ID to a verdict:

F01:
  passed: true
  evidence: "Brief factual evidence from the page text"
F02:
  passed: false
  evidence: "What was missing or wrong"
...

Evaluate ALL {count} requirements (F01-F{count:02d}). Do not skip any.
"""


def _format_evidence(states: list) -> str:
    """Format captured app states into text evidence for the judge."""
    parts = []
    for state in states:
        tree_summary = json.dumps(state.accessibility_tree, indent=2)[:3000]
        localStorage_keys = list(state.localStorage.keys())
        section = (
            "### State: " + state.name + "\n\n"
            + "**Page text:**\n"
            + "```\n"
            + state.page_text[:2000] + "\n"
            + "```\n\n"
            + "**Accessibility tree (truncated):**\n"
            + "```json\n"
            + tree_summary + "\n"
            + "```\n\n"
            + "**localStorage keys:** " + str(localStorage_keys) + "\n\n"
            + "**Screenshot saved:** " + str(state.screenshot_path) + "\n"
        )
        parts.append(section)
    return "\n---\n".join(parts)


def _format_requirements(tests: list[dict]) -> str:
    """Format functional test requirements as YAML for the judge."""
    parts = []
    for t in tests:
        parts.append(
            "- id: " + t["id"] + "\n"
            + "  requirement: \"" + t["requirement"] + "\"\n"
            + "  test: \"" + t["test"] + "\""
        )
    return "\n".join(parts)


def parse_verdicts(raw: str) -> dict:
    """Parse YAML verdicts from judge response."""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        data = yaml.safe_load(raw)
    except yaml.YAMLError:
        return {}

    if not isinstance(data, dict):
        return {}

    verdicts = {}
    for key, value in data.items():
        if isinstance(value, dict):
            verdicts[str(key)] = {
                "passed": bool(value.get("passed", False)),
                "evidence": str(value.get("evidence", "")),
            }
    return verdicts


def run_vision_judge(
    tests: list[dict],
    states: list,
    judge_model: str = "sonnet",
    timeout_seconds: int = DEFAULT_JUDGE_TIMEOUT_SECONDS,
) -> dict:
    """Run the LLM vision judge on captured app states.

    Args:
        tests: List of test dicts with id, requirement, test keys.
        states: List of AppState objects from app_navigator.
        judge_model: Claude model to use for judging.
        timeout_seconds: Subprocess timeout for the judge call (from
            judge.timeout_seconds in the matrix config).

    Returns:
        Dict mapping test IDs to {"passed": bool, "evidence": str}.
        On judge timeout, every test gets a failure verdict with
        "status": "judge_timeout" — one slow judge call must not kill
        the rest of the benchmark run.
    """
    evidence_text = _format_evidence(states)
    requirements_yaml = _format_requirements(tests)

    prompt = JUDGE_PROMPT.format(
        requirements_yaml=requirements_yaml,
        evidence_text=evidence_text,
        count=len(tests),
    )

    try:
        result = subprocess.run(
            [
                _resolve_claude_bin(),
                "-p",
                prompt,
                "--dangerously-skip-permissions",
                "--model",
                _map_claude_model(judge_model),
            ],
            capture_output=True,
            text=True,
            timeout=timeout_seconds,
        )
    except subprocess.TimeoutExpired:
        evidence = (
            f"Vision judge timed out after {timeout_seconds}s — no verdict produced"
        )
        return {
            t["id"]: {"passed": False, "evidence": evidence, "status": "judge_timeout"}
            for t in tests
        }

    if result.returncode != 0:
        raise RuntimeError(f"Vision judge failed (exit {result.returncode}): {result.stderr[:500]}")

    return parse_verdicts(result.stdout)
