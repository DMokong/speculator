// Staleness refresh for the As-Built Knowledge System (SPEC-049 Task 3).
//
// This is the ONLY mechanism that keeps an OKF bundle's machine zones
// (skeleton.ts's "# Structure"...zone) in sync with the target repo's
// CURRENT code, and the ONLY mechanism that flags audited prose (fold.ts's
// enriched zones) as stale when the code it explains has drifted. It never
// writes enriched-zone prose itself — see task-3-brief.md for the exact
// refresh semantics this implements:
//
// - New source file (has symbols in the fresh extraction, didn't before) ->
//   a fresh skeleton concept via skeleton.ts's renderConcept.
// - Removed source file (had symbols before, doesn't now) -> the concept's
//   frontmatter gets `stale: true, stale_reason: "source removed"`; its
//   machine zone AND any enriched zone are left byte-untouched (there is no
//   new manifest data to re-render from).
// - Existing file whose rendered machine zone differs from what's on disk
//   (its own symbols changed OR another file's change altered this file's
//   rendered "Called by"/"Calls out" section) -> the machine zone is
//   rewritten via skeleton.ts's renderMachineZone; any enriched zone
//   alongside it is preserved byte-for-byte.
// - Enriched concept (enrichment != "none") whose `explains:` cites a symbol
//   id that's missing from the fresh manifest, or present with a changed
//   content_hash -> `stale: true, stale_reason: "changed: <ids>"`. A concept
//   already stale for this reason keeps its flag and its reasons merge
//   (union of named symbols, sorted, deduped) across refreshes; "source
//   removed" always takes precedence over a "changed:" reason.
// - `graph_hash` (a hash of the WHOLE manifest, not a per-file hash) is
//   updated in every current concept whenever the manifest changed at all —
//   so a refresh that changes nothing user-visible can still touch every
//   concept's frontmatter. Only machine-zone rewrites are counted in the
//   returned `regenerated` list; a graph_hash-only touch is not.
// - No-op: if the fresh manifest hashes identically to the committed one,
//   nothing is written (not even the manifest file) and no log.md entry is
//   appended.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { argValue } from "./cli";
import { parseFrontmatter, reclassifyTags, reclassifyType, renderFrontmatter, resolveTags, splitConcept } from "./concept";
import { extractGraph } from "./extract";
import { appendLogBullets } from "./fold";
import { type GraphManifest, loadManifest, manifestHash, saveManifest } from "./manifest";
import { conceptPath, renderConcept, renderMachineZone, writeIndexes } from "./skeleton";

export interface RefreshOptions {
  targetRepo: string;
  /** YYYY-MM-DD; defaults to today's local date when omitted. Tests always pass a fixed value for byte-stability. */
  date?: string;
}

export interface RefreshResult {
  created: string[]; // concept paths for newly-discovered source files
  regenerated: string[]; // concept paths whose rendered machine zone changed
  stale: string[]; // concept paths flagged for explains-drift
  removed_sources: string[]; // concept paths flagged "source removed"
}

/**
 * Splits a concept's full content into its machine zone and existing
 * enriched zone (or empty, if this concept has never been folded) via
 * concept.ts's shared `splitConcept`/`parseFrontmatter` (SPEC-049 Task 4
 * consolidation; this file previously carried its own copies of both,
 * flagged in task-3-report.md as T4's job), wrapped with this module's
 * "refusing to refresh" error convention.
 */
function readConceptSplit(
  content: string,
  conceptLabel: string,
): { frontmatter: Record<string, unknown>; machineBody: string; enrichedExisting: string } {
  let split: ReturnType<typeof splitConcept>;
  try {
    split = splitConcept(content);
  } catch (err) {
    throw new Error(`refusing to refresh: ${err instanceof Error ? err.message : String(err)}: ${conceptLabel}`);
  }
  const frontmatter = parseFrontmatter(split.frontmatterBlock);
  return { frontmatter, machineBody: split.machineZone, enrichedExisting: split.enrichedZone };
}

/**
 * Parses a concept's frontmatter and returns the RAW, untouched body exactly
 * as it appears on disk (no machine/enriched split, no trimming) — what the
 * "source removed" path needs: a removed-source concept's entire body (both
 * its machine zone and any enriched zone) must survive byte-for-byte
 * alongside the frontmatter update.
 */
