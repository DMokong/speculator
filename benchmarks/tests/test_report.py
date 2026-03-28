import pytest
import yaml
from pathlib import Path
from spec_bench.report import generate_yaml_report, compute_correlations, compute_axis_analysis

SAMPLE_RESULTS = [
    {"target": "cc-vanilla-opus", "spec_version": "original", "speculator_score": 6.5, "outcome_score": 5.8, "functional_pass_rate": "10/15", "iterations_to_pass": 2, "total_tokens": 40000, "total_time_seconds": 300, "harness": "claude-code", "model": "opus-4-6", "process": "vanilla"},
    {"target": "cc-vanilla-opus", "spec_version": "improved", "speculator_score": 7.9, "outcome_score": 7.5, "functional_pass_rate": "13/15", "iterations_to_pass": 2, "total_tokens": 45000, "total_time_seconds": 320, "harness": "claude-code", "model": "opus-4-6", "process": "vanilla"},
    {"target": "cc-sp-opus", "spec_version": "original", "speculator_score": 8.2, "outcome_score": 8.0, "functional_pass_rate": "14/15", "iterations_to_pass": 0, "total_tokens": 35000, "total_time_seconds": 280, "harness": "claude-code", "model": "opus-4-6", "process": "superpowers"},
    {"target": "cc-sp-opus", "spec_version": "improved", "speculator_score": 8.5, "outcome_score": 8.8, "functional_pass_rate": "15/15", "iterations_to_pass": 0, "total_tokens": 38000, "total_time_seconds": 300, "harness": "claude-code", "model": "opus-4-6", "process": "superpowers"},
    {"target": "cc-vanilla-sonnet", "spec_version": "improved", "speculator_score": 7.2, "outcome_score": 6.8, "functional_pass_rate": "12/15", "iterations_to_pass": 1, "total_tokens": 30000, "total_time_seconds": 250, "harness": "claude-code", "model": "sonnet-4-6", "process": "vanilla"},
    {"target": "cc-sp-sonnet", "spec_version": "improved", "speculator_score": 8.0, "outcome_score": 8.2, "functional_pass_rate": "14/15", "iterations_to_pass": 0, "total_tokens": 32000, "total_time_seconds": 260, "harness": "claude-code", "model": "sonnet-4-6", "process": "superpowers"},
]


def test_compute_correlations():
    spec_scores = [6.5, 7.9, 8.2, 8.5, 7.2, 8.0]
    outcome_scores = [5.8, 7.5, 8.0, 8.8, 6.8, 8.2]
    corr = compute_correlations(spec_scores, outcome_scores)
    assert "speculator_score_vs_outcome" in corr
    assert isinstance(corr["speculator_score_vs_outcome"], float)
    # Should be strongly positive
    assert corr["speculator_score_vs_outcome"] > 0.8


def test_compute_correlations_degenerate_returns_zero():
    """All identical scores → zero variance → return 0.0 instead of NaN."""
    corr = compute_correlations([7.0, 7.0, 7.0], [5.0, 5.0, 5.0])
    assert corr["speculator_score_vs_outcome"] == 0.0


def test_compute_correlations_too_few_points():
    corr = compute_correlations([7.0], [5.0])
    assert corr["speculator_score_vs_outcome"] == 0.0


def test_compute_axis_analysis():
    analysis = compute_axis_analysis(SAMPLE_RESULTS)
    assert "process_effect" in analysis
    assert "superpowers_vs_vanilla" in analysis["process_effect"]
    # Superpowers should have higher outcomes than vanilla
    assert analysis["process_effect"]["superpowers_vs_vanilla"] > 0


def test_compute_axis_analysis_model_effect():
    """Model effect is detected when same harness+process but different models."""
    analysis = compute_axis_analysis(SAMPLE_RESULTS)
    # We have opus and sonnet under claude-code+vanilla and claude-code+superpowers
    assert "model_effect" in analysis
    assert len(analysis["model_effect"]["pairs"]) > 0


def test_generate_yaml_report_structure(tmp_path):
    """AC6: report.yml has required fields."""
    # Create a minimal run directory with pre-computed results
    run_dir = tmp_path / "bench-2026-04-01-001"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    # Write the report from pre-computed data
    report = generate_yaml_report(
        run_dir=run_dir,
        results=SAMPLE_RESULTS,
    )

    assert "rankings" in report
    assert "correlations" in report
    assert "axis_analysis" in report
    assert report["rankings"][0]["outcome_score"] >= report["rankings"][-1]["outcome_score"]  # sorted desc


