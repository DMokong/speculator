// Deterministic graph extraction for the As-Built Knowledge System (SPEC-048).
//
// Walks a target repo's .ts files with web-tree-sitter, collects symbol
// entries (functions/classes/methods/interfaces/types/enums/consts) and
// best-effort call edges between them, and produces a GraphManifest
// (see manifest.ts) that is byte-identical across repeated runs against
// the same working tree.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import Parser from "web-tree-sitter";
import { argValue } from "./cli";
import {
  type CallEdge,
  type GraphManifest,
  type SymbolEntry,
  type SymbolKind,
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

const SYMBOL_NODE_KINDS: Record<string, SymbolKind> = {
  function_declaration: "function",
  class_declaration: "class",
  method_definition: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

// Only these kinds represent executable/callable units; scanning class,
// interface, type, and enum bodies for call_expression descendants would
// double-count calls that belong to a nested method (its enclosing class
// would "inherit" the same call edge). See task-2-report.md for the
// rationale — this is a deliberate departure from a literal reading of the
// brief's pseudocode.
const EDGE_SOURCE_KINDS: ReadonlySet<SymbolKind> = new Set(["function", "method", "const"]);

// git-tracked .ts files only, minus type-declaration files, vendored deps,
// and our own test fixtures (which may contain .ts files that aren't part
// of the target repo's real source graph).
const EXCLUDE_FILE_PATTERN = /\.d\.ts$|node_modules\/|^tests\/fixtures\//;

// Exported (SPEC-049 Task 5) so graphify-check.ts's temp-copy discipline
// scans the exact same tracked-file set extractGraph does — one definition
// of "which .ts files count" shared by both independent pipelines.
export function listTsFiles(targetRepo: string): string[] {
  const out = execFileSync("git", ["-C", targetRepo, "ls-files", "--", "*.ts"], { encoding: "utf8" });
  return out
    .split("\n")
    .filter((line) => line.length > 0 && !EXCLUDE_FILE_PATTERN.test(line))
    .sort();
}

function headSha(targetRepo: string): string {
  try {
    return execFileSync("git", ["-C", targetRepo, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "UNCOMMITTED";
  }
}

let parserSingleton: Parser | null = null;

async function makeParser(): Promise<Parser> {
  if (parserSingleton) return parserSingleton;
  await Parser.init();
  const wasmPath = new URL(
    "../node_modules/tree-sitter-wasms/out/tree-sitter-typescript.wasm",
    import.meta.url,
  ).pathname;
  const language = await Parser.Language.load(wasmPath);
  const parser = new Parser();
  parser.setLanguage(language);
  parserSingleton = parser;
  return parser;
}

function classify(node: Parser.SyntaxNode): SymbolKind | null {
  const direct = SYMBOL_NODE_KINDS[node.type];
  if (direct) return direct;
  if (node.type === "variable_declarator") {
    const valueType = node.childForFieldName("value")?.type;
    if (valueType === "arrow_function" || valueType === "function_expression") return "const";
  }
  return null;
}

function nameOf(node: Parser.SyntaxNode): string | null {
  return node.childForFieldName("name")?.text ?? null;
}

function isExported(node: Parser.SyntaxNode): boolean {
  let current: Parser.SyntaxNode | null = node;
  while (current) {
    if (current.type === "export_statement") return true;
    current = current.parent;
  }
  return false;
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Depth-first walk tracking the nearest enclosing class name (for method qualification). */
function walk(
  node: Parser.SyntaxNode,
  visit: (node: Parser.SyntaxNode, className: string | null) => void,
  className: string | null = null,
): void {
  const kind = classify(node);
  if (kind) visit(node, className);
  const nextClassName = node.type === "class_declaration" ? (nameOf(node) ?? className) : className;
  for (const child of node.namedChildren) {
    walk(child, visit, nextClassName);
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
  const files = listTsFiles(targetRepo);
  const symbols: SymbolEntry[] = [];
  const rawEdges: RawEdge[] = [];
  const parser = await makeParser();

  for (const file of files) {
    const src = readFileSync(join(targetRepo, file), "utf8");
    const tree = parser.parse(src);
    if (!tree) continue;
    const lines = src.split("\n");

    walk(tree.rootNode, (node, className) => {
      const kind = classify(node);
      if (!kind) return;
      const name = nameOf(node);
      if (!name) return;
      const qualified = kind === "method" && className ? `${className}.${name}` : name;
      const span: [number, number] = [node.startPosition.row + 1, node.endPosition.row + 1];
      const id = `${file}#${qualified}`;
      symbols.push({
        id,
        kind,
        file,
        span,
        content_hash: sha256(lines.slice(span[0] - 1, span[1]).join("\n")),
        exported: isExported(node),
      });

      if (!EDGE_SOURCE_KINDS.has(kind)) return;
      for (const call of node.descendantsOfType("call_expression")) {
        const fn = call.childForFieldName("function");
        const toName =
          fn?.type === "identifier"
            ? fn.text
            : fn?.type === "member_expression"
              ? (fn.childForFieldName("property")?.text ?? "")
              : "";
        if (toName) rawEdges.push({ from: id, toName });
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
  const m = await extractGraph(target);
  saveManifest(out, m);
  console.log(`symbols=${m.symbols.length} edges=${m.edges.length} hash=${manifestHash(m)}`);
}
