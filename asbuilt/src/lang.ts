// Language adapters for multi-language graph extraction (SPEC-053).
//
// The extraction core (walk, sort, edge resolution, manifest assembly) is
// language-neutral; everything a grammar can't know by structure alone —
// which nodes are definitions, where names live, what "exported" means,
// what a call looks like — is declared here, one thin adapter per language.
// The TypeScript adapter reproduces the pre-SPEC-053 single-language
// extractor byte-for-byte (AC4): its logic is transplanted verbatim, and
// any change to it must keep a TS-only repo's manifest byte-identical.
//
// Adding a language = adding an adapter + an empirically-pinned fixture
// (asbuilt/tests/fixtures/lang/): never assume a grammar's node types —
// probe them. Grammar wasms come from the already-pinned tree-sitter-wasms
// package; adding adapters must not change dependency versions.

import type Parser from "web-tree-sitter";
import type { SymbolKind } from "./manifest";

/** Walk context threaded through the tree: nearest owner + whether we're inside a callable body. */
export interface LangContext {
  owner: string | null;
  insideCallable: boolean;
}

export const ROOT_CONTEXT: LangContext = { owner: null, insideCallable: false };

export interface Callee {
  name: string;
  /** true when the callee was reached through member/attribute access (method-style call). */
  method: boolean;
}

export interface LanguageAdapter {
  name: string;
  /** git ls-files patterns for this language's sources. */
  globs: string[];
  /** file extensions (no dot) used to route a discovered file to this adapter. */
  extensions: string[];
  /** wasm filename inside tree-sitter-wasms/out/. */
  wasm: string;
  /** Classify a node as a symbol kind, or null to skip. Context-sensitive (e.g. Python locals). */
  classify(node: Parser.SyntaxNode, ctx: LangContext): SymbolKind | null;
  /** The symbol's own name, or null to skip. */
  nameOf(node: Parser.SyntaxNode): string | null;
  /** Compose the qualified name recorded in the id (`file#<qualified>`). */
  qualify(node: Parser.SyntaxNode, kind: SymbolKind, name: string, ctx: LangContext): string;
  /** Language's visibility rule for this symbol. */
  isExported(node: Parser.SyntaxNode, name: string): boolean;
  /** Child context when descending past this node. */
  descend(node: Parser.SyntaxNode, ctx: LangContext): LangContext;
  /** Node types that represent calls, and how to read the callee's bare name. */
  calls: { types: string[]; callee(node: Parser.SyntaxNode): Callee | null };
}

// ---------------------------------------------------------------------------
// TypeScript — transplanted verbatim from the pre-SPEC-053 extractor.
// ---------------------------------------------------------------------------

const TS_SYMBOL_NODE_KINDS: Record<string, SymbolKind> = {
  function_declaration: "function",
  class_declaration: "class",
  method_definition: "method",
  interface_declaration: "interface",
  type_alias_declaration: "type",
  enum_declaration: "enum",
};

const typescript: LanguageAdapter = {
  name: "typescript",
  globs: ["*.ts"],
  extensions: ["ts"],
  wasm: "tree-sitter-typescript.wasm",
  classify(node) {
    const direct = TS_SYMBOL_NODE_KINDS[node.type];
    if (direct) return direct;
    if (node.type === "variable_declarator") {
      const valueType = node.childForFieldName("value")?.type;
      if (valueType === "arrow_function" || valueType === "function_expression") return "const";
    }
    return null;
  },
  nameOf(node) {
    return node.childForFieldName("name")?.text ?? null;
  },
  qualify(_node, kind, name, ctx) {
    return kind === "method" && ctx.owner ? `${ctx.owner}.${name}` : name;
  },
  isExported(node) {
    let current: Parser.SyntaxNode | null = node;
    while (current) {
      if (current.type === "export_statement") return true;
      current = current.parent;
    }
    return false;
  },
  descend(node, ctx) {
    if (node.type === "class_declaration") {
      return { ...ctx, owner: node.childForFieldName("name")?.text ?? ctx.owner };
    }
    return ctx;
  },
  calls: {
    types: ["call_expression"],
    callee(call) {
      const fn = call.childForFieldName("function");
      if (fn?.type === "identifier") return { name: fn.text, method: false };
      if (fn?.type === "member_expression") {
        const name = fn.childForFieldName("property")?.text ?? "";
        return name ? { name, method: true } : null;
      }
      return null;
    },
  },
};

// ---------------------------------------------------------------------------
// Go — exported = capitalized identifier; methods owned by their receiver type.
// Node types pinned by probe 2026-07-06 (tree-sitter-go from tree-sitter-wasms).
// ---------------------------------------------------------------------------

/** Receiver type name from a method_declaration: (s *Server) → "Server". */
function goReceiverType(node: Parser.SyntaxNode): string | null {
  const receiver = node.childForFieldName("receiver");
  if (!receiver) return null;
  const ident = receiver.descendantsOfType("type_identifier")[0];
  return ident?.text ?? null;
}

