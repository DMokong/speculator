import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listEnrichedConcepts, sampleConceptsForCodebaseScope } from "../src/quiz-concepts";
import { makeRng } from "../src/quiz-sample";

function writeConcept(dir: string, relPath: string, frontmatter: Record<string, unknown>) {
  const full = join(dir, relPath);
  mkdirSync(full.slice(0, full.lastIndexOf("/")), { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${x}`).join("\n")}` : `${k}: ${v}`))
    .join("\n");
  writeFileSync(full, `---\n${fm}\n---\n\n# Structure\n\nsome machine content\n`);
}

describe("listEnrichedConcepts", () => {
  test("skips enrichment: none concepts and index.md/log.md", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiz-concepts-"));
    try {
      writeConcept(dir, "index.md", { type: "index", enrichment: "none", resource: "", tags: [] });
      writeConcept(dir, "log.md", { type: "log", enrichment: "none", resource: "", tags: [] });
      writeConcept(dir, "src/skeleton-only.ts.md", { type: "Module", enrichment: "none", resource: "src/skeleton-only.ts", tags: ["src", "module"] });
      writeConcept(dir, "src/audited.ts.md", { type: "Module", enrichment: "fully-audited", resource: "src/audited.ts", tags: ["src", "module", "function"] });
      const concepts = listEnrichedConcepts(dir);
      expect(concepts.length).toBe(1);
      expect(concepts[0]?.resource).toBe("src/audited.ts");
      expect(concepts[0]?.enrichment).toBe("fully-audited");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("skips index.md and log.md even when they carry a non-none enrichment", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiz-concepts-"));
    try {
      writeConcept(dir, "index.md", { type: "index", enrichment: "fully-audited", resource: "", tags: [] });
      writeConcept(dir, "log.md", { type: "log", enrichment: "fully-audited", resource: "", tags: [] });
      writeConcept(dir, "src/real.ts.md", { type: "Module", enrichment: "fully-audited", resource: "src/real.ts", tags: ["src", "module"] });
      const concepts = listEnrichedConcepts(dir);
      expect(concepts.length).toBe(1);
      expect(concepts[0]?.resource).toBe("src/real.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("recurses into subdirectories", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiz-concepts-"));
    try {
      writeConcept(dir, "lib/deep/nested.ts.md", { type: "Module", enrichment: "accuracy-audited", resource: "lib/deep/nested.ts", tags: ["lib", "module"] });
      const concepts = listEnrichedConcepts(dir);
      expect(concepts.length).toBe(1);
      expect(concepts[0]?.resource).toBe("lib/deep/nested.ts");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns empty array for a skeleton-only bundle (nothing folded yet)", () => {
    const dir = mkdtempSync(join(tmpdir(), "quiz-concepts-"));
    try {
      writeConcept(dir, "src/a.ts.md", { type: "Module", enrichment: "none", resource: "src/a.ts", tags: ["src"] });
      expect(listEnrichedConcepts(dir)).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("sampleConceptsForCodebaseScope", () => {
  test("samples across the tags[0] directory spread before category inference", () => {
    const concepts = [
      { path: "a", resource: "src/a.ts", tags: ["src"], enrichment: "fully-audited" },
      { path: "b", resource: "src/b.ts", tags: ["src"], enrichment: "fully-audited" },
      { path: "c", resource: "lib/c.ts", tags: ["lib"], enrichment: "fully-audited" },
      { path: "d", resource: "lib/d.ts", tags: ["lib"], enrichment: "fully-audited" },
    ];
    const sampled = sampleConceptsForCodebaseScope(concepts, 2, makeRng(1));
    const dirs = new Set(sampled.map((c) => c.tags[0]));
    expect(sampled.length).toBe(2);
    expect(dirs.size).toBe(2); // stratified sampling across both groups deterministically produces 1 from each
  });
});
