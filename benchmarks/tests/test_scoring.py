import json
import pytest
import yaml
from pathlib import Path
from unittest.mock import patch, MagicMock
from spec_bench.scoring import (
    build_control_prompt,
    build_feedback_prompt,
    iterate_spec,
    parse_scorecard_yaml,
    score_spec,
)
from spec_bench.config import DEFAULT_SCORER_MODEL, Target

SAMPLE_SCORECARD_YAML = """
scores:
  completeness: 8
  clarity: 7
  testability: 6
  intent_verifiability: 7
  feasibility: 8
  scope: 8
  overall: 7.3
flags:
  blocking: []
  recommended:
    - "Testability needs improvement: ACs are vague"
  advisory:
    - "Consider adding anti-patterns"
"""

PASSING_SCORECARD_YAML = """
scores:
  completeness: 9
  clarity: 9
  testability: 8
  intent_verifiability: 8
  feasibility: 8
  scope: 8
  overall: 8.5
flags:
  blocking: []
  recommended: []
  advisory: []
"""


def test_parse_scorecard_yaml():
    result = parse_scorecard_yaml(SAMPLE_SCORECARD_YAML)
    assert result["scores"]["overall"] == 7.3
    assert result["scores"]["completeness"] == 8
    assert len(result["flags"]["recommended"]) == 1


def test_parse_scorecard_yaml_with_markdown_fence():
    """parse_scorecard_yaml should strip markdown code fences."""
    fenced = f"```yaml\n{SAMPLE_SCORECARD_YAML.strip()}\n```"
    result = parse_scorecard_yaml(fenced)
    assert result["scores"]["overall"] == 7.3


def test_parse_scorecard_yaml_with_leading_prose():
    """parse_scorecard_yaml should find YAML after leading prose."""
    with_prose = f"Here is the scorecard:\n\n{SAMPLE_SCORECARD_YAML}"
    result = parse_scorecard_yaml(with_prose)
    assert result["scores"]["overall"] == 7.3


def test_parse_scorecard_yaml_with_fenced_prose():
    """parse_scorecard_yaml should handle prose + fenced YAML."""
    with_prose_and_fence = (
        "I have evaluated the spec against the rubric.\n\n"
        f"```yaml\n{SAMPLE_SCORECARD_YAML.strip()}\n```\n"
    )
    result = parse_scorecard_yaml(with_prose_and_fence)
    assert result["scores"]["overall"] == 7.3


def test_score_spec_calls_claude(tmp_path):
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Test Spec\n## Requirements\n- R1: Do the thing")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=SAMPLE_SCORECARD_YAML,
            stderr=""
        )
        scorecard = score_spec(spec_file, tmp_path)

    assert scorecard["scores"]["overall"] == 7.3
    assert (tmp_path / "scorecard-v0.yml").exists()


def test_score_spec_writes_correct_version(tmp_path):
    """score_spec with version=2 writes scorecard-v2.yml."""
    spec_file = tmp_path / "spec-v2.md"
    spec_file.write_text("# Spec v2")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=0,
            stdout=PASSING_SCORECARD_YAML,
            stderr=""
        )
        scorecard = score_spec(spec_file, tmp_path, version=2)

    assert (tmp_path / "scorecard-v2.yml").exists()
    assert scorecard["scores"]["overall"] == 8.5


def test_score_spec_subprocess_failure_raises(tmp_path):
    """score_spec raises RuntimeError when claude -p exits non-zero."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(
            returncode=1,
            stdout="",
            stderr="claude: command not found"
        )
        with pytest.raises(RuntimeError, match="Scorer failed"):
            score_spec(spec_file, tmp_path)


def test_iterate_spec_passes_first_try(tmp_path):
    """AC2: If score >= 7.8 on first try, no iteration needed."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Good spec")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with patch("spec_bench.scoring.score_spec") as mock_score:
        mock_score.return_value = yaml.safe_load(PASSING_SCORECARD_YAML)

        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    assert result["summary"]["passed"] is True
    assert result["summary"]["iterations_needed"] == 0
    # spec-improved should be same as v0
    assert (spec_dir / "spec-improved.md").exists()


