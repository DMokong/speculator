// Bundle conformance checker for the As-Built Knowledge System (SPEC-048;
// log-structure/citations rules added SPEC-049 Task 4).
//
// Validates an OKF v0.1 bundle written by skeleton.ts's generateBundle
// against the spec's trust invariant (docs/specs/asbuilt-knowledge-system/
// spec.md R3): every concept's frontmatter is parseable and honest about
// its enrichment status, and `enrichment: none` concepts contain zero
// enriched-zone prose. See task-4-brief.md for the exact rule set. Return
// shape is `{ ok, violations, warnings }` — a `warnings` entry never flips
// `ok` to false (see missing-citations on `accuracy-audited` concepts,
// below); only entries in `violations` do.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";
import { parse } from "yaml";
import { argValue } from "./cli";
import { loadManifest } from "./manifest";
import { hasHeadingLine, headingLinesLevel2 } from "./md";
import { conceptPath } from "./skeleton";

const ENRICHMENT_VALUES = new Set(["none", "accuracy-audited", "fully-audited"]);
const ENRICHED_ZONE_HEADINGS = ["# Explanation", "# Decisions", "# Gotchas", "# Citations"];
const STRUCTURE_HEADING = "# Structure";
const CITATIONS_HEADING = "# Citations";
const RESERVED_BASENAMES = new Set(["index.md", "log.md"]);
const LOG_HEADER = "# Bundle Update Log";
const LOG_DATE_HEADING = /^ {0,3}## (\d{4}-\d{2}-\d{2})$/;

interface ParsedFrontmatter {
  hadBlock: boolean;
  parseError: boolean;
  raw: Record<string, unknown> | null;
  body: string;
}

/**
 * A file starting with "---\n" is treated as carrying frontmatter, closed by
 * the next "\n---\n" (resolution #4). Everything after the closing delimiter
 * is the body; everything before it (sans the leading "---\n") is the YAML
 * text handed to the `yaml` package.
 */
function parseFrontmatter(content: string): ParsedFrontmatter {
  if (!content.startsWith("---\n")) {
    return { hadBlock: false, parseError: false, raw: null, body: content };
  }
  // Search from index 3 (not 4) so a degenerate empty block ("---\n---\n") is
  // found: the opening delimiter's own trailing "\n" (at index 3) doubles as
  // the closing pattern's leading "\n", yielding an empty YAML text (correctly
  // parsed as {}) instead of misreading the block as unterminated.
  const closeIdx = content.indexOf("\n---\n", 3);
  if (closeIdx === -1) {
    return { hadBlock: true, parseError: true, raw: null, body: content.slice(4) };
  }
  const yamlText = content.slice(4, closeIdx + 1);
  const body = content.slice(closeIdx + 5);
  try {
    const parsed: unknown = parse(yamlText);
    const raw = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
    return { hadBlock: true, parseError: false, raw, body };
  } catch {
    return { hadBlock: true, parseError: true, raw: null, body };
  }
}

function walkMarkdownFiles(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".graph") continue; // machine-owned graph cache dir, not part of the bundle contract
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkMarkdownFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      out.push(relative(base, full));
    }
  }
  return out;
}

/** Checks a single reserved file (index.md / log.md at any level). Root index.md may carry only `okf_version`. */
function checkReservedFile(relPath: string, fm: ParsedFrontmatter, isRoot: boolean): string[] {
  const violations: string[] = [];
  if (!fm.hadBlock) return violations;

  if (!isRoot) {
    violations.push(`${relPath}: reserved-frontmatter — reserved file must not carry frontmatter`);
    return violations;
  }

  if (fm.parseError || fm.raw === null) {
    violations.push(`${relPath}: reserved-frontmatter — root index.md frontmatter is not valid YAML`);
    return violations;
  }
  const extraKeys = Object.keys(fm.raw).filter((k) => k !== "okf_version");
  if (extraKeys.length > 0) {
    violations.push(
      `${relPath}: reserved-frontmatter — root index.md frontmatter may carry only okf_version (found: ${extraKeys.join(", ")})`,
    );
  }
  return violations;
}

interface ConceptCheckResult {
  violations: string[];
  warnings: string[];
}

