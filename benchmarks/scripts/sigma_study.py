#!/usr/bin/env python3
"""Test-retest sigma study for the Gate 1 spec-scorer (LLM-as-judge).

Scores a FIXED set of spec files N times each with the production rubric and
pinned scorer model, then reports per-dimension and overall standard deviation.
This isolates pure scorer variance (the specs never change), unlike the
3-round benchmark data where each round scored a freshly generated spec.

Motivation (2026-06-12 review): the trust ladder resolves 0.2-point
distinctions (full_auto 7.8 vs self_improvement 8.0) on a single-dispatch
judge whose test-retest sigma had never been measured. If measured sigma
exceeds the band gap, the bands need resizing (raise run.full_auto_threshold).

Usage: uv run python scripts/sigma_study.py [--reps 5] [--out results/test-retest-sigma.yml]
"""

import argparse
import statistics
import sys
import tempfile
from pathlib import Path

import yaml

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))
from spec_bench.scoring import score_spec  # noqa: E402

BENCH_DIR = Path(__file__).resolve().parent.parent

# Fixed corpus: distinct quality levels from the March 2026 run (v0 raw draft,
# v1/v2 revisions, improved final) — spread matters so sigma isn't measured at
# a single band.
FIXED_SPECS = [
    BENCH_DIR / "runs/bench-2026-03-28-001/specs/cc-vanilla-sonnet/spec-v0.md",
    BENCH_DIR / "runs/bench-2026-03-28-001/specs/cc-vanilla-sonnet/spec-v1.md",
    BENCH_DIR / "runs/bench-2026-03-28-001/specs/cc-vanilla-sonnet/spec-v2.md",
    BENCH_DIR / "runs/bench-2026-03-28-001/specs/cc-vanilla-sonnet/spec-improved.md",
]

SCORER_MODEL = "claude-sonnet-4-6"
BAND_GAP = 0.2  # self_improvement_trigger (8.0) - full_auto_threshold (7.8)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reps", type=int, default=5)
    ap.add_argument("--out", default=str(BENCH_DIR / "results/test-retest-sigma.yml"))
    args = ap.parse_args()

    specs = [p for p in FIXED_SPECS if p.is_file()]
    if not specs:
        print("no fixed specs found", file=sys.stderr)
        return 1

    study = {}
    with tempfile.TemporaryDirectory() as td:
        for spec in specs:
            label = spec.parent.name + "/" + spec.stem
            runs = []
            for rep in range(args.reps):
                print(f"scoring {label} rep {rep + 1}/{args.reps} ...", flush=True)
                try:
                    result = score_spec(
                        spec, Path(td), version=rep,
                        model=SCORER_MODEL, rubric_source="production",
                    )
                except Exception as e:  # noqa: BLE001 — record and continue; partial data is still data
                    print(f"  rep {rep + 1} failed: {e}", flush=True)
                    continue
                runs.append(result["scores"])
                print(f"  overall: {result['scores'].get('overall')}", flush=True)
            if len(runs) < 2:
                study[label] = {"error": f"only {len(runs)} successful reps"}
                continue
            dims = sorted({k for r in runs for k in r if isinstance(r[k], (int, float))})
            entry = {"reps": len(runs), "scores": {}}
            for d in dims:
                vals = [r[d] for r in runs if isinstance(r.get(d), (int, float))]
                entry["scores"][d] = {
                    "values": vals,
                    "mean": round(statistics.mean(vals), 3),
                    "sigma": round(statistics.stdev(vals), 3) if len(vals) > 1 else None,
                    "range": round(max(vals) - min(vals), 3),
                }
            study[label] = entry

    overall_sigmas = [
        e["scores"]["overall"]["sigma"]
        for e in study.values()
        if isinstance(e, dict) and e.get("scores", {}).get("overall", {}).get("sigma") is not None
    ]
    summary = {
        "scorer_model": SCORER_MODEL,
        "rubric_source": "production",
        "reps_per_spec": args.reps,
        "overall_sigma_per_spec": overall_sigmas,
        "overall_sigma_max": max(overall_sigmas) if overall_sigmas else None,
        "trust_ladder_band_gap": BAND_GAP,
        "band_gap_exceeded": (max(overall_sigmas) > BAND_GAP) if overall_sigmas else None,
        "interpretation": (
            "If overall_sigma_max > trust_ladder_band_gap, the full_auto (7.8) vs "
            "self_improvement (8.0) distinction is within scorer noise — widen the gap "
            "via run.full_auto_threshold in .claude/sdlc.local.md."
        ),
    }

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        yaml.safe_dump({"summary": summary, "per_spec": study}, f, sort_keys=False)
    print(f"\nwrote {out}")
    print(f"overall sigma per spec: {overall_sigmas} (band gap {BAND_GAP})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
