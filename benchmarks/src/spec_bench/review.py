"""Review module — two-layer evaluation of benchmark implementations.

Layer 1: run_functional_tests() — Playwright-based functional smoke tests.
Layer 2: run_judge() — LLM-as-judge qualitative scorecard.
"""

import json
import os
import socket
import subprocess
import time
import urllib.request
import urllib.error

from .config import DEFAULT_JUDGE_TIMEOUT_SECONDS
from .scoring import _resolve_claude_bin, _map_claude_model
from pathlib import Path

import yaml

from .scoring import parse_scorecard_yaml

# Extensions collected for judge context
_SOURCE_EXTENSIONS = {".ts", ".tsx", ".css", ".html"}

# Default Vite dev server port
_DEFAULT_DEV_PORT = 5173
_SERVER_POLL_INTERVAL = 0.5  # seconds between readiness polls
_SERVER_TIMEOUT = 30  # seconds to wait for server to be ready


def _find_free_port(start: int = 15173, end: int = 15273) -> int:
    """Find a free TCP port in the given range."""
    for port in range(start, end):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(f"No free port found in range {start}-{end}")

JUDGE_PROMPT_TEMPLATE = """\
{rubric}

## PRD

{prd_content}

## Spec

{spec_content}

## Implementation source code

{source_code}
"""


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_functional_tests(tests_path: Path) -> list[dict]:
    """Parse a functional-tests.yml file and return the checklist as a list of dicts."""
    data = yaml.safe_load(tests_path.read_text())
    return data.get("functional_checklist", [])


def collect_source_code(impl_dir: Path) -> str:
    """Collect all TypeScript/TSX/CSS/HTML files from impl_dir into a single string.

    Skips node_modules. Each file is labelled with its relative path.
    """
    parts = []
    for path in sorted(impl_dir.rglob("*")):
        # Skip directories and node_modules subtree
        if not path.is_file():
            continue
        if "node_modules" in path.parts:
            continue
        if path.suffix not in _SOURCE_EXTENSIONS:
            continue

        rel = path.relative_to(impl_dir)
        parts.append(f"### {rel}\n\n```\n{path.read_text()}\n```")

    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Layer 1: Functional tests
# ---------------------------------------------------------------------------


def _wait_for_server(port: int = _DEFAULT_DEV_PORT, timeout: float = _SERVER_TIMEOUT) -> None:
    """Poll localhost:<port> until it responds or timeout expires."""
    url = f"http://localhost:{port}"
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            urllib.request.urlopen(url, timeout=1)
            return
        except Exception:
            time.sleep(_SERVER_POLL_INTERVAL)
    raise TimeoutError(f"Dev server at {url} did not become ready within {timeout}s")


def _run_programmatic_checks(
    page,
    states: list,
    intercepted: list[str],
) -> dict:
    """Run deterministic data-layer checks that don't need an LLM.

    Returns a dict mapping test IDs to {"passed": bool, "evidence": str}.
    Currently checks:
      - F15 (behavior tracking): localStorage has behavior-related keys with parseable JSON arrays
      - F17 (persistence): localStorage survives page reload (state 0 vs state 4)
      - F19 (responsive): Desktop vs mobile page text lengths differ meaningfully
    """
    results: dict[str, dict] = {}

    # --- F15: Behavior tracking via localStorage ---
    initial_storage = states[0].localStorage if states else {}
    behavior_keys = [
        k for k in initial_storage
        if any(term in k.lower() for term in [
            "behav", "pattern", "history", "log", "checkin", "check_in",
            "usage", "track",
        ])
    ]
    has_behavior_data = False
    for key in behavior_keys:
        try:
            val = json.loads(initial_storage[key])
            if isinstance(val, list) and len(val) > 0:
                has_behavior_data = True
                break
        except (json.JSONDecodeError, TypeError):
            continue

    results["F15"] = {
        "passed": has_behavior_data,
        "evidence": (
            f"Found {len(behavior_keys)} behavior-related key(s) in localStorage"
            + (", parseable JSON array present" if has_behavior_data else ", no parseable array")
        ),
    }

    # --- F17: Persistence across reload ---
    if len(states) >= 5:
        storage_before = states[0].localStorage
        storage_after = states[4].localStorage  # 05-after-reload
        keys_before = set(storage_before.keys())
        keys_after = set(storage_after.keys())
        persisted = keys_before & keys_after
        passed = len(persisted) > 0 and len(keys_before) > 0
        results["F17"] = {
            "passed": passed,
            "evidence": (
                f"{len(persisted)}/{len(keys_before)} keys persisted after reload"
                if keys_before else "No keys found before reload"
            ),
        }

    # --- F19: Responsive layout ---
    if len(states) >= 6:
        desktop_len = len(states[0].page_text)  # 01-initial (1280x720)
        mobile_len = len(states[5].page_text)    # 06-mobile (375x812)
        both_have_content = desktop_len > 100 and mobile_len > 100
        results["F19"] = {
            "passed": both_have_content,
            "evidence": (
                f"Desktop text length: {desktop_len}, mobile text length: {mobile_len}"
            ),
        }

    return results


