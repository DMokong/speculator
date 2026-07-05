// OKF v0.1 skeleton bundle generator for the As-Built Knowledge System (SPEC-048).
//
// Renders a GraphManifest (see manifest.ts) into a git-native OKF v0.1 bundle
// at <targetRepo>/docs/asbuilt/: one "Module" concept per source file (pure
// machine zone, zero LLM-generated prose), per-directory index.md files, and
// a root index.md carrying the bundle's okf_version. This is the surface
// Task 4 (conformance checker) validates and Task 8's agents read — see
// docs/specs/asbuilt-knowledge-system/spec.md R2/AC2 and task-3-brief.md for
// the exact shape.

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argValue } from "./cli";
import { deriveTags, renderFrontmatter } from "./concept";
import { type CallEdge, type GraphManifest, type SymbolEntry, loadManifest, manifestHash } from "./manifest";

const OKF_VERSION = "0.1";

// Basenames (sans extension) that collide with the bundle's reserved
// per-directory files (verify.ts's RESERVED_BASENAMES: "index.md", "log.md").
const RESERVED_STEMS = new Set(["index", "log"]);

/**
 * "<file>.ts" -> "<file>.md" — bundle-relative concept path (no leading
 * slash).
 *
 * Reserved-name collision guard (SPEC-049 T7 dogfood find): a source file
 * whose basename without extension is exactly "index" or "log" (e.g.
 * src/index.ts, src/util/log.ts) would otherwise map to the SAME path as
 * that directory's reserved index.md / log.md file. generateBundle writes
 * concept files first and per-directory indexes second, so the directory
 * index silently clobbered the concept on disk — the concept vanished from
 * the bundle with no error (SPEC-048's r2mcp bundle shipped 98 real
 * concepts labeled as 99 for exactly this reason: src/index.ts's concept
 * was overwritten by src/index.md's directory index). For these two
 * reserved stems only, the mapping appends ".md" to the FULL filename
 * instead of replacing the extension, so it can never collide with a
 * reserved path: src/index.ts -> src/index.ts.md, src/log.ts ->
 * src/log.ts.md, deeper/index.ts -> deeper/index.ts.md. Every other file
 * keeps the general replace-extension mapping unchanged: src/alpha.ts ->
 * src/alpha.md. This is the single mapping function — every caller
 * (generateBundle, renderConcept's cross-links, writeIndexes' directory
 * listings, refresh.ts's concept resolution) goes through it, so fixing it
 * here fixes the collision everywhere at once.
 */
export function conceptPath(file: string): string {
  const slash = file.lastIndexOf("/");
  const base = slash === -1 ? file : file.slice(slash + 1);
  const dot = base.lastIndexOf(".");
  const stem = dot === -1 ? base : base.slice(0, dot);
  if (RESERVED_STEMS.has(stem)) {
    return `${file}.md`;
  }
  return file.replace(/\.ts$/, ".md");
}

function qualifiedName(id: string): string {
  return id.split("#")[1] ?? id;
}

function fileOf(id: string): string {
  return id.split("#")[0] ?? id;
}

function description(file: string, symbolCount: number): string {
  return `Skeleton concept for ${file} (extracted; ${symbolCount} symbols).`;
}

function isResolved(e: CallEdge): e is CallEdge & { resolved: string } {
  return e.resolved !== null;
}

function renderExportsBlock(symbols: SymbolEntry[]): string | null {
  const exported = symbols.filter((s) => s.exported && s.kind !== "method");
  if (exported.length === 0) return null;
  const lines = exported.map((s) => `- \`${qualifiedName(s.id)}\` (${s.kind}, lines ${s.span[0]}-${s.span[1]})`);
  return `## Exports\n${lines.join("\n")}`;
}

function renderSymbolsBlock(symbols: SymbolEntry[]): string {
  const rows = symbols.map(
    (s) => `| \`${qualifiedName(s.id)}\` | ${s.kind} | ${s.span[0]}-${s.span[1]} | ${s.exported ? "yes" : "no"} |`,
  );
  return `## Symbols\n| Symbol | Kind | Span | Exported |\n|---|---|---|---|\n${rows.join("\n")}`;
}

/** Edges whose `from` symbol lives in this file and that resolved to a real target. */
function renderCallsOutBlock(file: string, symbols: SymbolEntry[], edges: CallEdge[]): string | null {
  const idsInFile = new Set(symbols.map((s) => s.id));
  const outgoing = edges.filter(isResolved).filter((e) => idsInFile.has(e.from));
  if (outgoing.length === 0) return null;
  const lines = outgoing.map((e) => {
    const targetFile = fileOf(e.resolved);
    const targetName = qualifiedName(e.resolved);
    const target = targetFile === file ? `\`${targetName}\` (same file)` : `[${targetName}](/${conceptPath(targetFile)})`;
    return `- \`${qualifiedName(e.from)}\` → ${target}`;
  });
  return `## Calls out\n${lines.join("\n")}`;
}

