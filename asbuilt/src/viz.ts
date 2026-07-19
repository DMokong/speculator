// OKF bundle → self-contained knowledge-graph visualize sheet (viz.html).
// Productized from the origin-repo prototype (claw-n5a6 → claw-efne): reads an
// As-Built OKF bundle (docs/asbuilt/) plus its graph manifest and renders
// viz-template.html with the bundle data embedded as a single JSON block —
// output is one self-contained HTML file that travels with the bundle (the
// "visualize pattern" from the 2026-07-04 design doc). Unlike graphify-check's
// --html (which needs the external graphify binary), this renders from the
// bundle + manifest alone.
//
// No timestamps are read from the clock — the sheet date comes from --date,
// mirroring log.md's convention. Output is deterministic: concepts and links
// are codepoint-sorted, so identical inputs produce byte-identical sheets.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { argValue } from "./cli";

interface VizFrontmatter {
  type: string;
  title: string;
  description: string;
  resource: string;
  tags: string[];
  enrichment: string;
  from: string[];
  explains: string[];
  stale: boolean;
}

/** Minimal parser for the flat skeleton/fold frontmatter (strings + string lists). */
function parseVizFrontmatter(lines: string[]): VizFrontmatter {
  const fm: Record<string, string | string[] | boolean> = {};
  let listKey: string | null = null;
  for (const line of lines) {
    const item = line.match(/^\s+-\s+(.*)$/);
    if (item && listKey) {
      (fm[listKey] as string[]).push((item[1] ?? "").trim());
      continue;
    }
    const kv = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1] as string;
    const raw = kv[2] as string;
    if (raw === "") {
      fm[key] = [];
      listKey = key;
    } else if (raw === "[]") {
      fm[key] = [];
      listKey = null;
    } else {
      const v = raw.replace(/^["']|["']$/g, "");
      fm[key] = v === "true" ? true : v === "false" ? false : v;
      listKey = null;
    }
  }
  // List fields must reach consumers as real arrays: a scalar spelling
  // (`tags: test`) parses as a string, and a bare `as string[]` cast would
  // launder it through to the template, where `n.tags.join` throws and kills
  // the whole client script (search included). Wrap scalars, drop non-strings.
  const list = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []);
  const str = (v: unknown, fallback = ""): string => (typeof v === "string" ? v : fallback);
  return {
    type: str(fm.type, "Module"),
    title: str(fm.title),
    description: str(fm.description),
    resource: str(fm.resource),
    tags: list(fm.tags),
    enrichment: str(fm.enrichment, "none"),
    from: list(fm.from),
    explains: list(fm.explains),
    stale: fm.stale === true,
  };
}

export interface VizExportEntry {
  name: string;
  kind: string;
  lines: string;
}

export interface VizConceptNode {
  id: string; // resource path, e.g. "src/tools/recall.ts"
  concept: string; // bundle-relative concept path, e.g. "src/tools/recall.md"
  title: string;
  type: string;
  group: string;
  test: boolean;
  description: string;
  tags: string[];
  enrichment: string;
  from: string[];
  explains: string[];
  stale: boolean;
  symbols: number;
  exports: VizExportEntry[];
  explanation: string;
  decisions: string[];
}

function sectionBody(body: string, heading: string): string {
  const re = new RegExp(`^# ${heading}\\s*$`, "m");
  const m = re.exec(body);
  if (!m) return "";
  const rest = body.slice(m.index + m[0].length);
  const next = rest.search(/^# /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function walkMd(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkMd(p, out);
    else if (name.endsWith(".md")) out.push(p);
  }
  return out;
}

/** Classification-driven: a concept is a test iff the toolchain classified it
 * so (type: Test / test tag) — never by path shape (claw-wsit: a
 * startsWith("tests/") heuristic missed co-located tests). */
function isTestConcept(fm: { type?: string; tags?: string[] }): boolean {
  return fm.type === "Test" || (Array.isArray(fm.tags) && fm.tags.includes("test"));
}

