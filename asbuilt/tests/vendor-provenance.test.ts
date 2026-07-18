// SPEC-004 AC9 hardening (round 2 — survivor: MIT license/copyright header
// stripped from the shipped `cytoscape.min.js`, leaving all functional bytes
// and the `$&` regression-pin string intact). Every prior AC3/AC9-relevant
// assertion (viz.test.ts's vendor byte-equality loop, viz-elements.test.ts's
// inlineVendor round-trip/no-op/real-template tests) compares the *built*
// output against `readFileSync(asbuilt/vendor/<file>)` — i.e. against the
// very same (already-mutated) file it was built from. That's self-referential:
// it can only ever catch `inlineVendor` failing to faithfully copy whatever
// bytes happen to be in `asbuilt/vendor/`, never that those bytes are
// missing something they're supposed to contain. This file checks against an
// INDEPENDENT ground truth instead: `VENDOR.md`'s own recorded sha256 table
// (a separate document, not derived from the same build-time read path) plus
// a direct substring pin on the one file VENDOR.md documents as retaining
// its original license header.
import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const VENDOR_DIR = new URL("../vendor/", import.meta.url);
const VENDOR_MD = readFileSync(new URL("VENDOR.md", VENDOR_DIR), "utf8");

const FILES = ["cytoscape.min.js", "layout-base.js", "cose-base.js", "cytoscape-fcose.js"];

interface VendorRecord {
  file: string;
  version: string;
  license: string;
  sha256: string;
}

/** Parses VENDOR.md's "shipped (minified) sha256" table specifically —
 * scoped to just the contiguous row block directly under that one header
 * line, since the document also carries several OTHER tables further down
 * ("Original (pre-minification) sha256s", "Minification attempt (round 2)",
 * "Minification, round 3 ... SHIPPED") that reuse the same four filenames
 * for superseded/rejected/original sha256s. A plain "line contains this
 * filename" scan across the whole file would pick those up too. This is a
 * markdown-table scan independent of any code path that also reads
 * `asbuilt/vendor/*` at build time, so a mutation to a vendor file that
 * isn't reflected in this same recorded table shows up as a hash mismatch
 * rather than passing silently. */
function parseVendorTable(md: string, files: string[]): VendorRecord[] {
  const lines = md.split("\n");
  const headerIdx = lines.findIndex((l) => l.includes("shipped (minified) sha256"));
  if (headerIdx === -1) throw new Error("VENDOR.md: 'shipped (minified) sha256' table header not found");

  const records: VendorRecord[] = [];
  for (let i = headerIdx + 2; i < lines.length; i++) {
    // +2 skips the header row itself and the `|---|---|...` separator row.
    const line = lines[i] ?? "";
    if (!line.trim().startsWith("|")) break; // end of this table
    const cols = line.split("|").map((c) => c.trim());
    // | File | Package | Version | License | Source | shipped (minified) sha256 |
    const file = cols[1] ?? "";
    if (!files.includes(file)) continue;
    const sha = (cols[6] ?? "").replace(/`/g, "").trim();
    records.push({ file, version: cols[3] ?? "", license: cols[4] ?? "", sha256: sha });
  }
  return records;
}

describe("vendor provenance (SPEC-004 AC9): independent ground truth, not self-referential", () => {
  const records = parseVendorTable(VENDOR_MD, FILES);

  test("VENDOR.md's table records all four vendor files with a non-empty version, license, and 64-hex-char sha256", () => {
    expect(records.map((r) => r.file).sort()).toEqual([...FILES].sort());
    for (const r of records) {
      expect(r.version.length).toBeGreaterThan(0);
      expect(r.license.length).toBeGreaterThan(0);
      expect(r.sha256).toMatch(/^[0-9a-f]{64}$/i);
    }
  });

  test("every shipped vendor file's actual sha256 matches VENDOR.md's independently recorded hash", () => {
    for (const r of records) {
      const bytes = readFileSync(new URL(r.file, VENDOR_DIR));
      const actual = createHash("sha256").update(bytes).digest("hex");
      expect(actual).toBe(r.sha256);
    }
  });

  // The one file VENDOR.md documents as shipping "minified upstream,
  // unchanged" (the other three ship as patched-minified derivatives that
  // never carried a comment header post-minification, per VENDOR.md's own
  // "Minification, round 3" notes) — stripping this header changes the
  // file's bytes (and thus its sha256, caught above), but this also pins the
  // literal license text directly, closing AC9's "license ... recorded ...
  // (manifest or header)" clause with a second, independent signal.
  test("cytoscape.min.js retains its literal MIT copyright header at the top of the file", () => {
    const text = readFileSync(new URL("cytoscape.min.js", VENDOR_DIR), "utf8");
    // "MIT"/"Copyright" alone also appear scattered through the minified
    // bundle's OTHER, unrelated third-party sub-attributions further down
    // (a Bezier-curve-generator credit, a Promises/A+ implementation notice)
    // -- those false-positive on a bare substring check even after the
    // primary header is stripped. Anchoring on the block-comment opener plus
    // the specific, header-unique consortium name avoids that false
    // confidence.
    expect(text.startsWith("/**")).toBe(true);
    const head = text.slice(0, 500);
    expect(head).toContain("Copyright");
    expect(head).toContain("The Cytoscape Consortium");
    expect(head).toContain("Permission is hereby granted"); // canonical MIT license text
  });
});

// I2 (PR #2 review): the vendor script-tag order in viz-template.html is
// load-bearing but was previously asserted nowhere. The conductor proved
// empirically that swapping fcose before cytoscape produces a dead page
// (fcose can't self-register against a cytoscape global that doesn't exist
// yet) while every other test in the suite stays green -- none of them
// inspect placeholder order. This pins the order directly against the RAW
// template source (not the built output), independent of inlineVendor's
// behavior.
describe("vendor script-tag order (PR #2 I2): pins the load-bearing placeholder sequence", () => {
  const TEMPLATE = readFileSync(new URL("../src/viz-template.html", import.meta.url), "utf8");

  // Dependency order: layout-base and cose-base are fcose's UMD deps (fcose
  // requires them to already be registered); cytoscape's global must exist
  // before fcose registers against it (fcose self-registers, no .use() call);
  // the data script comes after all four vendor bundles.
  const ORDERED_PLACEHOLDERS = [
    "__VENDOR_LAYOUT_BASE__",
    "__VENDOR_COSE_BASE__",
    "__VENDOR_CYTOSCAPE__",
    "__VENDOR_FCOSE__",
    "__ASBUILT_DATA__",
  ];

  test("each placeholder is present exactly once, in strictly increasing (dependency) order", () => {
    const indexes = ORDERED_PLACEHOLDERS.map((placeholder) => {
      const first = TEMPLATE.indexOf(placeholder);
      const last = TEMPLATE.lastIndexOf(placeholder);
      expect(first).toBeGreaterThan(-1); // placeholder present
      expect(first).toBe(last); // occurs exactly once (a duplicate would make
      // inlineVendor's split/join inline that vendor bundle twice)
      return first;
    });

    for (let i = 1; i < indexes.length; i++) {
      expect(indexes[i]).toBeGreaterThan(indexes[i - 1]);
    }
  });
});