def test_iterate_spec_improves_after_feedback(tmp_path):
    """AC2: Iteration loop re-invokes adapter with feedback."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Weak spec")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    failing = yaml.safe_load(SAMPLE_SCORECARD_YAML)  # 7.3
    passing = yaml.safe_load(PASSING_SCORECARD_YAML)  # 8.5

    call_count = [0]

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        call_count[0] += 1
        if call_count[0] == 1:
            return failing
        return passing

    def mock_adapter_side_effect(*args, **kwargs):
        # Simulate the adapter writing spec.md (which iterate_spec will rename to spec-v1.md)
        (spec_dir / "spec.md").write_text("# Improved spec")
        return MagicMock(returncode=0, stdout="", stderr="")

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run", side_effect=mock_adapter_side_effect):

        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    assert result["summary"]["passed"] is True
    assert result["summary"]["iterations_needed"] >= 1
    assert result["summary"]["original_score"] == 7.3
    assert result["summary"]["final_score"] == 8.5


def test_iterate_spec_produces_iteration_log(tmp_path):
    """AC8: iteration-log.yml has required fields."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Spec")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with patch("spec_bench.scoring.score_spec") as mock_score:
        mock_score.return_value = yaml.safe_load(PASSING_SCORECARD_YAML)

        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    # Check iteration-log.yml was written
    log_path = spec_dir / "iteration-log.yml"
    assert log_path.exists()
    log = yaml.safe_load(log_path.read_text())
    assert "iterations" in log
    assert "summary" in log
    assert "passed" in log["summary"]
    assert "original_score" in log["summary"]
    assert "final_score" in log["summary"]
    assert "convergence_rate" in log["summary"]


def test_iterate_spec_never_exceeds_max_iterations(tmp_path):
    """AC3: Loop stops at max_iterations even if spec never passes."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Weak spec")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")
    failing = yaml.safe_load(SAMPLE_SCORECARD_YAML)  # 7.3, always below 7.8

    call_count = [0]

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        call_count[0] += 1
        return failing

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run") as mock_adapter:
        mock_adapter.return_value = MagicMock(returncode=0, stdout="", stderr="")
        # Pre-create iteration specs so the loop can proceed
        for i in range(1, 5):
            (spec_dir / f"spec-v{i}.md").write_text(f"# Spec v{i}")

        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            max_iterations=3,
        )

    # score_spec called for v0 + up to 3 iterations = at most 4 calls
    assert call_count[0] <= 4
    assert result["summary"]["passed"] is False
    assert result["summary"]["iterations_needed"] == 3


def test_iterate_spec_best_version_chosen(tmp_path):
    """After loop ends, spec-improved.md = best-scoring version."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Spec v0")
    (spec_dir / "spec-v1.md").write_text("# Spec v1 — best")
    (spec_dir / "spec-v2.md").write_text("# Spec v2 — regression")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    # v0=7.3, v1=7.6 (best but below threshold), v2=7.1 (regression)
    scores = [7.3, 7.6, 7.1]
    call_count = [0]

    def make_scorecard(overall):
        return {
            "scores": {
                "completeness": 8, "clarity": 7, "testability": 7,
                "intent_verifiability": 7, "feasibility": 8, "scope": 8,
                "overall": overall,
            },
            "flags": {"blocking": [], "recommended": [], "advisory": []},
        }

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        idx = call_count[0]
        call_count[0] += 1
        return make_scorecard(scores[min(idx, len(scores) - 1)])

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run") as mock_adapter:
        mock_adapter.return_value = MagicMock(returncode=0, stdout="", stderr="")
        for i in range(3, 5):
            (spec_dir / f"spec-v{i}.md").write_text(f"# Spec v{i}")

        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            max_iterations=2,
        )

    # Best was v1 at 7.6
    improved = (spec_dir / "spec-improved.md").read_text()
    assert "best" in improved  # content from spec-v1.md
    assert result["summary"]["final_score"] == 7.6


