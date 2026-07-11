// Bundle-concept enumeration for the As-Built Comprehension Quiz
// Generator's --scope=codebase path (SPEC-058, R1). Reuses concept.ts's
// existing frontmatter-splitting logic rather than re-parsing OKF concept
// files a second way.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { argValue } from "./cli";
import { parseFrontmatter, splitConcept } from "./concept";
import { makeRng, stratifiedSample } from "./quiz-sample";

export interface ConceptSummary {
  path: string;
  resource: string;
  tags: string[];
  enrichment: string;
}

const SKIPPED_DIRS = new Set([".graph", ".quiz"]);
const SKIPPED_FILES = new Set(["index.md", "log.md"]);

/** Walks `bundleDir` recursively and returns every concept whose
 * `enrichment` frontmatter field is not "none" — skeleton-only concepts
 * have no prose to quiz on and are mechanically excluded. */
export function listEnrichedConcepts(bundleDir: string): ConceptSummary[] {
  const results: ConceptSummary[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (SKIPPED_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
        continue;
      }
      if (!entry.name.endsWith(".md") || SKIPPED_FILES.has(entry.name)) continue;

      const full = join(dir, entry.name);
      const { frontmatterBlock } = splitConcept(readFileSync(full, "utf8"));
      const fm = parseFrontmatter(frontmatterBlock);
      const enrichment = String(fm.enrichment ?? "none");
      if (enrichment === "none") continue;

      results.push({
        path: full,
        resource: String(fm.resource ?? ""),
        tags: Array.isArray(fm.tags) ? fm.tags.map(String) : [],
        enrichment,
      });
    }
  };

  walk(bundleDir);
  return results.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

/** Samples across the bundle's directory spread (tags[0], the top-level
 * source directory) BEFORE category inference runs — so the candidate
 * pool handed to quiz-generator isn't accidentally concentrated in one
 * corner of the codebase before the generator even sees it. */
export function sampleConceptsForCodebaseScope(
  concepts: ConceptSummary[],
  maxCount: number,
  rng: () => number,
): ConceptSummary[] {
  const { sample } = stratifiedSample(concepts, (c) => c.tags[0] ?? "root", maxCount, rng);
  return sample;
}

export const CLI_USAGE =
  "bun asbuilt/src/quiz-concepts.ts --bundle <docs/asbuilt-dir> --max <n> [--seed <n>] --out <path>";

if (import.meta.main) {
  const bundleDir = argValue("--bundle");
  const maxStr = argValue("--max");
  const outPath = argValue("--out");
  if (!bundleDir || !maxStr || !outPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const concepts = listEnrichedConcepts(bundleDir);
  if (concepts.length === 0) {
    console.error("quiz-concepts: no concepts with enrichment != none found — run backfill first");
    process.exit(1);
  }
  const seed = argValue("--seed") ? Number(argValue("--seed")) : Date.now();
  const sampled = sampleConceptsForCodebaseScope(concepts, Number(maxStr), makeRng(seed));
  writeFileSync(outPath, `${JSON.stringify(sampled, null, 2)}\n`);
  console.log(`${sampled.length} of ${concepts.length} enriched concepts sampled (seed ${seed})`);
  process.exit(0);
}
