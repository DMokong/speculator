// SPEC-004 AC2 + AC5 structural surface pins (Gate 2b remediation).
//
// Gate 2b's eval-quality scorer found AC2 and AC5 had ZERO committed test
// coverage — their verification lived only in T05's task-time browser probes,
// which don't survive as regression protection. AC2 is literally an
// inspection AC ("when its stylesheet and script are inspected"), so these
// tests implement its letter directly. AC5's letter is behavioral; full
// behavior was verified in a real browser at T05 (report evidence) — these
// pins hold the wiring and information surface so a refactor that drops or
// rewires an interaction fails the suite instead of shipping silently.
// Template is read at test time (same rationale as viz-layout.test.ts's
// extractProductionFcoseOptions — never assert against a hand copy).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8");

/** Extracts a balanced-brace block starting at the first occurrence of `marker`. */
function braceBlock(marker: string): string {
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`viz-surface.test.ts: marker not found: ${marker}`);
  const open = html.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < html.length; i++) {
    if (html[i] === "{") depth++;
    else if (html[i] === "}" && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`viz-surface.test.ts: unbalanced braces after: ${marker}`);
}

describe("AC2: label zoom-gating is structural, never population-conditional", () => {
  const childStyle = braceBlock('selector: "node[d]", style:');
  const parentStyle = braceBlock('selector: ":parent", style:');

  test("test_ac2_child_labels_gated_by_zoom_threshold", () => {
    expect(childStyle).toContain('"label": "data(label)"');
    expect(childStyle).toContain('"min-zoomed-font-size": 24');
  });

  test("test_ac2_parent_labels_always_visible_no_zoom_gate", () => {
    expect(parentStyle).toContain('"label": "data(label)"');
    expect(parentStyle).not.toContain("min-zoomed-font-size");
  });

  test("test_ac2_no_static_or_population_label_suppression", () => {
    // The reverted field patch gated labels on group population; the pre-SPEC-004
    // template gated them on enrichment state. Neither pattern may return.
    expect(html).not.toContain("labelSuppressedGroups");
    // Stylesheet construction is unconditional — no branching label logic.
    const styleFn = braceBlock("function buildStyle()");
    expect(styleFn).not.toMatch(/\bif\s*\(/);
    // The old SVG path created <text> labels only for audited nodes; that
    // conditional-creation pattern (and the SVG label layer) must stay gone.
    expect(html).not.toContain("createElementNS");
  });

  // PR #2 review wave 2 (claw-kt2c): the pins above only pinned historical
  // SPELLINGS — a population-gated suppression rewritten with fresh names
  // (extra style rule + addClass, an imperative el.style("label", ...) call,
  // or an el.data("label", ...) write, each outside buildStyle) passed the
  // full suite. These pins close the vector CLASS instead: the template's
  // label surface is exactly two static data(label) bindings, and no code
  // path may mutate label styling or label data at runtime. Validated
  // against reconstructed variants of all three vectors (each passed the
  // old pins, each fails these; the literal reverted patch is no longer
  // recoverable from history, so vector coverage stands in for it).
  test("test_ac2_label_surface_is_exactly_two_static_data_bindings", () => {
    expect(html.match(/"label":/g) ?? []).toHaveLength(2);
    expect(html.match(/"label": "data\(label\)"/g) ?? []).toHaveLength(2);
  });

  test("test_ac2_no_runtime_label_mutation_vectors", () => {
    expect(html).not.toContain("text-opacity"); // the classic CSS suppression vector
    expect(html).not.toMatch(/\.style\(\s*["']/); // imperative per-element style writes
    // Stylesheet re-application is legal ONLY as the theme toggle's verbatim
    // buildStyle() re-resolve — never with any other argument (which could
    // swap in a label-suppressing sheet).
    const styleCalls = html.match(/cy\.style\(/g) ?? [];
    const legalCalls = html.match(/cy\.style\(buildStyle\(\)\)/g) ?? [];
    expect(styleCalls.length).toBe(legalCalls.length);
    expect(html).not.toMatch(/\.data\(\s*["']label["']\s*,/); // label data WRITES (reads stay legal)
  });
});

describe("AC5: interaction surface — same information, same wiring as the prior template", () => {
  test("test_ac5_hover_tooltip_wired_with_full_information_surface", () => {
    expect(html).toContain('cy.on("mouseover", "node:child"');
    expect(html).toContain('cy.on("mousemove", "node:child"');
    expect(html).toContain('cy.on("mouseout", "node:child"');
    const hoverFn = braceBlock("function hover(");
    for (const surfaced of ["esc(n.id)", "esc(n.group)", "n.symbols", "esc(n.enrichment)", "STALE"]) {
      expect(hoverFn).toContain(surfaced);
    }
  });

  test("test_ac5_click_selects_and_background_tap_clears", () => {
    expect(html).toContain('cy.on("tap", "node:child"');
    // Deselect must fire on true background AND compound-hull taps — compounds
    // cover most of the packed canvas (blinded-review AC5 finding).
    expect(html).toContain("ev.target === cy || (ev.target.isParent && ev.target.isParent())");
    expect(html).toContain("select(null)");
    // Detail panel still opens and still carries the TEST stamp — driven by
    // the full classification flag (n.test, type-OR-tag), matching the graph
    // badge and area filter (Gate 2c cold-read finding: the old
    // n.type === "Test" check missed tag-only test concepts).
    expect(html).toContain('panel.classList.add("open")');
    expect(html).toContain("n.test ? '<span class=\"stamp test\">TEST</span>'");
    expect(html).not.toContain('n.type === "Test"');
  });

  test("test_ac5_search_dims_nonmatches_over_the_same_haystack", () => {
    expect(html).toContain('document.getElementById("q").addEventListener("input"');
    const visibleFn = braceBlock("function visible(");
    // Same haystack fields as the prior template: id, title, tags, export names.
    expect(visibleFn).toContain('n.id + " " + n.title');
    expect(visibleFn).toContain("n.tags.join");
    expect(visibleFn).toContain("n.exports.map");
  });

  test("test_ac5_area_filter_reads_classification_not_spatial_group", () => {
    const visibleFn = braceBlock("function visible(");
    expect(visibleFn).toContain('(fArea === "tests") !== (n.test === true)');
    expect(html).not.toContain('n.group === "tests"'); // the spatial bucket is dead (AC1/R3)
  });

  test("test_ac5_state_area_chips_and_dim_parity", () => {
    expect(html).toContain('"stateChips"');
    expect(html).toContain('"areaChips"');
    // Dim strength matches the prior template (final-audit AC5 finding, 07fdb7a).
    expect(html).toContain('{ selector: ".dim", style: { "opacity": 0.08 } }');
  });

  test("test_ac5_table_view_and_theme_toggle_survive", () => {
    expect(html).toContain('tableBtn.addEventListener("click"');
    expect(html).toContain('document.getElementById("themeBtn").addEventListener("click"');
  });
});

/** Extracts the JS content of the nearest <script> tag that contains `marker`
 * -- same "extract the real live slice, never hand-copy" idiom as braceBlock
 * above, but scoped to a <script>...</script> region rather than a balanced
 * brace block, since the I1 handler is not itself a single named function. */
function scriptBlockContaining(marker: string): string {
  const idx = html.indexOf(marker);
  if (idx === -1) throw new Error(`viz-surface.test.ts: marker not found: ${marker}`);
  const openTagStart = html.lastIndexOf("<script", idx);
  if (openTagStart === -1) throw new Error(`viz-surface.test.ts: no <script> tag precedes marker: ${marker}`);
  const openTagEnd = html.indexOf(">", openTagStart);
  if (openTagEnd === -1) throw new Error(`viz-surface.test.ts: unterminated <script> tag before marker: ${marker}`);
  const closeTag = html.indexOf("</script>", idx);
  if (closeTag === -1) throw new Error(`viz-surface.test.ts: no closing </script> after marker: ${marker}`);
  return html.slice(openTagEnd + 1, closeTag);
}

// PR #2 review finding I1 (Important, plan.md Wave F1 / 09-error-banner):
// the shipped viewer has no runtime error surface -- a vendor script error,
// fcose registration failure, or embedded-JSON corruption today renders as a
// blank canvas plus a console-only message the file:// audience never opens.
// These pins hold the fix's structural contract textually against the live
// template (never a hand copy), matching this file's existing idiom above.
describe("I1: runtime error surface (window.onerror / unhandledrejection banner)", () => {
  test("test_i1_registers_onerror_and_unhandledrejection_listener", () => {
    // Both hooks are required so synchronous throws (script eval, layout
    // registration) AND rejected promises are caught by the same surface.
    // Boolean-style checks (rather than expect(html).toMatch(...)) so a
    // failure reports true/false instead of dumping the entire template.
    expect(/window\.onerror\s*=/.test(html)).toBe(true);
    expect(/addEventListener\(\s*["']unhandledrejection["']/.test(html)).toBe(true);
  });

  test("test_i1_handler_registered_before_first_vendor_placeholder", () => {
    // Must be strictly before __VENDOR_LAYOUT_BASE__ (~line 302) so a vendor
    // script's own evaluation-time error -- e.g. fcose failing to register
    // against the cytoscape global -- is still caught. Registering after any
    // vendor tag would blind the handler to exactly the failure modes I1
    // exists to surface.
    const handlerIdx = html.indexOf("window.onerror");
    const vendorIdx = html.indexOf("__VENDOR_LAYOUT_BASE__");
    expect(handlerIdx).toBeGreaterThan(-1);
    expect(vendorIdx).toBeGreaterThan(-1);
    expect(handlerIdx).toBeLessThan(vendorIdx);
  });

  test("test_i1_handler_is_vanilla_dom_no_cytoscape_or_cy_references", () => {
    // The handler must work even when the vendor scripts themselves are what
    // failed to load/evaluate, so it cannot depend on `cytoscape` or the `cy`
    // instance -- both are defined later and may never exist.
    const handlerSlice = scriptBlockContaining("window.onerror");
    expect(handlerSlice.toLowerCase()).not.toContain("cytoscape");
    expect(handlerSlice).not.toContain("cy.");
  });

  test("test_i1_banner_has_required_id_and_role_alert", () => {
    // role="alert" is what makes the failure surface to assistive tech
    // without the audience needing to notice a visual change; the fixed id
    // is what keeps a second error from stacking a duplicate banner.
    const handlerSlice = scriptBlockContaining("window.onerror");
    expect(handlerSlice).toContain("asbuilt-error");
    expect(handlerSlice).toContain('role="alert"');
  });
});
