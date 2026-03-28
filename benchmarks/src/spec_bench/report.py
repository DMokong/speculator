"""Report generation module — aggregates benchmark run data into YAML + HTML dashboards.

Two public functions:
- generate_yaml_report(run_dir, results=None, output_path=None) → dict
- generate_html_report(report_data, template_path, output_path) → None
"""

from __future__ import annotations

import statistics
from pathlib import Path
from typing import Optional

import yaml


# ---------------------------------------------------------------------------
# Correlation helpers
# ---------------------------------------------------------------------------


def compute_correlations(spec_scores: list[float], outcome_scores: list[float]) -> dict:
    """Compute Pearson r between two score lists.

    Returns a dict with key 'speculator_score_vs_outcome'.
    Returns 0.0 when the input is degenerate (< 2 points, or zero variance).
    """
    from scipy.stats import pearsonr

    if len(spec_scores) < 2 or len(outcome_scores) < 2:
        return {"speculator_score_vs_outcome": 0.0}

    # Guard against zero variance (pearsonr returns NaN in that case)
    if len(set(spec_scores)) == 1 or len(set(outcome_scores)) == 1:
        return {"speculator_score_vs_outcome": 0.0}

    r, _ = pearsonr(spec_scores, outcome_scores)
    return {"speculator_score_vs_outcome": round(float(r), 4)}


# ---------------------------------------------------------------------------
# Axis analysis
# ---------------------------------------------------------------------------


def compute_axis_analysis(results: list[dict]) -> dict:
    """Group results by axis (LLM, process, harness) and compute mean outcome differences.

    For each axis we compare pairs that differ only on that axis while holding
    the other two axes constant.

    Returns a dict with optional keys:
      process_effect:  { superpowers_vs_vanilla: float, mean_superpowers: float, mean_vanilla: float }
      model_effect:    { pairs: [ {held: {harness, process}, models: [a, b], delta: float} ] }
      harness_effect:  { pairs: [ {held: {model, process}, harnesses: [a, b], delta: float} ] }
    """
    analysis: dict = {}

    # --- Process effect: same harness + model, different process ---
    process_outcomes: dict[str, list[float]] = {}
    for r in results:
        proc = r.get("process", "unknown")
        process_outcomes.setdefault(proc, []).append(r["outcome_score"])

    if "superpowers" in process_outcomes and "vanilla" in process_outcomes:
        mean_sp = statistics.mean(process_outcomes["superpowers"])
        mean_va = statistics.mean(process_outcomes["vanilla"])
        analysis["process_effect"] = {
            "superpowers_vs_vanilla": round(mean_sp - mean_va, 4),
            "mean_superpowers": round(mean_sp, 4),
            "mean_vanilla": round(mean_va, 4),
        }

    # --- Model effect: same harness + process, different model ---
    # Group by (harness, process) then compare models within each group
    model_pairs: list[dict] = []
    from itertools import groupby

    hp_groups: dict[tuple, dict[str, list[float]]] = {}
    for r in results:
        key = (r.get("harness", ""), r.get("process", ""))
        model = r.get("model", "")
        hp_groups.setdefault(key, {}).setdefault(model, []).append(r["outcome_score"])

    for (harness, process), model_outcomes in hp_groups.items():
        models = sorted(model_outcomes.keys())
        if len(models) >= 2:
            means = {m: statistics.mean(model_outcomes[m]) for m in models}
            # Emit pairwise deltas
            for i in range(len(models)):
                for j in range(i + 1, len(models)):
                    a, b = models[i], models[j]
                    model_pairs.append({
                        "held": {"harness": harness, "process": process},
                        "models": [a, b],
                        "delta": round(means[b] - means[a], 4),
                        "mean_a": round(means[a], 4),
                        "mean_b": round(means[b], 4),
                    })

    if model_pairs:
        analysis["model_effect"] = {"pairs": model_pairs}

    # --- Harness effect: same model + process, different harness ---
    harness_pairs: list[dict] = []
    mp_groups: dict[tuple, dict[str, list[float]]] = {}
    for r in results:
        key = (r.get("model", ""), r.get("process", ""))
        harness = r.get("harness", "")
        mp_groups.setdefault(key, {}).setdefault(harness, []).append(r["outcome_score"])

    for (model, process), harness_outcomes in mp_groups.items():
        harnesses = sorted(harness_outcomes.keys())
        if len(harnesses) >= 2:
            means = {h: statistics.mean(harness_outcomes[h]) for h in harnesses}
            for i in range(len(harnesses)):
                for j in range(i + 1, len(harnesses)):
                    a, b = harnesses[i], harnesses[j]
                    harness_pairs.append({
                        "held": {"model": model, "process": process},
                        "harnesses": [a, b],
                        "delta": round(means[b] - means[a], 4),
                        "mean_a": round(means[a], 4),
                        "mean_b": round(means[b], 4),
                    })

    if harness_pairs:
        analysis["harness_effect"] = {"pairs": harness_pairs}

    return analysis