def test_generate_yaml_report_writes_file(tmp_path):
    """Report is written to report.yml by default."""
    run_dir = tmp_path / "bench-2026-04-01-002"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    report_file = run_dir / "report.yml"
    assert report_file.exists()
    loaded = yaml.safe_load(report_file.read_text())
    assert "rankings" in loaded
    assert "insights" in loaded


def test_generate_yaml_report_custom_output_path(tmp_path):
    """Report can be written to a custom path."""
    run_dir = tmp_path / "bench-custom"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")
    custom_path = tmp_path / "my-report.yml"

    generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS, output_path=custom_path)

    assert custom_path.exists()


def test_generate_yaml_report_rankings_sorted(tmp_path):
    """Rankings are sorted by outcome_score descending."""
    run_dir = tmp_path / "bench-sorted"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report = generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    scores = [r["outcome_score"] for r in report["rankings"]]
    assert scores == sorted(scores, reverse=True)


def test_generate_yaml_report_ranking_fields(tmp_path):
    """Each ranking entry has all required fields."""
    run_dir = tmp_path / "bench-fields"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report = generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    required_fields = {
        "rank", "target", "spec_version", "speculator_score",
        "outcome_score", "functional_pass_rate", "iterations_to_pass",
        "total_tokens", "total_time_seconds", "status",
    }
    for entry in report["rankings"]:
        assert required_fields <= set(entry.keys()), f"Missing fields in: {entry}"


def test_generate_yaml_report_insights_non_empty(tmp_path):
    """Insights list is populated when data is rich enough."""
    run_dir = tmp_path / "bench-insights"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report = generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    assert len(report["insights"]) > 0
    assert all(isinstance(i, str) for i in report["insights"])


def test_generate_yaml_report_empty_results(tmp_path):
    """Empty results produce a graceful empty report."""
    run_dir = tmp_path / "bench-empty"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report = generate_yaml_report(run_dir=run_dir, results=[])

    assert report["rankings"] == []
    assert "correlations" in report


def test_generate_yaml_report_variance_analysis_skipped_single_run(tmp_path):
    """variance_analysis is absent when runs_per_combination == 1."""
    run_dir = tmp_path / "bench-single"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report = generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    assert "variance_analysis" not in report


def test_generate_yaml_report_variance_analysis_present_multi_run(tmp_path):
    """variance_analysis is included when runs_per_combination > 1 AND there are multi-run combos."""
    run_dir = tmp_path / "bench-multi"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 3")

    # Create duplicated results to simulate multi-run combos
    multi_results = [
        {"target": "cc-vanilla-opus", "spec_version": "original", "speculator_score": 7.0, "outcome_score": 6.5, "functional_pass_rate": "10/15", "iterations_to_pass": 0, "total_tokens": 40000, "total_time_seconds": 300, "harness": "claude-code", "model": "opus-4-6", "process": "vanilla", "status": "completed"},
        {"target": "cc-vanilla-opus", "spec_version": "original", "speculator_score": 7.2, "outcome_score": 6.8, "functional_pass_rate": "11/15", "iterations_to_pass": 0, "total_tokens": 41000, "total_time_seconds": 310, "harness": "claude-code", "model": "opus-4-6", "process": "vanilla", "status": "completed"},
        {"target": "cc-vanilla-opus", "spec_version": "original", "speculator_score": 6.8, "outcome_score": 6.2, "functional_pass_rate": "9/15", "iterations_to_pass": 0, "total_tokens": 39000, "total_time_seconds": 290, "harness": "claude-code", "model": "opus-4-6", "process": "vanilla", "status": "completed"},
    ]

    report = generate_yaml_report(run_dir=run_dir, results=multi_results)

    assert "variance_analysis" in report
    assert "combinations" in report["variance_analysis"]


def test_generate_html_report(tmp_path):
    """HTML report renders without errors and contains expected elements."""
    from spec_bench.report import generate_yaml_report, generate_html_report

    run_dir = tmp_path / "bench-html"
    run_dir.mkdir()
    (run_dir / "config.yml").write_text("benchmark:\n  prd: test\n  runs_per_combination: 1")

    report_data = generate_yaml_report(run_dir=run_dir, results=SAMPLE_RESULTS)

    template_path = Path(__file__).parent.parent / "templates" / "report.html.j2"
    output_path = tmp_path / "report.html"

    generate_html_report(report_data, template_path, output_path)

    assert output_path.exists()
    html_content = output_path.read_text()

    # Basic structure checks
    assert "<!DOCTYPE html>" in html_content
    assert "Spec-Bench Report" in html_content
    assert "Leaderboard" in html_content
    assert "Chart.js" in html_content or "chart.js" in html_content.lower()
    # Rankings data embedded
    assert "cc-sp-opus" in html_content
