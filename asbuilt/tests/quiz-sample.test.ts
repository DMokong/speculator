import { describe, expect, test } from "bun:test";
import { makeRng, stratifiedSample } from "../src/quiz-sample";

describe("makeRng", () => {
  test("same seed produces the same sequence", () => {
    const a = makeRng(42);
    const b = makeRng(42);
    const seqA = [a(), a(), a()];
    const seqB = [b(), b(), b()];
    expect(seqA).toEqual(seqB);
  });

  test("different seeds produce different sequences", () => {
    const a = makeRng(1);
    const b = makeRng(2);
    expect(a()).not.toEqual(b());
  });

  test("values are in [0, 1)", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 20; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

interface Item {
  id: string;
  category: string;
}

function makeItems(counts: Record<string, number>): Item[] {
  const items: Item[] = [];
  for (const [category, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) items.push({ id: `${category}-${i}`, category });
  }
  return items;
}

describe("stratifiedSample", () => {
  test("proportional allocation matches pool distribution within rounding", () => {
    const items = makeItems({ security: 12, db: 15, frontend: 10, validation: 8 }); // total 45
    const { sample, coverage } = stratifiedSample(items, (i) => i.category, 12, makeRng(1));
    expect(sample.length).toBe(12);
    // Exact largest-remainder allocation for 45 total, 12 target:
    // security 12/45*12=3.2->3, db 15/45*12=4.0->4, frontend 10/45*12=2.67->3
    // (remainder bump), validation 8/45*12=2.13->2. Exact values so ANY
    // change to the allocation strategy (uniform, backfill, redistribution)
    // breaks this test rather than sliding inside a tolerance band.
    expect(coverage.security).toEqual({ available: 12, requested: 3, taken: 3, shortfall: 0 });
    expect(coverage.db).toEqual({ available: 15, requested: 4, taken: 4, shortfall: 0 });
    expect(coverage.frontend).toEqual({ available: 10, requested: 3, taken: 3, shortfall: 0 });
    expect(coverage.validation).toEqual({ available: 8, requested: 2, taken: 2, shortfall: 0 });
  });

  test("no item is duplicated in the sample", () => {
    const items = makeItems({ a: 5, b: 5, c: 5 });
    const { sample } = stratifiedSample(items, (i) => i.category, 9, makeRng(3));
    const ids = sample.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("different seeds produce different order or selection", () => {
    const items = makeItems({ a: 10, b: 10, c: 10 });
    const r1 = stratifiedSample(items, (i) => i.category, 12, makeRng(1));
    const r2 = stratifiedSample(items, (i) => i.category, 12, makeRng(2));
    const ids1 = r1.sample.map((i) => i.id).join(",");
    const ids2 = r2.sample.map((i) => i.id).join(",");
    expect(ids1).not.toEqual(ids2);
  });

  test("under-populated category is never over-drawn and never silently backfilled", () => {
    const items = makeItems({ security: 1, db: 20 });
    const { sample, coverage } = stratifiedSample(items, (i) => i.category, 10, makeRng(1));
    // Exact allocation: security 1/21*10=0.476->floor 0; db 20/21*10=9.52->
    // floor 9 + remainder bump (0.52 > 0.476) -> 10. Largest-remainder
    // allocation proportional to the pool structurally never requests more
    // than a group has (requested <= available by construction), so
    // shortfall stays 0 here — the shortfall field goes nonzero only when a
    // CALLER injects proportions from a different distribution, which is why
    // quiz-render.test.ts's shortfall-notice test injects coverage directly.
    // What this test pins: the thin category is drawn at its exact
    // proportional share (0), its unused availability is reported in
    // coverage, and no slots silently migrate beyond the exact
    // largest-remainder result.
    expect(coverage.security).toEqual({ available: 1, requested: 0, taken: 0, shortfall: 0 });
    expect(coverage.db).toEqual({ available: 20, requested: 10, taken: 10, shortfall: 0 });
    expect(sample.length).toBe(10);
  });

  test("target larger than pool clamps to pool size", () => {
    const items = makeItems({ a: 2, b: 2 });
    const { sample } = stratifiedSample(items, (i) => i.category, 100, makeRng(1));
    expect(sample.length).toBe(4);
  });
});