def test_iterate_spec_convergence_rate_populated(tmp_path):
    """iteration-log.yml convergence_rate has one entry per scored version."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Spec v0")
    (spec_dir / "spec-v1.md").write_text("# Spec v1")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    failing = yaml.safe_load(SAMPLE_SCORECARD_YAML)   # 7.3
    passing = yaml.safe_load(PASSING_SCORECARD_YAML)  # 8.5
    call_count = [0]

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        call_count[0] += 1
        return failing if call_count[0] == 1 else passing

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run") as mock_adapter:
        mock_adapter.return_value = MagicMock(returncode=0, stdout="", stderr="")
        (spec_dir / "spec-v2.md").write_text("# Spec v2")

        iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    log = yaml.safe_load((spec_dir / "iteration-log.yml").read_text())
    # Scored v0 (7.3) and v1 (8.5) → 2 entries
    assert len(log["summary"]["convergence_rate"]) == 2
    assert log["summary"]["convergence_rate"][0] == 7.3
    assert log["summary"]["convergence_rate"][1] == 8.5


# ---------------------------------------------------------------------------
# Scorer model pinning
# ---------------------------------------------------------------------------


def _mock_scorer_run(stdout=SAMPLE_SCORECARD_YAML):
    return MagicMock(returncode=0, stdout=stdout, stderr="")


def test_score_spec_pins_default_model(tmp_path):
    """The scorer invocation always passes --model — never environment-default."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run()
        score_spec(spec_file, tmp_path)

    cmd = mock_run.call_args[0][0]
    assert "--model" in cmd
    assert cmd[cmd.index("--model") + 1] == DEFAULT_SCORER_MODEL


def test_score_spec_passes_model_through(tmp_path):
    """An explicit model parameter reaches the CLI invocation."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run()
        scorecard = score_spec(spec_file, tmp_path, model="claude-opus-4-6")

    cmd = mock_run.call_args[0][0]
    assert cmd[cmd.index("--model") + 1] == "claude-opus-4-6"
    # Provenance recorded on the scorecard
    assert scorecard["scorer"]["model"] == "claude-opus-4-6"


def test_score_spec_requests_json_output(tmp_path):
    """The scorer requests the JSON envelope so token usage can be parsed."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run()
        score_spec(spec_file, tmp_path)

    cmd = mock_run.call_args[0][0]
    assert "--output-format" in cmd
    assert cmd[cmd.index("--output-format") + 1] == "json"


# ---------------------------------------------------------------------------
# Rubric source
# ---------------------------------------------------------------------------

REPO_RUBRIC = Path(__file__).resolve().parents[2] / "rubrics" / "spec-quality.md"


def test_score_spec_production_rubric_in_prompt(tmp_path):
    """rubric_source='production' loads the shipped judge rubric into the prompt."""
    assert REPO_RUBRIC.exists(), f"expected production rubric at {REPO_RUBRIC}"

    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Distinctive spec content R1 R2 R3")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run()
        score_spec(spec_file, tmp_path, rubric_source="production")

    cmd = mock_run.call_args[0][0]
    prompt = cmd[cmd.index("-p") + 1]
    # Calibration / anti-inflation / minimums content that the inline prompt drops
    assert "Anti-Inflation Guidance" in prompt
    assert "Per-Dimension Minimum" in prompt
    assert "Calibration Examples" in prompt
    assert "# Distinctive spec content R1 R2 R3" in prompt