# ---------------------------------------------------------------------------
# Variance analysis (only when runs_per_combination > 1)
# ---------------------------------------------------------------------------


def compute_variance_analysis(results: list[dict]) -> dict:
    """Compute per-combination variance stats.

    Groups results by (target, spec_version) and computes mean, std_dev,
    and a clarity_score (inverse of coefficient of variation, capped 0-10).

    Also computes clarity_vs_variance_correlation.
    """
    # Group by combination key (target without run suffix)
    combos: dict[str, list[float]] = {}
    for r in results:
        key = f"{r['target']}-{r['spec_version']}"
        combos.setdefault(key, []).append(r["outcome_score"])

    # Only emit if any combination has > 1 run
    if not any(len(v) > 1 for v in combos.values()):
        return {}

    combo_stats = []
    for key, scores in combos.items():
        mean_val = statistics.mean(scores)
        std_val = statistics.stdev(scores) if len(scores) > 1 else 0.0
        # clarity_score: 10 when std=0, lower when more variance
        cv = std_val / mean_val if mean_val > 0 else 0.0
        clarity = max(0.0, 10.0 - cv * 10.0)
        combo_stats.append({
            "combination": key,
            "runs": len(scores),
            "mean": round(mean_val, 4),
            "std_dev": round(std_val, 4),
            "clarity_score": round(clarity, 2),
        })

    # Clarity vs variance correlation
    clarity_scores = [c["clarity_score"] for c in combo_stats if c["runs"] > 1]
    std_devs = [c["std_dev"] for c in combo_stats if c["runs"] > 1]
    clarity_var_corr = 0.0
    if len(clarity_scores) >= 2 and len(set(clarity_scores)) > 1 and len(set(std_devs)) > 1:
        from scipy.stats import pearsonr
        r_val, _ = pearsonr(clarity_scores, std_devs)
        clarity_var_corr = round(float(r_val), 4)

    return {
        "combinations": combo_stats,
        "clarity_vs_variance_correlation": clarity_var_corr,
    }


# ---------------------------------------------------------------------------
# Insight generation
# ---------------------------------------------------------------------------


