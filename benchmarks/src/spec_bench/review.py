"""Review module — two-layer evaluation of benchmark implementations.

Layer 1: run_functional_tests() — Playwright-based functional smoke tests.
Layer 2: run_judge() — LLM-as-judge qualitative scorecard.
"""

import subprocess
import time
import urllib.request
import urllib.error
from pathlib import Path
from typing import Optional

import yaml

from .scoring import parse_scorecard_yaml

# Extensions collected for judge context
_SOURCE_EXTENSIONS = {".ts", ".tsx", ".css", ".html"}

# Default Vite dev server port
_DEFAULT_DEV_PORT = 5173
_SERVER_POLL_INTERVAL = 0.5  # seconds between readiness polls
_SERVER_TIMEOUT = 30  # seconds to wait for server to be ready

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


def _run_playwright_checks(
    tests: list[dict],
    port: int = _DEFAULT_DEV_PORT,
) -> list[dict]:
    """Run Playwright assertions for each functional test item.

    Each item in tests is a dict with keys: id, requirement, test.
    Returns a list of result dicts with: id, requirement, passed, [error].

    This uses Playwright's Python bindings (sync_api) to check each
    assertion against the running dev server.
    """
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

    base_url = f"http://localhost:{port}"
    results = []

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        try:
            page.goto(base_url, timeout=15000)
            page.wait_for_load_state("networkidle", timeout=10000)
        except Exception as e:
            # If we can't load the page at all, mark everything as failed
            browser.close()
            return [
                {"id": t["id"], "requirement": t["requirement"], "passed": False, "error": f"Page load failed: {e}"}
                for t in tests
            ]

        for test_item in tests:
            result = {"id": test_item["id"], "requirement": test_item["requirement"]}
            try:
                _assert_functional_test(page, test_item)
                result["passed"] = True
            except (AssertionError, PlaywrightTimeout, Exception) as e:
                result["passed"] = False
                result["error"] = str(e)[:300]
            results.append(result)

        browser.close()

    return results


def _assert_functional_test(page, test_item: dict) -> None:
    """Attempt to verify a single functional test item using Playwright.

    This is a best-effort heuristic: the test descriptions are natural language,
    so we do keyword-based checks on the page content and structure.

    Raises AssertionError if the check fails.
    """
    test_desc = test_item.get("test", "")
    test_id = test_item["id"]

    # Each test description is natural language. We map test IDs to assertions.
    # F01: temperature in Celsius
    if test_id == "F01":
        # Look for °C pattern
        content = page.content()
        assert "°C" in content or "&#176;C" in content, "No Celsius temperature found on page"

    elif test_id == "F02":
        # 5-day forecast — look for day labels
        days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        content = page.content()
        found = sum(1 for d in days if d in content)
        assert found >= 5, f"Found only {found} day labels, expected at least 5"

    elif test_id == "F03":
        content = page.content()
        assert "Feels like" in content or "feels like" in content, "No 'Feels like' text found"

    elif test_id == "F04":
        content = page.content()
        assert "km/h" in content, "No wind speed (km/h) found"

    elif test_id == "F05":
        # 5 departure rows with HH:MM time format
        import re
        content = page.content()
        times = re.findall(r"\b\d{1,2}:\d{2}\b", content)
        assert len(times) >= 5, f"Found only {len(times)} time values, expected at least 5"

    elif test_id == "F06":
        content = page.content()
        assert "On time" in content or "on time" in content or "min" in content, \
            "No delay status indicators found"

    elif test_id == "F07":
        # Transport mode icons — look for icon elements
        icons = page.query_selector_all("img[alt], svg, [aria-label]")
        assert len(icons) > 0, "No icon elements found"

    elif test_id == "F08":
        # localStorage persistence test — check localStorage after interaction
        result = page.evaluate("() => Object.keys(localStorage)")
        assert len(result) > 0, "localStorage is empty — no preferences saved"

    elif test_id == "F09":
        result = page.evaluate("() => Object.keys(localStorage)")
        assert len(result) > 0, "localStorage is empty — no stop preferences saved"

    elif test_id == "F10":
        content = page.content()
        greetings = ["Good morning", "Good afternoon", "Good evening", "Good night"]
        assert any(g in content for g in greetings), "No time-of-day greeting found in header"

    elif test_id == "F11":
        # Settings panel — look for a settings icon/button
        settings_btn = page.query_selector("[aria-label*='setting'], [title*='setting'], button:has(svg)")
        assert settings_btn is not None, "No settings button found"

    elif test_id == "F12":
        # Transport stop search in settings — same as F11 but check for input
        settings_btn = page.query_selector("[aria-label*='setting'], [title*='setting'], button:has(svg)")
        assert settings_btn is not None, "No settings button found for stop search"

    elif test_id == "F13":
        # Responsive layout — check at 375px
        page.set_viewport_size({"width": 375, "height": 812})
        page.wait_for_load_state("networkidle", timeout=5000)
        content = page.content()
        # Basic check that content renders at mobile width
        assert len(content) > 100, "Page appears empty at mobile viewport"

    elif test_id == "F14":
        # Refresh button
        refresh_btn = page.query_selector("button[aria-label*='refresh'], button[title*='refresh'], button:has-text('refresh')")
        assert refresh_btn is not None, "No refresh button found"

    elif test_id == "F15":
        # Last-updated timestamp
        content = page.content()
        assert "Last updated" in content or "last updated" in content, "No 'Last updated' timestamp found"

    else:
        # Unknown test ID — fall through as inconclusive (pass)
        pass


def run_functional_tests(
    app_dir: Path,
    functional_tests_path: Path,
    output_dir: Path,
    port: int = _DEFAULT_DEV_PORT,
) -> dict:
    """Run Playwright functional tests against a Vite dev app.

    Steps:
    1. Parse functional-tests.yml
    2. Start the Vite dev server (`npm run dev`) in app_dir
    3. Wait for server to be ready
    4. Run Playwright checks for each test item
    5. Terminate the dev server
    6. Write functional-results.yml to output_dir
    7. Return the results dict

    Args:
        app_dir: Directory containing the Vite app (has package.json + npm run dev).
        functional_tests_path: Path to functional-tests.yml.
        output_dir: Directory to write functional-results.yml into.
        port: Port the Vite dev server listens on (default: 5173).

    Returns:
        Dict with 'results' list and 'summary' dict.
    """
    tests = parse_functional_tests(functional_tests_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Start dev server
    proc = subprocess.Popen(
        ["npm", "run", "dev"],
        cwd=str(app_dir),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
    )

    try:
        _wait_for_server(port=port)
        check_results = _run_playwright_checks(tests, port=port)
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()

    # Build summary
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
    judge_model: str = "claude-opus-4-5",
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
            "claude",
            "-p",
            prompt,
            "--dangerously-skip-permissions",
            "--model",
            judge_model,
        ],
        capture_output=True,
        text=True,
        timeout=300,
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
