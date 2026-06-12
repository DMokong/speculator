#!/usr/bin/env python3
"""Spec-only feedback-vs-control ablation (Phase 1 of the validation experiment).

Runs the generate→score→iterate pipeline for every target × run in a matrix,
SKIPPING implementation/review entirely. The spec-side question — does scorer
feedback improve specs beyond the compute of an extra revision pass? — needs
only this phase. The outcome half (implementations + functional tests) runs
separately once the vision-judge subprocess timeout is fixed (it killed the
full run at bench-2026-06-12-001).

Usage: uv run python scripts/spec_only_ablation.py [--matrix feedback-ablation.yml]
"""

import argparse
import statistics
import sys
from pathlib import Path

import yaml

BENCH_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BENCH_DIR / "src"))

from spec_bench.config import load_matrix, load_prd  # noqa: E402
from spec_bench.orchestrator import create_run_directory, run_target  # noqa: E402
from spec_bench.scoring import iterate_spec  # noqa: E402


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--matrix", default="feedback-ablation.yml")
    ap.add_argument("--prd", default="weather-transport")
    args = ap.parse_args()

    matrix_path = BENCH_DIR / "matrix" / args.matrix
    config = load_matrix(matrix_path)
    prd_config = load_prd(args.prd, BENCH_DIR / "prds")
    runs_dir = BENCH_DIR / "runs"
    runs_dir.mkdir(exist_ok=True)
    run_dir = create_run_directory(
        base_dir=runs_dir,
        prd_name=args.prd,
        prd_content=prd_config.content,
        matrix_content=matrix_path.read_text(),
    )
    prd_path = run_dir / "prd.md"
    adapters_dir = BENCH_DIR / "adapters"
    prompts_dir = BENCH_DIR / "prompts"
    template_path = prompts_dir / "spec-template.md"

    print(f"run dir: {run_dir}", flush=True)
    rows = []
    for run_num in range(config.runs_per_combination):
        suffix = f"-run{run_num + 1}" if config.runs_per_combination > 1 else ""
        for target in config.targets:
            tid = f"{target.id}{suffix}"
            print(f"\n--- {tid} ---", flush=True)
            spec_dir = run_dir / "specs" / tid
            spec_dir.mkdir(parents=True, exist_ok=True)
            prompt_path = prompts_dir / "vanilla.md" if target.process == "vanilla" else None

            print("  generating spec ...", flush=True)
            gen = run_target(
                target=target, output_dir=spec_dir, prd_path=prd_path,
                template_path=template_path, prompt_path=prompt_path,
                adapters_dir=adapters_dir,
            )
            if gen.status == "adapter_failed":
                print(f"  ADAPTER FAILED: {gen.error}", flush=True)
                rows.append({"target": tid, "status": "adapter_failed", "error": str(gen.error)})
                continue
            spec_out = spec_dir / "spec.md"
            if spec_out.exists():
                spec_out.rename(spec_dir / "spec-v0.md")

            mode = target.improvement_mode or config.scorer.improvement_mode
            print(f"  iterating (mode: {mode}) ...", flush=True)
            log = iterate_spec(
                target=target, spec_dir=spec_dir, adapters_dir=adapters_dir,
                prompts_dir=prompts_dir, prd_path=prd_path, template_path=template_path,
                scorer_model=config.scorer.model, improvement_mode=mode,
                rubric_source=config.scorer.rubric_source,
            )
            s = log["summary"]
            print(f"  {s['original_score']} -> {s['final_score']} in {s['iterations_needed']} iter(s), passed={s['passed']}", flush=True)
            rows.append({
                "target": tid, "arm": mode, "status": "ok",
                "original_score": s["original_score"], "final_score": s["final_score"],
                "lift": round(s["final_score"] - s["original_score"], 2),
                "iterations_needed": s["iterations_needed"], "passed": s["passed"],
            })

    by_arm = {}
    for r in rows:
        if r.get("status") == "ok":
            by_arm.setdefault(r["arm"], []).append(r)
    arm_summary = {}
    for arm, rs in by_arm.items():
        lifts = [r["lift"] for r in rs]
        finals = [r["final_score"] for r in rs]
        arm_summary[arm] = {
            "n": len(rs),
            "mean_lift": round(statistics.mean(lifts), 3),
            "lifts": lifts,
            "mean_final": round(statistics.mean(finals), 3),
            "mean_iterations": round(statistics.mean([r["iterations_needed"] for r in rs]), 2),
        }

    out = {
        "experiment": "spec-only feedback-vs-control ablation",
        "scorer_model": config.scorer.model,
        "rubric_source": config.scorer.rubric_source,
        "caveat": "Spec-score lift only — implementation-outcome link measured separately. Lift is judged by the same scorer in both arms; the control arm isolates feedback content from revision-pass compute.",
        "arms": arm_summary,
        "rows": rows,
    }
    out_path = run_dir / "spec-ablation-summary.yml"
    with open(out_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(out, f, sort_keys=False)
    print(f"\nwrote {out_path}", flush=True)
    print(yaml.safe_dump(arm_summary, sort_keys=False), flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