/** Checks a single concept file (R1, R2, R3, R4, R5, R6). */
function checkConceptFile(relPath: string, fm: ParsedFrontmatter): ConceptCheckResult {
  const violations: string[] = [];
  const warnings: string[] = [];
  let type: unknown;
  let enrichment: unknown;
  let resource: unknown;

  // R1: parseable frontmatter with non-empty `type`.
  if (!fm.hadBlock) {
    violations.push(`${relPath}: frontmatter-type — no frontmatter block found`);
  } else if (fm.parseError || fm.raw === null) {
    violations.push(`${relPath}: frontmatter-type — frontmatter is not valid YAML`);
  } else {
    type = fm.raw.type;
    enrichment = fm.raw.enrichment;
    resource = fm.raw.resource;
    if (typeof type !== "string" || type.trim() === "") {
      violations.push(`${relPath}: frontmatter-type — type is missing or empty`);
    }
  }

  // R2: enrichment must be one of the three known values (only checkable when frontmatter parsed).
  if (fm.hadBlock && !fm.parseError && fm.raw !== null) {
    if (typeof enrichment !== "string" || !ENRICHMENT_VALUES.has(enrichment)) {
      violations.push(
        `${relPath}: enrichment-value — enrichment '${String(enrichment)}' is not one of none, accuracy-audited, fully-audited`,
      );
    }
  }

  // R3: enrichment: none must not contain enriched-zone prose (the trust invariant).
  if (enrichment === "none") {
    for (const heading of ENRICHED_ZONE_HEADINGS) {
      if (hasHeadingLine(fm.body, heading)) {
        violations.push(`${relPath}: enriched-zone-in-skeleton — enrichment: none but body contains '${heading}'`);
      }
    }
  }

  // R4: every concept has a "# Structure" heading.
  if (!hasHeadingLine(fm.body, STRUCTURE_HEADING)) {
    violations.push(`${relPath}: missing-structure — no '# Structure' heading found`);
  }

  // R5: Module-type concepts have a non-empty resource.
  if (type === "Module") {
    if (typeof resource !== "string" || resource.trim() === "") {
      violations.push(`${relPath}: missing-resource — Module concept has empty resource`);
    }
  }

  // R6 (SPEC-049 Task 4): audited concepts should cite their sources. A
  // `fully-audited` concept without a "# Citations" heading is a violation
  // (the trust invariant is broken — audited prose with no citation trail);
  // an `accuracy-audited` concept without one is only a warning (a lighter
  // audit tier, citations recommended but not load-bearing the same way).
  if (enrichment === "fully-audited" || enrichment === "accuracy-audited") {
    if (!hasHeadingLine(fm.body, CITATIONS_HEADING)) {
      const message = `${relPath}: missing-citations — ${String(enrichment)} concept has no '# Citations' heading`;
      if (enrichment === "fully-audited") {
        violations.push(message);
      } else {
        warnings.push(message);
      }
    }
  }

  return { violations, warnings };
}

/**
 * Validates log.md's structure (SPEC-049 Task 4, R7): the file must open
 * with the literal header line "# Bundle Update Log", every level-2 ("## ")
 * heading must match `YYYY-MM-DD` exactly, and the date groups must appear
 * in strictly descending (newest-first) order — matching fold.ts/refresh.ts's
 * `appendLogBullets` writing convention. Fence-aware via md.ts's
 * `headingLinesLevel2` so a fenced example inside a log bullet's prose can
 * never be mistaken for a real date heading.
 */
function checkLogStructure(relPath: string, content: string): string[] {
  const violations: string[] = [];

  if (!hasHeadingLine(content, LOG_HEADER)) {
    violations.push(`${relPath}: log-structure — missing '${LOG_HEADER}' header`);
  }

  const dates: string[] = [];
  for (const { line } of headingLinesLevel2(content)) {
    const match = LOG_DATE_HEADING.exec(line);
    if (!match?.[1]) {
      violations.push(`${relPath}: log-structure — malformed date heading '${line.trim()}'`);
      continue;
    }
    dates.push(match[1]);
  }

  for (let i = 1; i < dates.length; i++) {
    const prev = dates[i - 1];
    const curr = dates[i];
    if (prev !== undefined && curr !== undefined && !(curr < prev)) {
      violations.push(
        `${relPath}: log-structure — date groups are not strictly descending ('${prev}' followed by '${curr}')`,
      );
    }
  }

  return violations;
}

