// Deterministic stratified sampler for the As-Built Comprehension Quiz
// Generator (SPEC-058, R4/AC5/AC6). Used twice: quiz-concepts.ts samples
// bundle concepts across directories for --scope=codebase; the
// asbuilt-quiz skill samples the final 10-15 questions across categories
// from the verified candidate pool. One implementation, one test suite,
// both callers.

import { readFileSync, writeFileSync } from "node:fs";
import { argValue } from "./cli";

/** mulberry32 — small, fast, deterministic PRNG. Not cryptographic; only
 * used for reproducible shuffling/sampling in tests and quiz variety. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const arr = items.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j] as T, arr[i] as T];
  }
  return arr;
}

export interface GroupCoverage {
  available: number;
  requested: number;
  taken: number;
  shortfall: number;
}

export interface StratifiedSampleResult<T> {
  sample: T[];
  coverage: Record<string, GroupCoverage>;
}

/**
 * Proportional (largest-remainder) allocation across groups, then a
 * per-group shuffle-and-take, then a final shuffle of the combined sample
 * for presentation order. Deliberately does NOT redistribute an
 * under-populated group's unused slots to other groups — a shortfall is
 * recorded in `coverage[key].shortfall` and the returned `sample` may be
 * smaller than `targetCount`. Silent backfill would hide exactly the
 * "accidentally all one category" failure mode this function exists to
 * prevent (SPEC-058 AC6) — the caller decides what to do about a shortfall
 * (proceed smaller, or refuse), this function only measures and reports it.
 */
export function stratifiedSample<T>(
  items: T[],
  groupKeyFn: (item: T) => string,
  targetCount: number,
  rng: () => number,
): StratifiedSampleResult<T> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = groupKeyFn(item);
    const list = groups.get(key);
    if (list) list.push(item);
    else groups.set(key, [item]);
  }

  const total = items.length;
  const clampedTarget = Math.min(targetCount, total);
  const keys = [...groups.keys()].sort();

  const shares = keys.map((key) => {
    const size = groups.get(key)?.length ?? 0;
    const exact = total === 0 ? 0 : (size / total) * clampedTarget;
    return { key, size, floor: Math.floor(exact), remainder: exact - Math.floor(exact) };
  });

  let allocated = shares.reduce((sum, s) => sum + s.floor, 0);
  const byRemainder = shares.slice().sort((a, b) => b.remainder - a.remainder || (a.key < b.key ? -1 : 1));
  for (let i = 0; allocated < clampedTarget && i < byRemainder.length; i++) {
    const share = shares.find((s) => s.key === byRemainder[i]?.key);
    if (share) {
      share.floor += 1;
      allocated += 1;
    }
  }

  const coverage: Record<string, GroupCoverage> = {};
  const sample: T[] = [];
  for (const share of shares) {
    const groupItems = groups.get(share.key) ?? [];
    const taken = Math.min(share.floor, share.size);
    sample.push(...shuffle(groupItems, rng).slice(0, taken));
    coverage[share.key] = {
      available: share.size,
      requested: share.floor,
      taken,
      shortfall: Math.max(0, share.floor - taken),
    };
  }

  return { sample: shuffle(sample, rng), coverage };
}

export const CLI_USAGE =
  "bun asbuilt/src/quiz-sample.ts --pool <path> --group-by <category> --count <n> --seed <n> --out <path>";

// CLI entry guard — no module-level side effects (see claw-8cjf.2).
if (import.meta.main) {
  const poolPath = argValue("--pool");
  const groupBy = argValue("--group-by") ?? "category";
  const countStr = argValue("--count");
  const outPath = argValue("--out");
  if (!poolPath || !countStr || !outPath) {
    console.error(CLI_USAGE);
    process.exit(1);
  }
  const seed = argValue("--seed") ? Number(argValue("--seed")) : Date.now();
  const items = JSON.parse(readFileSync(poolPath, "utf8")) as Record<string, unknown>[];
  const result = stratifiedSample(items, (item) => String(item[groupBy] ?? "uncategorized"), Number(countStr), makeRng(seed));
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`sampled ${result.sample.length}/${countStr} (seed ${seed})`);
  process.exit(0);
}
