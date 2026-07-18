// Mechanical backfill applier for the As-Built Knowledge System (SPEC-005
// R3, AC6, AC7, AC9, AC9a, AC10) — the ONLY way an already-enriched concept
// (one fold's hash-equality early-return can never re-visit; see refresh.ts's
// header, claw-nb9j) ever gets a semantic frontmatter `type`. Companion to
// fold.ts's `suggested_type` forward path (SPEC-005 R2): this file backfills
// the SAME field, mechanically, from a pre-computed artifact instead of a
// live LLM judgment — the mechanical/judgment boundary this whole spec turns
// on (docs/specs/asbuilt-semantic-types/spec.md "Intent & Anti-Patterns").
//
// Artifact format (YAML):
//
//   reclassifications:
//     - concept: <bundle-relative concept path, e.g. "src/alpha.md">
//       suggested_type: <string — the LLM's judged architectural role>
//     - concept: ...
//       suggested_type: ...
//
// `concept` matches the SAME bundle-relative path fold.ts's drafts use (see
// fold.ts's `normalizedConcept`): relative to <targetRepo>/docs/asbuilt/,
// optionally prefixed with "docs/asbuilt/" (stripped once, mirroring fold's
// normalization so reclassify accepts the same path shapes fold's drafts
// do). `suggested_type` is a single-line, non-empty string; open vocabulary
// (AC9) — any well-formed value outside the curated core vocabulary is
// accepted and applied as-is, no enum check.
//
// Two-phase run (mirrors fold.ts's validate-then-write shape):
//
//   1. VALIDATION (whole artifact, before any write): every entry's
//      `suggested_type` must be a non-empty, single-line string, and every
//      entry's `concept` must resolve to a real concept file in the target
//      bundle. ANY violation anywhere in the artifact aborts the ENTIRE run
//      (all-or-nothing) with a nonzero exit and zero writes — every
//      violation is collected and reported together, not just the first.
//   2. APPLY (only reached if validation found zero violations): entries are
//      processed in codepoint-sorted concept-path order (determinism; no
//      clock reads, no randomness — AC10) and each is classified:
//        - concept is skeleton-only (frontmatter `enrichment` is "none" or
//          absent) -> skipped, untouched.
//        - `suggested_type` is literally "Module" or "Test" -> skipped,
//          untouched (AC9a: treated exactly as if the field were absent).
//        - concept's current frontmatter `type` is "Test" -> skipped,
//          untouched (machine-owned classification; never reclassified).
//        - concept's current frontmatter `type` is already semantic
//          (anything other than "Module") -> preserved, untouched
//          (first-semantic-wins).
//        - otherwise (enriched, currently `type: Module`) -> applied:
//          exactly the frontmatter `type` line is rewritten; every other
//          byte of the file (every other frontmatter field, in its original
//          SPEC-049 field order, and the entire body) is left untouched.
//
// Idempotent by construction (AC10): a concept whose type reclassify already
// wrote no longer reads as `type: Module` on a later run, so it falls into
// the "already semantic" (preserved) branch instead of being rewritten
// again — no need to special-case "already-applied" separately.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse, stringify } from "yaml";
import { argValue } from "./cli";
import { conceptType, parseFrontmatter, splitConcept } from "./concept";

export interface ReclassifyOptions {
  targetRepo: string;
  artifactPath: string;
}

export interface ReclassifySkip {
  concept: string;
  reason: string;
}

export interface ReclassifyResult {
  applied: string[]; // concept paths whose frontmatter `type` was rewritten
  preserved: ReclassifySkip[]; // concept paths that already carried a semantic type (first-semantic-wins)
  skipped: ReclassifySkip[]; // skeleton-only concepts, AC9a Module/Test literals, and Test-classified concepts
}

interface RawEntry {
  concept?: unknown;
  suggested_type?: unknown;
}

interface ArtifactShape {
  reclassifications?: RawEntry[];
}

interface NormalizedEntry {
  rawConcept: string; // exactly as given in the artifact (used in violation/skip messages)
  concept: string; // bundle-relative, one leading "docs/asbuilt/" prefix stripped
  suggestedType: string;
}

