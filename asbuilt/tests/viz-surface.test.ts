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
