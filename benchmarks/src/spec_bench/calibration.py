"""Human-in-the-loop calibration for LLM-as-judge."""

from datetime import datetime
from pathlib import Path

import click
import yaml

from .review import run_judge

DIMENSIONS = [
    "prd_feature_coverage",
    "requirement_accuracy",
    "scope_discipline",
    "edge_case_handling",
    "spec_to_impl_fidelity",
    "structural_quality",
]


def compare_scores(human_scores: dict, judge_scores: dict, tolerance: float = 1.0) -> dict:
    """Compare human and judge scores dimension by dimension."""
    aligned = []
    diverged = []
    max_div = 0.0

    for dim in DIMENSIONS:
        h = human_scores.get(dim, 0)
        j = judge_scores.get(dim, 0)
        diff = abs(h - j)
        max_div = max(max_div, diff)
        if diff <= tolerance:
            aligned.append(dim)
        else:
            diverged.append({"dimension": dim, "human": h, "judge": j, "divergence": diff})

    return {
        "aligned": aligned,
        "diverged": diverged,
        "max_divergence": max_div,
        "calibrated": len(diverged) == 0,
    }


def run_calibration(
    run_dir: Path,
    rubric_path: Path,
    prd_path: Path,
    judge_model: str = "opus-4-6",
) -> dict:
    """Run interactive calibration protocol."""
    impl_dir = run_dir / "implementations"
    if not impl_dir.exists():
        click.echo("No implementations directory found.")
        return {}

    # List available implementations
    impls = sorted([d for d in impl_dir.iterdir() if d.is_dir()])
    if not impls:
        click.echo("No implementations found.")
        return {}

    click.echo(f"\nAvailable implementations ({len(impls)} total):")
    for i, impl in enumerate(impls):
        click.echo(f"  [{i+1}] {impl.name}")

    # Select 3-4 for review
    selection = click.prompt(
        "Select 3-4 implementations to review (comma-separated numbers)",
        type=str,
    )
    indices = [int(x.strip()) - 1 for x in selection.split(",")]
    selected = [impls[i] for i in indices if 0 <= i < len(impls)]

    reviews = []
    for impl in selected:
        click.echo(f"\n{'='*60}")
        click.echo(f"Reviewing: {impl.name}")
        click.echo(f"Path: {impl}")
        click.echo(f"To run: cd {impl / 'app'} && npm run dev")
        click.echo(f"{'='*60}")

        # Get human scores
        human_scores = {}
        for dim in DIMENSIONS:
            label = dim.replace("_", " ").title()
            score = click.prompt(f"  {label} (1-10)", type=int)
            human_scores[dim] = max(1, min(10, score))

        # Run judge on same implementation
        spec_path = run_dir / "specs" / impl.name.rsplit("-", 1)[0] / "spec-improved.md"
        if not spec_path.exists():
            spec_path = run_dir / "specs" / impl.name.rsplit("-", 1)[0] / "spec-v0.md"

        judge_output_dir = impl / "calibration"
        judge_output_dir.mkdir(exist_ok=True)

        judge_scorecard = run_judge(
            prd_path=prd_path,
            spec_path=spec_path,
            impl_dir=impl / "app",
            rubric_path=rubric_path,
            output_dir=judge_output_dir,
            judge_model=judge_model,
        )

        judge_scores = judge_scorecard.get("scores", {})
        comparison = compare_scores(human_scores, judge_scores)

        reviews.append({
            "id": impl.name,
            "human_scores": human_scores,
            "judge_scores": {d: judge_scores.get(d, 0) for d in DIMENSIONS},
            "max_divergence": comparison["max_divergence"],
            "calibrated": comparison["calibrated"],
        })

        # Show comparison
        click.echo(f"\n  Comparison:")
        for dim in DIMENSIONS:
            h = human_scores[dim]
            j = judge_scores.get(dim, 0)
            marker = "✅" if abs(h - j) <= 1.0 else "❌"
            click.echo(f"    {marker} {dim}: human={h}, judge={j}")

    # Write calibration artifact
    cal_dir = run_dir / "calibration"
    cal_dir.mkdir(exist_ok=True)
    existing = list(cal_dir.glob("calibration-*.yml"))
    cal_num = len(existing) + 1

    artifact = {
        "prd": "weather-transport",
        "date": datetime.now().strftime("%Y-%m-%d"),
        "implementations_reviewed": reviews,
        "rubric_version": "1.0",
        "result": "calibrated" if all(r["calibrated"] for r in reviews) else "needs_tuning",
        "notes": "",
    }

    cal_path = cal_dir / f"calibration-{cal_num:03d}.yml"
    cal_path.write_text(yaml.dump(artifact, default_flow_style=False, sort_keys=False))

    click.echo(f"\nCalibration artifact written to: {cal_path}")
    overall = "✅ CALIBRATED" if artifact["result"] == "calibrated" else "⚠️ NEEDS TUNING"
    click.echo(f"Result: {overall}")

    return artifact