/** Resolved edges from other files pointing into this file's symbols. */
function renderCalledByBlock(file: string, symbols: SymbolEntry[], edges: CallEdge[]): string | null {
  const idsInFile = new Set(symbols.map((s) => s.id));
  const incoming = edges.filter(isResolved).filter((e) => idsInFile.has(e.resolved) && fileOf(e.from) !== file);
  if (incoming.length === 0) return null;
  const lines = incoming.map((e) => {
    const callerFile = fileOf(e.from);
    return `- \`${qualifiedName(e.from)}\` in [${callerFile}](/${conceptPath(callerFile)})`;
  });
  return `## Called by\n${lines.join("\n")}`;
}

/** Symbols belonging to `file`, in the manifest's id-sort order (see `groupSymbolsByFile`). */
function symbolsOf(file: string, manifest: GraphManifest): SymbolEntry[] {
  return manifest.symbols.filter((s) => s.file === file).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function renderBlocks(file: string, symbols: SymbolEntry[], edges: CallEdge[]): string {
  const blocks = [
    "# Structure",
    renderExportsBlock(symbols),
    renderSymbolsBlock(symbols),
    renderCallsOutBlock(file, symbols, edges),
    renderCalledByBlock(file, symbols, edges),
  ].filter((b): b is string => b !== null);
  return blocks.join("\n\n");
}

/**
 * Renders exactly the "# Structure"...zone of `file`'s concept — the pure
 * machine-derived portion generateBundle writes, with no frontmatter and no
 * enriched-zone prose. Task 3 (refresh.ts) reuses this verbatim to detect and
 * rewrite machine-zone drift without touching any enriched zone alongside it.
 */
export function renderMachineZone(file: string, manifest: GraphManifest): string {
  return renderBlocks(file, symbolsOf(file, manifest), manifest.edges);
}

/**
 * Renders a full skeleton concept (frontmatter + machine zone) for `file`,
 * exactly as generateBundle writes it for a freshly-extracted file. Task 3
 * (refresh.ts) reuses this verbatim for newly-discovered files.
 *
 * Frontmatter is rendered via concept.ts's shared `renderFrontmatter` (SPEC-
 * 049 Task 4 consolidation) with `tags` freshly derived from the manifest
 * (see `deriveTags`) and no `stale_reason` key at all — a freshly-generated
 * concept has never been folded or refreshed, so there is no staleness
 * reason to report yet; this is the OKF-optional-field omission the root
 * index.md's conformance note documents.
 */
export function renderConcept(file: string, manifest: GraphManifest): string {
  const symbols = symbolsOf(file, manifest);
  const hash = manifestHash(manifest);
  const frontmatter = renderFrontmatter({
    type: "Module",
    title: file,
    description: description(file, symbols.length),
    resource: file,
    tags: deriveTags(file, manifest),
    enrichment: "none",
    from: [],
    explains: [],
    stale: false,
    graph_hash: hash,
  });
  return `${frontmatter}\n${renderBlocks(file, symbols, manifest.edges)}\n`;
}

function dirOf(file: string): string {
  const idx = file.lastIndexOf("/");
  return idx === -1 ? "." : file.slice(0, idx);
}

function parentDir(dir: string): string {
  if (dir === ".") return ".";
  const idx = dir.lastIndexOf("/");
  return idx === -1 ? "." : dir.slice(0, idx);
}

function ancestorDirs(dir: string): string[] {
  if (dir === ".") return ["."];
  const parts = dir.split("/");
  const dirs: string[] = [];
  for (let i = parts.length; i >= 1; i--) dirs.push(parts.slice(0, i).join("/"));
  dirs.push(".");
  return dirs;
}

function stripDirPrefix(dir: string, path: string): string {
  return dir === "." ? path : path.slice(dir.length + 1);
}

function collectDirs(files: string[]): Set<string> {
  const dirs = new Set<string>(["."]);
  for (const file of files) {
    for (const d of ancestorDirs(dirOf(file))) dirs.add(d);
  }
  return dirs;
}

interface ConceptMeta {
  title: string;
  description: string;
}

/** OKF §6 directory index: `# Concepts` list of concept files, then child directories. */
function renderDirIndex(
  dir: string,
  allDirs: Set<string>,
  filesByDir: Map<string, string[]>,
  meta: Map<string, ConceptMeta>,
  allFiles: string[],
): string {
  const directFiles = (filesByDir.get(dir) ?? []).slice().sort();
  const childDirs = [...allDirs].filter((d) => d !== dir && parentDir(d) === dir).sort();

  const lines: string[] = [];
  for (const file of directFiles) {
    const m = meta.get(file);
    if (!m) continue;
    const rel = stripDirPrefix(dir, conceptPath(file));
    lines.push(`* [${m.title}](${rel}) - ${m.description}`);
  }
  for (const child of childDirs) {
    const relName = `${stripDirPrefix(dir, child)}/`;
    const count = allFiles.filter((f) => f.startsWith(`${child}/`)).length;
    lines.push(`* [${relName}](${relName}) - ${count} concepts`);
  }

  const body = `# Concepts\n${lines.join("\n")}`;
  if (dir === ".") {
    // Root-only conformance note (SPEC-049 Task 4, R6): concepts never carry
    // OKF's optional timestamp field, so regeneration from the same
    // manifest is always byte-deterministic — OKF v0.1 §4.1 explicitly
    // permits omitting optional fields. Documented once, here, rather than
    // per-concept.
    const conformanceNote =
      "> Conformance note: concepts omit the optional OKF timestamp field — regeneration is byte-deterministic by design (OKF v0.1 §4.1 permits this).";
    return `---\nokf_version: "${OKF_VERSION}"\n---\n\n${body}\n\n${conformanceNote}\n`;
  }
  return `${body}\n`;
}

/** Groups symbols by file, preserving manifest's id-sort order within each group. */
function groupSymbolsByFile(symbols: SymbolEntry[]): Map<string, SymbolEntry[]> {
  const sorted = [...symbols].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const map = new Map<string, SymbolEntry[]>();
  for (const s of sorted) {
    const list = map.get(s.file);
    if (list) list.push(s);
    else map.set(s.file, [s]);
  }
  return map;
}

interface BundleMeta {
  files: string[];
  meta: Map<string, ConceptMeta>;
}

/** Sorted file list + per-file title/description, derived purely from `manifest`. Shared by generateBundle and writeIndexes so both always agree on the same file/meta set. */
function buildBundleMeta(manifest: GraphManifest): BundleMeta {
  const byFile = groupSymbolsByFile(manifest.symbols);
  const files = [...byFile.keys()].sort();
  const meta = new Map<string, ConceptMeta>();
  for (const file of files) {
    const symbols = byFile.get(file);
    if (!symbols) continue;
    meta.set(file, { title: file, description: description(file, symbols.length) });
  }
  return { files, meta };
}

/**
 * Writes every index.md in the bundle (root + one per directory) from
 * `manifest`'s current file set — the OKF §6 directory indexes generateBundle
 * writes. Exported so Task 3 (refresh.ts) can regenerate ALL indexes from a
 * fresh manifest without duplicating this traversal.
 */
export function writeIndexes(targetRepo: string, manifest: GraphManifest): void {
  const bundleDir = join(targetRepo, "docs/asbuilt");
  const { files, meta } = buildBundleMeta(manifest);

  const filesByDir = new Map<string, string[]>();
  for (const file of files) {
    const d = dirOf(file);
    const list = filesByDir.get(d);
    if (list) list.push(file);
    else filesByDir.set(d, [file]);
  }
  const allDirs = collectDirs(files);
  for (const dir of allDirs) {
    const content = renderDirIndex(dir, allDirs, filesByDir, meta, files);
    const outPath = dir === "." ? join(bundleDir, "index.md") : join(bundleDir, dir, "index.md");
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content);
  }
}

