// Deterministic graph extraction for the As-Built Knowledge System (SPEC-048,
// multi-language since SPEC-053).
//
// Walks a target repo's supported source files (TypeScript, Go, Java, Python
// — see lang.ts) with web-tree-sitter, collects symbol entries and best-effort
// call edges between them, and produces a GraphManifest (see manifest.ts) that
// is byte-identical across repeated runs against the same working tree. For a
// TypeScript-only repo the output is byte-identical to the pre-SPEC-053
// single-language extractor (AC4) — the TS adapter transplants that logic
// verbatim and the core below is unchanged in ordering, hashing, and edge
// resolution.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "web-tree-sitter";
import { argValue } from "./cli";
import { ADAPTERS, type LangContext, type LanguageAdapter, ROOT_CONTEXT, adapterForFile } from "./lang";
import {
  type CallEdge,
  type GraphManifest,
  type SymbolEntry,
  manifestHash,
  requirePin,
  saveManifest,
} from "./manifest";

const EXTRACTOR_NAME = "web-tree-sitter";

// Single source of truth for the pinned version: read package.json's
// dependency entry (via requirePin, called inside extractGraph — NOT at
// module scope, so importing this file for tests never risks throwing
// before a single test runs) rather than hardcoding it a second time.
const PACKAGE_JSON_PATH = new URL("../package.json", import.meta.url);

// Only these kinds represent executable/callable units; scanning class,
// interface, type, and enum bodies for call descendants would double-count
// calls that belong to a nested member (its enclosing type would "inherit"
// the same call edge). Language-neutral: adapters map their nodes into these
// kinds and the rule applies uniformly.
const EDGE_SOURCE_KINDS: ReadonlySet<string> = new Set(["function", "method", "const"]);

// git-tracked source files only, minus type-declaration files, vendored deps,
// and our own test fixtures (which may contain source files that aren't part
// of the target repo's real source graph). Deliberately unchanged by SPEC-053:
// git ls-files already respects .gitignore, which covers venvs and vendor
// trees in practice — new exclusions would risk perturbing existing TS output.
const EXCLUDE_FILE_PATTERN = /\.d\.ts$|node_modules\/|^tests\/fixtures\//;

function gitFiles(targetRepo: string, globs: string[]): string[] {
  const out = execFileSync("git", ["-C", targetRepo, "ls-files", "--", ...globs], {
    encoding: "utf8",
  });
  return out
    .split("\n")
    .filter((line) => line.length > 0 && !EXCLUDE_FILE_PATTERN.test(line))
    .sort();
}

// Exported (SPEC-049 Task 5) so graphify-check.ts's temp-copy discipline
// scans the exact same tracked-file set the extractor does for TypeScript —
// one definition of "which .ts files count" shared by both independent
// pipelines. graphify cross-validation remains TS-scoped; multi-language
// discovery lives in listSourceFiles.
export function listTsFiles(targetRepo: string): string[] {
  return gitFiles(targetRepo, ["*.ts"]);
}

/** All supported-language source files (union across adapters), codepoint-sorted. */
export function listSourceFiles(targetRepo: string): string[] {
  return gitFiles(
    targetRepo,
    ADAPTERS.flatMap((a) => a.globs),
  );
}

