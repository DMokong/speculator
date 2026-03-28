"""Spec scoring module — integrates with Speculator's spec-scorer and implements
the iteration loop for improving specs before benchmarking."""

import os
import re
import shutil
import subprocess
import time
from pathlib import Path
from typing import Optional

import yaml


def _resolve_claude_bin() -> str:
    """Find the system claude binary, avoiding node_modules/.bin shadowing."""
    claude_bin = os.environ.get("CLAUDE_BIN")
    if claude_bin:
        return claude_bin
    found = shutil.which("claude")
    if found and "node_modules" not in found:
        return found
    fallback = Path.home() / ".local" / "bin" / "claude"
    if fallback.exists():
        return str(fallback)
    return "claude"  # Last resort


# Map matrix model IDs to Claude CLI model identifiers
_CLAUDE_MODEL_MAP = {
    "sonnet-4-6": "sonnet",
    "opus-4-6": "opus",
    "sonnet": "sonnet",
    "opus": "opus",
}


def _map_claude_model(model_id: str) -> str:
    """Map a matrix model ID to a Claude CLI model identifier."""
    return _CLAUDE_MODEL_MAP.get(model_id, model_id)

from .config import Target

# Default scoring weights matching the Speculator rubric
DIMENSION_WEIGHTS = {
    "completeness": 0.20,
    "clarity": 0.20,
    "testability": 0.20,
    "intent_verifiability": 0.15,
    "feasibility": 0.15,
    "scope": 0.10,
}

DIMENSIONS = list(DIMENSION_WEIGHTS.keys())

SCORING_PROMPT_TEMPLATE = """\
You are a specification quality evaluator. Evaluate the following software spec
against the 6-dimension Speculator rubric and produce a YAML scorecard.

## Dimensions and weights

| Dimension             | Weight |
|----------------------|--------|
| completeness          | 0.20   |
| clarity               | 0.20   |
| testability           | 0.20   |
| intent_verifiability  | 0.15   |
| feasibility           | 0.15   |
| scope                 | 0.10   |

## Scoring anchors (per dimension, 1–10)
- 1–3: Poor — missing, vague, or fundamentally broken
- 4–6: Adequate — present but thin or partially meets the bar
- 7–8: Good — solid, ready for implementation with minor improvements
- 9–10: Excellent — comprehensive, production-grade (rare; reserved for exceptional specs)

## Flag categories
- blocking: must fix before implementation (e.g. contradictory requirements, untestable ACs)
- recommended: should fix but not gate-blocking (e.g. thin sections, minor ambiguity)
- advisory: nice-to-have improvements

## Spec to evaluate

{spec_content}

## Required output format

Respond with ONLY a YAML block (no prose before or after):

```yaml
scores:
  completeness: <1-10>
  clarity: <1-10>
  testability: <1-10>
  intent_verifiability: <1-10>
  feasibility: <1-10>
  scope: <1-10>
  overall: <weighted average, 1 decimal>
flags:
  blocking: []
  recommended:
    - "<observation>"
  advisory:
    - "<observation>"
```
"""

IMPROVEMENT_PROMPT_TEMPLATE = """\
A software spec was evaluated and scored {score:.1f} overall (pass threshold: {threshold:.1f}).

The weakest dimensions were: {weakest_dims}.

Feedback from the scorecard:
{feedback}

## Original PRD

{prd_content}

## Current spec (version {version})

{spec_content}

## Spec template

{template_content}

## Your task

Improve the spec to address the feedback above. Keep the same overall structure
and requirements. Focus specifically on the weakest dimensions. Output ONLY the
improved spec — no commentary, no preamble.
"""


def parse_scorecard_yaml(text: str) -> dict:
    """Extract and parse a YAML scorecard from LLM response text.

    Handles:
    - Responses that are pure YAML
    - Responses with leading prose followed by YAML
    - Markdown code fences (```yaml ... ```)
    """
    # Try to extract from a markdown code fence first
    fence_match = re.search(r"```(?:yaml)?\s*\n(.*?)```", text, re.DOTALL)
    if fence_match:
        candidate = fence_match.group(1).strip()
        try:
            return yaml.safe_load(candidate)
        except yaml.YAMLError:
            pass

    # Try the whole text as YAML
    try:
        result = yaml.safe_load(text)
        if isinstance(result, dict) and "scores" in result:
            return result
    except yaml.YAMLError:
        pass

    # Try everything from the first 'scores:' line onward
    idx = text.find("scores:")
    if idx != -1:
        try:
            result = yaml.safe_load(text[idx:])
            if isinstance(result, dict) and "scores" in result:
                return result
        except yaml.YAMLError:
            pass

    raise ValueError(f"Could not extract a valid YAML scorecard from response:\n{text[:500]}")