const go: LanguageAdapter = {
  name: "go",
  globs: ["*.go"],
  extensions: ["go"],
  wasm: "tree-sitter-go.wasm",
  classify(node, ctx) {
    if (ctx.insideCallable) return null;
    switch (node.type) {
      case "function_declaration":
        return "function";
      case "method_declaration":
        return "method";
      case "type_spec": {
        const t = node.childForFieldName("type")?.type;
        return t === "interface_type" ? "interface" : t === "struct_type" ? "class" : "type";
      }
      case "const_spec":
        return "const";
      case "var_spec":
        return "const";
      default:
        return null;
    }
  },
  nameOf(node) {
    return node.childForFieldName("name")?.text ?? null;
  },
  qualify(node, kind, name) {
    if (kind === "method") {
      const owner = goReceiverType(node);
      if (owner) return `${owner}.${name}`;
    }
    return name;
  },
  isExported(_node, name) {
    const first = name[0] ?? "";
    return first !== "" && first === first.toUpperCase() && first !== first.toLowerCase();
  },
  descend(node, ctx) {
    if (node.type === "function_declaration" || node.type === "method_declaration") {
      return { ...ctx, insideCallable: true };
    }
    return ctx;
  },
  calls: {
    types: ["call_expression"],
    callee(call) {
      const fn = call.childForFieldName("function");
      if (fn?.type === "identifier") return { name: fn.text, method: false };
      if (fn?.type === "selector_expression") {
        const name = fn.childForFieldName("field")?.text ?? "";
        return name ? { name, method: true } : null;
      }
      return null;
    },
  },
};

// ---------------------------------------------------------------------------
// Java — exported = `public` modifier; members owned by their declaring type.
// Node types pinned by probe 2026-07-06 (tree-sitter-java from tree-sitter-wasms).
// ---------------------------------------------------------------------------

const JAVA_OWNER_TYPES = new Set(["class_declaration", "interface_declaration", "enum_declaration"]);

const java: LanguageAdapter = {
  name: "java",
  globs: ["*.java"],
  extensions: ["java"],
  wasm: "tree-sitter-java.wasm",
  classify(node, ctx) {
    if (ctx.insideCallable) return null;
    switch (node.type) {
      case "class_declaration":
        return "class";
      case "interface_declaration":
        return "interface";
      case "enum_declaration":
        return "enum";
      case "method_declaration":
      case "constructor_declaration":
        return "method";
      default:
        return null;
    }
  },
  nameOf(node) {
    return node.childForFieldName("name")?.text ?? null;
  },
  qualify(_node, kind, name, ctx) {
    return kind === "method" && ctx.owner ? `${ctx.owner}.${name}` : name;
  },
  isExported(node) {
    const modifiers = node.namedChildren.find((c) => c.type === "modifiers");
    return modifiers ? /\bpublic\b/.test(modifiers.text) : false;
  },
  descend(node, ctx) {
    if (JAVA_OWNER_TYPES.has(node.type)) {
      return { ...ctx, owner: node.childForFieldName("name")?.text ?? ctx.owner };
    }
    if (node.type === "method_declaration" || node.type === "constructor_declaration") {
      return { ...ctx, insideCallable: true };
    }
    return ctx;
  },
  calls: {
    types: ["method_invocation"],
    callee(call) {
      const name = call.childForFieldName("name")?.text ?? "";
      if (!name) return null;
      // an explicit receiver (obj.m()) is member access; a bare in-class call m() is not
      return { name, method: call.childForFieldName("object") !== null };
    },
  },
};

// ---------------------------------------------------------------------------
// Python — exported = not underscore-prefixed (dunders count as private);
// module-level defs + one level of class members; function-local defs skipped.
// Node types pinned by probe 2026-07-06 (tree-sitter-python from tree-sitter-wasms).
// ---------------------------------------------------------------------------

const python: LanguageAdapter = {
  name: "python",
  globs: ["*.py"],
  extensions: ["py"],
  wasm: "tree-sitter-python.wasm",
  classify(node, ctx) {
    if (ctx.insideCallable) return null;
    if (node.type === "function_definition") return ctx.owner ? "method" : "function";
    if (node.type === "class_definition") return ctx.owner ? null : "class";
    return null;
  },
  nameOf(node) {
    return node.childForFieldName("name")?.text ?? null;
  },
  qualify(_node, kind, name, ctx) {
    return kind === "method" && ctx.owner ? `${ctx.owner}.${name}` : name;
  },
  isExported(_node, name) {
    return !name.startsWith("_");
  },
  descend(node, ctx) {
    if (node.type === "class_definition") {
      return { ...ctx, owner: node.childForFieldName("name")?.text ?? ctx.owner };
    }
    if (node.type === "function_definition") {
      return { ...ctx, insideCallable: true };
    }
    return ctx;
  },
  calls: {
    types: ["call"],
    callee(call) {
      const fn = call.childForFieldName("function");
      if (fn?.type === "identifier") return { name: fn.text, method: false };
      if (fn?.type === "attribute") {
        const name = fn.childForFieldName("attribute")?.text ?? "";
        return name ? { name, method: true } : null;
      }
      return null;
    },
  },
};

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

/** Registration order fixes file-list construction order; the extractor re-sorts the union anyway. */
export const ADAPTERS: readonly LanguageAdapter[] = [typescript, go, java, python];

const BY_EXTENSION = new Map<string, LanguageAdapter>(
  ADAPTERS.flatMap((a) => a.extensions.map((ext) => [ext, a] as const)),
);

/** Adapter for a repo-relative path, by extension; null when no language claims it. */
export function adapterForFile(file: string): LanguageAdapter | null {
  const dot = file.lastIndexOf(".");
  if (dot === -1) return null;
  return BY_EXTENSION.get(file.slice(dot + 1)) ?? null;
}

export const SUPPORTED_LANGUAGES = ADAPTERS.map((a) => a.name);