function readFrontmatterAndRawBody(
  content: string,
  conceptLabel: string,
): { frontmatter: Record<string, unknown>; rawBody: string } {
  let split: ReturnType<typeof splitConcept>;
  try {
    split = splitConcept(content);
  } catch (err) {
    throw new Error(`refusing to refresh: ${err instanceof Error ? err.message : String(err)}: ${conceptLabel}`);
  }
  const frontmatter = parseFrontmatter(split.frontmatterBlock);
  return { frontmatter, rawBody: content.slice(split.frontmatterBlock.length) };
}

/**
 * Renders a concept's frontmatter block, preserving every field except
 * stale/stale_reason/graph_hash (this refresh's to set). `tags` is
 * PRESERVED from the existing frontmatter when present, else re-derived
 * from the fresh manifest (concept.ts's `resolveTags`) — so a legacy
 * concept lacking tags gets them populated the first time refresh touches
 * it.
 */
function renderConceptFrontmatter(
  fm: Record<string, unknown>,
  stale: boolean,
  staleReason: string,
  graphHash: string,
  resource: string,
  manifest: GraphManifest,
): string {
  return renderFrontmatter({
    type: reclassifyType(fm.type, resource),
    title: fm.title,
    description: fm.description,
    resource: fm.resource,
    tags: reclassifyTags(resolveTags(fm, resource, manifest), resource),
    enrichment: fm.enrichment,
    from: fm.from,
    explains: fm.explains,
    stale,
    stale_reason: staleReason,
    graph_hash: graphHash,
  });
}

/** Parses a previously-written `"changed: id1, id2"` stale_reason back into its symbol id list (empty for any other shape, e.g. "", "source removed"). */
function parseChangedIds(staleReason: string): string[] {
  const m = staleReason.match(/^changed: (.*)$/);
  if (!m?.[1]) return [];
  return m[1].split(", ").filter((s) => s.length > 0);
}

/** Every file with at least one symbol — the same "does this file have a concept" convention skeleton.ts's generateBundle uses. */
function fileSet(m: GraphManifest): Set<string> {
  return new Set(m.symbols.map((s) => s.file));
}

/** symbol id -> content_hash, for explains-drift comparison. */
function symbolHashIndex(m: GraphManifest): Map<string, string> {
  const map = new Map<string, string>();
  for (const s of m.symbols) map.set(s.id, s.content_hash);
  return map;
}

/**
 * Refreshes `opts.targetRepo`'s OKF bundle against its CURRENT code: re-runs
 * extraction, diffs the fresh manifest against the committed one, and
 * updates the bundle accordingly. See this file's header comment for the
 * exact per-concept rules. Idempotent: a refresh with no underlying code
 * change makes zero writes and returns all-empty lists.
 */