/**
 * Writes an OKF v0.1 skeleton bundle for `manifest` under
 * `<targetRepo>/docs/asbuilt/`. Pure function of the manifest — no
 * timestamps, no LLM calls; re-running with the same manifest reproduces
 * byte-identical output.
 */
export function generateBundle(targetRepo: string, manifest: GraphManifest): void {
  const bundleDir = join(targetRepo, "docs/asbuilt");
  const { files } = buildBundleMeta(manifest);

  for (const file of files) {
    const content = renderConcept(file, manifest);
    const outPath = join(bundleDir, conceptPath(file));
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, content);
  }

  writeIndexes(targetRepo, manifest);

  mkdirSync(bundleDir, { recursive: true });
  writeFileSync(join(bundleDir, ".gitignore"), ".graph/\n");
}

export const CLI_USAGE = "bun asbuilt/src/skeleton.ts --target <repo>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const target = argValue("--target");
  if (!target) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const manifestPath = join(target, "docs/asbuilt/.graph-manifest.json");
  if (!existsSync(manifestPath)) {
    console.error(
      `No graph manifest found at ${manifestPath}. Run 'bun src/extract.ts --target ${target}' first.`,
    );
    process.exit(1);
  }
  const manifest = loadManifest(manifestPath);
  generateBundle(target, manifest);
  console.log(`Wrote OKF skeleton bundle to ${join(target, "docs/asbuilt")}`);
}
