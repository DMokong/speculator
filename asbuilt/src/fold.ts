// Close-time fold-in for the As-Built Knowledge System (SPEC-049 Task 2).
//
// This is the ONLY writer of enriched zones ("# Explanation", "# Decisions",
// "# Citations") in an OKF v0.1 bundle (skeleton.ts, Task 3): it takes a
// PASSED gate-2c-asbuilt.yml evidence file (SPEC-048's evidence.ts) plus the
// generator artifact it references, and lands the artifact's
// `enrichment_drafts` into the bundle's concept files, updating their
// frontmatter (`enrichment`, `from`, `explains`, `stale`, `stale_reason`) and
// appending an entry to the bundle's `log.md`.
//
// This is the load-bearing piece of the trust invariant (docs/specs/
// asbuilt-knowledge-system/spec.md R3): every statement of fact in the
// bundle is either mechanically extracted (skeleton.ts) or independently
// audited (this file, gated on a passed evidence artifact). fold() refuses
// — throwing before any file is written — whenever that invariant can't be
// established: a non-passing evidence result, a mechanical veto, an
// unflagged degraded (LLM-only) run, a provenance downgrade, or a draft
// naming a concept that doesn't exist in the target bundle. See
// task-2-brief.md for the exact fold semantics this implements.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { parse } from "yaml";
import { argValue, hasFlag } from "./cli";
import { parseFrontmatter, renderFrontmatter, resolveTags, splitConcept } from "./concept";
import { type GraphManifest, loadManifest } from "./manifest";
import { headingLines, isExactHeading } from "./md";

export interface FoldOptions {
  evidencePath: string;
  targetRepo: string;
  specId: string;
  provenance: "fully-audited" | "accuracy-audited";
  /** YYYY-MM-DD; defaults to today's local date when omitted. Tests always pass a fixed value for byte-stability. */
  date?: string;
  /** Permits folding evidence whose mechanical checks were skipped (LLM-only degraded runs). */
  allowUnchecked?: boolean;
}

export interface FoldResult {
  folded: string[]; // concept paths written (content changed)
  skipped: string[]; // concept paths already current (byte-identical — no write)
}

interface EnrichmentDraft {
  concept: string;
  explanation: string;
  decisions: string;
}

interface CodeLocation {
  symbol: string;
  lines?: string;
}

interface ComprehensionEntry {
  ac_id?: string;
  code_locations?: CodeLocation[];
}

interface ArtifactShape {
  comprehension_entries?: ComprehensionEntry[];
  enrichment_drafts?: EnrichmentDraft[];
}

interface MechanicalBlock {
  blocking?: boolean;
  skipped?: true;
}

interface EvidenceShape {
  result?: string;
  mechanical?: MechanicalBlock;
  spec_id?: string;
  generator?: { artifact?: string };
}

interface PreparedConcept {
  draft: EnrichmentDraft;
  conceptAbsPath: string;
  oldContent: string;
  frontmatter: Record<string, unknown>;
  machineBody: string;
  enrichedExisting: string;
}

/**
 * Splits a concept file's full content into its frontmatter block, machine
 * zone, and existing enriched zone, and parses the frontmatter into an
 * object — wrapping concept.ts's shared `splitConcept`/`parseFrontmatter`
 * (SPEC-049 Task 4 consolidation; this file previously carried its own
 * copies of both) with this module's "refusing to fold" error convention.
 */
function readConcept(
  content: string,
  conceptLabel: string,
): { frontmatter: Record<string, unknown>; machineBody: string; enrichedExisting: string } {
  let split: ReturnType<typeof splitConcept>;
  try {
    split = splitConcept(content);
  } catch (err) {
    throw new Error(`refusing to fold: ${err instanceof Error ? err.message : String(err)}: ${conceptLabel}`);
  }
  const frontmatter = parseFrontmatter(split.frontmatterBlock);
  return { frontmatter, machineBody: split.machineZone, enrichedExisting: split.enrichedZone };
}

/**
 * Existing `- (SPEC-ID) <text>` bullets under "# Decisions", keyed by spec
 * id, in whatever order they appear (order doesn't matter — the caller
 * re-sorts by spec id). Fenced-code-aware: a heading-shaped line inside a
 * ```-fenced example (e.g. an Explanation quoting "# Decisions" as literal
 * text) does not open or close the section, so a fenced example bullet like
 * "- (FAKE-SPEC) x" can never leak into the real accumulation.
 */