/**
 * Bundle-completeness rule (SPEC-049 T7 dogfood find): a concept file
 * silently overwritten by a reserved index.md/log.md collision (see
 * skeleton.ts's conceptPath fix) leaves no trace on disk — nothing about
 * the remaining bundle looks malformed, so R1-R7 above never catch it.
 * When a committed graph manifest is present, cross-check it against the
 * bundle: every file that owns at least one symbol must have a concept
 * file at conceptPath(file), or the loss goes undetected exactly as it did
 * in SPEC-048's r2mcp bundle (98 real concepts shipped labeled as 99).
 *
 * The manifest is optional input, not a bundle-shape requirement: fold.ts's
 * evidence-manifest workflows store their own manifests elsewhere, and a
 * bundle without `.graph-manifest.json` at its root has nothing to check
 * completeness against — loadManifest's own read/parse failure (missing
 * file or malformed JSON), or the loaded value simply not having the
 * `GraphManifest` shape (e.g. a stray unrelated JSON file at that path),
 * is caught and the rule is skipped silently, same as an absent log.md is
 * not itself a violation.
 */
function checkCompleteness(bundleDir: string): string[] {
  let files: string[];
  try {
    const manifest = loadManifest(join(bundleDir, ".graph-manifest.json"));
    files = [...new Set(manifest.symbols.map((s) => s.file))].sort();
  } catch {
    return [];
  }

  const violations: string[] = [];
  for (const file of files) {
    const cPath = conceptPath(file);
    if (!existsSync(join(bundleDir, cPath))) {
      violations.push(`${cPath}: missing-concept — manifest file ${file} has no concept page`);
    }
  }
  return violations;
}

interface VerifyResult {
  ok: boolean;
  violations: string[];
  warnings: string[];
  conceptsChecked: number;
}

function verify(bundleDir: string): VerifyResult {
  if (!existsSync(bundleDir) || !statSync(bundleDir).isDirectory()) {
    return {
      ok: false,
      violations: [`${bundleDir}: missing-structure — bundle directory does not exist`],
      warnings: [],
      conceptsChecked: 0,
    };
  }

  const violations: string[] = [];
  const warnings: string[] = [];
  let conceptsChecked = 0;

  for (const relPath of walkMarkdownFiles(bundleDir).sort()) {
    const content = readFileSync(join(bundleDir, relPath), "utf8");
    const fm = parseFrontmatter(content);
    const isReserved = RESERVED_BASENAMES.has(basename(relPath));

    if (isReserved) {
      violations.push(...checkReservedFile(relPath, fm, relPath === "index.md"));
      if (basename(relPath) === "log.md") {
        violations.push(...checkLogStructure(relPath, fm.body));
      }
      continue;
    }

    conceptsChecked++;
    const { violations: conceptViolations, warnings: conceptWarnings } = checkConceptFile(relPath, fm);
    violations.push(...conceptViolations);
    warnings.push(...conceptWarnings);
  }

  violations.push(...checkCompleteness(bundleDir));

  return { ok: violations.length === 0, violations, warnings, conceptsChecked };
}

/** Validates an OKF v0.1 bundle at `bundleDir` (`<repo>/docs/asbuilt`). See task-4-brief.md rules R1-R7. */
export function verifyBundle(bundleDir: string): { ok: boolean; violations: string[]; warnings: string[] } {
  const { ok, violations, warnings } = verify(bundleDir);
  return { ok, violations, warnings };
}

export const CLI_USAGE = "bun asbuilt/src/verify.ts --target <repo>";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const target = argValue("--target");
  if (!target) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const bundleDir = join(target, "docs/asbuilt");
  const { ok, violations, warnings, conceptsChecked } = verify(bundleDir);
  for (const v of violations) console.log(v);
  for (const w of warnings) console.log(`warn: ${w}`);
  if (!ok) {
    process.exit(1);
  }
  console.log(`verify-asbuilt: OK (${conceptsChecked} concepts checked)`);
  process.exit(0);
}