def _merge_results(
    tests: list[dict],
    llm_verdicts: dict,
    programmatic_results: dict,
) -> list[dict]:
    """Merge programmatic and LLM results into a single results list.

    Programmatic results override LLM verdicts where available.
    Each result has: id, requirement, passed, evidence, source.
    """
    merged = []
    for t in tests:
        tid = t["id"]
        if tid in programmatic_results:
            r = programmatic_results[tid]
            merged.append({
                "id": tid,
                "requirement": t["requirement"],
                "passed": r["passed"],
                "evidence": r["evidence"],
                "source": "programmatic",
            })
        elif tid in llm_verdicts:
            v = llm_verdicts[tid]
            row = {
                "id": tid,
                "requirement": t["requirement"],
                "passed": v["passed"],
                "evidence": v["evidence"],
                "source": "llm-judge",
            }
            # Surface judge failures (e.g. judge_timeout) in the results file
            if "status" in v:
                row["status"] = v["status"]
            merged.append(row)
        else:
            merged.append({
                "id": tid,
                "requirement": t["requirement"],
                "passed": False,
                "evidence": "No verdict produced by either programmatic checks or LLM judge",
                "source": "missing",
            })
    return merged


def run_functional_tests(
    app_dir: Path,
    functional_tests_path: Path,
    output_dir: Path,
    port: int = _DEFAULT_DEV_PORT,
    judge_model: str = "sonnet",
    judge_timeout_seconds: int = DEFAULT_JUDGE_TIMEOUT_SECONDS,
) -> dict:
    """Run hybrid functional tests (programmatic + LLM vision judge) against a Vite dev app.

    Steps:
    1. Parse functional-tests.yml
    2. Start Vite dev server on a free port
    3. Open Playwright browser with API mocks and seeded localStorage
    4. Navigate through key app states, capturing evidence (screenshots, text, a11y tree)
    5. Run deterministic programmatic checks on captured data
    6. Run LLM vision judge on remaining requirements
    7. Merge results (programmatic overrides LLM where available)
    8. Write functional-results.yml to output_dir

    Args:
        app_dir: Directory containing the Vite app (has package.json).
        functional_tests_path: Path to functional-tests.yml.
        output_dir: Directory to write functional-results.yml into.
        port: Ignored (kept for API compat); a free port is always chosen.
        judge_model: Claude model name for the LLM vision judge.
        judge_timeout_seconds: Subprocess timeout for the vision judge call.

    Returns:
        Dict with 'results' list and 'summary' dict.
    """
    from playwright.sync_api import sync_playwright
    from .mock_data import (
        OPEN_METEO_CURRENT, OPEN_METEO_FORECAST,
        TFNSW_STOP_FINDER_HORNSBY, TFNSW_DEPARTURES_HORNSBY,
        TFNSW_TRIP_HORNSBY_CHATSWOOD, GTFS_ADVISORY_T1,
        build_seed_profile,
    )
    from .app_navigator import setup_api_mocks, seed_profile, navigate_states
    from .vision_judge import run_vision_judge

    tests = parse_functional_tests(functional_tests_path)
    output_dir.mkdir(parents=True, exist_ok=True)
    screenshots_dir = output_dir / "screenshots"
    screenshots_dir.mkdir(exist_ok=True)

    actual_port = _find_free_port()
    api_key = os.environ.get("TFNSW_API_KEY", "test-key-for-benchmark")

    proc = subprocess.Popen(
        ["npx", "vite", "--port", str(actual_port), "--strictPort"],
        cwd=str(app_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        _wait_for_server(port=actual_port)
        base_url = f"http://localhost:{actual_port}"

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})

            page.goto(base_url, timeout=15000)
            page.wait_for_load_state("networkidle", timeout=10000)

            mock_data = {
                "open_meteo_current": OPEN_METEO_CURRENT,
                "open_meteo_forecast": OPEN_METEO_FORECAST,
                "tfnsw_stop_finder": TFNSW_STOP_FINDER_HORNSBY,
                "tfnsw_departures": TFNSW_DEPARTURES_HORNSBY,
                "tfnsw_trip": TFNSW_TRIP_HORNSBY_CHATSWOOD,
                "gtfs_advisory": GTFS_ADVISORY_T1,
            }
            intercepted = setup_api_mocks(page, mock_data)

            seed_data = build_seed_profile(api_key)
            seed_profile(page, seed_data, base_url)

            states = navigate_states(page, base_url, screenshots_dir)

            programmatic_results = _run_programmatic_checks(page, states, intercepted)

            browser.close()

        llm_verdicts = run_vision_judge(
            tests, states,
            judge_model=judge_model,
            timeout_seconds=judge_timeout_seconds,
        )
        check_results = _merge_results(tests, llm_verdicts, programmatic_results)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    passed_count = sum(1 for r in check_results if r.get("passed"))
    failed_count = len(check_results) - passed_count

    results_dict = {
        "results": check_results,
        "summary": {
            "total": len(check_results),
            "passed": passed_count,
            "failed": failed_count,
            "pass_rate": f"{passed_count}/{len(check_results)}",
        },
    }

    output_path = output_dir / "functional-results.yml"
    output_path.write_text(yaml.dump(results_dict, default_flow_style=False, sort_keys=False))

    return results_dict


