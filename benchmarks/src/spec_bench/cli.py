"""Spec-Bench CLI entrypoint."""

import click
from pathlib import Path

from .config import load_matrix, load_prd, Target
from .orchestrator import create_run_directory, run_target
from .scoring import iterate_spec
from .review import run_functional_tests, run_judge
from .report import generate_yaml_report, generate_html_report
from .calibration import run_calibration

BENCHMARKS_DIR = Path(__file__).parent.parent.parent


@click.group()
@click.pass_context
def main(ctx):
    """Spec-Bench: Speculator benchmark harness."""
    ctx.ensure_object(dict)
    ctx.obj["benchmarks_dir"] = BENCHMARKS_DIR


@main.command()
@click.option("--prd", required=True, help="PRD name from the library")
@click.option("--matrix", default="default.yml", help="Matrix config file")
@click.option("--runs", default=None, type=int, help="Override runs per combination")
@click.pass_context
def run(ctx, prd, matrix, runs):
    """Run the full benchmark."""
    bench_dir = ctx.obj["benchmarks_dir"]

    # Load config
    matrix_path = bench_dir / "matrix" / matrix
    config = load_matrix(matrix_path)
    if runs is not None:
        config.runs_per_combination = runs

    prd_config = load_prd(prd, bench_dir / "prds")

    click.echo(f"Spec-Bench Run")
    click.echo(f"  PRD: {prd_config.name}")
    click.echo(f"  Targets: {len(config.targets)}")
    click.echo(f"  Runs per combination: {config.runs_per_combination}")
    click.echo(f"  Total spec generations: {len(config.targets) * config.runs_per_combination}")
    click.echo(f"  Total implementations: {len(config.targets) * config.runs_per_combination * 2}")
    click.echo()

    # Create run directory
    runs_dir = bench_dir / "runs"
    runs_dir.mkdir(exist_ok=True)
    run_dir = create_run_directory(
        base_dir=runs_dir,
        prd_name=prd,
        prd_content=prd_config.content,
        matrix_content=matrix_path.read_text(),
    )
    click.echo(f"Run directory: {run_dir}")

    # Phase 1: Spec generation + scoring for each target
    adapters_dir = bench_dir / "adapters"
    prompts_dir = bench_dir / "prompts"
    rubric_path = bench_dir / "rubrics" / "outcome-rubric.md"
    template_path = prompts_dir / "spec-template.md"
    prd_path = run_dir / "prd.md"

    all_results = []

    for target in config.targets:
        click.echo(f"\n--- Target: {target.id} ---")

        # Generate spec
        spec_dir = run_dir / "specs" / target.id
        spec_dir.mkdir(parents=True, exist_ok=True)

        prompt_path = prompts_dir / "vanilla.md" if target.process == "vanilla" else None

        click.echo(f"  Generating spec...")
        gen_result = run_target(
            target=target,
            output_dir=spec_dir,
            prd_path=prd_path,
            template_path=template_path,
            prompt_path=prompt_path,
            adapters_dir=adapters_dir,
        )

        if gen_result.status == "adapter_failed":
            click.echo(f"  Adapter failed: {gen_result.error}")
            all_results.append({
                "target": target.id,
                "status": "adapter_failed",
                "error": gen_result.error,
                "harness": target.harness,
                "model": target.model,
                "process": target.process,
            })
            continue

        # Rename generated spec to spec-v0.md for the iteration loop
        spec_output = spec_dir / "spec.md"
        spec_v0 = spec_dir / "spec-v0.md"
        if spec_output.exists():
            spec_output.rename(spec_v0)

        # Score and iterate
        click.echo(f"  Scoring and iterating...")
        iteration_log = iterate_spec(
            target=target,
            spec_dir=spec_dir,
            adapters_dir=adapters_dir,
            prompts_dir=prompts_dir,
            prd_path=prd_path,
            template_path=template_path,
        )

        click.echo(f"  Score: {iteration_log['summary']['original_score']} → {iteration_log['summary']['final_score']}")
        click.echo(f"  Iterations: {iteration_log['summary']['iterations_needed']}")
        click.echo(f"  Passed: {'yes' if iteration_log['summary']['passed'] else 'no'}")

        # Phase 2: Implementation (both original and improved)
        for spec_version in ["original", "improved"]:
            impl_id = f"{target.id}-{spec_version}"
            impl_dir = run_dir / "implementations" / impl_id
            impl_dir.mkdir(parents=True, exist_ok=True)

            spec_file = spec_dir / f"spec-{'v0' if spec_version == 'original' else 'improved'}.md"
            if not spec_file.exists():
                continue

            click.echo(f"  Implementing ({spec_version})...")

            # Invoke constant implementer
            impl_target = Target(
                id=f"{target.id}-{spec_version}",
                harness=config.constant_implementer.harness,
                model=config.constant_implementer.model,
                process=config.constant_implementer.process,
            )

            # Write the spec as the prompt for the implementer
            impl_prompt_path = impl_dir / "impl-prompt.md"
            impl_prompt_path.write_text(
                f"Implement the following specification. All code must be created in the current working directory.\n\n"
                f"Use the superpowers:writing-plans skill to write an implementation plan first, "
                f"then use superpowers:executing-plans with superpowers:subagent-driven-development "
                f"to execute the plan. Do not ask for user input — execute autonomously.\n\n"
                f"Tech stack: Vite + React + TypeScript + Tailwind CSS. No other frameworks.\n\n"
                f"{spec_file.read_text()}"
            )

            # Find Superpowers plugin — check standard install locations
            superpowers_candidates = [
                Path.home() / ".claude" / "plugins" / "cache" / "claude-plugins-official" / "superpowers",
            ]
            superpowers_path = None
            for candidate in superpowers_candidates:
                if candidate.exists():
                    # Use the latest version directory
                    versions = sorted(candidate.iterdir(), reverse=True)
                    if versions:
                        superpowers_path = versions[0]
                        break
            impl_result = run_target(
                target=impl_target,
                output_dir=impl_dir / "app",
                prd_path=impl_prompt_path,
                template_path=template_path,
                prompt_path=None,
                adapters_dir=adapters_dir,
                superpowers_path=superpowers_path if impl_target.process == "superpowers" else None,
            )

            if impl_result.status == "adapter_failed":
                click.echo(f"  Implementer failed: {impl_result.error}")

            # Phase 3: Review (functional tests + judge)
            # Only run if implementation produced an app
            app_dir = impl_dir / "app"
            if app_dir.exists():
                click.echo(f"  Reviewing ({spec_version})...")

                # Layer 1: Functional tests
                functional_tests_path = bench_dir / "prds" / prd / "functional-tests.yml"
                functional_results = run_functional_tests(
                    app_dir=app_dir,
                    functional_tests_path=functional_tests_path,
                    output_dir=impl_dir,
                )

                # Layer 2: LLM-as-judge
                judge_scorecard = run_judge(
                    prd_path=prd_path,
                    spec_path=spec_file,
                    impl_dir=app_dir,
                    rubric_path=rubric_path,
                    output_dir=impl_dir,
                    judge_model=config.judge_model,
                )

                all_results.append({
                    "target": target.id,
                    "spec_version": spec_version,
                    "speculator_score": iteration_log["summary"]["final_score"] if spec_version == "improved" else iteration_log["summary"]["original_score"],
                    "outcome_score": judge_scorecard.get("scores", {}).get("overall", 0),
                    "functional_pass_rate": functional_results.get("summary", {}).get("pass_rate", "0/0"),
                    "iterations_to_pass": iteration_log["summary"]["iterations_needed"],
                    "total_tokens": gen_result.tokens_in + gen_result.tokens_out,
                    "total_time_seconds": gen_result.wall_clock_seconds,
                    "status": "completed",
                    "harness": target.harness,
                    "model": target.model,
                    "process": target.process,
                })

    # Phase 4: Generate report
    click.echo(f"\n--- Generating Report ---")
    report_data = generate_yaml_report(
        run_dir=run_dir,
        results=all_results,
        output_path=run_dir / "report.yml",
    )

    template_html = bench_dir / "templates" / "report.html.j2"
    if template_html.exists():
        generate_html_report(
            report_data=report_data,
            template_path=template_html,
            output_path=run_dir / "report.html",
        )
        click.echo(f"Dashboard: {run_dir / 'report.html'}")

    click.echo(f"Report: {run_dir / 'report.yml'}")
    click.echo(f"\nBenchmark complete!")


