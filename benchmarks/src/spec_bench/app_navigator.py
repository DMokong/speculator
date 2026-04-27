"""App navigator — drives the app through key states using accessibility tree.

Instead of guessing CSS selectors, we use the page's accessibility tree to find
interactive elements by their roles and names. This works regardless of how the
UI is implemented.
"""

import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from playwright.sync_api import Page


@dataclass
class AppState:
    """Captured evidence at a particular app state."""
    name: str
    page_text: str
    accessibility_tree: dict
    screenshot_path: str
    localStorage: dict
    console_errors: list[str] = field(default_factory=list)
    intercepted_requests: list[str] = field(default_factory=list)


def _find_in_tree(tree: dict, role: str = None, name_pattern: str = None) -> list[dict]:
    """Recursively find nodes in accessibility tree matching role and/or name pattern."""
    results = []
    if tree is None:
        return results

    role_match = role is None or tree.get("role") == role
    name_match = name_pattern is None or (
        tree.get("name") and re.search(name_pattern, tree["name"], re.IGNORECASE)
    )

    if role_match and name_match:
        results.append(tree)

    for child in tree.get("children", []):
        results.extend(_find_in_tree(child, role, name_pattern))

    return results


def _get_a11y_tree(page: Page) -> dict:
    """Build an accessibility-like tree from the DOM using JavaScript.

    Playwright's page.accessibility.snapshot() was removed in newer versions.
    This replaces it with a JS-based equivalent that walks the DOM and captures
    roles, names, and structure for interactive elements.
    """
    return page.evaluate("""() => {
        function walk(el) {
            if (!el || el.nodeType !== 1) return null;
            const tag = el.tagName.toLowerCase();
            const role = el.getAttribute('role') || ({
                'a': 'link', 'button': 'button', 'input': 'textbox',
                'select': 'combobox', 'textarea': 'textbox', 'h1': 'heading',
                'h2': 'heading', 'h3': 'heading', 'nav': 'navigation',
                'main': 'main', 'section': 'region', 'img': 'img',
            }[tag] || '');
            const name = el.getAttribute('aria-label')
                || el.getAttribute('title')
                || (tag === 'button' || tag === 'a' ? el.textContent.trim().slice(0, 80) : '')
                || el.getAttribute('placeholder')
                || '';
            const children = [];
            for (const child of el.children) {
                const c = walk(child);
                if (c) children.push(c);
            }
            if (!role && children.length === 0 && !name) return null;
            const node = {};
            if (role) node.role = role;
            if (name) node.name = name;
            if (children.length > 0) node.children = children;
            return node;
        }
        return walk(document.body) || {};
    }""") or {}


def _get_storage(page: Page) -> dict:
    """Dump all localStorage as a dict."""
    return page.evaluate("""() => {
        const data = {};
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            data[key] = localStorage.getItem(key);
        }
        return data;
    }""")


def _capture_state(page: Page, name: str, output_dir: Path) -> AppState:
    """Capture full evidence for the current page state."""
    screenshot_path = str(output_dir / f"screenshot-{name}.png")
    page.screenshot(path=screenshot_path, full_page=True)

    tree = _get_a11y_tree(page)
    page_text = page.inner_text("body")
    storage = _get_storage(page)

    return AppState(
        name=name,
        page_text=page_text,
        accessibility_tree=tree,
        screenshot_path=screenshot_path,
        localStorage=storage,
    )


def setup_api_mocks(page: Page, mock_data: dict) -> list[str]:
    """Intercept all external API calls and return mock data.

    Returns a list of intercepted request URLs for verification.

    Args:
        page: Playwright page object.
        mock_data: Dict with keys: open_meteo_current, open_meteo_forecast,
                   tfnsw_stop_finder, tfnsw_departures, tfnsw_trip, gtfs_advisory.
    """
    intercepted = []

    def handle_open_meteo(route):
        url = route.request.url
        intercepted.append(url)
        body = {**mock_data["open_meteo_current"], **mock_data["open_meteo_forecast"]}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body))

    def handle_tfnsw(route):
        url = route.request.url
        intercepted.append(url)
        if "stop_finder" in url:
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(mock_data["tfnsw_stop_finder"]))
        elif "departure_mon" in url:
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(mock_data["tfnsw_departures"]))
        elif "trip" in url:
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(mock_data["tfnsw_trip"]))
        else:
            route.fulfill(status=200, content_type="application/json",
                          body=json.dumps(mock_data["gtfs_advisory"]))

    page.route("**/api.open-meteo.com/**", handle_open_meteo)
    page.route("**/api.transport.nsw.gov.au/**", handle_tfnsw)

    return intercepted