function parseDecisionsSection(enriched: string): Map<string, string> {
  const map = new Map<string, string>();
  const headingIdx = new Set(headingLines(enriched).map((h) => h.index));
  let inSection = false;
  const lines = enriched.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\s+$/, "");
    const isHeadingCandidate = headingIdx.has(i);
    if (isHeadingCandidate && isExactHeading(line, "# Decisions")) {
      inSection = true;
      continue;
    }
    if (inSection && isHeadingCandidate) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const m = line.match(/^- \((\S+)\) (.*)$/);
      if (m && m[1] !== undefined && m[2] !== undefined) {
        map.set(m[1], m[2]);
      }
    }
  }
  return map;
}

/**
 * Existing citation bodies (text after "[n] ") under "# Citations", in
 * first-appearance file order. Fenced-code-aware — see parseDecisionsSection.
 */
function parseCitationsSection(enriched: string): string[] {
  const out: string[] = [];
  const headingIdx = new Set(headingLines(enriched).map((h) => h.index));
  let inSection = false;
  const lines = enriched.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = (lines[i] ?? "").replace(/\s+$/, "");
    const isHeadingCandidate = headingIdx.has(i);
    if (isHeadingCandidate && isExactHeading(line, "# Citations")) {
      inSection = true;
      continue;
    }
    if (inSection && isHeadingCandidate) {
      inSection = false;
      continue;
    }
    if (inSection) {
      const m = line.match(/^\[\d+\] (.*)$/);
      if (m && m[1] !== undefined) {
        out.push(m[1]);
      }
    }
  }
  return out;
}

/**
 * Reads `path` as utf8, translating any failure (missing file, permission
 * error, etc.) into the fold refusal convention instead of letting a raw
 * ENOENT/EACCES bubble up — evidence/artifact paths are user-supplied
 * (`--evidence`, and `generator.artifact` resolved relative to it), so a
 * typo'd or moved path should read as a clear refusal, not a stack trace.
 */
function readFileOrThrow(path: string): string {
  try {
    return readFileSync(path, "utf8");
  } catch {
    throw new Error(`refusing to fold: cannot read ${path}`);
  }
}

/** repo-relative path via node:path relative(); falls back to the absolute path when outside the repo. */
function repoRelativePath(targetRepo: string, absPath: string): string {
  const rel = relative(resolve(targetRepo), absPath);
  return rel.startsWith("..") ? absPath : rel;
}

/**
 * Renders a concept's full new file content: unchanged frontmatter keys
 * (type/title/description/resource/graph_hash), `tags` preserved-or-
 * re-derived (see `resolveTags`), plus this fold's updates
 * (enrichment/from/explains/stale/stale_reason), the untouched machine zone,
 * and a freshly rendered enriched zone (Explanation replaced verbatim;
 * Decisions/Citations accumulated across specs, deduped, deterministically
 * ordered).
 */