def _generate_insights(
    rankings: list[dict],
    correlations: dict,
    axis_analysis: dict,
) -> list[str]:
    """Auto-generate human-readable insight strings from the computed data."""
    insights: list[str] = []

    # Correlation insight
    r_val = correlations.get("speculator_score_vs_outcome", 0.0)
    if r_val > 0.8:
        insights.append(
            f"Speculator score is strongly predictive of outcome (Pearson r={r_val:.2f})."
        )
    elif r_val > 0.5:
        insights.append(
            f"Speculator score is moderately predictive of outcome (Pearson r={r_val:.2f})."
        )
    elif r_val >= 0.0:
        insights.append(
            f"Speculator score shows weak correlation with outcome (Pearson r={r_val:.2f})."
        )
    else:
        insights.append(
            f"Speculator score is negatively correlated with outcome (Pearson r={r_val:.2f}) — investigate."
        )

    # Process effect insight
    proc = axis_analysis.get("process_effect", {})
    delta = proc.get("superpowers_vs_vanilla")
    if delta is not None:
        direction = "higher" if delta > 0 else "lower"
        insights.append(
            f"Superpowers process produced {abs(delta):.2f} points {direction} average outcome "
            f"than vanilla (superpowers={proc['mean_superpowers']:.2f}, vanilla={proc['mean_vanilla']:.2f})."
        )
        if abs(delta) >= 0.5:
            insights.append("Process had a meaningful effect on implementation quality.")

    # Model effect insight
    model_eff = axis_analysis.get("model_effect", {})
    model_pairs = model_eff.get("pairs", [])
    if model_pairs:
        largest = max(model_pairs, key=lambda p: abs(p["delta"]))
        models = largest["models"]
        d = largest["delta"]
        better = models[1] if d > 0 else models[0]
        worse = models[0] if d > 0 else models[1]
        insights.append(
            f"Model effect: {better} outperformed {worse} by {abs(d):.2f} points "
            f"(held: harness={largest['held']['harness']}, process={largest['held']['process']})."
        )

    # Ranking insight
    if rankings:
        winner = rankings[0]
        insights.append(
            f"Top performer: {winner['target']} ({winner['spec_version']} spec) "
            f"with outcome score {winner['outcome_score']:.1f}."
        )

    # Spec version delta insight
    original_outcomes = [r["outcome_score"] for r in rankings if r["spec_version"] == "original"]
    improved_outcomes = [r["outcome_score"] for r in rankings if r["spec_version"] == "improved"]
    if original_outcomes and improved_outcomes:
        mean_orig = statistics.mean(original_outcomes)
        mean_impr = statistics.mean(improved_outcomes)
        delta_sv = mean_impr - mean_orig
        direction = "improved" if delta_sv > 0 else "degraded"
        insights.append(
            f"Improved spec version {direction} average outcome by {abs(delta_sv):.2f} points "
            f"vs original (original={mean_orig:.2f}, improved={mean_impr:.2f})."
        )

    return insights


# ---------------------------------------------------------------------------
# Disk I/O helpers
# ---------------------------------------------------------------------------


def _load_results_from_disk(run_dir: Path) -> list[dict]:
    """Scan run_dir/specs/ and run_dir/implementations/ to reconstruct results."""
    results: list[dict] = []

    specs_dir = run_dir / "specs"
    implementations_dir = run_dir / "implementations"

    if not specs_dir.exists():
        return results

    # Load config to get target metadata
    config_path = run_dir / "config.yml"
    config: dict = {}
    if config_path.exists():
        config = yaml.safe_load(config_path.read_text()) or {}

    targets_by_id: dict[str, dict] = {}
    bench = config.get("benchmark", {})
    for t in bench.get("targets", []):
        targets_by_id[t["id"]] = t

    for spec_dir in sorted(specs_dir.iterdir()):
        if not spec_dir.is_dir():
            continue

        target_id = spec_dir.name

        # Determine spec_version: did we use original or improved?
        iteration_log_path = spec_dir / "iteration-log.yml"
        spec_version = "original"
        speculator_score = 0.0
        iterations_to_pass = 0

        if iteration_log_path.exists():
            log = yaml.safe_load(iteration_log_path.read_text()) or {}
            summary = log.get("summary", {})
            iterations_to_pass = summary.get("iterations_needed", 0)
            final_score = summary.get("final_score", 0.0)
            original_score = summary.get("original_score", 0.0)
            speculator_score = final_score
            spec_version = "improved" if iterations_to_pass > 0 else "original"
        else:
            # Fall back to reading the latest scorecard
            scorecards = sorted(spec_dir.glob("scorecard-v*.yml"))
            if scorecards:
                sc = yaml.safe_load(scorecards[-1].read_text()) or {}
                speculator_score = sc.get("scores", {}).get("overall", 0.0)

        # Read judge scorecard for outcome score
        judge_path = spec_dir / "judge-scorecard.yml"
        outcome_score = 0.0
        if not judge_path.exists():
            # Check implementations directory
            impl_judge_path = implementations_dir / target_id / "judge-scorecard.yml"
            if impl_judge_path.exists():
                judge_path = impl_judge_path

        if judge_path.exists():
            judge_sc = yaml.safe_load(judge_path.read_text()) or {}
            scores = judge_sc.get("scores", {})
            outcome_score = scores.get("overall", 0.0)

        # Read functional results
        functional_path = implementations_dir / target_id / "functional-results.yml"
        functional_pass_rate = "0/0"
        if functional_path.exists():
            func = yaml.safe_load(functional_path.read_text()) or {}
            functional_pass_rate = func.get("summary", {}).get("pass_rate", "0/0")

        # Read timing / token metrics
        metrics_path = implementations_dir / target_id / "metrics.json"
        total_tokens = 0
        total_time_seconds = 0.0
        if metrics_path.exists():
            import json
            metrics = json.loads(metrics_path.read_text())
            total_tokens = metrics.get("tokens_in", 0) + metrics.get("tokens_out", 0)
            total_time_seconds = metrics.get("wall_clock_seconds", 0.0)

        # Target metadata
        t_meta = targets_by_id.get(target_id, {})
        harness = t_meta.get("harness", "unknown")
        model = t_meta.get("model", "unknown")
        process = t_meta.get("process", "unknown")

        # Status
        status = "completed"
        status_path = spec_dir / "status.txt"
        if status_path.exists():
            status = status_path.read_text().strip()

        results.append({
            "target": target_id,
            "spec_version": spec_version,
            "speculator_score": speculator_score,
            "outcome_score": outcome_score,
            "functional_pass_rate": functional_pass_rate,
            "iterations_to_pass": iterations_to_pass,
            "total_tokens": total_tokens,
            "total_time_seconds": total_time_seconds,
            "harness": harness,
            "model": model,
            "process": process,
            "status": status,
        })

    return results