def _build_scoring_prompt(spec_content: str) -> str:
    return SCORING_PROMPT_TEMPLATE.format(spec_content=spec_content)


def score_spec(spec_path: Path, output_dir: Path, version: int = 0) -> dict:
    """Score a spec using the Speculator rubric via `claude -p`.

    Args:
        spec_path: Path to the spec markdown file.
        output_dir: Directory to write the scorecard YAML into.
        version: Integer version number — determines output filename
                 (e.g. version=0 → scorecard-v0.yml).

    Returns:
        Parsed scorecard dict with 'scores' and 'flags' keys.

    Raises:
        RuntimeError: If the subprocess exits non-zero.
    """
    spec_content = spec_path.read_text()
    prompt = _build_scoring_prompt(spec_content)

    result = subprocess.run(
        [_resolve_claude_bin(), "-p", prompt, "--dangerously-skip-permissions"],
        capture_output=True,
        text=True,
        timeout=300,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Scorer failed (exit {result.returncode}): {result.stderr[:500]}"
        )

    scorecard = parse_scorecard_yaml(result.stdout)

    # Write scorecard to output dir
    output_dir.mkdir(parents=True, exist_ok=True)
    scorecard_path = output_dir / f"scorecard-v{version}.yml"
    scorecard_path.write_text(yaml.dump(scorecard, default_flow_style=False))

    return scorecard


def _extract_feedback(scorecard: dict) -> str:
    """Summarise scorecard flags into a human-readable feedback string."""
    lines = []
    flags = scorecard.get("flags", {})
    blocking = flags.get("blocking", []) or []
    recommended = flags.get("recommended", []) or []
    advisory = flags.get("advisory", []) or []

    if blocking:
        lines.append("BLOCKING issues (must fix):")
        lines.extend(f"  - {f}" for f in blocking)
    if recommended:
        lines.append("Recommended improvements:")
        lines.extend(f"  - {f}" for f in recommended)
    if advisory:
        lines.append("Advisory suggestions:")
        lines.extend(f"  - {f}" for f in advisory)

    return "\n".join(lines) if lines else "No specific flags — review dimension scores for guidance."


def _weakest_dimensions(scorecard: dict, n: int = 2) -> list[str]:
    """Return the n lowest-scoring dimension names."""
    scores = scorecard.get("scores", {})
    dim_scores = {d: scores.get(d, 5) for d in DIMENSIONS}
    return sorted(dim_scores, key=lambda d: dim_scores[d])[:n]


def build_feedback_prompt(
    scorecard: dict,
    spec_content: str,
    prd_content: str,
    template_content: str,
    version: int = 0,
    pass_threshold: float = 7.8,
) -> str:
    """Construct the improvement prompt from scorecard feedback."""
    overall = scorecard["scores"]["overall"]
    weakest = _weakest_dimensions(scorecard)
    feedback = _extract_feedback(scorecard)

    return IMPROVEMENT_PROMPT_TEMPLATE.format(
        score=overall,
        threshold=pass_threshold,
        weakest_dims=", ".join(weakest),
        feedback=feedback,
        prd_content=prd_content,
        spec_content=spec_content,
        template_content=template_content,
        version=version,
    )