function renderConceptContent(
  p: PreparedConcept,
  opts: FoldOptions,
  allCitedSymbols: string[],
  evidenceAbsPath: string,
  graphManifest: GraphManifest | null,
): string {
  const resource = typeof p.frontmatter.resource === "string" ? p.frontmatter.resource : "";
  const matchingSymbols = allCitedSymbols.filter((sym) => sym.split("#")[0] === resource);
  const existingExplains = Array.isArray(p.frontmatter.explains) ? p.frontmatter.explains.map(String) : [];
  // claw-nybt: ids absent from the committed manifest are dead — their symbol was
  // deleted — and retaining them keeps refresh flagging the concept stale forever
  // (no re-audit can clear it). Manifest-present ids all survive, so a partial
  // re-audit never shrinks live coverage. With no manifest on disk there is
  // nothing to validate against: the merge is preserved unchanged.
  const merged = [...new Set([...existingExplains, ...matchingSymbols])].sort();
  const manifestIds = graphManifest ? new Set(graphManifest.symbols.map((s) => s.id)) : null;
  const explains = manifestIds ? merged.filter((id) => manifestIds.has(id)) : merged;

  const existingFrom = Array.isArray(p.frontmatter.from) ? p.frontmatter.from.map(String) : [];
  const from = existingFrom.includes(opts.specId) ? existingFrom : [...existingFrom, opts.specId];

  // SPEC-049 field order: type,title,description,resource,tags,enrichment,
  // from,explains,stale,stale_reason,graph_hash (see concept.ts's
  // renderFrontmatter). `tags` is PRESERVED from the existing concept when
  // present, else re-derived from the bundle's committed graph manifest (T4,
  // SPEC-049 Task 4) — see concept.ts's `resolveTags`.
  const frontmatterBlock = renderFrontmatter({
    type: p.frontmatter.type,
    title: p.frontmatter.title,
    description: p.frontmatter.description,
    resource: p.frontmatter.resource,
    tags: resolveTags(p.frontmatter, resource, graphManifest),
    enrichment: opts.provenance,
    from,
    explains,
    stale: false,
    stale_reason: "",
    graph_hash: p.frontmatter.graph_hash,
  });

  const decisionsMap = parseDecisionsSection(p.enrichedExisting);
  decisionsMap.set(opts.specId, p.draft.decisions.trim());
  const decisionsLines = [...decisionsMap.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([id, text]) => `- (${id}) ${text}`);

  const evidenceRelPath = repoRelativePath(opts.targetRepo, evidenceAbsPath);
  const newCitationBody = `${opts.specId} evidence: ${evidenceRelPath}`;
  const existingCitations = parseCitationsSection(p.enrichedExisting);
  const citations = existingCitations.includes(newCitationBody) ? existingCitations : [...existingCitations, newCitationBody];
  const citationLines = citations.map((body, i) => `[${i + 1}] ${body}`);

  const explanationSection = `# Explanation\n${p.draft.explanation.trim()}`;
  const decisionsSection = `# Decisions\n${decisionsLines.join("\n")}`;
  const citationsSection = `# Citations\n${citationLines.join("\n")}`;
  const enrichedBody = [explanationSection, decisionsSection, citationsSection].join("\n\n");

  return `${frontmatterBlock}\n${p.machineBody}\n\n${enrichedBody}\n`;
}

interface LogGroup {
  date: string;
  bullets: string[];
}

