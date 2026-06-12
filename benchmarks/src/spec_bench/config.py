"""Matrix and PRD configuration loading and validation."""

import re
from dataclasses import dataclass, field
from pathlib import Path
import yaml

VALID_PROCESSES = {"vanilla", "superpowers"}
VALID_IMPROVEMENT_MODES = {"feedback", "control", "none"}
VALID_RUBRIC_SOURCES = {"inline", "production"}

# Pinned scorer model. Matches the scorer_model recorded in
# results/3-round-spec-quality.yml — without an explicit pin, `claude -p`
# uses whatever model the operator's environment defaults to, making the
# recorded scorer_model unverifiable.
DEFAULT_SCORER_MODEL = "claude-sonnet-4-6"

# Default judge subprocess timeout in seconds. The opus judge reviewing
# functional-test evidence routinely exceeded the old 120s limit and killed
# entire runs (bench-2026-06-12-001) — 600s gives headroom while still
# bounding a hung judge.
DEFAULT_JUDGE_TIMEOUT_SECONDS = 600


@dataclass
class Target:
    id: str
    harness: str
    model: str
    process: str
    # Optional per-target override of scorer.improvement_mode, so one matrix
    # can run paired arms (e.g. the same target once with `feedback` and once
    # with `control`). None → use the matrix-level scorer.improvement_mode.
    improvement_mode: str | None = None


@dataclass
class ConstantImplementer:
    harness: str
    model: str
    process: str
    permissions: str


@dataclass
class ScorerConfig:
    """Configuration for the spec scorer (the Gate-1 LLM judge).

    model: Claude model used for scoring — pinned, never environment-default.
    improvement_mode: how revision passes are prompted:
        feedback — scorer flags fed back into the revision prompt (default)
        control  — same revision passes, generic "improve this spec" prompt
                   with NO scorer feedback (isolates feedback value from
                   extra-pass compute)
        none     — score v0 only, no revision passes
    rubric_source: which rubric text the scoring prompt uses:
        inline     — the simplified benchmark-local prompt (default)
        production — the shipped judge rubric at <repo-root>/rubrics/spec-quality.md
    """
    model: str = DEFAULT_SCORER_MODEL
    improvement_mode: str = "feedback"
    rubric_source: str = "inline"


@dataclass
class MatrixConfig:
    prd: str
    runs_per_combination: int
    constant_implementer: ConstantImplementer
    judge_model: str
    targets: list[Target]
    scorer: ScorerConfig = field(default_factory=ScorerConfig)
    # Optional judge.timeout_seconds in the matrix — bounds each judge
    # subprocess call (vision judge + outcome judge).
    judge_timeout_seconds: int = DEFAULT_JUDGE_TIMEOUT_SECONDS


@dataclass
class PRDConfig:
    id: str
    name: str
    version: str
    difficulty: str
    estimated_features: int
    estimated_impl_time: str
    content: str        # Stripped of HTML comments — for spec generators
    raw_content: str    # Full content including implied requirements — for the judge
    prd_dir: Path


def _strip_html_comments(text: str) -> str:
    """Remove HTML comment blocks from text."""
    return re.sub(r'<!--.*?-->', '', text, flags=re.DOTALL)


def load_matrix(path: Path) -> MatrixConfig:
    """Load and validate a benchmark matrix configuration."""
    with open(path) as f:
        raw = yaml.safe_load(f)

    bench = raw["benchmark"]
    ci = bench["constant_implementer"]
    judge = bench["judge"]
    judge_model = judge["model"]
    judge_timeout_seconds = int(judge.get("timeout_seconds", DEFAULT_JUDGE_TIMEOUT_SECONDS))

    if judge_model == ci["model"]:
        raise ValueError(
            f"judge.model must differ from constant_implementer.model "
            f"(both are '{judge_model}')"
        )
    if judge_timeout_seconds <= 0:
        raise ValueError(
            f"judge.timeout_seconds must be positive (got {judge_timeout_seconds})"
        )

    # Scorer block is optional — defaults pin the model and preserve the
    # historical feedback/inline behavior.
    scorer_raw = bench.get("scorer", {}) or {}
    scorer = ScorerConfig(
        model=scorer_raw.get("model", DEFAULT_SCORER_MODEL),
        improvement_mode=scorer_raw.get("improvement_mode", "feedback"),
        rubric_source=scorer_raw.get("rubric_source", "inline"),
    )
    if scorer.improvement_mode not in VALID_IMPROVEMENT_MODES:
        raise ValueError(
            f"Invalid scorer.improvement_mode '{scorer.improvement_mode}'. "
            f"Valid values: {VALID_IMPROVEMENT_MODES}"
        )
    if scorer.rubric_source not in VALID_RUBRIC_SOURCES:
        raise ValueError(
            f"Invalid scorer.rubric_source '{scorer.rubric_source}'. "
            f"Valid values: {VALID_RUBRIC_SOURCES}"
        )

    targets = []
    for t in bench["targets"]:
        if t["process"] not in VALID_PROCESSES:
            raise ValueError(
                f"Invalid process '{t['process']}' for target '{t['id']}'. "
                f"Valid values: {VALID_PROCESSES}"
            )
        improvement_mode = t.get("improvement_mode")
        if improvement_mode is not None and improvement_mode not in VALID_IMPROVEMENT_MODES:
            raise ValueError(
                f"Invalid improvement_mode '{improvement_mode}' for target '{t['id']}'. "
                f"Valid values: {VALID_IMPROVEMENT_MODES}"
            )
        targets.append(Target(
            id=t["id"],
            harness=t["harness"],
            model=t["model"],
            process=t["process"],
            improvement_mode=improvement_mode,
        ))

    return MatrixConfig(
        prd=bench["prd"],
        runs_per_combination=bench.get("runs_per_combination", 1),
        constant_implementer=ConstantImplementer(
            harness=ci["harness"],
            model=ci["model"],
            process=ci["process"],
            permissions=ci["permissions"],
        ),
        judge_model=judge_model,
        targets=targets,
        scorer=scorer,
        judge_timeout_seconds=judge_timeout_seconds,
    )


def load_prd(prd_name: str, prds_dir: Path) -> PRDConfig:
    """Load a PRD from the library by name."""
    prd_dir = prds_dir / prd_name
    prd_file = prd_dir / "prd.md"

    if not prd_file.exists():
        raise FileNotFoundError(f"PRD not found: {prd_file}")

    raw_content = prd_file.read_text()

    # Parse YAML frontmatter
    if raw_content.startswith("---"):
        _, fm, body = raw_content.split("---", 2)
        meta = yaml.safe_load(fm)
    else:
        meta = {}
        body = raw_content

    # Strip HTML comments from content exposed to spec generators
    # so implied requirements (IR01-IR08) are not leaked
    content = _strip_html_comments(raw_content)

    return PRDConfig(
        id=meta.get("id", prd_name),
        name=meta.get("name", prd_name),
        version=str(meta.get("version", "1.0")),
        difficulty=meta.get("difficulty", "medium"),
        estimated_features=meta.get("estimated_features", 0),
        estimated_impl_time=meta.get("estimated_impl_time", "unknown"),
        content=content,
        raw_content=raw_content,
        prd_dir=prd_dir,
    )
