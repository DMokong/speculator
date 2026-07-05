// Real-Graphify cross-validation lane for the As-Built Knowledge System
// (SPEC-049 Task 5, AC6).
//
// extract.ts and the pinned third-party `graphifyy` tool are two
// independent tree-sitter-based pipelines. This module runs the real
// `graphify` binary (0.9.6 pinned) against the same tracked-file set
// extract.ts consumes, and diffs its output against our own GraphManifest
// — an advisory cross-check, never a blocking gate. `graphifyy` is an
// optional dependency of the *workstation*, not of this repo: when it isn't
// installed, this module reports that loudly and exits clean rather than
// failing the build.
//
// No LLM anywhere in this module.

import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { argValue, hasFlag } from "./cli";
import { listTsFiles } from "./extract";
import type { GraphManifest, SymbolKind } from "./manifest";
import { loadManifest } from "./manifest";

const PINNED_EXPECTED = "0.9.6";

export interface InteropReport {
  graphify_version: string | null; // raw --version output line, null when unavailable
  pinned_expected: "0.9.6";
  graphify_unavailable?: true;
  version_mismatch?: true; // advisory: graphify_version doesn't contain pinned_expected
  files_compared: number;
  symbols_matched: number;
  symbols_manifest_only: { id: string }[]; // advisory
  types_not_compared: number; // manifest symbols of kind interface|type|enum — excluded from matching entirely
  nodes_graphify_only: { id: string; file: string }[]; // advisory (filtered to manifest files)
  calls_matched: number;
  calls_unmatched: { from: string; toName: string; side: "graphify" | "manifest" }[]; // advisory; manifest-side entries exclude resolved:null (reported separately); toName is always a manifest symbol id on both sides
  ambiguous_skipped: number; // manifest edges with resolved:null — reported, never failed
  html_generated?: boolean; // present only when opts.html was requested
}