export async function refresh(opts: RefreshOptions): Promise<RefreshResult> {
  const bundleDir = join(opts.targetRepo, "docs/asbuilt");
  const manifestPath = join(bundleDir, ".graph-manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(
      `No graph manifest found at ${manifestPath}. Run extract and skeleton first ('bun src/extract.ts --target ${opts.targetRepo}' then 'bun src/skeleton.ts --target ${opts.targetRepo}').`,
    );
  }
  const oldManifest = loadManifest(manifestPath);
  const newManifest = await extractGraph(opts.targetRepo);

  const oldHash = manifestHash(oldManifest);
  const newHash = manifestHash(newManifest);
  if (oldHash === newHash) {
    return { created: [], regenerated: [], stale: [], removed_sources: [] };
  }

  const oldFiles = fileSet(oldManifest);
  const newFiles = fileSet(newManifest);
  const createdFiles = [...newFiles].filter((f) => !oldFiles.has(f)).sort();
  const removedFiles = [...oldFiles].filter((f) => !newFiles.has(f)).sort();
  const commonFiles = [...newFiles].filter((f) => oldFiles.has(f)).sort();

  const oldSymbolHashes = symbolHashIndex(oldManifest);
  const newSymbolHashes = symbolHashIndex(newManifest);

  const created: string[] = [];
  const regenerated: string[] = [];
  const stale: string[] = [];
  const removed_sources: string[] = [];

  for (const file of createdFiles) {
    const cPath = conceptPath(file);
    const outPath = join(bundleDir, cPath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, renderConcept(file, newManifest));
    created.push(cPath);
  }

  for (const file of commonFiles) {
    const cPath = conceptPath(file);
    const outPath = join(bundleDir, cPath);
    const oldContent = readFileSync(outPath, "utf8");
    const { frontmatter, machineBody: oldMachineBody, enrichedExisting } = readConceptSplit(oldContent, cPath);
    const newMachineBody = renderMachineZone(file, newManifest);
    if (newMachineBody !== oldMachineBody) regenerated.push(cPath);

    const enrichment = typeof frontmatter.enrichment === "string" ? frontmatter.enrichment : "none";
    let staleFlag = frontmatter.stale === true;
    let staleReason = typeof frontmatter.stale_reason === "string" ? frontmatter.stale_reason : "";

    if (enrichment !== "none") {
      const explains = Array.isArray(frontmatter.explains) ? frontmatter.explains.map(String) : [];
      const driftIds = explains.filter((id) => {
        const nh = newSymbolHashes.get(id);
        if (nh === undefined) return true;
        return nh !== oldSymbolHashes.get(id);
      });
      // claw-nybt (stale_reason side): a previously-recorded changed-id whose symbol
      // no longer exists in the new manifest must not keep the concept stale by
      // itself — if its id is still in explains, driftIds re-adds it (correct:
      // the prose still cites deleted code); once a re-audit fold drops it from
      // explains, nothing re-adds it and the alarm clears.
      const carried = parseChangedIds(staleReason).filter((id) => newSymbolHashes.has(id));
      const merged = [...new Set([...carried, ...driftIds])].sort();
      if (merged.length > 0) {
        staleFlag = true;
        staleReason = `changed: ${merged.join(", ")}`;
        stale.push(cPath);
      } else if (staleFlag && staleReason.startsWith("changed: ")) {
        // claw-dkxq (SPEC-055): a changed:-shaped flag is a pure function of
        // current facts (explains × manifest hashes) — when recomputation finds
        // no surviving drift, refresh clears its own flag instead of latching
        // until some other tool's write happens to reset it. Non-changed
        // reasons ("source removed", hand-set states) belong to other paths
        // and pass through untouched.
        staleFlag = false;
        staleReason = "";
      }
    }

    const newFrontmatterBlock = renderConceptFrontmatter(frontmatter, staleFlag, staleReason, newHash, file, newManifest);
    const newContent =
      enrichedExisting.length > 0
        ? `${newFrontmatterBlock}\n${newMachineBody}\n\n${enrichedExisting}`
        : `${newFrontmatterBlock}\n${newMachineBody}\n`;
    if (newContent !== oldContent) {
      writeFileSync(outPath, newContent);
    }
  }

  for (const file of removedFiles) {
    const cPath = conceptPath(file);
    const outPath = join(bundleDir, cPath);
    const oldContent = readFileSync(outPath, "utf8");
    const { frontmatter, rawBody } = readFrontmatterAndRawBody(oldContent, cPath);
    const newFrontmatterBlock = renderConceptFrontmatter(frontmatter, true, "source removed", newHash, file, newManifest);
    const newContent = `${newFrontmatterBlock}${rawBody}`;
    if (newContent !== oldContent) {
      writeFileSync(outPath, newContent);
    }
    removed_sources.push(cPath);
  }

  writeIndexes(opts.targetRepo, newManifest);
  saveManifest(manifestPath, newManifest);

  const date = opts.date ?? new Date().toISOString().slice(0, 10);
  const bullet = `* **Refresh**: ${regenerated.length} regenerated, ${created.length} new, ${stale.length} stale.`;
  appendLogBullets(join(bundleDir, "log.md"), date, [bullet]);

  return { created, regenerated, stale, removed_sources };
}

export const CLI_USAGE = "bun asbuilt/src/refresh.ts --target <repo> [--date YYYY-MM-DD]";

// CLI entry guard — no module-level side effects (importing this file for
// tests must never trigger a CLI run; see claw-8cjf.2 / extract.ts).
if (import.meta.main) {
  const target = argValue("--target");
  if (!target) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const dateRaw = argValue("--date");

  try {
    const result = await refresh({ targetRepo: target, ...(dateRaw !== undefined ? { date: dateRaw } : {}) });
    console.log(
      `regenerated=${result.regenerated.length} new=${result.created.length} stale=${result.stale.length} removed=${result.removed_sources.length}`,
    );
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
