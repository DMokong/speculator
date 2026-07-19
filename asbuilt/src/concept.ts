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
import { isTestSource } from "./lang";
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
  return [firstSegment, "module", ...(isTestSource(resource) ? ["test"] : []), ...kinds];
}

/** Machine-derived concept type: "Test" for test sources (OKF v0.1 §4.1 producer-defined type), else "Module". */
export function conceptType(resource: string): "Test" | "Module" {
  return isTestSource(resource) ? "Test" : "Module";
}

/**
 * The machine-vocabulary membership test — THE canonical predicate for "does
 * this concept carry a human/LLM semantic type, or only machine defaults?"
 * `Module`, `Test`, absent, and null are all machine values (PR #3 review C4:
 * reclassify.ts hand-rolled `!== "Module"` here and silently preserved
 * absent/null types that fold correctly treated as machine vocabulary —
 * the 4th divergence bred by duplicating this predicate; claw-jeh5).
 */
export function isMachineType(existing: unknown): boolean {
  return existing === "Module" || existing === "Test" || existing === undefined || existing === null;
}

/**
 * Reclassifies a machine-vocabulary type ("Module"/"Test"/absent) from the resource's
 * test convention; any other producer-defined type is preserved untouched.
 */
export function reclassifyType(existing: unknown, resource: string): unknown {
  return isMachineType(existing) ? conceptType(resource) : existing;
}

/**
 * Outcome of the SHARED semantic-type precedence core (claw-jeh5 extraction,
 * PR #3 review). Callers map outcomes onto their own bucket/reason
 * vocabulary; the precedence ORDER lives here exactly once.
 */
export type SemanticTypeOutcome =
  | "apply" // machine-typed, boundary-clear: the suggestion wins
  | "preserve" // existing semantic type wins (first-semantic-wins)
  | "skip-machine-literal" // suggested is literal Module/Test (treated as absent)
  | "skip-unknown-resource" // resource missing/non-string: test boundary indeterminate — fail toward skip
  | "skip-test-boundary" // resource classifies as Test: suggestion never crosses the boundary
  | "skip-machine-owned"; // existing type is machine-owned "Test" and the caller enforces ownership

/**
 * Shared precedence core for applying a WELL-FORMED semantic type suggestion
 * — the single implementation both fold.ts (`decideConceptType`) and
 * reclassify.ts consume. Four precedence divergences across three audits all
 * came from each file re-implementing this chain by hand (claw-jeh5).
 *
 * Precedence, in order: literal Module/Test suggestion → unknown resource
 * (fail toward skip: a missing/non-string `resource` used to short-circuit
 * the test-boundary guard straight through to apply in BOTH files — PR #3
 * review) → test-boundary → machine-owned existing "Test" (only when
 * `machineOwnedTestGuard` — reclassify defers to machine ownership; fold
 * deliberately does not, a DISCLOSED divergence for drifted `type: Test` on
 * non-test resources) → first-semantic-wins → apply.
 *
 * Malformed-suggestion handling stays caller-side BY DESIGN: fold buckets
 * `skippedInvalid` and keeps folding siblings (tolerant of LLM draft
 * output); reclassify treats it as a validation violation that aborts the
 * whole run (its artifact is an authored, all-or-nothing input — AC9). That
 * divergence is intentional and documented at both call sites.
 */
export function decideSemanticType(
  existingType: unknown,
  resource: unknown,
  suggested: string,
  opts: { machineOwnedTestGuard: boolean },
): SemanticTypeOutcome {
  if (suggested === "Module" || suggested === "Test") return "skip-machine-literal";
  if (typeof resource !== "string" || resource === "") return "skip-unknown-resource";
  if (conceptType(resource) === "Test") return "skip-test-boundary";
  if (opts.machineOwnedTestGuard && existingType === "Test") return "skip-machine-owned";
  if (!isMachineType(existingType)) return "preserve";
  return "apply";
}

/** Ensures the `test` tag matches the resource's classification while preserving every other tag and their order. */
export function reclassifyTags(tags: string[], resource: string): string[] {
  const isTest = isTestSource(resource);
  const has = tags.includes("test");
  if (isTest && !has) {
    const i = tags.indexOf("module");
    return i === -1 ? [...tags, "test"] : [...tags.slice(0, i + 1), "test", ...tags.slice(i + 1)];
  }
  if (!isTest && has) return tags.filter((t) => t !== "test");
  return tags;
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