/** Strips a single leading "docs/asbuilt/" prefix — mirrors fold.ts's concept-path normalization. */
function normalizeConceptPath(concept: string): string {
  return concept.startsWith("docs/asbuilt/") ? concept.slice("docs/asbuilt/".length) : concept;
}

/**
 * Reads `path` as utf8, translating any failure (missing file, permission
 * error, etc.) into the reclassify refusal convention instead of letting a
 * raw ENOENT/EACCES bubble up — mirrors fold.ts's `readFileOrThrow`.
 */
function readFileOrThrow(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`refusing to reclassify: cannot read ${path}`);
  }
}

/**
 * Rewrites exactly the `type:` line of a concept's raw frontmatter block to
 * `newType`, leaving every other line byte-untouched — the surgical (not
 * full-reconstruction) approach required content #4 demands ("differs from
 * before by exactly the type line"). `stringify({ type: newType })`
 * delegates quoting/escaping to the same yaml library the block was
 * originally rendered with (concept.ts's `renderFrontmatter`), so the
 * rewritten line stays consistent with that formatting.
 */
function rewriteTypeLine(frontmatterBlock: string, newType: string): string {
  const lines = frontmatterBlock.split("\n");
  const idx = lines.findIndex((line, i) => i > 0 && line.startsWith("type:"));
  if (idx === -1) {
    throw new Error("refusing to reclassify: frontmatter block has no type field");
  }
  lines[idx] = stringify({ type: newType }).replace(/\n$/, "");
  return lines.join("\n");
}

/**
 * A concept file's full content, its raw frontmatter block, its parsed
 * frontmatter object, and the exact RAW bytes of everything past the
 * frontmatter (mirrors refresh.ts's `readFrontmatterAndRawBody` — no
 * machine/enriched re-split, so the body can never be reformatted by this
 * applier).
 */
function readConcept(
  conceptAbsPath: string,
  conceptLabel: string,
): { content: string; frontmatterBlock: string; frontmatter: Record<string, unknown>; rawBody: string } {
  const content = readFileSync(conceptAbsPath, "utf8");
  let split: ReturnType<typeof splitConcept>;
  try {
    split = splitConcept(content);
  } catch (err) {
    throw new Error(`refusing to reclassify: ${err instanceof Error ? err.message : String(err)}: ${conceptLabel}`);
  }
  const frontmatter = parseFrontmatter(split.frontmatterBlock);
  return { content, frontmatterBlock: split.frontmatterBlock, frontmatter, rawBody: content.slice(split.frontmatterBlock.length) };
}

/**
 * Applies a reclassification artifact to `opts.targetRepo`'s OKF bundle. See
 * this file's header comment for the exact two-phase contract. Throws
 * (before any write) when validation finds any violation anywhere in the
 * artifact — the thrown Error's message names every violating concept, not
 * just the first (AC9's "one malformed entry must not silently swallow
 * sibling violations" — unlike fold's single-throw-on-first-violation
 * convention, reclassify's all-or-nothing validation pass is exhaustive).
 */
