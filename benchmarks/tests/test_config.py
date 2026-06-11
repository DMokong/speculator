import pytest
from pathlib import Path
from spec_bench.config import (
    DEFAULT_SCORER_MODEL,
    load_matrix,
    load_prd,
    MatrixConfig,
    PRDConfig,
)

FIXTURES = Path(__file__).parent / "fixtures"

MATRIX_HEADER = """
benchmark:
  prd: test
  runs_per_combination: 1
  constant_implementer:
    harness: claude-code
    model: sonnet-4-6
    process: superpowers
    permissions: dangerously-skip-permissions
  judge:
    model: opus-4-6
"""


def test_load_matrix_valid(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text("""
benchmark:
  prd: weather-transport
  runs_per_combination: 1
  constant_implementer:
    harness: claude-code
    model: sonnet-4-6
    process: superpowers
    permissions: dangerously-skip-permissions
  judge:
    model: opus-4-6
  targets:
    - id: cc-vanilla-opus
      harness: claude-code
      model: opus-4-6
      process: vanilla
""")
    config = load_matrix(matrix_file)
    assert config.prd == "weather-transport"
    assert config.runs_per_combination == 1
    assert config.judge_model == "opus-4-6"
    assert len(config.targets) == 1
    assert config.targets[0].id == "cc-vanilla-opus"
    assert config.targets[0].process == "vanilla"


def test_load_matrix_rejects_unknown_process(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text("""
benchmark:
  prd: test
  runs_per_combination: 1
  constant_implementer:
    harness: claude-code
    model: sonnet-4-6
    process: superpowers
    permissions: dangerously-skip-permissions
  judge:
    model: opus-4-6
  targets:
    - id: test-target
      harness: claude-code
      model: opus-4-6
      process: unknown-process
""")
    with pytest.raises(ValueError, match="unknown-process"):
        load_matrix(matrix_file)


def test_load_matrix_rejects_judge_same_as_implementer(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text("""
benchmark:
  prd: test
  runs_per_combination: 1
  constant_implementer:
    harness: claude-code
    model: sonnet-4-6
    process: superpowers
    permissions: dangerously-skip-permissions
  judge:
    model: sonnet-4-6
  targets:
    - id: test-target
      harness: claude-code
      model: opus-4-6
      process: vanilla
""")
    with pytest.raises(ValueError, match="judge.model must differ"):
        load_matrix(matrix_file)


def test_load_matrix_scorer_defaults(tmp_path):
    """Without a scorer block the model is pinned to the default — never unset."""
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  targets:
    - id: t1
      harness: claude-code
      model: opus-4-6
      process: vanilla
""")
    config = load_matrix(matrix_file)
    assert config.scorer.model == DEFAULT_SCORER_MODEL
    assert config.scorer.improvement_mode == "feedback"
    assert config.scorer.rubric_source == "inline"
    assert config.targets[0].improvement_mode is None


def test_load_matrix_scorer_block_parsed(tmp_path):
    """Scorer block and per-target improvement_mode overrides are parsed."""
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  scorer:
    model: claude-opus-4-6
    improvement_mode: feedback
    rubric_source: production
  targets:
    - id: t1-feedback
      harness: claude-code
      model: sonnet-4-6
      process: vanilla
      improvement_mode: feedback
    - id: t1-control
      harness: claude-code
      model: sonnet-4-6
      process: vanilla
      improvement_mode: control
""")
    config = load_matrix(matrix_file)
    assert config.scorer.model == "claude-opus-4-6"
    assert config.scorer.rubric_source == "production"
    # Paired arms: same target axes, differing only on improvement_mode
    assert config.targets[0].improvement_mode == "feedback"
    assert config.targets[1].improvement_mode == "control"


def test_load_matrix_rejects_invalid_improvement_mode(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  scorer:
    improvement_mode: bogus
  targets:
    - id: t1
      harness: claude-code
      model: opus-4-6
      process: vanilla
""")
    with pytest.raises(ValueError, match="improvement_mode"):
        load_matrix(matrix_file)


def test_load_matrix_rejects_invalid_rubric_source(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  scorer:
    rubric_source: bogus
  targets:
    - id: t1
      harness: claude-code
      model: opus-4-6
      process: vanilla
""")
    with pytest.raises(ValueError, match="rubric_source"):
        load_matrix(matrix_file)


def test_load_matrix_rejects_invalid_target_improvement_mode(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  targets:
    - id: t1
      harness: claude-code
      model: opus-4-6
      process: vanilla
      improvement_mode: bogus
""")
    with pytest.raises(ValueError, match="improvement_mode 'bogus' for target 't1'"):
        load_matrix(matrix_file)


def test_load_matrix_ablation_config_parses():
    """The checked-in paired-arm ablation matrix loads cleanly."""
    matrix_path = Path(__file__).resolve().parents[1] / "matrix" / "feedback-ablation.yml"
    config = load_matrix(matrix_path)
    assert config.scorer.model == "claude-sonnet-4-6"
    assert config.scorer.rubric_source == "production"
    modes = {t.improvement_mode for t in config.targets}
    assert modes == {"feedback", "control"}