function groupOf(resource: string): string {
  const parts = resource.split("/");
  return parts.length > 2 ? parts.slice(0, 2).join("/") : "src";
}

export interface VizLink {
  source: string;
  target: string;
  w: number;
}

/** Cytoscape.js element: a compound-parent (`dir:${group}`), a child node, or
 * an edge — three distinct shapes, not one interface with everything
 * optional. Parents carry only id/label (no classes, no parent). Child nodes
 * add parent/label/test/d and always carry a state class (`classes` is
 * required — every child gets skeleton/accuracy/full, optionally " test").
 * Edges add source/target/w and their own deterministic id; toElements never
 * emits `classes` on them (kept optional because the client toggles `.dim`
 * on edges at runtime — the template styles edges via the plain `edge`
 * selector reading client-computed `data(ew)`/`data(eo)`, plus that class).
 * Note the arms share no discriminant field, so TypeScript's excess-property
 * relaxation for union literals still admits mixed shapes (e.g. a classless
 * child written as a literal); narrowing needs runtime predicates (`"parent"
 * in e.data`), and the arm-shape guarantees hold for values produced by
 * toElements, not for arbitrary hand-written literals. */
export interface CyParentElement {
  data: { id: string; label: string };
}

export interface CyChildElement {
  data: { id: string; parent: string; label: string; test: boolean; d: number };
  classes: string;
}

export interface CyEdgeElement {
  data: { id: string; source: string; target: string; w: number };
  classes?: string;
}

export type CyElement = CyParentElement | CyChildElement | CyEdgeElement;

/** Mirrors the template's client-side `stateOf` (viz-template.html) so the
 * embedded elements carry the same skeleton/accuracy/full classification the
 * table view and legend already use. The audited states are an explicit
 * allowlist (fold.ts's provenance enum): an unknown or typo'd enrichment
 * value renders as skeleton — falling through to "full" would inflate the
 * deepest-audited state, masking bad data in exactly the misleading
 * direction for a tool whose job is honest audit reporting (PR #2 review). */
const AUDITED_STATES = new Set(["accuracy-audited", "fully-audited"]);
function stateOf(enrichment: string): string {
  return enrichment === "fully-audited" ? "full" : enrichment === "accuracy-audited" ? "accuracy" : "skeleton";
}

/** Cytoscape elements for the compound-group render: one parent per group
 * (codepoint-sorted), then child nodes (sorted by id), then edges (sorted
 * source→target) — deterministic order so the embedding stays byte-stable
 * across identical inputs (SPEC-004 T04). */
export function toElements(nodes: VizConceptNode[], links: VizLink[]): CyElement[] {
  const groups = [...new Set(nodes.map((n) => n.group))].sort();
  const parents: CyParentElement[] = groups.map((group) => ({
    data: { id: `dir:${group}`, label: group },
  }));

  const childNodes: CyChildElement[] = [...nodes]
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((n) => ({
      data: {
        id: n.id,
        parent: `dir:${n.group}`,
        label: basename(n.id),
        test: n.test,
        d: 2 * (4 + 2.3 * Math.sqrt(n.symbols || 1)),
      },
      classes: stateOf(n.enrichment) + (n.test ? " test" : ""),
    }));

  const edges: CyEdgeElement[] = [...links]
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : a.target > b.target ? 1 : 0))
    .map((l) => ({
      data: { id: `${l.source}->${l.target}`, source: l.source, target: l.target, w: l.w },
    }));

  return [...parents, ...childNodes, ...edges];
}

const VENDOR_PLACEHOLDERS: [placeholder: string, name: string, file: string][] = [
  ["__VENDOR_LAYOUT_BASE__", "layout-base", "layout-base.js"],
  ["__VENDOR_COSE_BASE__", "cose-base", "cose-base.js"],
  ["__VENDOR_CYTOSCAPE__", "cytoscape", "cytoscape.min.js"],
  ["__VENDOR_FCOSE__", "fcose", "cytoscape-fcose.js"],
];

