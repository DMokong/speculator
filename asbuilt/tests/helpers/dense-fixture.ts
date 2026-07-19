// Synthetic dense flat-package bundle mirroring the sdlc-clients field case
// (SPEC-004 R7): one 54-source + 42-test cmd/cli group, small internal/*
// groups, one root file. Deterministic: indexed names, fixed enrichment
// stride, no clock reads, no randomness — two calls must yield byte-identical
// content so the fixture is safe for both the spike (T03) and the regression
// suite (T06).
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

interface Spec {
  dir: string;
  sources: number;
  tests: number;
}

const SHAPE: Spec[] = [
  { dir: "cmd/cli", sources: 54, tests: 42 },
  { dir: "internal/model", sources: 6, tests: 0 },
  { dir: "internal/util", sources: 4, tests: 0 },
  { dir: "internal/cli", sources: 4, tests: 0 },
];

function concept(resource: string, isTest: boolean, audited: boolean): string {
  const fm = [
    `type: ${isTest ? "Test" : "Module"}`,
    `title: ${resource}`,
    `description: synthetic ${isTest ? "test" : "module"} concept`,
    `resource: ${resource}`,
    `tags:\n  - ${resource.split("/")[0]}\n  - module${isTest ? "\n  - test" : ""}`,
    `enrichment: ${audited ? "fully-audited" : "none"}`,
    "from: []",
    "explains: []",
    "stale: false",
  ].join("\n");
  const body = audited
    ? "# Structure\n\nmachine content\n\n# Explanation\n\nSynthetic audited explanation.\n"
    : "# Structure\n\nmachine content\n";
  return `---\n${fm}\n---\n\n${body}`;
}

/** Builds a temp target-repo dir whose docs/asbuilt/ bundle + manifest
 * reproduce the sdlc-clients field-failure shape (111 concepts total).
 * Pure/deterministic: no Math.random, no Date reads — every byte is a
 * function of fixed indexes, so repeated calls (same or independent
 * sandboxes) produce identical bundle content. */
export function makeDenseSandbox(): string {
  const target = mkdtempSync(join(tmpdir(), "viz-dense-"));
  const bundle = join(target, "docs", "asbuilt");
  const symbols: { id: string; file: string }[] = [];
  const edges: { from: string; toName: string; resolved: string | null }[] = [];
  const write = (resource: string, isTest: boolean, i: number) => {
    const mdPath = join(bundle, resource.replace(/\.(go|ts)$/, ".md"));
    mkdirSync(mdPath.slice(0, mdPath.lastIndexOf("/")), { recursive: true });
    writeFileSync(mdPath, concept(resource, isTest, i % 3 === 0));
    symbols.push({ id: `${resource}#fn${i}`, file: resource });
    if (!isTest && i % 4 === 1) {
      // deterministic sparse call web into the first source file of the group
      const dir = resource.slice(0, resource.lastIndexOf("/"));
      edges.push({ from: `${resource}#fn${i}`, toName: "fn0", resolved: `${dir}/file000.go#fn0` });
    }
  };
  for (const { dir, sources, tests } of SHAPE) {
    for (let i = 0; i < sources; i++) write(`${dir}/file${String(i).padStart(3, "0")}.go`, false, i);
    for (let i = 0; i < tests; i++) write(`${dir}/file${String(i).padStart(3, "0")}_test.go`, true, i);
  }
  write("main.go", false, 0); // root-level: groups to "src"
  writeFileSync(
    join(bundle, ".graph-manifest.json"),
    JSON.stringify({ target_commit: "f1e1d0c", symbols, edges }),
  );
  return target;
}
