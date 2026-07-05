// Shared concept-file zone/frontmatter logic for the As-Built Knowledge
// System (SPEC-049 Task 4 consolidation).
//
// fold.ts (Task 2) and refresh.ts (Task 3) each carried a structurally
// identical local copy of "split a concept into its frontmatter block plus
// machine/enriched zones" and "parse/render the frontmatter block" — both
// tasks' reports explicitly flagged this module as the intended
// consolidation target (task-2-report.md item 2's note to T4; task-3-
// report.md's "Duplicated zone-splitting/frontmatter-parsing logic"
// concern). This is now the single home for both concerns: skeleton.ts,
// fold.ts, and refresh.ts all import from here instead of keeping their own
// copies.

import { parse, stringify } from "yaml";
import type { GraphManifest } from "./manifest";
import { headingLines, isExactHeading } from "./md";

const ENRICHED_HEADINGS = ["# Explanation", "# Decisions", "# Gotchas", "# Citations"];

/**
 * A concept file's OKF v0.1 frontmatter, in the exact SPEC-049 field order
 * `renderFrontmatter` writes: type, title, description, resource, tags,
 * enrichment, from, explains, stale, stale_reason, graph_hash. Most fields
 * simply pass through whatever a caller already parsed/derived — only the
 * two fields this task actually governs (`tags`, `stale`) are given a
 * concrete shape.
 *
 * `stale_reason` is deliberately optional: skeleton.ts's freshly-generated
 * concepts omit it entirely (the OKF-conformance-by-omission the root
 * index.md's conformance note documents — see skeleton.ts); fold.ts and
 * refresh.ts, which DO track staleness, always supply it (possibly `""`).
 */
export interface ConceptFrontmatter {
  type: unknown;
  title: unknown;
  description: unknown;
  resource: unknown;
  tags: string[];
  enrichment: unknown;
  from: unknown;
  explains: unknown;
  stale: boolean;
  stale_reason?: string;
  graph_hash: unknown;
}

/**
 * Splits a concept's FULL file content (frontmatter + body) into its raw
 * frontmatter block (`"---\n<yaml>\n---\n"`, unparsed — see
 * `parseFrontmatter`), its machine zone (everything from after the
 * frontmatter through the end of "# Structure" — mechanically written by
 * skeleton.ts), and its existing enriched zone (from the first enriched
 * heading onward, or empty when this concept has never been folded before).
 * The machine/enriched split point is the FIRST line matching one of the
 * four enriched headings, trim-tolerant.
 *
 * Fenced-code-aware (md.ts's `headingLines`): a heading-shaped line inside a
 * ```-fenced code sample (e.g. a machine zone's example snippet that happens
 * to quote "# Explanation" as literal text) is not a real heading and must
 * not be mistaken for the split point — otherwise everything after it,
 * including genuine machine-zone content, would be silently discarded.
 */
export function splitConcept(content: string): {
  frontmatterBlock: string;
  machineZone: string;
  enrichedZone: string;
} {
  if (!content.startsWith("---\n")) {
    throw new Error("concept has no frontmatter block");
  }
  // Search from index 3 (not 4) so a degenerate empty block ("---\n---\n") is
  // found — the opening delimiter's own trailing "\n" (at index 3) doubles
  // as the closing pattern's leading "\n" (mirrors verify.ts's parseFrontmatter
  // off-by-one note).
  const closeIdx = content.indexOf("\n---\n", 3);
  if (closeIdx === -1) {
    throw new Error("concept frontmatter block is not terminated");
  }
  const frontmatterBlock = content.slice(0, closeIdx + 5);
  const body = content.slice(closeIdx + 5);

  const lines = body.split("\n");
  const headingIdx = new Set(headingLines(body).map((h) => h.index));
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (!headingIdx.has(i)) continue;
    const line = (lines[i] ?? "").replace(/\s+$/, "");
    if (ENRICHED_HEADINGS.some((h) => isExactHeading(line, h))) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    return { frontmatterBlock, machineZone: body.trim(), enrichedZone: "" };
  }
  const machineZone = lines.slice(0, idx).join("\n").trim();
  const enrichedZone = lines.slice(idx).join("\n");
  return { frontmatterBlock, machineZone, enrichedZone };
}

/**
 * Parses a concept's raw frontmatter block (as returned by `splitConcept`)
 * into its YAML object. Non-mapping or empty YAML parses to `{}` rather
 * than throwing — callers that need to distinguish a malformed block from
 * an empty one should inspect the block's raw text themselves (this is the
 * same tolerant-parse convention fold.ts/refresh.ts used before this
 * consolidation).
 */
export function parseFrontmatter(block: string): Record<string, unknown> {
  if (!block.startsWith("---\n")) {
    throw new Error("frontmatter block malformed: missing opening delimiter");
  }
  const closeIdx = block.indexOf("\n---\n", 3);
  if (closeIdx === -1) {
    throw new Error("frontmatter block malformed: missing closing delimiter");
  }
  const yamlText = block.slice(4, closeIdx + 1);
  const parsed: unknown = parse(yamlText);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
}

/**
 * Renders a concept's frontmatter block in the SPEC-049 field order (see
 * `ConceptFrontmatter`). `stale_reason` is included only when
 * `fields.stale_reason !== undefined` — this is how skeleton.ts's fresh
 * concepts omit the key entirely while fold.ts/refresh.ts always supply it.
 */
export function renderFrontmatter(fields: ConceptFrontmatter): string {
  const fmObj: Record<string, unknown> = {
    type: fields.type,
    title: fields.title,
    description: fields.description,
    resource: fields.resource,
    tags: fields.tags,
    enrichment: fields.enrichment,
    from: fields.from,
    explains: fields.explains,
    stale: fields.stale,
  };
  if (fields.stale_reason !== undefined) {
    fmObj.stale_reason = fields.stale_reason;
  }
  fmObj.graph_hash = fields.graph_hash;
  return `---\n${stringify(fmObj)}---\n`;
}

/**
 * Deterministic tags rule (SPEC-049 Task 4): `[<first path segment of
 * resource>, "module", ...<sorted unique symbol kinds present in the
 * file>]` — e.g. `src/alpha.ts` -> `["src","module","class","function","method"]`.
 * `manifest` is nullable so a caller without one on hand (fold.ts doesn't
 * otherwise load the graph manifest) can still derive a degraded tag set
 * (just `[segment, "module"]`, no kinds) instead of failing outright.
 */
export function deriveTags(resource: string, manifest: GraphManifest | null): string[] {
  const firstSegment = resource.split("/")[0] ?? resource;
  const kinds = manifest
    ? [...new Set(manifest.symbols.filter((s) => s.file === resource).map((s) => s.kind))].sort()
    : [];
  return [firstSegment, "module", ...kinds];
}

/**
 * Returns `frontmatter.tags` verbatim when it's already a non-empty string
 * array — fold.ts/refresh.ts PRESERVE existing tags rather than inventing a
 * fresh set for a concept that already has one. Otherwise re-derives a
 * fresh set via `deriveTags` — the "legacy concept lacking tags" fallback
 * that keeps the field populated after any writer touches the file.
 */
export function resolveTags(
  frontmatter: Record<string, unknown>,
  resource: string,
  manifest: GraphManifest | null,
): string[] {
  const existing = frontmatter.tags;
  if (Array.isArray(existing) && existing.length > 0 && existing.every((t) => typeof t === "string")) {
    return existing.map(String);
  }
  return deriveTags(resource, manifest);
}