def test_score_spec_inline_rubric_has_no_calibration_examples(tmp_path):
    """Default inline prompt stays unchanged (no production rubric content)."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run()
        scorecard = score_spec(spec_file, tmp_path)

    prompt = mock_run.call_args[0][0][mock_run.call_args[0][0].index("-p") + 1]
    assert "Calibration Examples" not in prompt
    assert scorecard["scorer"]["rubric_source"] == "inline"


def test_score_spec_invalid_rubric_source_raises(tmp_path):
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")
    with pytest.raises(ValueError, match="rubric_source"):
        score_spec(spec_file, tmp_path, rubric_source="bogus")


# ---------------------------------------------------------------------------
# Token accounting
# ---------------------------------------------------------------------------


def test_score_spec_parses_usage_from_json_envelope(tmp_path):
    """Token usage from the claude -p JSON envelope is recorded on the scorecard."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    envelope = json.dumps({
        "type": "result",
        "result": SAMPLE_SCORECARD_YAML,
        "usage": {"input_tokens": 1234, "output_tokens": 567},
    })

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run(stdout=envelope)
        scorecard = score_spec(spec_file, tmp_path)

    assert scorecard["scores"]["overall"] == 7.3
    assert scorecard["scorer"]["tokens_in"] == 1234
    assert scorecard["scorer"]["tokens_out"] == 567

    # Persisted scorecard carries the same provenance
    written = yaml.safe_load((tmp_path / "scorecard-v0.yml").read_text())
    assert written["scorer"]["tokens_in"] == 1234


def test_score_spec_null_tokens_when_usage_unavailable(tmp_path):
    """Plain-text scorer output (no JSON envelope) records None — never 0."""
    spec_file = tmp_path / "spec.md"
    spec_file.write_text("# Spec")

    with patch("spec_bench.scoring.subprocess.run") as mock_run:
        mock_run.return_value = _mock_scorer_run(stdout=SAMPLE_SCORECARD_YAML)
        scorecard = score_spec(spec_file, tmp_path)

    assert scorecard["scorer"]["tokens_in"] is None
    assert scorecard["scorer"]["tokens_out"] is None


def test_iterate_spec_accumulates_scorer_tokens(tmp_path):
    """total_iteration_tokens sums real scorer measurements across versions."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Weak spec")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    failing = yaml.safe_load(SAMPLE_SCORECARD_YAML)
    failing["scorer"] = {"model": DEFAULT_SCORER_MODEL, "rubric_source": "inline",
                         "tokens_in": 100, "tokens_out": 50}
    passing = yaml.safe_load(PASSING_SCORECARD_YAML)
    passing["scorer"] = {"model": DEFAULT_SCORER_MODEL, "rubric_source": "inline",
                         "tokens_in": 200, "tokens_out": 80}

    call_count = [0]

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        call_count[0] += 1
        return failing if call_count[0] == 1 else passing

    def mock_adapter_side_effect(*args, **kwargs):
        (spec_dir / "spec.md").write_text("# Improved spec")
        return MagicMock(returncode=0, stdout="", stderr="")

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run", side_effect=mock_adapter_side_effect):
        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    # 100+50 (v0) + 200+80 (v1) = 430
    assert result["summary"]["total_iteration_tokens"] == 430


def test_iterate_spec_total_tokens_null_when_unmeasured(tmp_path):
    """No token measurements anywhere → total_iteration_tokens is null, not 0."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Good spec")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with patch("spec_bench.scoring.score_spec") as mock_score:
        mock_score.return_value = yaml.safe_load(PASSING_SCORECARD_YAML)
        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
        )

    assert result["summary"]["total_iteration_tokens"] is None

    log = yaml.safe_load((spec_dir / "iteration-log.yml").read_text())
    assert log["summary"]["total_iteration_tokens"] is None


# ---------------------------------------------------------------------------
# Improvement modes (feedback | control | none)
# ---------------------------------------------------------------------------


