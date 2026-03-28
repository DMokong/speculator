import pytest
import yaml
from pathlib import Path
from unittest.mock import patch, MagicMock
from spec_bench.scoring import score_spec, iterate_spec, parse_scorecard_yaml
from spec_bench.config import Target

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

    def mock_score_side_effect(spec_path, output_dir, version=0):
        call_count[0] += 1
        if call_count[0] == 1:
            return failing
        return passing

    with patch("spec_bench.scoring.score_spec", side_effect=mock_score_side_effect), \
         patch("spec_bench.scoring.subprocess.run") as mock_adapter:
        mock_adapter.return_value = MagicMock(returncode=0, stdout="", stderr="")
        # Create the v1 spec that the adapter "produces"
        (spec_dir / "spec-v1.md").write_text("# Improved spec")

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

    def mock_score_side_effect(spec_path, output_dir, version=0):
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

    def mock_score_side_effect(spec_path, output_dir, version=0):
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

    def mock_score_side_effect(spec_path, output_dir, version=0):
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
