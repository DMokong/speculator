import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
from spec_bench.orchestrator import create_run_directory, run_target, RunResult
from spec_bench.config import Target, MatrixConfig, ConstantImplementer


def test_create_run_directory(tmp_path):
    run_dir = create_run_directory(
        base_dir=tmp_path,
        prd_name="weather-transport",
        prd_content="# PRD content",
        matrix_content="# Matrix content",
    )
    assert (run_dir / "config.yml").exists()
    assert (run_dir / "prd.md").exists()
    assert (run_dir / "specs").is_dir()
    assert (run_dir / "implementations").is_dir()
    assert run_dir.name.startswith("bench-")


def test_run_target_adapter_failure(tmp_path):
    target = Target(id="failing-target", harness="claude-code", model="opus-4-6", process="vanilla")
    # Create required files that the function will try to read
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "vanilla.md").write_text("# Vanilla")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 1")
    output_dir = tmp_path / "specs" / "failing-target"
    output_dir.mkdir(parents=True)

    with patch("spec_bench.orchestrator.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=1, stderr="adapter crashed")
        result = run_target(
            target=target,
            output_dir=output_dir,
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            prompt_path=tmp_path / "vanilla.md",
            adapters_dir=tmp_path / "adapters",
        )
    assert result.status == "adapter_failed"
    assert result.error is not None


def test_run_target_adapter_success(tmp_path):
    target = Target(id="good-target", harness="claude-code", model="opus-4-6", process="vanilla")
    (tmp_path / "prd.md").write_text("# PRD")
    (tmp_path / "template.md").write_text("# Template")
    (tmp_path / "vanilla.md").write_text("# Vanilla")
    (tmp_path / "adapters").mkdir()
    (tmp_path / "adapters" / "claude-code.sh").write_text("#!/bin/bash\nexit 0")
    output_dir = tmp_path / "specs" / "good-target"
    output_dir.mkdir(parents=True)
    # Create expected output files that adapter would produce
    (output_dir / "spec.md").write_text("# Generated spec")
    (output_dir / "metrics.json").write_text('{"tokens_in": 100, "tokens_out": 200, "wall_clock_seconds": 30.0}')
    (output_dir / "session.log").write_text("session log")

    with patch("spec_bench.orchestrator.subprocess.run") as mock_run:
        mock_run.return_value = MagicMock(returncode=0, stderr="")
        result = run_target(
            target=target,
            output_dir=output_dir,
            prd_path=tmp_path / "prd.md",
            template_path=tmp_path / "template.md",
            prompt_path=tmp_path / "vanilla.md",
            adapters_dir=tmp_path / "adapters",
        )
    assert result.status == "completed"
    assert result.error is None