# ---------------------------------------------------------------------------
# Layer 2: LLM-as-judge
# ---------------------------------------------------------------------------


def run_judge(
    prd_path: Path,
    spec_path: Path,
    impl_dir: Path,
    rubric_path: Path,
    output_dir: Path,
    judge_model: str = "opus-4-6",
    timeout_seconds: int = DEFAULT_JUDGE_TIMEOUT_SECONDS,
) -> dict:
    """Run the LLM-as-judge qualitative review of an implementation.

    Steps:
    1. Read PRD, spec, and collected source code
    2. Load the outcome rubric
    3. Construct judge prompt
    4. Call `claude -p` with the judge model
    5. Parse the YAML scorecard response
    6. Write judge-scorecard.yml to output_dir
    7. Return the scorecard dict

    Args:
        prd_path: Path to the PRD markdown.
        spec_path: Path to the spec markdown.
        impl_dir: Root directory of the implementation (source files collected recursively).
        rubric_path: Path to the outcome rubric markdown.
        output_dir: Directory to write judge-scorecard.yml into.
        judge_model: Claude model name to use as the judge.
        timeout_seconds: Subprocess timeout for the judge call.

    Returns:
        Parsed scorecard dict with 'scores' and 'reasoning' keys.

    Raises:
        RuntimeError: If the claude -p subprocess exits non-zero.
    """
    prd_content = prd_path.read_text()
    spec_content = spec_path.read_text()
    rubric_content = rubric_path.read_text()
    source_code = collect_source_code(impl_dir)

    prompt = JUDGE_PROMPT_TEMPLATE.format(
        rubric=rubric_content,
        prd_content=prd_content,
        spec_content=spec_content,
        source_code=source_code,
    )

    result = subprocess.run(
        [
            _resolve_claude_bin(),
            "-p",
            prompt,
            "--dangerously-skip-permissions",
            "--model",
            _map_claude_model(judge_model),
        ],
        capture_output=True,
        text=True,
        timeout=timeout_seconds,
    )

    if result.returncode != 0:
        raise RuntimeError(
            f"Judge failed (exit {result.returncode}): {result.stderr[:500]}"
        )

    scorecard = parse_scorecard_yaml(result.stdout)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / "judge-scorecard.yml"
    output_path.write_text(yaml.dump(scorecard, default_flow_style=False))

    return scorecard
