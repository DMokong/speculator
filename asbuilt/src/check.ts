// Mechanical comprehension checks for the As-Built Knowledge System
// (SPEC-048, AC3/AC4/AC5).
//
// Replaces LLM judgment for three deterministic questions about a
// comprehension artifact's `code_locations` citations against the graph
// manifest (see manifest.ts) and the diff's touched-symbol set (slice.ts):
//   1. symbol_exists — does the cited symbol id exist in the manifest?
//   2. span_valid    — when a line range is cited, is it fully contained
//                       within the symbol's actual span (containment, not
//                       intersection)?
//   3. diff_touched / unexplained_computed — advisory cross-check between
//                       what the artifact cites and what the diff actually
//                       touched.
//
// No LLM anywhere in this module: it imports only fs, path, the local
// manifest/slice modules, and the `yaml` parser — no model-vendor client,
// no outbound network call of any kind.

import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { argValue } from "./cli";
import type { GraphManifest } from "./manifest";
import { loadManifest } from "./manifest";
import { touchedSymbols } from "./slice";

export interface MechanicalReport {
  symbol_exists: { entry: string; symbol: string }[]; // failures (blocking)
  span_valid: { entry: string; symbol: string; cited: string; actual: string }[]; // failures (blocking)
  diff_touched: { entry: string; symbol: string }[]; // advisories: cited but not touched
  unexplained_computed: string[]; // touched − cited − excluded, sorted
  blocking: boolean;
  graph_unavailable?: true; // set by callers when no manifest exists (AC8 path); never set here
}

interface CodeLocation {
  symbol: string;
  lines?: string;
}

interface ComprehensionEntry {
  ac_id: string;
  implementation_summary?: string;
  code_locations?: CodeLocation[];
}

interface ArtifactShape {
  comprehension_entries?: ComprehensionEntry[];
}

/**
 * Parses a cited `lines` value into an inclusive [start, end] range.
 *
 * Accepts "N-M" (an explicit range, with N <= M) and a bare "N" (a single
 * line number). The single-number form is accepted as shorthand for
 * "N-N" — a reasonable citation style when the cited detail is one line
 * — and is parsed as [N, N] rather than rejected.
 *
 * Returns null for anything else: non-numeric noise ("abc"), malformed
 * shapes ("-5-15"), and reversed ranges ("15-13", "20-1") where N > M.
 * Unlike a genuinely missing `lines` field (which the caller checks for
 * separately and skips entirely), a null result here means "present but
 * invalid" and the caller must treat it as a span_valid failure rather
 * than silently skipping the check.
 */
function parseLineRange(lines: string): [number, number] | null {
  const range = lines.match(/^(\d+)-(\d+)$/);
  if (range) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    return start <= end ? [start, end] : null;
  }
  const single = lines.match(/^(\d+)$/);
  if (single) {
    const n = Number(single[1]);
    return [n, n];
  }
  return null;
}

/**
 * Runs the three mechanical checks against `artifactPath`'s
 * `comprehension_entries[].code_locations[]` citations.
 *
 * - symbol_exists: a cited `symbol` absent from `manifest.symbols` is a
 *   blocking failure naming the citing entry's `ac_id` and the symbol id.
 * - span_valid: when `lines` is present on a citation whose symbol exists,
 *   the cited range must sit fully inside the symbol's actual span
 *   (containment); otherwise a blocking failure names both ranges. A
 *   *missing* `lines` field skips this check for that entry — but a
 *   *present* value that fails to parse (unparseable shape, or a reversed
 *   range like "15-13") is itself a blocking failure, not a skip.
 * - diff_touched / unexplained_computed: advisory cross-check against the
 *   diff's touched-symbol set (see slice.ts) — every cited symbol not in
 *   that set is an advisory, and every touched symbol not cited anywhere
 *   (and not in `excluded`) lands in `unexplained_computed`.
 *
 * `blocking` is true iff `symbol_exists` or `span_valid` is non-empty.
 */
export function runChecks(
  manifest: GraphManifest,
  artifactPath: string,
  targetRepo: string,
  diffRange: string,
  excluded?: string[],
): MechanicalReport {
  const artifactText = readFileSync(artifactPath, "utf8");
  const parsed = parse(artifactText) as ArtifactShape | null;
  const entries = parsed?.comprehension_entries ?? [];

  const symbolsById = new Map(manifest.symbols.map((s) => [s.id, s]));
  const touched = touchedSymbols(manifest, targetRepo, diffRange);
  const touchedSet = new Set(touched);
  const excludedSet = new Set(excluded ?? []);

  const symbol_exists: MechanicalReport["symbol_exists"] = [];
  const span_valid: MechanicalReport["span_valid"] = [];
  const diff_touched: MechanicalReport["diff_touched"] = [];
  const citedSymbols = new Set<string>();

  for (const entry of entries) {
    for (const loc of entry.code_locations ?? []) {
      const symbol = symbolsById.get(loc.symbol);
      if (!symbol) {
        symbol_exists.push({ entry: entry.ac_id, symbol: loc.symbol });
        continue;
      }

      citedSymbols.add(loc.symbol);

      if (loc.lines !== undefined) {
        const cited = parseLineRange(loc.lines);
        const [actualStart, actualEnd] = symbol.span;
        // cited === null covers both "unparseable" (e.g. "abc", "-5-15")
        // and "reversed" (e.g. "15-13") — both fail containment here
        // rather than being silently skipped like an absent field.
        const fullyContained = cited !== null && cited[0] >= actualStart && cited[1] <= actualEnd;
        if (!fullyContained) {
          span_valid.push({
            entry: entry.ac_id,
            symbol: loc.symbol,
            cited: loc.lines,
            actual: `${actualStart}-${actualEnd}`,
          });
        }
      }

      if (!touchedSet.has(loc.symbol)) {
        diff_touched.push({ entry: entry.ac_id, symbol: loc.symbol });
      }
    }
  }

  const unexplained_computed = touched.filter((id) => !citedSymbols.has(id) && !excludedSet.has(id)).sort();

  return {
    symbol_exists,
    span_valid,
    diff_touched,
    unexplained_computed,
    blocking: symbol_exists.length > 0 || span_valid.length > 0,
  };
}

export const CLI_USAGE =
  "bun asbuilt/src/check.ts --manifest <p> --artifact <p> --target <repo> --diff-range <r> [--exclude <json>]";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const manifestPath = argValue("--manifest");
  const artifactPath = argValue("--artifact");
  const target = argValue("--target");
  const diffRange = argValue("--diff-range");
  const excludePath = argValue("--exclude");

  if (!manifestPath || !artifactPath || !target || !diffRange) {
    console.error(CLI_USAGE);
    process.exit(1);
  }

  const excluded: string[] | undefined = excludePath
    ? ((JSON.parse(readFileSync(excludePath, "utf8")) as { symbols?: string[] }).symbols ?? [])
    : undefined;

  const manifest = loadManifest(manifestPath);
  const report = runChecks(manifest, artifactPath, target, diffRange, excluded);
  console.log(JSON.stringify(report, null, 2));
  if (report.blocking) {
    process.exit(1);
  }
  process.exit(0);
}