/** Inlines the vendored Cytoscape/fcose UMDs into the template at the four
 * placeholders, wrapped in `/*VENDOR:<name>:start|end*\/` marker comments (T06
 * byte-compares those regions against `asbuilt/vendor/`). Uses split/join,
 * never `String.replace` — minified vendor code contains `$`-sequences
 * (e.g. `$&`) that `String.replace`'s special replacement-pattern handling
 * would corrupt. A missing or renamed placeholder is a build error, not a
 * skip: silently continuing would ship a dead viewer with exit 0 (PR #2
 * review). The residual scan below is safe precisely because this runs on
 * the raw template BEFORE bundle data is interpolated — bundle content that
 * legitimately mentions a `__VENDOR_*__` string can never reach it. */
export function inlineVendor(template: string): string {
  let out = template;
  for (const [placeholder, name, file] of VENDOR_PLACEHOLDERS) {
    if (!out.includes(placeholder)) {
      throw new Error(
        `inlineVendor: template is missing the ${placeholder} slot — a template edit renamed or dropped it; refusing to emit a viewer without ${name}`,
      );
    }
    const content = readFileSync(new URL(`../vendor/${file}`, import.meta.url), "utf8");
    const wrapped = `/*VENDOR:${name}:start*/${content}/*VENDOR:${name}:end*/`;
    out = out.split(placeholder).join(wrapped);
  }
  const residual = out.match(/__VENDOR_[A-Z_]+__/);
  if (residual) {
    throw new Error(`inlineVendor: unreplaced vendor placeholder ${residual[0]} remains in the template`);
  }
  return out;
}

export interface VizResult {
  html: string;
  concepts: number;
  audited: number;
  fileLinks: number;
  resolvedEdges: number;
}

/** Re-extracts the `<script id="asbuilt-data" type="application/json">…</script>`
 * region from a built visualize sheet and `JSON.parse`s it, throwing if the
 * tag is missing, the content fails to parse, or the parsed object lacks
 * `meta`/`elements`. When `expected` is given, additionally requires the
 * re-parsed data to re-stringify byte-identically to the source object —
 * only with that check does the guard catch interpolation bugs that yield
 * valid-but-wrong JSON. `buildViz` calls this immediately after
 * interpolation, passing `expected`, so a data-interpolation bug cannot
 * ship a silently corrupted DATA block with exit code 0 (PR #2 review C1).
 * Scope is the `asbuilt-data` region only: `__PROJECT__` substitution and
 * the vendor regions are guarded separately (presence asserts in `buildViz`
 * / `inlineVendor` plus the vendor-provenance byte-compare tests), not by
 * this round-trip. Two stringify-sized passes, no clock reads, no
 * randomness — cheap and deterministic. */
export function assertDataRoundTrip(html: string, expected?: unknown): void {
  const m = html.match(/<script id="asbuilt-data" type="application\/json">([\s\S]*?)<\/script>/);
  if (!m) throw new Error("assertDataRoundTrip: <script id=\"asbuilt-data\"> region not found in built html");
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[1] as string);
  } catch (err) {
    throw new Error(`assertDataRoundTrip: embedded data failed JSON.parse: ${(err as Error).message}`);
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    !("meta" in parsed) ||
    !("elements" in parsed)
  ) {
    throw new Error("assertDataRoundTrip: parsed data is missing meta/elements");
  }
  if (expected !== undefined && JSON.stringify(parsed) !== JSON.stringify(expected)) {
    throw new Error(
      "assertDataRoundTrip: embedded data does not round-trip byte-identically to the source bundle data",
    );
  }
}

/** Build the visualize sheet from a bundle + manifest. Pure function of the
 * on-disk bundle state and the given date — deterministic by construction. */
