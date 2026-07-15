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
  return {
    type: (fm.type as string) ?? "Module",
    title: (fm.title as string) ?? "",
    description: (fm.description as string) ?? "",
    resource: (fm.resource as string) ?? "",
    tags: (fm.tags as string[]) ?? [],
    enrichment: (fm.enrichment as string) ?? "none",
    from: (fm.from as string[]) ?? [],
    explains: (fm.explains as string[]) ?? [],
    stale: (fm.stale as boolean) ?? false,
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
 * an edge. Field presence varies by kind — parents carry only id/label, child
 * nodes add parent/label/test/d + a state class, edges add source/target/w. */
export interface CyElement {
  data: {
    id: string;
    parent?: string;
    label?: string;
    test?: boolean;
    d?: number;
    source?: string;
    target?: string;
    w?: number;
  };
  classes?: string;
}

/** Mirrors the template's client-side `stateOf` (viz-template.html) so the
 * embedded elements carry the same skeleton/accuracy/full classification the
 * table view and legend already use. */
function stateOf(enrichment: string): string {
  return enrichment === "none" ? "skeleton" : enrichment === "accuracy-audited" ? "accuracy" : "full";
}

/** Cytoscape elements for the compound-group render: one parent per group
 * (codepoint-sorted), then child nodes (sorted by id), then edges (sorted
 * source→target) — deterministic order so the embedding stays byte-stable
 * across identical inputs (SPEC-004 T04). */
export function toElements(nodes: VizConceptNode[], links: VizLink[]): CyElement[] {
  const groups = [...new Set(nodes.map((n) => n.group))].sort();
  const parents: CyElement[] = groups.map((group) => ({
    data: { id: `dir:${group}`, label: group },
  }));

  const childNodes: CyElement[] = [...nodes]
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

  const edges: CyElement[] = [...links]
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
 * would corrupt. A no-op (byte-identical return) when no placeholders are
 * present, which is the case for the current template until T05 lands. */
export function inlineVendor(template: string): string {
  let out = template;
  for (const [placeholder, name, file] of VENDOR_PLACEHOLDERS) {
    if (!out.includes(placeholder)) continue;
    const content = readFileSync(new URL(`../vendor/${file}`, import.meta.url).pathname, "utf8");
    const wrapped = `/*VENDOR:${name}:start*/${content}/*VENDOR:${name}:end*/`;
    out = out.split(placeholder).join(wrapped);
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

/** Build the visualize sheet from a bundle + manifest. Pure function of the
 * on-disk bundle state and the given date — deterministic by construction. */
export function buildViz(targetRepo: string, date: string): VizResult {
  const bundleDir = join(targetRepo, "docs/asbuilt");
  const manifest = JSON.parse(readFileSync(join(bundleDir, ".graph-manifest.json"), "utf8")) as {
    target_commit: string;
    symbols: { id: string; file: string }[];
    edges: { from: string; toName: string; resolved: string | null }[];
  };

  const symbolCountByFile = new Map<string, number>();
  for (const s of manifest.symbols) {
    symbolCountByFile.set(s.file, (symbolCountByFile.get(s.file) ?? 0) + 1);
  }

  const nodes: VizConceptNode[] = [];
  for (const path of walkMd(bundleDir)) {
    const text = readFileSync(path, "utf8");
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
      audited: nodes.filter((n) => n.enrichment !== "none").length,
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

  const template = readFileSync(new URL("viz-template.html", import.meta.url).pathname, "utf8");
  const withVendor = inlineVendor(template);
  const json = JSON.stringify(data).replace(/<\//g, "<\\/");
  const html = withVendor.replaceAll("__PROJECT__", basename(targetRepo)).replace("__ASBUILT_DATA__", json);
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