export function graphifyCheck(opts: { targetRepo: string; graphifyBin?: string; html?: boolean }): InteropReport {
  const bin = resolveGraphifyBin(opts.graphifyBin);
  if (!bin || !existsSync(bin)) {
    return unavailableReport();
  }

  const graphify_version = readGraphifyVersion(bin);
  const version_mismatch = graphify_version !== null && !graphify_version.includes(PINNED_EXPECTED) ? true : undefined;

  const manifestPath = join(opts.targetRepo, "docs/asbuilt/.graph-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No graph manifest found at ${manifestPath}. Run extract first ('bun src/extract.ts --target ${opts.targetRepo}').`,
    );
  }
  const manifest = loadManifest(manifestPath);
  const files = listTsFiles(opts.targetRepo);

  const tmpDir = mkdtempSync(join(tmpdir(), "asbuilt-graphify-"));
  try {
    for (const file of files) {
      const dest = join(tmpDir, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(opts.targetRepo, file), dest);
    }

    // NEVER run graphify against the target repo directly — only ever
    // against this throwaway tmp copy of its tracked .ts files. `env:
    // process.env` is explicit (not just the execFileSync default) because
    // Bun's execFileSync does not reliably pick up live process.env
    // mutations made after process start unless the env option is passed.
    execFileSync(bin, [tmpDir], { stdio: "pipe", timeout: 120_000, env: process.env });

    const graph = JSON.parse(readFileSync(join(tmpDir, "graphify-out", "graph.json"), "utf8")) as GraphifyGraphJson;

    let html_generated: boolean | undefined;
    if (opts.html) {
      const htmlSrc = join(tmpDir, "graphify-out", "graph.html");
      // Calibrated against a live 0.9.6 run (2026-07): the base extraction
      // pass writes only graph.json + .graphify_analysis.json (+ its own
      // internal manifest.json) — graph.html is NOT produced unless a
      // separate `graphify cluster-only` pass runs first. Record the
      // negative result rather than silently no-op'ing.
      html_generated = existsSync(htmlSrc);
      if (html_generated) {
        const destDir = join(opts.targetRepo, "docs/asbuilt/.graph");
        mkdirSync(destDir, { recursive: true });
        copyFileSync(htmlSrc, join(destDir, "graph.html"));
      }
    }

    const report = buildInteropReport(manifest, graph, files.length, graphify_version, version_mismatch);
    return html_generated === undefined ? report : { ...report, html_generated };
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

function unavailableReport(): InteropReport {
  return {
    graphify_version: null,
    pinned_expected: PINNED_EXPECTED,
    graphify_unavailable: true,
    files_compared: 0,
    symbols_matched: 0,
    symbols_manifest_only: [],
    types_not_compared: 0,
    nodes_graphify_only: [],
    calls_matched: 0,
    calls_unmatched: [],
    ambiguous_skipped: 0,
  };
}

/**
 * --graphify-bin flag, else GRAPHIFY_BIN env var, else `which graphify` on
 * PATH. `env: process.env` is explicit on the `which` spawn for the same
 * reason as the main graphify invocation above — see that comment.
 */
function resolveGraphifyBin(explicit?: string): string | undefined {
  if (explicit) return explicit;
  if (process.env.GRAPHIFY_BIN) return process.env.GRAPHIFY_BIN;
  try {
    const out = execFileSync("which", ["graphify"], { encoding: "utf8", env: process.env }).trim();
    return out.length > 0 ? out : undefined;
  } catch {
    return undefined;
  }
}

function readGraphifyVersion(bin: string): string | null {
  try {
    const out = execFileSync(bin, ["--version"], { encoding: "utf8", env: process.env });
    const firstLine = out.split("\n")[0]?.trim();
    return firstLine && firstLine.length > 0 ? firstLine : null;
  } catch {
    return null;
  }
}

// --- graphify 0.9.6's on-disk graph.json shape (NetworkX node-link JSON) ---
// Calibrated live (2026-07) against tests/fixtures/asbuilt/fixture-repo,
// scanning a tmp copy whose root plays the role of the repo root (src/ is a
// subdirectory of the scanned dir). Only the fields this module reads are
// typed; graphify emits more (community, weight, confidence_score, ...)
// that we don't need.
interface GraphifyNode {
  id: string;
  source_file: string;
}
interface GraphifyLink {
  relation: string;
  source: string;
  target: string;
}
interface GraphifyGraphJson {
  nodes: GraphifyNode[];
  links: GraphifyLink[];
}

// Only these manifest symbol kinds participate in id-matching. interface /
// type / enum are type-level declarations; graphify's AST pass may still
// emit a node for them (it does, in our fixture — see BetaConfig/BetaResult
// below), but per SPEC-049 Task 5 resolution #5 they're excluded from the
// matching process entirely and just tallied into `types_not_compared`.
const PARTICIPATING_KINDS: ReadonlySet<SymbolKind> = new Set(["function", "class", "method", "const"]);
const TYPE_LEVEL_KINDS: ReadonlySet<SymbolKind> = new Set(["interface", "type", "enum"]);

// A graphify node is a "real symbol" (as opposed to the file-level
// container node graphify emits per source file, e.g. {id:"src_alpha",
// label:"alpha.ts"}) iff it's the target of a "contains" edge (file
// contains top-level symbol) or a "method" edge (class contains method).
// File-level container nodes are never the target of either relation, so
// this set excludes them without needing to pattern-match on label/id shape.
const CANDIDATE_TARGET_RELATIONS = new Set(["contains", "method"]);

/**
 * Computes the expected graphify 0.9.6 node id for a manifest symbol id.
 *
 * Formula (calibrated live, 2026-07, against a real 0.9.6 run over
 * tests/fixtures/asbuilt/fixture-repo — see task-5-report.md for the full
 * transcript; hyphen/dot/underscore-run normalization re-calibrated 2026-07
 * against a live r2mcp interop run — see task-7-report.md "Fix 2"): drop
 * the file's extension, lowercase the whole remaining path, then replace
 * every RUN of one-or-more non-alphanumeric characters (this includes "/",
 * "-", ".", and "_" itself — none of those are in [a-z0-9]) with a single
 * "_"; separately lowercase the qualified name (the part of the manifest
 * id after "#") and apply the identical run-collapsing normalization (this
 * is what nests a method's id under its class, since "." is one of the
 * collapsed characters); join the two halves with a final "_". This holds
 * when the SCANNED directory's root is the repo root (src/ a subdirectory
 * of it) — scanning ./src directly instead drops the leading "src_"
 * segment (out of scope here; we always scan a tmp copy that preserves
 * full repo-relative paths, so the repo-root shape is the only one this
 * module ever needs).
 *
 * Concrete examples, verified byte-for-byte against a live
 * `graphify-out/graph.json` (mkdtemp probe repos, real graphify 0.9.6):
 *   "src/alpha.ts#AlphaService.run"        -> "src_alpha_alphaservice_run"
 *   "src/alpha.ts#alphaMain"               -> "src_alpha_alphamain"
 *   "src/util/gamma.ts#gamma"              -> "src_util_gamma_gamma"
 *   "src/multi-word-name.ts#someFunc"      -> "src_multi_word_name_somefunc"
 *     (hyphen -> underscore in a path segment; this is the r2mcp-live-run
 *     defect fix — the old split("/")+per-segment-lowercase+join("_")
 *     formula left the hyphen intact, producing "..._multi-word-name_..."
 *     which never matched graphify's actual "..._multi_word_name_...")
 *   "src/some.helper.ts#helperFn"          -> "src_some_helper_helperfn"
 *     (a non-extension "." in the stem is ALSO collapsed to "_", same as
 *     a hyphen — graphify does not special-case ".ts" beyond the trailing
 *     extension itself)
 *   "src/multi--hyphen.ts", "src/dot..dot.ts", "src/sub-dir/-leading.ts",
 *   "src/multi__underscore.ts#my__func" -> a RUN of 2+ punctuation/
 *     underscore chars (even a slash immediately adjacent to a hyphen
 *     across a path-segment boundary) collapses to exactly ONE "_", never
 *     one "_" per character — confirming the "run", not "per-character",
 *     semantics of the regex.
 */
function graphifyNormalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function expectedGraphifyId(symbolId: string): string {
  const hashIdx = symbolId.indexOf("#");
  const file = symbolId.slice(0, hashIdx);
  const qualified = symbolId.slice(hashIdx + 1);
  const filePart = graphifyNormalize(file.replace(/\.ts$/, ""));
  const namePart = graphifyNormalize(qualified);
  return `${filePart}_${namePart}`;
}

function buildInteropReport(
  manifest: GraphManifest,
  graph: GraphifyGraphJson,
  filesCompared: number,
  graphify_version: string | null,
  version_mismatch: true | undefined,
): InteropReport {
  const allGraphifyIds = new Set(graph.nodes.map((n) => n.id));
  const nodesById = new Map(graph.nodes.map((n) => [n.id, n]));

  const participating = manifest.symbols.filter((s) => PARTICIPATING_KINDS.has(s.kind));
  const types_not_compared = manifest.symbols.filter((s) => TYPE_LEVEL_KINDS.has(s.kind)).length;

  // Forward: manifest -> graphify. graphifyIdToManifestId only covers
  // PARTICIPATING symbols that actually found a graphify node.
  const graphifyIdToManifestId = new Map<string, string>();
  const symbols_manifest_only: InteropReport["symbols_manifest_only"] = [];
  for (const sym of participating) {
    const gid = expectedGraphifyId(sym.id);
    if (allGraphifyIds.has(gid)) {
      graphifyIdToManifestId.set(gid, sym.id);
    } else {
      symbols_manifest_only.push({ id: sym.id });
    }
  }
  symbols_manifest_only.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const symbols_matched = participating.length - symbols_manifest_only.length;

  // Reverse: graphify -> manifest. Uses the FULL manifest (participating and
  // type-level alike) so a type-level symbol's node (e.g. BetaConfig) isn't
  // misreported as "extra" — it's legitimately accounted for by
  // types_not_compared instead, not by this advisory list.
  const allExpectedIds = new Set(manifest.symbols.map((s) => expectedGraphifyId(s.id)));
  const candidateIds = new Set(
    graph.links.filter((l) => CANDIDATE_TARGET_RELATIONS.has(l.relation)).map((l) => l.target),
  );
  const nodes_graphify_only: InteropReport["nodes_graphify_only"] = [...candidateIds]
    .filter((id) => !allExpectedIds.has(id))
    .map((id) => ({ id, file: nodesById.get(id)?.source_file ?? "" }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  // Calls comparison (resolution #6). matchedManifestIds = participating
  // symbols that DID find a graphify node — a manifest edge only counts as
  // comparable when both its endpoints are in this set.
  const matchedManifestIds = new Set(graphifyIdToManifestId.values());
  const manifestEdgeMatched = new Map<string, boolean>(); // "from\0resolved" -> seen-in-graphify?
  let ambiguous_skipped = 0;
  for (const edge of manifest.edges) {
    if (edge.resolved === null) {
      ambiguous_skipped++;
      continue;
    }
    manifestEdgeMatched.set(`${edge.from}\0${edge.resolved}`, false);
  }

  const calls_unmatched: InteropReport["calls_unmatched"] = [];
  let calls_matched = 0;
  for (const link of graph.links) {
    if (link.relation !== "calls" && link.relation !== "method") continue;
    const fromId = graphifyIdToManifestId.get(link.source);
    const toId = graphifyIdToManifestId.get(link.target);
    if (fromId === undefined || toId === undefined) continue; // not between two MATCHED nodes
    const key = `${fromId}\0${toId}`;
    if (manifestEdgeMatched.has(key)) {
      manifestEdgeMatched.set(key, true);
      calls_matched++;
    } else {
      calls_unmatched.push({ from: fromId, toName: toId, side: "graphify" });
    }
  }

  for (const edge of manifest.edges) {
    if (edge.resolved === null) continue;
    if (!matchedManifestIds.has(edge.from) || !matchedManifestIds.has(edge.resolved)) continue;
    const key = `${edge.from}\0${edge.resolved}`;
    if (manifestEdgeMatched.get(key) === false) {
      calls_unmatched.push({ from: edge.from, toName: edge.resolved, side: "manifest" });
    }
  }
  calls_unmatched.sort((a, b) => {
    if (a.from !== b.from) return a.from < b.from ? -1 : 1;
    if (a.toName !== b.toName) return a.toName < b.toName ? -1 : 1;
    if (a.side !== b.side) return a.side < b.side ? -1 : 1;
    return 0;
  });

  return {
    graphify_version,
    pinned_expected: PINNED_EXPECTED,
    ...(version_mismatch ? { version_mismatch } : {}),
    files_compared: filesCompared,
    symbols_matched,
    symbols_manifest_only,
    types_not_compared,
    nodes_graphify_only,
    calls_matched,
    calls_unmatched,
    ambiguous_skipped,
  };
}

export const CLI_USAGE = "bun asbuilt/src/graphify-check.ts --target <repo> [--graphify-bin <path>] [--html]";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const target = argValue("--target");
  if (!target) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const graphifyBin = argValue("--graphify-bin");
  const html = hasFlag("--html");
  const report = graphifyCheck({ targetRepo: target, graphifyBin, html });
  if (report.graphify_unavailable) {
    console.log("graphify-check: graphifyy not installed — cross-validation skipped (loudly)");
  }
  console.log(JSON.stringify(report, null, 2));
  // Advisory-only lane: no field in InteropReport ever represents a blocking
  // failure (ambiguous_skipped/symbols_manifest_only/etc. are all reported,
  // never failed — see the brief). Always exit clean.
  process.exit(0);
}