/** Parses log.md into ordered date groups; unrecognized lines (the header, blank lines) are ignored. */
function parseLog(content: string): LogGroup[] {
  const groups: LogGroup[] = [];
  let current: LogGroup | null = null;
  for (const line of content.split("\n")) {
    const m = line.match(/^## (\d{4}-\d{2}-\d{2})$/);
    if (m?.[1] !== undefined) {
      current = { date: m[1], bullets: [] };
      groups.push(current);
      continue;
    }
    if (current && line.startsWith("* ")) {
      current.bullets.push(line);
    }
  }
  return groups;
}

function renderLog(groups: LogGroup[]): string {
  const body = groups.map((g) => `## ${g.date}\n${g.bullets.join("\n")}`).join("\n\n");
  return `# Bundle Update Log\n\n${body}\n`;
}

/**
 * Appends `bullets` to log.md's `date` group (creating the file and/or the
 * group as needed, keeping groups newest-first), skipping any bullet that
 * already exists verbatim anywhere in the file. Writes only when the
 * rendered content differs from what's on disk, so a re-fold that adds no
 * new bullets leaves the file's mtime (and bytes) untouched.
 *
 * A date group is pruned before rendering if it ends up with zero bullets —
 * this matters when every bullet in this batch already exists elsewhere in
 * the log (e.g. re-folding identical inputs under a later --date): without
 * the prune, the freshly-created-but-empty group would render as an orphan
 * "## <date>" heading with no bullets beneath it.
 *
 * Exported (SPEC-049 Task 3) so refresh.ts's `**Refresh**` bullets share this
 * single log.md-append implementation instead of a second copy — this file
 * remains the only writer of log.md's date-grouping/dedup conventions.
 */
export function appendLogBullets(logPath: string, date: string, bullets: string[]): void {
  const existingContent = existsSync(logPath) ? readFileSync(logPath, "utf8") : "";
  const groups = existsSync(logPath) ? parseLog(existingContent) : [];
  const seen = new Set(groups.flatMap((g) => g.bullets));

  let group = groups.find((g) => g.date === date);
  if (!group) {
    group = { date, bullets: [] };
    const insertIdx = groups.findIndex((g) => g.date < date);
    if (insertIdx === -1) groups.push(group);
    else groups.splice(insertIdx, 0, group);
  }

  for (const bullet of bullets) {
    if (!seen.has(bullet)) {
      group.bullets.push(bullet);
      seen.add(bullet);
    }
  }

  const prunedGroups = groups.filter((g) => g.bullets.length > 0);
  const newContent = renderLog(prunedGroups);
  if (newContent !== existingContent) {
    writeFileSync(logPath, newContent);
  }
}

/**
 * Folds a passed gate-2c-asbuilt.yml evidence artifact's `enrichment_drafts`
 * into the target repo's OKF bundle. See the fold semantics in
 * task-2-brief.md (Steps 1-6) for the exact contract; summarized:
 *
 * 1. Refuse unless the evidence passed cleanly (see the mechanical-gate
 *    checks below) — zero writes on refusal.
 * 2. Resolve the generator artifact relative to the evidence file's
 *    directory and read its `enrichment_drafts`.
 * 3. Validate EVERY draft's concept path exists and the provenance-downgrade
 *    rule for EVERY target BEFORE writing anything (atomic all-or-nothing).
 * 4. For each concept, keep frontmatter (with this fold's updates) + the
 *    machine zone, and render fresh enriched zones (Explanation/Decisions/
 *    Citations).
 * 5. Append a `log.md` entry per concept (idempotent on exact-bullet match).
 * 6. Write only when bytes differ; return the folded/skipped concept lists.
 */
export function fold(opts: FoldOptions): FoldResult {
  const date = opts.date ?? new Date().toISOString().slice(0, 10);

  const evidenceAbsPath = resolve(opts.evidencePath);
  const evidenceText = readFileOrThrow(evidenceAbsPath);
  const evidence: unknown = parse(evidenceText);
  if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) {
    throw new Error(`refusing to fold: evidence file did not parse to a YAML mapping: ${opts.evidencePath}`);
  }
  const ev = evidence as EvidenceShape;

  if (ev.result !== "pass") {
    throw new Error(`refusing to fold: evidence result is not "pass" (got: ${JSON.stringify(ev.result)})`);
  }

  const mechanical = ev.mechanical;
  if (mechanical === undefined || mechanical === null || typeof mechanical !== "object") {
    throw new Error("refusing to fold: evidence has no mechanical block");
  }
  const mechanicalOk = mechanical.blocking === false || mechanical.skipped === true;
  if (!mechanicalOk) {
    throw new Error(
      `refusing to fold: mechanical checks did not pass cleanly (blocking=${JSON.stringify(mechanical.blocking)}, skipped=${JSON.stringify(mechanical.skipped)})`,
    );
  }
  if (mechanical.skipped === true && !opts.allowUnchecked) {
    throw new Error(
      "refusing to fold: mechanical checks were skipped (LLM-only degraded run) — pass --allow-unchecked to fold anyway",
    );
  }

  const generatorArtifact = ev.generator?.artifact;
  if (typeof generatorArtifact !== "string" || generatorArtifact === "") {
    throw new Error("refusing to fold: evidence has no generator.artifact");
  }
  const artifactAbsPath = join(dirname(evidenceAbsPath), generatorArtifact);
  const artifactText = readFileOrThrow(artifactAbsPath);
  const artifactParsed: unknown = parse(artifactText);
  const artifact: ArtifactShape =
    artifactParsed && typeof artifactParsed === "object" && !Array.isArray(artifactParsed)
      ? (artifactParsed as ArtifactShape)
      : {};
  const drafts = artifact.enrichment_drafts ?? [];
  const comprehensionEntries = artifact.comprehension_entries ?? [];
  const allCitedSymbols = comprehensionEntries.flatMap((e) => (e.code_locations ?? []).map((l) => l.symbol));

  const bundleDir = join(opts.targetRepo, "docs/asbuilt");

  // Loaded once (if present) so renderConceptContent can re-derive `tags`
  // for a legacy concept that lacks them (concept.ts's `resolveTags`); `null`
  // when no manifest is committed yet, in which case resolveTags falls back
  // to a degraded (kind-less) tag set rather than failing the fold.
  const manifestPath = join(bundleDir, ".graph-manifest.json");
  const graphManifest: GraphManifest | null = existsSync(manifestPath) ? loadManifest(manifestPath) : null;

  // Process concepts in a fixed (path-sorted) order for determinism — this
  // affects log.md bullet ordering within a date group, not per-concept
  // correctness.
  const sortedDrafts = [...drafts].sort((a, b) => (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0));

  // Phase 1 (validate-all-before-write-any): resolve + validate every
  // draft's concept path and the provenance-downgrade rule BEFORE the first
  // write. Throws on the first violation found — nothing has been written
  // yet at that point, so a mid-list failure still yields zero writes.
  const prepared: PreparedConcept[] = [];
  for (const draft of sortedDrafts) {
    // Normalize concept path: strip leading "docs/asbuilt/" prefix if present
    // (exactly once, at the start). This handles asbuilt-generator emitting
    // bundle-dir-prefixed paths while fold.ts expects bundle-relative paths.
    let normalizedConcept = draft.concept;
    if (normalizedConcept.startsWith("docs/asbuilt/")) {
      normalizedConcept = normalizedConcept.slice("docs/asbuilt/".length);
    }

    const conceptAbsPath = join(bundleDir, normalizedConcept);
    if (!existsSync(conceptAbsPath)) {
      throw new Error(
        `refusing to fold: concept does not exist in the bundle: ${draft.concept}`,
      );
    }
    const oldContent = readFileSync(conceptAbsPath, "utf8");
    const { frontmatter, machineBody, enrichedExisting } = readConcept(
      oldContent,
      normalizedConcept,
    );
    if (opts.provenance === "accuracy-audited" && frontmatter.enrichment === "fully-audited") {
      throw new Error(
        `refusing to fold: ${normalizedConcept} is already fully-audited — refusing to downgrade to accuracy-audited`,
      );
    }
    // Store normalized concept in the prepared entry so all downstream uses are consistent
    prepared.push({
      draft: { ...draft, concept: normalizedConcept },
      conceptAbsPath,
      oldContent,
      frontmatter,
      machineBody,
      enrichedExisting,
    });
  }

  // Phase 2: compute + write (only when bytes differ) + log.md.
  const folded: string[] = [];
  const skipped: string[] = [];
  const logBullets: string[] = [];

  for (const p of prepared) {
    const newContent = renderConceptContent(p, opts, allCitedSymbols, evidenceAbsPath, graphManifest);
    if (newContent === p.oldContent) {
      skipped.push(p.draft.concept);
    } else {
      writeFileSync(p.conceptAbsPath, newContent);
      folded.push(p.draft.concept);
    }
    const title = typeof p.frontmatter.title === "string" ? p.frontmatter.title : String(p.frontmatter.title ?? "");
    logBullets.push(`* **Fold**: ${opts.specId} enriched [${title}](/${p.draft.concept}) (${opts.provenance}).`);
  }

  if (logBullets.length > 0) {
    appendLogBullets(join(bundleDir, "log.md"), date, logBullets);
  }

  return { folded, skipped };
}

