// Manifest interface for the As-Built Knowledge System (SPEC-048).
//
// This module owns the on-disk graph manifest shape and its (de)serialization.
// Every later task (diffing, doc generation, drift detection, ...) consumes
// exactly these types — see docs/asbuilt/.graph-manifest.json produced by
// `extract.ts`'s CLI entry point.

import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export type SymbolKind = "function" | "class" | "method" | "interface" | "type" | "enum" | "const";

export interface SymbolEntry {
  id: string; // "<repo-relative-file>#<qualifiedName>", e.g. "src/alpha.ts#AlphaService.run"
  kind: SymbolKind;
  file: string; // repo-relative
  span: [number, number]; // 1-based inclusive start/end lines
  content_hash: string; // sha256 hex of the symbol's source slice
  exported: boolean;
}

export interface CallEdge {
  from: string;
  toName: string;
  resolved: string | null;
}

export interface GraphManifest {
  schema: 1;
  extractor: { name: string; version: string };
  target_commit: string; // git HEAD sha of target repo ("UNCOMMITTED" if dirty-only)
  symbols: SymbolEntry[]; // sorted by id
  edges: CallEdge[]; // sorted by (from, toName)
}

/** Writes the manifest as 2-space-indented JSON, keys in declared order, trailing newline. */
export function saveManifest(path: string, m: GraphManifest): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(m, null, 2)}\n`);
}

export function loadManifest(path: string): GraphManifest {
  return JSON.parse(readFileSync(path, "utf8")) as GraphManifest;
}

/** sha256 of the exact bytes `saveManifest` would write for this manifest. */
export function manifestHash(m: GraphManifest): string {
  return createHash("sha256").update(`${JSON.stringify(m, null, 2)}\n`).digest("hex");
}

/**
 * Loud missing-pin guard (SPEC-049 Task 1, AC8-adjacent hardening): reads the
 * pinned `web-tree-sitter` version out of a parsed package.json and throws a
 * clear, specific error rather than letting a silent `undefined` version
 * flow into the manifest's `extractor.version` field. Lives here (not
 * extract.ts) because manifest.ts owns the on-disk manifest interface that
 * `extractor.version` is part of.
 */
export function requirePin(pkg: Record<string, unknown>): string {
  const dependencies = pkg?.dependencies as Record<string, unknown> | undefined;
  const version = dependencies?.["web-tree-sitter"];
  if (typeof version !== "string" || version === "") {
    throw new Error("web-tree-sitter pin missing from asbuilt/package.json dependencies");
  }
  return version;
}
