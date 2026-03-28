"""Benchmark run orchestration — creates directories, invokes adapters, collects results."""

import json
import subprocess
import time
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Optional

from .config import MatrixConfig, Target


@dataclass
class RunResult:
    target_id: str
    status: str  # "completed" | "adapter_failed"
    error: Optional[str] = None
    wall_clock_seconds: float = 0.0
    tokens_in: int = 0
    tokens_out: int = 0


def create_run_directory(
    base_dir: Path,
    prd_name: str,
    prd_content: str,
    matrix_content: str,
) -> Path:
    """Create the run output directory with frozen copies of config and PRD."""
    today = datetime.now().strftime("%Y-%m-%d")

    # Find next run number for today
    existing = list(base_dir.glob(f"bench-{today}-*"))
    run_num = len(existing) + 1
    run_id = f"bench-{today}-{run_num:03d}"

    run_dir = base_dir / run_id
    run_dir.mkdir(parents=True)

    # Frozen copies
    (run_dir / "config.yml").write_text(matrix_content)
    (run_dir / "prd.md").write_text(prd_content)

    # Subdirectories
    (run_dir / "specs").mkdir()
    (run_dir / "implementations").mkdir()

    return run_dir


ADAPTER_MAP = {
    "claude-code": "claude-code.sh",
    "copilot-cli": "copilot-cli.sh",
}


def run_target(
    target: Target,
    output_dir: Path,
    prd_path: Path,
    template_path: Path,
    prompt_path: Optional[Path],
    adapters_dir: Path,
    superpowers_path: Optional[Path] = None,
) -> RunResult:
    """Invoke an adapter for a single target and capture results."""
    adapter_script = adapters_dir / ADAPTER_MAP.get(target.harness, f"{target.harness}.sh")

    output_dir.mkdir(parents=True, exist_ok=True)

    cmd = [
        str(adapter_script),
        "--prd", str(prd_path),
        "--template", str(template_path),
        "--model", target.model,
        "--output-dir", str(output_dir),
    ]

    if prompt_path and prompt_path.exists():
        cmd.extend(["--prompt", str(prompt_path)])

    if superpowers_path and target.process == "superpowers":
        cmd.extend(["--superpowers", str(superpowers_path)])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=3600,  # 1 hour max per target
        )

        if result.returncode != 0:
            return RunResult(
                target_id=target.id,
                status="adapter_failed",
                error=f"Exit code {result.returncode}: {result.stderr[:500]}",
            )

        # Try to read metrics from adapter output
        metrics_file = output_dir / "metrics.json"
        if metrics_file.exists():
            metrics = json.loads(metrics_file.read_text())
            return RunResult(
                target_id=target.id,
                status="completed",
                wall_clock_seconds=metrics.get("wall_clock_seconds", 0.0),
                tokens_in=metrics.get("tokens_in", 0),
                tokens_out=metrics.get("tokens_out", 0),
            )

        return RunResult(target_id=target.id, status="completed")

    except subprocess.TimeoutExpired:
        return RunResult(
            target_id=target.id,
            status="adapter_failed",
            error="Adapter timed out after 3600 seconds",
        )
    except Exception as e:
        return RunResult(
            target_id=target.id,
            status="adapter_failed",
            error=str(e),
        )


def run_benchmark(
    config: MatrixConfig,
    run_dir: Path,
    adapters_dir: Path,
    prompts_dir: Path,
    superpowers_path: Optional[Path] = None,
) -> list[RunResult]:
    """Run all targets in the matrix and collect results."""
    results = []
    prd_path = run_dir / "prd.md"
    template_path = prompts_dir / "spec-template.md"
    vanilla_prompt_path = prompts_dir / "vanilla.md"

    for run_num in range(config.runs_per_combination):
        for target in config.targets:
            # Determine prompt based on process
            prompt_path = vanilla_prompt_path if target.process == "vanilla" else None

            # Create target output directory
            suffix = f"-run{run_num + 1}" if config.runs_per_combination > 1 else ""
            output_dir = run_dir / "specs" / f"{target.id}{suffix}"

            result = run_target(
                target=target,
                output_dir=output_dir,
                prd_path=prd_path,
                template_path=template_path,
                prompt_path=prompt_path,
                adapters_dir=adapters_dir,
                superpowers_path=superpowers_path,
            )
            results.append(result)

    return results
