"""CLI regression tests — the `run` command must honor runs_per_combination.

The feedback-ablation matrix promises n=3 per arm; these tests pin the run
command to actually deliver N runs per target, with per-run output dirs
(mirroring run_benchmark's -runN suffix convention) so artifacts never collide.
"""

import copy

import yaml
from click.testing import CliRunner
from unittest.mock import MagicMock, patch

from spec_bench import cli as cli_module


MATRIX_YAML = {
    "benchmark": {
        "prd": "test-prd",
        "runs_per_combination": 3,
        "constant_implementer": {
            "harness": "claude-code",
            "model": "sonnet-4-6",
            "process": "superpowers",
            "permissions": "dangerously-skip-permissions",
        },
        "judge": {"model": "opus-4-6"},
        "targets": [
            {"id": "arm-feedback", "harness": "claude-code", "model": "sonnet-4-6",
             "process": "vanilla", "improvement_mode": "feedback"},
            {"id": "arm-control", "harness": "claude-code", "model": "sonnet-4-6",
             "process": "vanilla", "improvement_mode": "control"},
        ],
    }
}

FAKE_ITERATION_LOG = {
    "summary": {
        "passed": True,
        "iterations_needed": 0,
        "original_score": 8.0,
        "final_score": 8.0,
        "improvement_mode": "feedback",
    },
}


def _make_bench_dir(tmp_path, runs_per_combination):
    """Build a minimal benchmarks dir tree the run command can operate on."""
    bench = tmp_path / "bench"
    (bench / "matrix").mkdir(parents=True)
    matrix = copy.deepcopy(MATRIX_YAML)
    matrix["benchmark"]["runs_per_combination"] = runs_per_combination
    (bench / "matrix" / "test.yml").write_text(yaml.dump(matrix))

    prd_dir = bench / "prds" / "test-prd"
    prd_dir.mkdir(parents=True)
    (prd_dir / "prd.md").write_text("# Test PRD")

    (bench / "prompts").mkdir()
    (bench / "prompts" / "spec-template.md").write_text("# Template")
    (bench / "prompts" / "vanilla.md").write_text("Write a spec")

    (bench / "rubrics").mkdir()
    (bench / "rubrics" / "outcome-rubric.md").write_text("# Rubric")
    return bench


def _invoke_run(bench, extra_args=()):
    """Invoke `spec-bench run` with the heavy calls mocked out."""
    captured_dirs = []

    def fake_run_target(target, output_dir, **kwargs):
        captured_dirs.append(output_dir)
        return MagicMock(
            status="completed",
            tokens_in=None,
            tokens_out=None,
            wall_clock_seconds=0.0,
        )

    with patch.object(cli_module, "BENCHMARKS_DIR", bench), \
         patch.object(cli_module, "run_target", side_effect=fake_run_target) as mock_rt, \
         patch.object(cli_module, "iterate_spec",
                      return_value=FAKE_ITERATION_LOG) as mock_iter:
        runner = CliRunner()
        result = runner.invoke(
            cli_module.main,
            ["run", "--prd", "test-prd", "--matrix", "test.yml", *extra_args],
        )
    return result, mock_rt, mock_iter, captured_dirs


def test_run_command_honors_runs_per_combination(tmp_path):
    """runs_per_combination: 3 → each target's pipeline executes 3 times."""
    bench = _make_bench_dir(tmp_path, runs_per_combination=3)

    result, mock_rt, mock_iter, captured_dirs = _invoke_run(bench)

    assert result.exit_code == 0, result.output
    # 2 targets × 3 runs = 6 spec generations and 6 score/iterate passes
    assert mock_rt.call_count == 6
    assert mock_iter.call_count == 6

    # Per-run output dirs carry the -runN suffix (run_benchmark's convention)
    # and never collide.
    names = sorted(d.name for d in captured_dirs)
    assert names == sorted(
        f"{t}-run{n}"
        for t in ("arm-feedback", "arm-control")
        for n in (1, 2, 3)
    )
    assert len(set(captured_dirs)) == 6


def test_run_command_single_run_uses_unsuffixed_dirs(tmp_path):
    """runs_per_combination: 1 keeps the historical unsuffixed dir names."""
    bench = _make_bench_dir(tmp_path, runs_per_combination=1)

    result, mock_rt, mock_iter, captured_dirs = _invoke_run(bench)

    assert result.exit_code == 0, result.output
    assert mock_rt.call_count == 2
    assert mock_iter.call_count == 2
    assert sorted(d.name for d in captured_dirs) == ["arm-control", "arm-feedback"]


def test_run_command_runs_flag_overrides_matrix(tmp_path):
    """--runs overrides the matrix's runs_per_combination."""
    bench = _make_bench_dir(tmp_path, runs_per_combination=1)

    result, mock_rt, _, captured_dirs = _invoke_run(bench, extra_args=["--runs", "2"])

    assert result.exit_code == 0, result.output
    assert mock_rt.call_count == 4
    assert sorted(d.name for d in captured_dirs) == sorted(
        f"{t}-run{n}" for t in ("arm-feedback", "arm-control") for n in (1, 2)
    )
