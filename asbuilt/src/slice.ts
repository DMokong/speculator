// Diff -> touched-symbols mapper + 1-hop graph slicer for the As-Built
// Knowledge System (SPEC-048).
//
// Given a GraphManifest (see manifest.ts) and a git diff range, `touchedSymbols`
// determines which symbols' spans intersect the new-side hunks of the diff,
// and `graphSlice` expands that set to its 1-hop neighborhood (callers and
// callees) via the manifest's resolved call edges. Task 6 (mechanical checks)
// and Task 8 (generator dispatch) consume this to scope their work to what a
// change actually touched, instead of the whole repo.

import { execFileSync } from "node:child_process";
import { argValue } from "./cli";
import type { GraphManifest, SymbolEntry } from "./manifest";
import { loadManifest } from "./manifest";

type LineRange = [number, number]; // 1-based inclusive, new-side line numbers

/**
 * Parses `git diff --unified=0` output into a per-file list of new-side
 * line ranges touched by the diff's hunks.
 *
 * Hunk header shape: `@@ -a[,b] +c[,d] @@ ...`. We only care about the new
 * side (`+c[,d]`): `d` is the hunk's new-side line count, omitted by git when
 * it equals 1 (a single-line hunk is written as just `+c`, not `+c,1`).
 *
 * New-side range = `[c, c + max(d, 1) - 1]`.
 *
 * Why `max(d, 1)`: when `d === 0` the hunk is a pure deletion — every changed
 * line was on the old side, so the new side contributes zero lines and `c` is
 * really "insert before this line" rather than a real line number. Rather
 * than emitting an empty range (which would make a deletion invisible to
 * `touchedSymbols` — e.g. deleting a whole function's tail could silently
 * fail to touch that function), we treat `c` as a one-line boundary marker:
 * `[c, c]`. Any symbol whose span straddles that boundary point (the common
 * case — the symbol whose body had lines removed) still registers as
 * touched. This is a deliberate over-approximation, not an attempt at exact
 * post-deletion line accounting.
 */
function parseNewSideRanges(diffOutput: string): Map<string, LineRange[]> {
  const ranges = new Map<string, LineRange[]>();
  let currentFile: string | null = null;

  for (const line of diffOutput.split("\n")) {
    if (line.startsWith("+++ ")) {
      const path = line.slice(4).trim();
      currentFile = path === "/dev/null" ? null : path.startsWith("b/") ? path.slice(2) : path;
      continue;
    }
    if (!line.startsWith("@@") || currentFile === null) continue;
    const m = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
    if (!m) continue;
    const c = Number(m[1]);
    const d = m[2] === undefined ? 1 : Number(m[2]);
    const start = c;
    const end = c + Math.max(d, 1) - 1;
    const list = ranges.get(currentFile);
    if (list) list.push([start, end]);
    else ranges.set(currentFile, [[start, end]]);
  }

  return ranges;
}

function rangesIntersect(a: LineRange, b: LineRange): boolean {
  return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * Returns the sorted ids of every symbol in `manifest` whose span intersects
 * a new-side hunk range in `git -C targetRepo diff --unified=0 <diffRange> -- '*.ts'`.
 *
 * The manifest must have been extracted from the new side of `diffRange`
 * (i.e. from the ref/working-tree state the range diffs *to*) — line numbers
 * on the old side don't correspond to the manifest's spans.
 */
export function touchedSymbols(manifest: GraphManifest, targetRepo: string, diffRange: string): string[] {
  const diffOutput = execFileSync(
    "git",
    ["-C", targetRepo, "diff", "--unified=0", diffRange, "--", "*.ts"],
    { encoding: "utf8" },
  );
  const rangesByFile = parseNewSideRanges(diffOutput);

  const touched: string[] = [];
  for (const symbol of manifest.symbols) {
    const fileRanges = rangesByFile.get(symbol.file);
    if (!fileRanges) continue;
    if (fileRanges.some((r) => rangesIntersect(r, symbol.span))) touched.push(symbol.id);
  }

  return touched.sort();
}

/**
 * Expands `touched` to its 1-hop neighborhood via the manifest's resolved
 * call edges: for every resolved edge, if `from` is touched the callee
 * (`resolved`) joins the neighborhood, and if `resolved` is touched the
 * caller (`from`) joins the neighborhood. `files` is the sorted, deduped set
 * of files containing any neighborhood entry.
 */
export function graphSlice(
  manifest: GraphManifest,
  touched: string[],
): { touched: string[]; neighborhood: SymbolEntry[]; files: string[] } {
  const touchedSet = new Set(touched);
  const neighborIds = new Set(touched);

  for (const edge of manifest.edges) {
    if (edge.resolved === null) continue;
    if (touchedSet.has(edge.from)) neighborIds.add(edge.resolved);
    if (touchedSet.has(edge.resolved)) neighborIds.add(edge.from);
  }

  const byId = new Map(manifest.symbols.map((s): [string, SymbolEntry] => [s.id, s]));
  const neighborhood = [...neighborIds]
    .map((id) => byId.get(id))
    .filter((s): s is SymbolEntry => s !== undefined)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const files = [...new Set(neighborhood.map((s) => s.file))].sort();

  return { touched: [...touched].sort(), neighborhood, files };
}

export const CLI_USAGE = "bun asbuilt/src/slice.ts --target <repo> --manifest <path> --diff-range <range>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const target = argValue("--target");
  const manifestPath = argValue("--manifest");
  const diffRange = argValue("--diff-range");
  if (!target || !manifestPath || !diffRange) {
    console.error(CLI_USAGE);
    console.error(
      "Note: <path>'s manifest must be extracted from the NEW side of <range> (the ref/working tree the range diffs to) — old-side line numbers don't map onto its spans.",
    );
    process.exit(1);
  }
  const manifest = loadManifest(manifestPath);
  const touched = touchedSymbols(manifest, target, diffRange);
  const slice = graphSlice(manifest, touched);
  console.log(JSON.stringify(slice, null, 2));
}