@main.command()
@click.option("--run", "run_id", required=True, help="Run ID to generate report for")
@click.pass_context
def report(ctx, run_id):
    """Generate report from existing run data."""
    bench_dir = ctx.obj["benchmarks_dir"]
    run_dir = bench_dir / "runs" / run_id
    if not run_dir.exists():
        click.echo(f"Run not found: {run_dir}")
        return

    # Read existing results from run directory
    report_data = generate_yaml_report(run_dir=run_dir, output_path=run_dir / "report.yml")

    template_html = bench_dir / "templates" / "report.html.j2"
    if template_html.exists():
        generate_html_report(report_data, template_html, run_dir / "report.html")

    click.echo(f"Report regenerated: {run_dir / 'report.yml'}")


@main.command()
@click.option("--run", "run_id", required=True, help="Run ID to calibrate")
@click.pass_context
def calibrate(ctx, run_id):
    """Run calibration (human-in-the-loop)."""
    bench_dir = ctx.obj["benchmarks_dir"]
    run_dir = bench_dir / "runs" / run_id
    if not run_dir.exists():
        click.echo(f"Run not found: {run_dir}")
        return

    run_calibration(
        run_dir=run_dir,
        rubric_path=bench_dir / "rubrics" / "outcome-rubric.md",
        prd_path=run_dir / "prd.md",
    )


@main.command()
@click.pass_context
def prds(ctx):
    """List available PRDs."""
    prds_dir = ctx.obj["benchmarks_dir"] / "prds"
    if not prds_dir.exists():
        click.echo("No PRDs directory found.")
        return
    for prd_dir in sorted(prds_dir.iterdir()):
        if prd_dir.is_dir() and (prd_dir / "prd.md").exists():
            click.echo(f"  {prd_dir.name}")


@main.command("add-prd")
@click.option("--path", required=True, type=click.Path(exists=True), help="Path to PRD file")
@click.pass_context
def add_prd(ctx, path):
    """Add a new PRD to the library."""
    import shutil
    src = Path(path)
    dest = ctx.obj["benchmarks_dir"] / "prds" / src.stem
    dest.mkdir(parents=True, exist_ok=True)
    shutil.copy(src, dest / "prd.md")
    click.echo(f"Added PRD: {src.stem}")
