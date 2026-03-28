"""Tests for the calibration module."""

import pytest
from spec_bench.calibration import compare_scores, DIMENSIONS


def _full_scores(value: int) -> dict:
    """Build a score dict with all dimensions set to the given value."""
    return {dim: value for dim in DIMENSIONS}


def test_compare_scores_all_aligned():
    human = _full_scores(8)
    judge = _full_scores(8)
    result = compare_scores(human, judge)
    assert result["calibrated"] is True
    assert len(result["aligned"]) == len(DIMENSIONS)
    assert result["diverged"] == []
    assert result["max_divergence"] == 0.0


def test_compare_scores_within_tolerance():
    human = _full_scores(7)
    judge = _full_scores(8)  # diff of 1.0 — exactly at tolerance boundary
    result = compare_scores(human, judge)
    assert result["calibrated"] is True
    assert result["max_divergence"] == 1.0


def test_compare_scores_one_diverged():
    human = _full_scores(7)
    judge = _full_scores(7)
    # Override one dimension to be out of tolerance
    judge["prd_feature_coverage"] = 5  # diff of 2
    result = compare_scores(human, judge)
    assert result["calibrated"] is False
    assert len(result["diverged"]) == 1
    assert result["diverged"][0]["dimension"] == "prd_feature_coverage"
    assert result["diverged"][0]["human"] == 7
    assert result["diverged"][0]["judge"] == 5
    assert result["diverged"][0]["divergence"] == 2
    assert result["max_divergence"] == 2.0


def test_compare_scores_multiple_diverged():
    human = _full_scores(5)
    judge = _full_scores(9)  # diff of 4 on every dimension
    result = compare_scores(human, judge)
    assert result["calibrated"] is False
    assert len(result["diverged"]) == len(DIMENSIONS)
    assert result["max_divergence"] == 4.0


def test_compare_scores_custom_tolerance():
    human = _full_scores(5)
    judge = _full_scores(7)  # diff of 2
    # With tolerance=2.0 this should be aligned
    result = compare_scores(human, judge, tolerance=2.0)
    assert result["calibrated"] is True
    assert len(result["aligned"]) == len(DIMENSIONS)

    # With tolerance=1.0 (default) this should diverge
    result_strict = compare_scores(human, judge, tolerance=1.0)
    assert result_strict["calibrated"] is False


def test_compare_scores_missing_dimensions_default_zero():
    human = {"prd_feature_coverage": 8}
    judge = {"prd_feature_coverage": 8}
    result = compare_scores(human, judge)
    # Missing dims default to 0 — diff from 0 is 0, so they're "aligned" but max_divergence = 0
    assert result["calibrated"] is True
    assert result["max_divergence"] == 0.0


def test_compare_scores_returns_all_keys():
    human = _full_scores(6)
    judge = _full_scores(7)
    result = compare_scores(human, judge)
    assert "aligned" in result
    assert "diverged" in result
    assert "max_divergence" in result
    assert "calibrated" in result
