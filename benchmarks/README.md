# Spec-Bench

Spec-Bench is a benchmark harness for [Speculator](../MANIFESTO.md) — it tests whether spec quality predicts implementation quality. Given a product requirements document (PRD), multiple target configurations generate specs which Speculator scores and iterates. A constant implementer then builds the feature from both the original and improved spec. Playwright functional tests and an LLM-as-judge review the results, producing a comparative report that measures how much spec quality improvements translate into better implementations.

## Quick Start

```bash
cd speculator/benchmarks
uv sync
uv run spec-bench run --prd weather-transport --matrix default.yml --runs 1
```

## How It Works

The pipeline runs in four phases:

1. **Spec Generation** — Each target (a combination of LLM, process, and harness) generates a spec from the PRD.
2. **Score + Iterate** — Speculator scores each spec across 6 dimensions. If the score is below 7.8, the same target is given feedback and asked to improve. This repeats up to 3 times. The best-scoring version is saved as `spec-improved.md`.
3. **Constant Implementation** — A fixed implementer (Claude Code + Superpowers) builds the feature twice: once from the original spec (`spec-v0.md`) and once from the improved spec. This holds implementation quality constant so differences in outcome are attributable to spec quality.
4. **Review** — Playwright functional tests check whether the app meets the PRD's acceptance criteria. An LLM-as-judge scores the implementation against an outcome rubric. Results are aggregated into a YAML + HTML dashboard.

## Target Matrix

Targets are defined along three axes:

| Axis | Values |
|------|--------|
| **LLM** | claude-opus-4-6, claude-sonnet-4-6, gpt-4.1 |
| **Process** | vanilla (no system prompt), superpowers (Superpowers skill loaded) |
| **Harness** | claude-code, copilot-cli |

The `default.yml` matrix defines 8 targets covering the cross-product of harnesses, models, and processes:

| ID | Harness | Model | Process |
|----|---------|-------|---------|
| cc-vanilla-opus | claude-code | opus-4-6 | vanilla |
| cc-vanilla-sonnet | claude-code | sonnet-4-6 | vanilla |
| cc-sp-opus | claude-code | opus-4-6 | superpowers |
| cc-sp-sonnet | claude-code | sonnet-4-6 | superpowers |
| copilot-vanilla-gpt41 | copilot-cli | gpt-4.1 | vanilla |
| copilot-sp-gpt41 | copilot-cli | gpt-4.1 | superpowers |
| copilot-vanilla-opus | copilot-cli | opus-4-6 | vanilla |
| copilot-sp-opus | copilot-cli | opus-4-6 | superpowers |

## Adding PRDs

Create a directory under `prds/` with a `prd.md` and a `functional-tests.yml`:

```
prds/
  my-feature/
    prd.md                 # Product requirements document
    functional-tests.yml   # Playwright test definitions
```

Or use the CLI to copy an existing PRD file:

```bash
uv run spec-bench add-prd --path /path/to/my-prd.md
```

The PRD name (used in `--prd`) is the directory name.

## CLI Reference

```
spec-bench run --prd <name> --matrix <file> --runs <n>
spec-bench report --run <run-id>
spec-bench calibrate --run <run-id>
spec-bench prds
spec-bench add-prd --path <file>
```

| Command | Description |
|---------|-------------|
| `run` | Execute the full benchmark pipeline for a PRD + matrix combination |
| `report` | Regenerate the YAML + HTML report from an existing run directory |
| `calibrate` | Run the human-in-the-loop calibration protocol against a completed run |
| `prds` | List all PRDs available in the library |
| `add-prd` | Copy a PRD file into the library |

## Calibration

The `calibrate` command runs a human-in-the-loop protocol to validate that the LLM-as-judge scores align with human judgment. You select 3-4 implementations from a run and score them manually across 6 dimensions. The protocol then runs the same judge prompt and compares scores dimension-by-dimension. If human and judge scores diverge by more than 1 point on any dimension, the result is flagged as `needs_tuning` and written to `runs/<run-id>/calibration/calibration-NNN.yml`. Use calibration artifacts to tune the outcome rubric (`rubrics/outcome-rubric.md`) until judge scores reliably track human scores.

## Directory Structure

```
benchmarks/
├── README.md
├── pyproject.toml          # Package config, spec-bench entrypoint
├── uv.lock
├── adapters/               # Bash adapters for each harness
│   ├── claude-code.sh
│   └── copilot-cli.sh
├── matrix/                 # Benchmark matrix config files
│   └── default.yml         # 8-target default matrix
├── prds/                   # PRD library
│   └── weather-transport/  # Built-in example PRD
│       ├── prd.md
│       └── functional-tests.yml
├── prompts/                # Prompt templates
│   ├── spec-template.md    # Spec structure template
│   └── vanilla.md          # Vanilla (no-system-prompt) instruction
├── rubrics/
│   └── outcome-rubric.md   # LLM-as-judge outcome rubric
├── src/
│   └── spec_bench/         # Python package
│       ├── cli.py           # Click CLI entrypoint
│       ├── config.py        # Matrix + PRD loading
│       ├── orchestrator.py  # Run directory + adapter invocation
│       ├── scoring.py       # Speculator integration + iteration loop
│       ├── review.py        # Playwright tests + LLM judge
│       ├── report.py        # YAML + HTML report generation
│       └── calibration.py   # Human-in-the-loop calibration
├── templates/
│   └── report.html.j2      # Jinja2 HTML dashboard template
├── tests/                  # Unit tests (67 tests, all passing)
└── runs/                   # Benchmark run outputs (gitignored)
```

## License

MIT — same as Speculator.