def seed_profile(page: Page, seed_data: dict[str, str], base_url: str) -> None:
    """Write seed data to localStorage and reload."""
    for key, value in seed_data.items():
        # value is already a JSON-encoded string from build_seed_profile().
        # Pass it directly as a JS string literal — no extra json.dumps().
        escaped = value.replace("\\", "\\\\").replace("'", "\\'").replace("\n", "\\n")
        page.evaluate(f"() => localStorage.setItem('{key}', '{escaped}')")

    page.goto(base_url, timeout=15000)
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(3000)

    _dismiss_overlays(page)


def _dismiss_overlays(page: Page) -> None:
    """Close any overlays/drawers blocking the main UI using accessibility tree."""
    tree = _get_a11y_tree(page)

    close_buttons = _find_in_tree(tree, role="button", name_pattern=r"close|dismiss|cancel|✕|×")

    for btn_info in close_buttons:
        name = btn_info.get("name", "")
        try:
            locator = page.get_by_role("button", name=name, exact=True)
            if locator.count() > 0 and locator.first.is_visible():
                locator.first.click(force=True)
                page.wait_for_timeout(500)
        except Exception:
            pass


def navigate_states(page: Page, base_url: str, output_dir: Path) -> list[AppState]:
    """Navigate the app through key states and capture evidence at each.

    Returns a list of AppState objects, one per state.
    """
    output_dir.mkdir(parents=True, exist_ok=True)
    states = []

    # --- State 1: Initial load (after seed + mock) ---
    page.wait_for_timeout(2000)
    states.append(_capture_state(page, "01-initial", output_dir))

    # --- State 2: Route builder ---
    tree = _get_a11y_tree(page)
    new_route_btns = _find_in_tree(tree, role="button", name_pattern=r"new route|add route|create route")
    if new_route_btns:
        name = new_route_btns[0].get("name", "")
        try:
            page.get_by_role("button", name=name).first.click(force=True)
            page.wait_for_timeout(1500)
        except Exception:
            pass
    states.append(_capture_state(page, "02-route-builder", output_dir))

    # --- State 3: Trip planner (go back, select saved route) ---
    page.goto(base_url, timeout=15000)
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(2000)
    _dismiss_overlays(page)

    tree = _get_a11y_tree(page)
    route_items = _find_in_tree(tree, name_pattern=r"hornsby|plan trip|chatswood")
    for item in route_items:
        name = item.get("name", "")
        role = item.get("role", "button")
        try:
            locator = page.get_by_role(role, name=name)
            if locator.count() > 0:
                locator.first.click(force=True)
                page.wait_for_timeout(3000)
                break
        except Exception:
            pass
    states.append(_capture_state(page, "03-trip-planner", output_dir))

    # --- State 4: Settings panel ---
    tree = _get_a11y_tree(page)
    settings_btns = _find_in_tree(tree, role="button", name_pattern=r"setting|config|gear|⚙")
    if settings_btns:
        name = settings_btns[0].get("name", "")
        try:
            page.get_by_role("button", name=name).first.click(force=True)
            page.wait_for_timeout(1000)
        except Exception:
            pass
    states.append(_capture_state(page, "04-settings", output_dir))

    # --- State 5: After page reload (persistence test) ---
    page.reload()
    page.wait_for_load_state("networkidle", timeout=15000)
    page.wait_for_timeout(2000)
    _dismiss_overlays(page)
    states.append(_capture_state(page, "05-after-reload", output_dir))

    # --- State 6: Mobile viewport ---
    page.set_viewport_size({"width": 375, "height": 812})
    page.wait_for_timeout(1000)
    states.append(_capture_state(page, "06-mobile", output_dir))

    # Reset to desktop
    page.set_viewport_size({"width": 1280, "height": 720})
    page.wait_for_timeout(500)

    return states