function headSha(targetRepo: string): string {
  try {
    return execFileSync("git", ["-C", targetRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "UNCOMMITTED";
  }
}

const parserSingletons = new Map<string, Parser>();
let parserInitDone = false;

async function makeParser(adapter: LanguageAdapter): Promise<Parser> {
  const existing = parserSingletons.get(adapter.name);
  if (existing) return existing;
  if (!parserInitDone) {
    await Parser.init();
    parserInitDone = true;
  }
  const wasmPath = new URL(`../node_modules/tree-sitter-wasms/out/${adapter.wasm}`, import.meta.url)
    .pathname;
  const language = await Parser.Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  parserSingletons.set(adapter.name, parser);
  return parser;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Depth-first walk threading the adapter's language context (owner, callable nesting). */
function walk(
  adapter: LanguageAdapter,
  node: Parser.SyntaxNode,
  visit: (node: Parser.SyntaxNode, ctx: LangContext) => void,
  ctx: LangContext = ROOT_CONTEXT,
): void {
  if (adapter.classify(node, ctx)) visit(node, ctx);
  const next = adapter.descend(node, ctx);
  for (const child of node.namedChildren) {
    walk(adapter, child, visit, next);
  }
}

function simpleName(id: string): string {
  const qualified = id.split("#")[1] ?? "";
  const parts = qualified.split(".");
  return parts[parts.length - 1] ?? qualified;
}

interface RawEdge {
  from: string;
  toName: string;
}

function dedupeEdges(rawEdges: RawEdge[]): RawEdge[] {
  const seen = new Set<string>();
  const result: RawEdge[] = [];
  for (const edge of rawEdges) {
    const key = `${edge.from}\0${edge.toName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(edge);
  }
  return result;
}

export async function extractGraph(targetRepo: string): Promise<GraphManifest> {
  const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, "utf8")) as Record<string, unknown>;
  const pinnedVersion = requirePin(pkg);
  const files = listSourceFiles(targetRepo);
  const symbols: SymbolEntry[] = [];
  const rawEdges: RawEdge[] = [];

  for (const file of files) {
    const adapter = adapterForFile(file);
    if (!adapter) continue;
    const parser = await makeParser(adapter);
    const src = readFileSync(join(targetRepo, file), "utf8");
    const tree = parser.parse(src);
    if (!tree) continue;
    const lines = src.split("\n");

    walk(adapter, tree.rootNode, (node, ctx) => {
      const kind = adapter.classify(node, ctx);
      if (!kind) return;
      const name = adapter.nameOf(node);
      if (!name) return;
      const qualified = adapter.qualify(node, kind, name, ctx);
      const span: [number, number] = [node.startPosition.row + 1, node.endPosition.row + 1];
      const id = `${file}#${qualified}`;
      symbols.push({
        id,
        kind,
        file,
        span,
        content_hash: sha256(lines.slice(span[0] - 1, span[1]).join("\n")),
        exported: adapter.isExported(node, name),
      });

      if (!EDGE_SOURCE_KINDS.has(kind)) return;
      for (const callType of adapter.calls.types) {
        for (const call of node.descendantsOfType(callType)) {
          const toName = adapter.calls.callee(call);
          if (toName) rawEdges.push({ from: id, toName });
        }
      }
    });
  }

  // Plain codepoint ordering, not localeCompare: locale-aware collation treats
  // "AlphaService" and "alphaMain" as primarily equal up to the first
  // case-insensitive difference (S vs M) and would sort alphaMain first,
  // which disagrees with the hand-verified golden fixture order (uppercase
  // sorts before lowercase at the first differing byte).
  symbols.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const byName = new Map<string, string[]>();
  for (const s of symbols) {
    const key = simpleName(s.id);
    byName.set(key, [...(byName.get(key) ?? []), s.id]);
  }

  const edges: CallEdge[] = dedupeEdges(rawEdges)
    .map((e): CallEdge => {
      const fromFile = e.from.split("#")[0];
      const sameFile = (byName.get(e.toName) ?? []).filter((id) => id.startsWith(`${fromFile}#`));
      const candidates = sameFile.length ? sameFile : (byName.get(e.toName) ?? []);
      const resolved = candidates.length === 1 ? candidates[0] : sameFile.length === 1 ? sameFile[0] : null;
      return { from: e.from, toName: e.toName, resolved };
    })
    .sort((a, b) => {
      if (a.from !== b.from) return a.from < b.from ? -1 : 1;
      if (a.toName !== b.toName) return a.toName < b.toName ? -1 : 1;
      return 0;
    });

  return {
    schema: 1,
    extractor: { name: EXTRACTOR_NAME, version: pinnedVersion },
    target_commit: headSha(targetRepo),
    symbols,
    edges,
  };
}

export const CLI_USAGE = "bun asbuilt/src/extract.ts --target <repo> [--out <path>]";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2).
if (import.meta.main) {
  const target = argValue("--target");
  if (!target) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const out = argValue("--out") ?? join(target, "docs/asbuilt/.graph-manifest.json");
  if (listSourceFiles(target).length === 0) {
    console.error(
      `note: no supported-language sources found in ${target} (supported: ${ADAPTERS.map((a) => a.name).join(", ")}) — an empty manifest will be written; the comprehension gate can still run judge-only via --graph-unavailable`,
    );
  }
  const m = await extractGraph(target);
  saveManifest(out, m);
  console.log(`symbols=${m.symbols.length} edges=${m.edges.length} hash=${manifestHash(m)}`);
}
