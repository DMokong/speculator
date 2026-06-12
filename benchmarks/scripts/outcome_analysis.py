#!/usr/bin/env python3
"""Outcome analysis for a full spec-bench matrix run (the score→outcome question).

Per chain: spec scores (v0 + final), then for BOTH implementations (original spec
vs improved spec): the screenshot-driven functional pass rate AND the code-reading
judge's overall. Reports:
  1. improved-vs-original outcome deltas per chain (does spec lift carry to outcomes?)
  2. feedback-vs-control arm comparison on outcomes
  3. instrument health: functional-floor detection (uniform low scores can't carry
     signal) and functional-vs-judge disagreement — if the instruments disagree
     wildly, say so instead of averaging the disagreement away.

Usage: uv run python scripts/outcome_analysis.py <run-dir> [--out results/outcome-matrix.yml]
"""

import argparse
import statistics
import sys
from pathlib import Path

import yaml


def load(p):
    try:
        with open(p, encoding="utf-8") as f:
            return yaml.safe_load(f)
    except OSError:
        return None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("run_dir")
    ap.add_argument("--out", default=None)
    args = ap.parse_args()
    run = Path(args.run_dir)

    chains = []
    for spec_dir in sorted((run / "specs").iterdir()):
        tid = spec_dir.name
        itlog = load(spec_dir / "iteration-log.yml")
        if not itlog:
            continue
        s = itlog.get("summary", {})
        chain = {
            "target": tid,
            "arm": s.get("improvement_mode") or ("control" if "-control" in tid else "feedback"),
            "spec_original": s.get("original_score"),
            "spec_final": s.get("final_score"),
            "spec_lift": None,
            "implementations": {},
        }
        if isinstance(chain["spec_original"], (int, float)) and isinstance(chain["spec_final"], (int, float)):
            chain["spec_lift"] = round(chain["spec_final"] - chain["spec_original"], 2)
        for version in ("original", "improved"):
            idir = run / "implementations" / f"{tid}-{version}"
            func = load(idir / "functional-results.yml")
            judge = load(idir / "judge-scorecard.yml")
            entry = {}
            if func and isinstance(func.get("summary"), dict):
                entry["functional_passed"] = func["summary"].get("passed")
                entry["functional_total"] = func["summary"].get("total")
            if judge and isinstance(judge.get("scores"), dict):
                entry["judge_overall"] = judge["scores"].get("overall")
            if entry:
                chain["implementations"][version] = entry
        chains.append(chain)

    def fpct(e):
        if e.get("functional_passed") is None or not e.get("functional_total"):
            return None
        return e["functional_passed"] / e["functional_total"]

    deltas = []
    for c in chains:
        o, i = c["implementations"].get("original", {}), c["implementations"].get("improved", {})
        d = {}
        if fpct(o) is not None and fpct(i) is not None:
            d["functional_delta"] = round(fpct(i) - fpct(o), 3)
        if o.get("judge_overall") is not None and i.get("judge_overall") is not None:
            d["judge_delta"] = round(i["judge_overall"] - o["judge_overall"], 2)
        if d:
            d["target"] = c["target"]
            d["arm"] = c["arm"]
            d["spec_lift"] = c["spec_lift"]
            deltas.append(d)

    # Instrument health
    all_fpcts = [fpct(e) for c in chains for e in c["implementations"].values() if fpct(e) is not None]
    all_judges = [e["judge_overall"] for c in chains for e in c["implementations"].values()
                  if e.get("judge_overall") is not None]
    health = {
        "functional_pass_rates": [round(x, 3) for x in all_fpcts],
        "functional_floor_suspected": bool(all_fpcts) and max(all_fpcts) <= 0.25,
        "functional_range": round(max(all_fpcts) - min(all_fpcts), 3) if all_fpcts else None,
        "judge_overalls": all_judges,
        "judge_range": round(max(all_judges) - min(all_judges), 2) if all_judges else None,
        "note": ("If functional_floor_suspected is true, the screenshot-driven functional "
                 "instrument is compressed near its floor (e.g. implementations need live "
                 "APIs/keys the harness does not provide) and CANNOT carry spec-quality "
                 "signal — judge_overall is then the only usable outcome instrument, with "
                 "its own same-family caveats."),
    }

    def arm_stats(arm, key):
        vals = [d[key] for d in deltas if d["arm"] == arm and d.get(key) is not None]
        return {"n": len(vals), "mean": round(statistics.mean(vals), 3) if vals else None, "values": vals}

    out = {
        "experiment": "outcome matrix — does spec score lift carry to implementation outcomes?",
        "run_dir": str(run),
        "chains": chains,
        "improved_vs_original_deltas": deltas,
        "by_arm": {
            arm: {
                "judge_delta": arm_stats(arm, "judge_delta"),
                "functional_delta": arm_stats(arm, "functional_delta"),
            } for arm in ("feedback", "control")
        },
        "instrument_health": health,
    }

    text = yaml.safe_dump(out, sort_keys=False)
    print(text)
    if args.out:
        Path(args.out).parent.mkdir(parents=True, exist_ok=True)
        Path(args.out).write_text(text, encoding="utf-8")
        print(f"wrote {args.out}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