def test_build_control_prompt_contains_no_scorer_feedback():
    """Control prompt carries spec/PRD/template but zero scorer output."""
    scorecard = yaml.safe_load(SAMPLE_SCORECARD_YAML)
    flag_text = "Testability needs improvement: ACs are vague"

    feedback = build_feedback_prompt(
        scorecard=scorecard,
        spec_content="SPEC-CONTENT",
        prd_content="PRD-CONTENT",
        template_content="TEMPLATE-CONTENT",
    )
    control = build_control_prompt(
        spec_content="SPEC-CONTENT",
        prd_content="PRD-CONTENT",
        template_content="TEMPLATE-CONTENT",
    )

    # Feedback arm carries the scorer's flags; control arm must not
    assert flag_text in feedback
    assert flag_text not in control
    assert "7.3" in feedback
    assert "7.3" not in control
    assert "threshold" not in control.lower()
    assert "weakest" not in control.lower()
    assert "feedback" not in control.lower()

    # Control arm still gets the same inputs
    assert "SPEC-CONTENT" in control
    assert "PRD-CONTENT" in control
    assert "TEMPLATE-CONTENT" in control


def test_iterate_spec_control_mode_writes_clean_prompt(tmp_path):
    """In control mode the revision prompt file contains no scorer flag text."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Weak spec")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "prompts").mkdir()
    (tmp_path / "prompts" / "vanilla.md").write_text("Write spec")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    failing = yaml.safe_load(SAMPLE_SCORECARD_YAML)
    passing = yaml.safe_load(PASSING_SCORECARD_YAML)
    call_count = [0]

    def mock_score_side_effect(spec_path, output_dir, version=0, **kwargs):
        call_count[0] += 1
        return failing if call_count[0] == 1 else passing

    def mock_adapter_side_effect(*args, **kwargs):
        (spec_dir / "spec.md").write_text("# Improved spec")
        return MagicMock(returncode=0, stdout="", stderr="")

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run", side_effect=mock_adapter_side_effect):
        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            improvement_mode="control",
        )

    prompt_file = spec_dir / "control-prompt-v1.md"
    assert prompt_file.exists()
    prompt = prompt_file.read_text()
    assert "Testability needs improvement: ACs are vague" not in prompt
    assert "7.3" not in prompt
    # Same revision-pass structure as the feedback arm
    assert result["summary"]["iterations_needed"] >= 1
    assert result["summary"]["improvement_mode"] == "control"


def test_iterate_spec_mode_none_skips_revisions(tmp_path):
    """improvement_mode='none' scores v0 only — no adapter invocation."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Weak spec")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with patch("spec_bench.scoring.score_spec") as mock_score, \
         patch("spec_bench.scoring.subprocess.run") as mock_adapter:
        mock_score.return_value = yaml.safe_load(SAMPLE_SCORECARD_YAML)  # 7.3, below threshold
        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            improvement_mode="none",
        )

    mock_adapter.assert_not_called()
    assert result["summary"]["iterations_needed"] == 0
    assert result["summary"]["passed"] is False
    assert result["summary"]["improvement_mode"] == "none"
    assert (spec_dir / "spec-improved.md").read_text() == "# Weak spec"


def test_iterate_spec_invalid_mode_raises(tmp_path):
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Spec")
    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with pytest.raises(ValueError, match="improvement_mode"):
        iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            improvement_mode="bogus",
        )


def test_iteration_log_records_scorer_provenance(tmp_path):
    """iteration-log.yml records scorer_model, improvement_mode, rubric_source."""
    spec_dir = tmp_path / "specs" / "test-target"
    spec_dir.mkdir(parents=True)
    (spec_dir / "spec-v0.md").write_text("# Good spec")

    target = Target(id="test-target", harness="claude-code", model="opus-4-6", process="vanilla")

    with patch("spec_bench.scoring.score_spec") as mock_score:
        mock_score.return_value = yaml.safe_load(PASSING_SCORECARD_YAML)
        result = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=tmp_path / "adapters",
            prompts_dir=tmp_path / "prompts",
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            scorer_model="claude-opus-4-6",
            rubric_source="production",
        )

    assert result["summary"]["scorer_model"] == "claude-opus-4-6"
    assert result["summary"]["improvement_mode"] == "feedback"
    assert result["summary"]["rubric_source"] == "production"
    # score_spec received the threaded scorer parameters
    _, kwargs = mock_score.call_args
    assert kwargs["model"] == "claude-opus-4-6"
    assert kwargs["rubric_source"] == "production"