# ---------------------------------------------------------------------------
# Rankings
# ---------------------------------------------------------------------------


def _build_rankings(results: list[dict]) -> list[dict]:
    """Sort results by outcome_score descending and assign ranks."""
    sorted_results = sorted(results, key=lambda r: r["outcome_score"], reverse=True)
    rankings = []
    for rank, r in enumerate(sorted_results, start=1):
        rankings.append({
            "rank": rank,
            "target": r["target"],
            "spec_version": r["spec_version"],
            "speculator_score": r.get("speculator_score", 0.0),
            "outcome_score": r["outcome_score"],
            "functional_pass_rate": r.get("functional_pass_rate", "0/0"),
            "iterations_to_pass": r.get("iterations_to_pass", 0),
            "total_tokens": r.get("total_tokens", 0),
            "total_time_seconds": r.get("total_time_seconds", 0.0),
            "status": r.get("status", "completed"),
        })
    return rankings


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def generate_yaml_report(
    run_dir: Path,
    results: Optional[list[dict]] = None,
    output_path: Optional[Path] = None,
) -> dict:
    """Aggregate all run data into a report dict (and optionally write report.yml).

    Args:
        run_dir: Root run directory (bench-YYYY-MM-DD-NNN).
        results: Pre-computed results list — if provided, skip disk I/O. For testing.
        output_path: If given, write the report dict to this YAML file.

    Returns:
        Report dict with keys: rankings, correlations, axis_analysis,
        variance_analysis (if applicable), insights.
    """
    # Load config to check runs_per_combination
    config_path = run_dir / "config.yml"
    runs_per_combination = 1
    if config_path.exists():
        cfg = yaml.safe_load(config_path.read_text()) or {}
        runs_per_combination = cfg.get("benchmark", {}).get("runs_per_combination", 1)

    # Resolve results
    if results is None:
        results = _load_results_from_disk(run_dir)

    if not results:
        report = {
            "rankings": [],
            "correlations": {"speculator_score_vs_outcome": 0.0},
            "axis_analysis": {},
            "insights": ["No results found in run directory."],
        }
        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(yaml.dump(report, default_flow_style=False, sort_keys=False))
        return report

    # Rankings
    rankings = _build_rankings(results)

    # Correlations
    spec_scores = [r.get("speculator_score", 0.0) for r in results]
    outcome_scores = [r["outcome_score"] for r in results]
    correlations = compute_correlations(spec_scores, outcome_scores)

    # Also compute original_vs_improved_delta
    original_scores = [r["outcome_score"] for r in results if r.get("spec_version") == "original"]
    improved_scores = [r["outcome_score"] for r in results if r.get("spec_version") == "improved"]
    if original_scores and improved_scores:
        correlations["original_vs_improved_delta"] = round(
            statistics.mean(improved_scores) - statistics.mean(original_scores), 4
        )

    # Iteration count vs outcome correlation
    iter_counts = [r.get("iterations_to_pass", 0) for r in results]
    if len(set(iter_counts)) > 1:
        from scipy.stats import pearsonr
        r_val, _ = pearsonr(iter_counts, outcome_scores)
        correlations["iteration_count_vs_outcome"] = round(float(r_val), 4)
    else:
        correlations["iteration_count_vs_outcome"] = 0.0

    # Axis analysis
    axis_analysis = compute_axis_analysis(results)

    # Variance analysis (only when multiple runs per combination)
    variance_analysis: Optional[dict] = None
    if runs_per_combination > 1:
        variance_analysis = compute_variance_analysis(results)

    # Auto-generated insights
    insights = _generate_insights(rankings, correlations, axis_analysis)

    # Assemble report
    report: dict = {
        "rankings": rankings,
        "correlations": correlations,
        "axis_analysis": axis_analysis,
        "insights": insights,
    }
    if variance_analysis:
        report["variance_analysis"] = variance_analysis

    # Optionally write to disk
    if output_path is None:
        output_path = run_dir / "report.yml"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(yaml.dump(report, default_flow_style=False, sort_keys=False))

    return report