export function buildViz(targetRepo: string, date: string): VizResult {
  const bundleDir = join(targetRepo, "docs/asbuilt");
  const manifestPath = join(bundleDir, ".graph-manifest.json");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    target_commit: string;
    symbols: { id: string; file: string }[];
    edges: { from: string; toName: string; resolved: string | null }[];
  };
  // Validate at the read boundary: a manifest missing target_commit would
  // otherwise build "successfully" (JSON.stringify drops undefined on both
  // sides of the round-trip guard) and only throw later in the browser at
  // meta.target_commit.slice (PR #2 review).
  if (typeof manifest.target_commit !== "string" || manifest.target_commit === "") {
    throw new Error(`buildViz: ${manifestPath} is missing target_commit`);
  }
  if (!Array.isArray(manifest.symbols) || !Array.isArray(manifest.edges)) {
    throw new Error(`buildViz: ${manifestPath} is missing symbols/edges arrays`);
  }

  const symbolCountByFile = new Map<string, number>();
  for (const s of manifest.symbols) {
    symbolCountByFile.set(s.file, (symbolCountByFile.get(s.file) ?? 0) + 1);
  }

  const nodes: VizConceptNode[] = [];
  for (const path of walkMd(bundleDir)) {
    // Normalize CRLF before the delimiter checks: a bundle checked out with
    // Windows line endings would otherwise fail `startsWith("---\n")` on
    // every concept and ship a professional-looking blank sheet (PR #2
    // review C2). Normalizing the whole text (not just the frontmatter) is
    // deliberate — section extraction below uses `^`-anchored regexes that
    // are equally CRLF-blind.
    const text = readFileSync(path, "utf8").replace(/\r\n/g, "\n");
    if (!text.startsWith("---\n")) continue;
    const end = text.indexOf("\n---\n", 4);
    if (end === -1) continue;
    const fm = parseVizFrontmatter(text.slice(4, end).split("\n"));
    if (!fm.resource) continue; // dir indexes, log.md, root index.md
    const body = text.slice(end + 5);

    const exports: VizExportEntry[] = [];
    const exportsBlock = body.split(/^## Exports\s*$/m)[1]?.split(/^#+ /m)[0] ?? "";
    for (const line of exportsBlock.split("\n")) {
      const m = line.match(/^- `([^`]+)` \(([a-z]+), lines (\d+-\d+)\)/);
      if (m) exports.push({ name: m[1] as string, kind: m[2] as string, lines: m[3] as string });
    }

    nodes.push({
      id: fm.resource,
      concept: relative(bundleDir, path),
      title: fm.title,
      type: fm.type,
      group: groupOf(fm.resource), // SPEC-004: grouping is ALWAYS path-derived; the
      // hardcoded "tests" spatial bucket dies — classification (below) stays
      // frontmatter-driven, separately from where a concept sits in the tree.
      test: isTestConcept(fm),
      description: fm.description,
      tags: fm.tags,
      enrichment: fm.enrichment,
      from: fm.from,
      explains: fm.explains,
      stale: fm.stale,
      symbols: symbolCountByFile.get(fm.resource) ?? 0,
      exports,
      explanation: sectionBody(body, "Explanation"),
      decisions: sectionBody(body, "Decisions")
        .split(/^- /m)
        .map((s) => s.trim())
        .filter(Boolean),
    });
  }

  // Zero parsed concepts is never a sheet worth shipping: the bundle is
  // either empty or (more likely) malformed in a way the per-file skip
  // conditions can't distinguish from intentional non-concept files. Throw
  // rather than exit 0 with a blank canvas (PR #2 review C2).
  if (nodes.length === 0) {
    throw new Error(
      `buildViz: no concepts parsed from ${bundleDir} — bundle is empty or its frontmatter is malformed (every .md was skipped)`,
    );
  }

  // File-level call edges: resolved symbol→symbol edges collapsed to file→file.
  const fileOf = (symbolId: string) => symbolId.split("#")[0] as string;
  const known = new Set(nodes.map((n) => n.id));
  const linkWeight = new Map<string, number>();
  let resolvedEdges = 0;
  for (const e of manifest.edges) {
    if (!e.resolved) continue;
    resolvedEdges++;
    const s = fileOf(e.from);
    const t = fileOf(e.resolved);
    if (s === t || !known.has(s) || !known.has(t)) continue;
    const key = `${s}\0${t}`;
    linkWeight.set(key, (linkWeight.get(key) ?? 0) + 1);
  }
  const links = [...linkWeight.entries()]
    .map(([key, w]) => {
      const [source, targetId] = key.split("\0");
      return { source: source as string, target: targetId as string, w };
    })
    .sort((a, b) => (a.source < b.source ? -1 : a.source > b.source ? 1 : a.target < b.target ? -1 : 1));

  const data = {
    meta: {
      project: basename(targetRepo),
      okf_version: "0.1",
      target_commit: manifest.target_commit,
      date,
      concepts: nodes.length,
      // Explicit allowlist, not `!== "none"`: an unknown enrichment value
      // must not count as audited (same rationale as stateOf).
      audited: nodes.filter((n) => AUDITED_STATES.has(n.enrichment)).length,
      symbols: manifest.symbols.length,
      resolved_edges: resolvedEdges,
      file_links: links.length,
      folds: nodes
        .flatMap((n) => n.from)
        .filter((v, i, a) => a.indexOf(v) === i)
        .sort(),
    },
    nodes,
    links,
    elements: toElements(nodes, links),
  };

  const template = readFileSync(new URL("viz-template.html", import.meta.url), "utf8");
  const withVendor = inlineVendor(template);
  // Presence asserts run BEFORE interpolation (a post-interpolation residual
  // scan would false-positive on bundle content that legitimately mentions
  // these strings — this repo's own asbuilt bundle documents this file). A
  // renamed slot must fail the build, not ship a sheet with a hole in it.
  for (const slot of ["__PROJECT__", "__ASBUILT_DATA__"]) {
    if (!withVendor.includes(slot)) {
      throw new Error(`buildViz: template is missing the ${slot} slot — a template edit renamed or dropped it`);
    }
  }
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const projectName = basename(targetRepo);
  // Split/join, never `String.replace`/`replaceAll` with a string argument:
  // the latter treats `$$`, `$&`, `` $` ``, `$'` inside the replacement
  // string as substitution patterns, so bundle JSON or a project name
  // containing those sequences would otherwise silently corrupt the
  // embedded data (PR #2 review C1). Same convention `inlineVendor` already
  // uses for vendor code, applied here to the data/project placeholders.
  const html = withVendor.split("__PROJECT__").join(projectName).split("__ASBUILT_DATA__").join(json);
  // Build-time invariant: a corrupted DATA block cannot ship with exit
  // code 0 (PR #2 review C1). Passing `data` upgrades the guard from
  // parse-level to a byte-identical content round-trip (blinded-review
  // finding, 2026-07-18). Vendor regions and __PROJECT__ are covered by the
  // presence asserts above and the vendor-provenance tests, not by this
  // round-trip — a template bug outside the data block is caught at those
  // layers or not at all.
  assertDataRoundTrip(html, data);
  return {
    html,
    concepts: nodes.length,
    audited: data.meta.audited,
    fileLinks: links.length,
    resolvedEdges,
  };
}

export const CLI_USAGE = "bun asbuilt/src/viz.ts --target <repo> --date YYYY-MM-DD [--out <path>]";

// CLI entry guard — no module-level side effects (see claw-8cjf.2).
if (import.meta.main) {
  const target = argValue("--target");
  const date = argValue("--date");
  if (!target || !date) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const out = argValue("--out") ?? join(target, "docs/asbuilt/viz.html");
  const result = buildViz(target, date);
  writeFileSync(out, result.html);
  console.log(
    `viz: ${result.concepts} concepts (${result.audited} audited), ${result.fileLinks} file links from ${result.resolvedEdges} resolved edges → ${out}`,
  );
  process.exit(0);
}