export function reclassify(opts: ReclassifyOptions): ReclassifyResult {
  const artifactAbsPath = resolve(opts.artifactPath);
  const artifactText = readFileOrThrow(artifactAbsPath);
  const parsed: unknown = parse(artifactText);
  const artifact: ArtifactShape = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as ArtifactShape) : {};
  const rawEntries = Array.isArray(artifact.reclassifications) ? artifact.reclassifications : [];

  const bundleDir = join(opts.targetRepo, "docs/asbuilt");

  // Codepoint-sorted deterministic order (AC10) — applied to validation
  // reporting order too, so violation messages and apply-phase writes are
  // stable regardless of the artifact's own entry order.
  const sortedRaw = [...rawEntries].sort((a, b) => {
    const ac = typeof a.concept === "string" ? a.concept : "";
    const bc = typeof b.concept === "string" ? b.concept : "";
    return ac < bc ? -1 : ac > bc ? 1 : 0;
  });

  // Phase 1 (validate-all-before-write-any): resolve + validate every
  // entry's suggested_type shape and concept-path existence BEFORE the
  // first write. Collects EVERY violation instead of throwing on the first
  // (AC9's multi-violation test).
  const violations: string[] = [];
  const prepared: NormalizedEntry[] = [];
  for (const raw of sortedRaw) {
    const rawConcept = typeof raw.concept === "string" ? raw.concept : String(raw.concept ?? "");
    const concept = normalizeConceptPath(rawConcept);
    const suggested = raw.suggested_type;

    let malformedReason: string | null = null;
    if (typeof suggested !== "string") {
      malformedReason = `suggested_type is not a string (got: ${JSON.stringify(suggested)})`;
    } else if (suggested.trim() === "") {
      malformedReason = "suggested_type is empty";
    } else if (suggested.includes("\n")) {
      malformedReason = "suggested_type is multi-line";
    }
    if (malformedReason !== null) {
      violations.push(`${rawConcept}: ${malformedReason}`);
      continue;
    }

    const conceptAbsPath = join(bundleDir, concept);
    if (!existsSync(conceptAbsPath)) {
      violations.push(`${rawConcept}: unknown concept path`);
      continue;
    }

    prepared.push({ rawConcept, concept, suggestedType: suggested as string });
  }

  if (violations.length > 0) {
    throw new Error(`refusing to reclassify: ${violations.length} violation(s):\n${violations.map((v) => `  - ${v}`).join("\n")}`);
  }

  // Phase 2: APPLY — every entry here already passed validation.
  const applied: string[] = [];
  const preserved: ReclassifySkip[] = [];
  const skipped: ReclassifySkip[] = [];

  for (const entry of prepared) {
    const conceptAbsPath = join(bundleDir, entry.concept);
    const { content, frontmatterBlock, frontmatter, rawBody } = readConcept(conceptAbsPath, entry.concept);

    const enrichment = typeof frontmatter.enrichment === "string" ? frontmatter.enrichment : "none";
    if (enrichment === "none") {
      skipped.push({ concept: entry.concept, reason: "skeleton-only concept (enrichment: none)" });
      continue;
    }

    if (entry.suggestedType === "Module" || entry.suggestedType === "Test") {
      skipped.push({
        concept: entry.concept,
        reason: `suggested_type "${entry.suggestedType}" is machine vocabulary (Module/Test); treated as absent`,
      });
      continue;
    }

    // Test-boundary guard (final-audit AC4 finding, 2026-07-19): the boundary
    // is derived from the concept's RESOURCE filename, not its current
    // frontmatter type — a drifted test concept still typed Module must never
    // receive a semantic type via this automated path, and a pre-existing
    // semantic type on a test resource is left alone (preserved in value,
    // suggestion skipped), mirroring fold's canonical precedence.
    const resource = typeof frontmatter.resource === "string" ? frontmatter.resource : "";
    if (resource !== "" && conceptType(resource) === "Test") {
      skipped.push({
        concept: entry.concept,
        reason: "test-classified resource (filename pattern); type is machine-owned — suggestion never applied across the test boundary",
      });
      continue;
    }

    const currentType = frontmatter.type;
    if (currentType === "Test") {
      skipped.push({ concept: entry.concept, reason: "current type is machine-owned Test classification; not reclassified" });
      continue;
    }
    if (currentType !== "Module") {
      preserved.push({
        concept: entry.concept,
        reason: `existing type ${JSON.stringify(currentType)} preserved (first-semantic-wins)`,
      });
      continue;
    }

    const newFrontmatterBlock = rewriteTypeLine(frontmatterBlock, entry.suggestedType);
    const newContent = newFrontmatterBlock + rawBody;
    if (newContent !== content) {
      writeFileSync(conceptAbsPath, newContent);
    }
    applied.push(entry.concept);
  }

  return { applied, preserved, skipped };
}

export const CLI_USAGE = "bun asbuilt/src/reclassify.ts --target <repo> --artifact <path>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const targetRepo = argValue("--target");
  const artifactPath = argValue("--artifact");

  if (!targetRepo || !artifactPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }

  try {
    const { applied, preserved, skipped } = reclassify({ targetRepo, artifactPath });
    console.log(`applied=${applied.length} preserved=${preserved.length} skipped=${skipped.length}`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