def generate_html_report(
    report_data: dict,
    template_path: Path,
    output_path: Path,
) -> None:
    """Render the Jinja2 HTML template with report data and write to output_path.

    Args:
        report_data: The report dict returned by generate_yaml_report.
        template_path: Path to the Jinja2 template file (.html.j2).
        output_path: Where to write the rendered HTML.
    """
    from jinja2 import Environment, FileSystemLoader, select_autoescape
    import json

    env = Environment(
        loader=FileSystemLoader(str(template_path.parent)),
        autoescape=select_autoescape(["html"]),
    )
    template = env.get_template(template_path.name)

    # Prepare chart-friendly data
    rankings = report_data.get("rankings", [])
    correlations = report_data.get("correlations", {})
    axis_analysis = report_data.get("axis_analysis", {})
    insights = report_data.get("insights", [])
    variance_analysis = report_data.get("variance_analysis")

    # Scatter chart data: speculator_score vs outcome_score
    scatter_data = [
        {
            "x": r["speculator_score"],
            "y": r["outcome_score"],
            "label": f"{r['target']} ({r['spec_version']})",
        }
        for r in rankings
    ]

    # Axis bar chart data
    bar_labels: list[str] = []
    bar_values: list[float] = []
    proc = axis_analysis.get("process_effect", {})
    if proc:
        bar_labels.append("Superpowers vs Vanilla")
        bar_values.append(proc.get("superpowers_vs_vanilla", 0.0))
    for pair in axis_analysis.get("model_effect", {}).get("pairs", []):
        label = f"{pair['models'][1]} vs {pair['models'][0]}"
        bar_labels.append(label)
        bar_values.append(pair["delta"])
    for pair in axis_analysis.get("harness_effect", {}).get("pairs", []):
        label = f"{pair['harnesses'][1]} vs {pair['harnesses'][0]}"
        bar_labels.append(label)
        bar_values.append(pair["delta"])

    # Heatmap data: functional pass rates per target
    heatmap_labels: list[str] = []
    heatmap_values: list[float] = []
    for r in rankings:
        rate_str = r.get("functional_pass_rate", "0/0")
        try:
            passed, total = rate_str.split("/")
            rate = int(passed) / int(total) * 100 if int(total) > 0 else 0.0
        except (ValueError, ZeroDivisionError):
            rate = 0.0
        heatmap_labels.append(f"{r['target']} ({r['spec_version']})")
        heatmap_values.append(round(rate, 1))

    html = template.render(
        rankings=rankings,
        correlations=correlations,
        axis_analysis=axis_analysis,
        insights=insights,
        variance_analysis=variance_analysis,
        scatter_data_json=json.dumps(scatter_data),
        bar_labels_json=json.dumps(bar_labels),
        bar_values_json=json.dumps(bar_values),
        heatmap_labels_json=json.dumps(heatmap_labels),
        heatmap_values_json=json.dumps(heatmap_values),
        r_value=correlations.get("speculator_score_vs_outcome", 0.0),
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html)