export const CLI_USAGE =
  "bun asbuilt/src/fold.ts --evidence <gate-2c-asbuilt.yml> --target <repo> --spec-id SPEC-NNN [--provenance fully-audited|accuracy-audited] [--date YYYY-MM-DD] [--allow-unchecked]";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const evidencePath = argValue("--evidence");
  const targetRepo = argValue("--target");
  const specId = argValue("--spec-id");
  const provenanceRaw = argValue("--provenance");
  const dateRaw = argValue("--date");
  const allowUnchecked = hasFlag("--allow-unchecked");

  if (!evidencePath || !targetRepo || !specId) {
    console.error(CLI_USAGE);
    process.exit(1);
  }

  if (provenanceRaw !== undefined && provenanceRaw !== "fully-audited" && provenanceRaw !== "accuracy-audited") {
    console.error(CLI_USAGE);
    console.error(`  --provenance must be "fully-audited" or "accuracy-audited" (got: ${provenanceRaw})`);
    process.exit(1);
  }
  const provenance: "fully-audited" | "accuracy-audited" = provenanceRaw ?? "fully-audited";

  try {
    const { folded, skipped } = fold({
      evidencePath,
      targetRepo,
      specId,
      provenance,
      ...(dateRaw !== undefined ? { date: dateRaw } : {}),
      ...(allowUnchecked ? { allowUnchecked: true as const } : {}),
    });
    console.log(`folded=${folded.length} skipped=${skipped.length}`);
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