def iterate_spec(
    target: Target,
    spec_dir: Path,
    adapters_dir: Path,
    prompts_dir: Path,
    prd_path: Path,
    template_path: Path,
    max_iterations: int = 3,
    pass_threshold: float = 7.8,
) -> dict:
    """Run the spec iteration loop: score → improve → rescore until pass or max_iterations.

    Implements AC2, AC3, AC8 from the Spec-Bench spec.

    Returns:
        The iteration-log dict (also written to spec_dir/iteration-log.yml).
    """
    from .orchestrator import ADAPTER_MAP

    start_time = time.time()
    iteration_tokens = 0

    # Determine prompt path based on process
    prompt_path: Optional[Path] = None
    if target.process == "vanilla":
        prompt_path = prompts_dir / "vanilla.md"

    adapter_script = adapters_dir / ADAPTER_MAP.get(target.harness, f"{target.harness}.sh")

    version_history = []  # list of {version, score, scorecard}

    # --- Score v0 ---
    spec_v0 = spec_dir / "spec-v0.md"
    scorecard = score_spec(spec_v0, spec_dir, version=0)
    overall = scorecard["scores"]["overall"]
    version_history.append({"version": 0, "score": overall, "scorecard": scorecard})

    # --- Fast-pass: already above threshold ---
    if overall >= pass_threshold:
        _write_improved(spec_dir, spec_v0)
        log = _build_log(
            version_history=version_history,
            best_score=overall,
            iterations_needed=0,
            passed=True,
            elapsed=time.time() - start_time,
            total_tokens=iteration_tokens,
            pass_threshold=pass_threshold,
        )
        _write_log(spec_dir, log)
        return log

    # --- Iteration loop ---
    prd_content = prd_path.read_text() if prd_path.exists() else ""
    template_content = template_path.read_text() if template_path.exists() else ""

    current_version = 0
    iterations_done = 0

    for iteration in range(1, max_iterations + 1):
        next_version = current_version + 1
        next_spec = spec_dir / f"spec-v{next_version}.md"

        # Build feedback prompt and write to a temp file so the adapter can read it
        current_spec_content = (spec_dir / f"spec-v{current_version}.md").read_text()
        feedback_prompt = build_feedback_prompt(
            scorecard=version_history[-1]["scorecard"],
            spec_content=current_spec_content,
            prd_content=prd_content,
            template_content=template_content,
            version=current_version,
            pass_threshold=pass_threshold,
        )

        feedback_prompt_path = spec_dir / f"feedback-prompt-v{next_version}.md"
        feedback_prompt_path.write_text(feedback_prompt)

        # Re-invoke the adapter with the feedback prompt
        cmd = [
            str(adapter_script),
            "--prd", str(prd_path),
            "--template", str(template_path),
            "--model", target.model,
            "--output-dir", str(spec_dir),
            "--prompt", str(feedback_prompt_path),
        ]

        adapter_result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,
        )

        iterations_done += 1

        if adapter_result.returncode != 0:
            # Adapter failed — stop iterating, use best so far
            break

        # Adapter always writes spec.md — rename to versioned name
        adapter_output = spec_dir / "spec.md"
        if adapter_output.exists():
            adapter_output.rename(next_spec)

        # Score the new version (only if the adapter produced it)
        if not next_spec.exists():
            # Adapter didn't produce the expected output file — stop
            break

        scorecard = score_spec(next_spec, spec_dir, version=next_version)
        overall = scorecard["scores"]["overall"]
        version_history.append({"version": next_version, "score": overall, "scorecard": scorecard})
        current_version = next_version

        if overall >= pass_threshold:
            break

    # --- Choose best-scoring version ---
    best = max(version_history, key=lambda v: v["score"])
    best_spec = spec_dir / f"spec-v{best['version']}.md"
    _write_improved(spec_dir, best_spec)

    final_score = best["score"]
    passed = final_score >= pass_threshold

    log = _build_log(
        version_history=version_history,
        best_score=final_score,
        iterations_needed=iterations_done,
        passed=passed,
        elapsed=time.time() - start_time,
        total_tokens=iteration_tokens,
        pass_threshold=pass_threshold,
    )
    _write_log(spec_dir, log)
    return log


def _write_improved(spec_dir: Path, source_spec: Path) -> None:
    """Copy source_spec to spec-improved.md."""
    improved = spec_dir / "spec-improved.md"
    improved.write_text(source_spec.read_text())


def _build_log(
    version_history: list[dict],
    best_score: float,
    iterations_needed: int,
    passed: bool,
    elapsed: float,
    total_tokens: int,
    pass_threshold: float,
) -> dict:
    """Build the iteration-log data structure."""
    original_score = version_history[0]["score"] if version_history else 0.0
    final_score = best_score

    # Compute per-iteration improvement deltas
    improvement_deltas = []
    for i in range(1, len(version_history)):
        delta = version_history[i]["score"] - version_history[i - 1]["score"]
        improvement_deltas.append(round(delta, 2))

    convergence_rate = [v["score"] for v in version_history]

    iterations = [
        {
            "version": v["version"],
            "score": v["score"],
        }
        for v in version_history
    ]

    return {
        "iterations": iterations,
        "summary": {
            "passed": passed,
            "iterations_needed": iterations_needed,
            "original_score": original_score,
            "final_score": final_score,
            "improvement_deltas": improvement_deltas,
            "convergence_rate": convergence_rate,
            "total_iteration_tokens": total_tokens,
            "total_iteration_time_seconds": round(elapsed, 2),
            "pass_threshold": pass_threshold,
        },
    }


def _write_log(spec_dir: Path, log: dict) -> None:
    log_path = spec_dir / "iteration-log.yml"
    log_path.write_text(yaml.dump(log, default_flow_style=False, sort_keys=False))
