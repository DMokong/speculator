"""Judge timeout regression tests (bench-2026-06-12-001).

The vision judge's subprocess.run(timeout=120) raised TimeoutExpired during
functional-test review and killed the whole run. These tests pin the fix:
a 600s default threaded from judge.timeout_seconds in the matrix config,
and a structured judge_timeout verdict instead of an exception.
"""

import subprocess

import pytest
from unittest.mock import MagicMock, patch

from spec_bench.config import DEFAULT_JUDGE_TIMEOUT_SECONDS, load_matrix
from spec_bench.review import run_judge
from spec_bench.vision_judge import run_vision_judge


MATRIX_HEADER = """
benchmark:
  prd: test
  runs_per_combination: 1
  constant_implementer:
    harness: claude-code
    model: sonnet-4-6
    process: superpowers
    permissions: dangerously-skip-permissions
"""

MATRIX_TARGETS = """
  targets:
    - id: t1
      harness: claude-code
      model: opus-4-6
      process: vanilla
"""

SAMPLE_TESTS = [
    {"id": "F01", "requirement": "R01: Show temperature", "test": "Temperature visible"},
    {"id": "F02", "requirement": "R02: Show forecast", "test": "Forecast visible"},
]

SAMPLE_VERDICT_YAML = """\
F01:
  passed: true
  evidence: "ok"
F02:
  passed: true
  evidence: "ok"
"""


# ---------------------------------------------------------------------------
# Config: judge.timeout_seconds
# ---------------------------------------------------------------------------


def test_load_matrix_judge_timeout_defaults_to_600(tmp_path):
    """Without judge.timeout_seconds the config defaults to 600."""
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  judge:
    model: opus-4-6
""" + MATRIX_TARGETS)
    config = load_matrix(matrix_file)
    assert config.judge_timeout_seconds == 600
    assert DEFAULT_JUDGE_TIMEOUT_SECONDS == 600


def test_load_matrix_judge_timeout_parsed(tmp_path):
    """judge.timeout_seconds in the matrix overrides the default."""
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  judge:
    model: opus-4-6
    timeout_seconds: 1200
""" + MATRIX_TARGETS)
    config = load_matrix(matrix_file)
    assert config.judge_timeout_seconds == 1200


def test_load_matrix_rejects_non_positive_judge_timeout(tmp_path):
    matrix_file = tmp_path / "matrix.yml"
    matrix_file.write_text(MATRIX_HEADER + """
  judge:
    model: opus-4-6
    timeout_seconds: 0
""" + MATRIX_TARGETS)
    with pytest.raises(ValueError, match="judge.timeout_seconds must be positive"):
        load_matrix(matrix_file)


# ---------------------------------------------------------------------------
# Vision judge: TimeoutExpired → structured judge_timeout verdicts
# ---------------------------------------------------------------------------


def test_run_vision_judge_timeout_returns_judge_timeout_verdicts():
    """TimeoutExpired produces a failure verdict per test, not an exception."""
    with patch("spec_bench.vision_judge._resolve_claude_bin", return_value="claude"), \
         patch("spec_bench.vision_judge.subprocess.run",
               side_effect=subprocess.TimeoutExpired(cmd="claude", timeout=600)):
        verdicts = run_vision_judge(SAMPLE_TESTS, states=[])

    assert set(verdicts) == {"F01", "F02"}
    for verdict in verdicts.values():
        assert verdict["passed"] is False
        assert verdict["status"] == "judge_timeout"
        assert "timed out" in verdict["evidence"]


def test_run_vision_judge_default_timeout_is_600():
    """The subprocess timeout default was raised from 120s to 600s."""
    with patch("spec_bench.vision_judge._resolve_claude_bin", return_value="claude"), \
         patch("spec_bench.vision_judge.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=SAMPLE_VERDICT_YAML, stderr="")
        run_vision_judge(SAMPLE_TESTS, states=[])

    assert mock_run.call_args.kwargs["timeout"] == 600


def test_run_vision_judge_timeout_is_configurable():
    """timeout_seconds threads through to subprocess.run."""
    with patch("spec_bench.vision_judge._resolve_claude_bin", return_value="claude"), \
         patch("spec_bench.vision_judge.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stdout=SAMPLE_VERDICT_YAML, stderr="")
        run_vision_judge(SAMPLE_TESTS, states=[], timeout_seconds=42)

    assert mock_run.call_args.kwargs["timeout"] == 42


def test_run_functional_tests_threads_judge_timeout(tmp_path):
    """run_functional_tests passes judge_timeout_seconds to the vision judge."""
    from spec_bench.review import run_functional_tests

    functional_tests_path = tmp_path / "functional-tests.yml"
    functional_tests_path.write_text("""
functional_checklist:
  - id: F01
    requirement: "R01: Show temperature"
    test: "Temperature visible"
""")
    app_dir = tmp_path / "app"
    app_dir.mkdir()
    output_dir = tmp_path / "output"
    output_dir.mkdir()

    mock_pw_ctx = MagicMock()
    mock_browser = MagicMock()
    mock_browser.new_page.return_value = MagicMock()
    mock_pw_ctx.chromium.launch.return_value = mock_browser

    with patch("spec_bench.review.subprocess.Popen", return_value=MagicMock()), \
         patch("spec_bench.review._wait_for_server"), \
         patch("playwright.sync_api.sync_playwright") as pw_mock, \
         patch("spec_bench.app_navigator.setup_api_mocks", return_value=[]), \
         patch("spec_bench.app_navigator.seed_profile"), \
         patch("spec_bench.app_navigator.navigate_states", return_value=[]), \
         patch("spec_bench.review._run_programmatic_checks", return_value={}), \
         patch("spec_bench.vision_judge.run_vision_judge", return_value={}) as mock_judge:
        pw_mock.return_value.__enter__.return_value = mock_pw_ctx
        run_functional_tests(
            app_dir=app_dir,
            functional_tests_path=functional_tests_path,
            output_dir=output_dir,
            judge_timeout_seconds=987,
        )

    assert mock_judge.call_args.kwargs["timeout_seconds"] == 987


# ---------------------------------------------------------------------------
# Outcome judge: configurable timeout
# ---------------------------------------------------------------------------


def _run_judge_with_mock(tmp_path, mock_run, **kwargs):
    prd_path = tmp_path / "prd.md"
    prd_path.write_text("# PRD")
    spec_path = tmp_path / "spec.md"
    spec_path.write_text("# Spec")
    impl_dir = tmp_path / "app"
    impl_dir.mkdir(exist_ok=True)
    rubric_path = tmp_path / "rubric.md"
    rubric_path.write_text("rubric")
    output_dir = tmp_path / "output"
    output_dir.mkdir(exist_ok=True)

    mock_run.return_value = MagicMock(returncode=0, stdout="scores:\n  overall: 7.0", stderr="")
    return run_judge(
        prd_path=prd_path,
        spec_path=spec_path,
        impl_dir=impl_dir,
        rubric_path=rubric_path,
        output_dir=output_dir,
        **kwargs,
    )


def test_run_judge_default_timeout_is_600(tmp_path):
    with patch("spec_bench.review.subprocess.run") as mock_run:
        _run_judge_with_mock(tmp_path, mock_run)
    assert mock_run.call_args.kwargs["timeout"] == 600


def test_run_judge_timeout_is_configurable(tmp_path):
    with patch("spec_bench.review.subprocess.run") as mock_run:
        _run_judge_with_mock(tmp_path, mock_run, timeout_seconds=123)
    assert mock_run.call_args.kwargs["timeout"] == 123
