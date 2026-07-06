import { describe, expect, test } from "bun:test";
import { execSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { manifestHash, saveManifest } from "../src/manifest";
import { conceptPath, generateBundle, listEnrichedConcepts } from "../src/skeleton";
import { verifyBundle } from "../src/verify";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
const SKELETON_CLI = new URL("../src/skeleton.ts", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
}

// Shared bundle generated once — every test below only reads from it.
const dir = mkdtempSync(join(tmpdir(), "asbuilt-skeleton-"));
const manifest = await extractGraph(FIXTURE);
generateBundle(dir, manifest);
const bundleDir = join(dir, "docs/asbuilt");

describe("AC2: OKF skeleton bundle generator", () => {
  test("conceptPath replaces .ts with .md", () => {
    expect(conceptPath("src/alpha.ts")).toBe("src/alpha.md");
    expect(conceptPath("src/util/gamma.ts")).toBe("src/util/gamma.md");
  });

  test("exactly one concept file per manifest source file", () => {
    expect(existsSync(join(bundleDir, "src/alpha.md"))).toBe(true);
    expect(existsSync(join(bundleDir, "src/beta.md"))).toBe(true);
    expect(existsSync(join(bundleDir, "src/noexport.md"))).toBe(true);
    expect(existsSync(join(bundleDir, "src/util/gamma.md"))).toBe(true);
    // No stray fifth concept: the fixture only has these four source files.
    const notes = ["src/gamma.md", "beta.md", "alpha.md", "noexport.md"];
    for (const stray of notes) expect(existsSync(join(bundleDir, stray))).toBe(false);
  });

  test("empty-section pin (SPEC-049 Task 1): noexport's concept has no Exports/Calls-out/Called-by headings — hidden() is unexported and calls/is-called-by nothing", () => {
    const raw = readFileSync(join(bundleDir, "src/noexport.md"), "utf8");
    expect(raw).toContain("# Structure");
    expect(raw).toContain("## Symbols");
    expect(raw).toContain("`hidden`");
    expect(raw).not.toContain("## Exports");
    expect(raw).not.toContain("## Calls out");
    expect(raw).not.toContain("## Called by");
  });

  test("concept frontmatter parses and matches the manifest", () => {
    const raw = readFileSync(join(bundleDir, "src/alpha.md"), "utf8");
    const fm = frontmatterOf(raw);
    expect(fm.type).toBe("Module");
    expect(fm.resource).toBe("src/alpha.ts");
    expect(fm.enrichment).toBe("none");
    expect(fm.graph_hash).toBe(manifestHash(manifest));
  });

  test("AC11 (SPEC-049 Task 4): frontmatter field order is type,title,description,resource,tags,enrichment,from,explains,stale,graph_hash (no stale_reason on a fresh concept)", () => {
    const raw = readFileSync(join(bundleDir, "src/alpha.md"), "utf8");
    const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
    expect(match).not.toBeNull();
    const keys = (match?.[1] ?? "")
      .split("\n")
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(":")[0]);
    expect(keys).toEqual(["type", "title", "description", "resource", "tags", "enrichment", "from", "explains", "stale", "graph_hash"]);
  });

  test("concept has # Structure and no enriched-zone sections", () => {
    for (const file of ["src/alpha.md", "src/beta.md", "src/util/gamma.md"]) {
      const raw = readFileSync(join(bundleDir, file), "utf8");
      expect(raw).toContain("# Structure");
      expect(raw).not.toMatch(/# Explanation|# Decisions|# Gotchas|# Citations/);
    }
  });

  test("index.md exists at bundle root, src/, and src/util/", () => {
    expect(existsSync(join(bundleDir, "index.md"))).toBe(true);
    expect(existsSync(join(bundleDir, "src/index.md"))).toBe(true);
    expect(existsSync(join(bundleDir, "src/util/index.md"))).toBe(true);
  });

  test("root index.md frontmatter has okf_version 0.1; directory indexes have no frontmatter", () => {
    const rootRaw = readFileSync(join(bundleDir, "index.md"), "utf8");
    expect(frontmatterOf(rootRaw).okf_version).toBe("0.1");

    const srcRaw = readFileSync(join(bundleDir, "src/index.md"), "utf8");
    expect(srcRaw.startsWith("---")).toBe(false);
    expect(srcRaw).toContain("# Concepts");
  });

  test("AC11 (SPEC-049 Task 4): root index.md body ends with the OKF conformance note", () => {
    const rootRaw = readFileSync(join(bundleDir, "index.md"), "utf8");
    expect(rootRaw).toContain(
      "> Conformance note: concepts omit the optional OKF timestamp field — regeneration is byte-deterministic by design (OKF v0.1 §4.1 permits this).",
    );
    expect(rootRaw.trimEnd().endsWith("(OKF v0.1 §4.1 permits this).")).toBe(true);

    // Directory indexes (non-root) do NOT carry the conformance note.
    const srcRaw = readFileSync(join(bundleDir, "src/index.md"), "utf8");
    expect(srcRaw).not.toContain("Conformance note");
  });

  test("AC11 (SPEC-049 Task 4): tags rule — [<first path segment>, \"module\", ...sorted unique symbol kinds]", () => {
    const alpha = frontmatterOf(readFileSync(join(bundleDir, "src/alpha.md"), "utf8"));
    // src/alpha.ts: alphaMain (function), AlphaService (class), run (method), helper (function)
    expect(alpha.tags).toEqual(["src", "module", "class", "function", "method"]);

    const beta = frontmatterOf(readFileSync(join(bundleDir, "src/beta.md"), "utf8"));
    // src/beta.ts: betaHandler (const), BetaConfig (interface), BetaResult (type)
    expect(beta.tags).toEqual(["src", "module", "const", "interface", "type"]);

    const noexport = frontmatterOf(readFileSync(join(bundleDir, "src/noexport.md"), "utf8"));
    // src/noexport.ts: hidden (function, unexported)
    expect(noexport.tags).toEqual(["src", "module", "function"]);

    const gamma = frontmatterOf(readFileSync(join(bundleDir, "src/util/gamma.md"), "utf8"));
    // src/util/gamma.ts: gamma (function) — first path segment is still "src", not "util".
    expect(gamma.tags).toEqual(["src", "module", "function"]);
  });

  test(".gitignore is written with exact content", () => {
    expect(readFileSync(join(bundleDir, ".gitignore"), "utf8")).toBe(".graph/\n");
  });

  test("alpha concept's Calls-out line links /src/util/gamma.md", () => {
    const raw = readFileSync(join(bundleDir, "src/alpha.md"), "utf8");
    expect(raw).toContain("[gamma](/src/util/gamma.md)");
  });

  test("regeneration is idempotent (byte-identical on second run)", () => {
    const before = {
      alpha: readFileSync(join(bundleDir, "src/alpha.md")),
      beta: readFileSync(join(bundleDir, "src/beta.md")),
      gamma: readFileSync(join(bundleDir, "src/util/gamma.md")),
      rootIndex: readFileSync(join(bundleDir, "index.md")),
      srcIndex: readFileSync(join(bundleDir, "src/index.md")),
      utilIndex: readFileSync(join(bundleDir, "src/util/index.md")),
      gitignore: readFileSync(join(bundleDir, ".gitignore")),
    };

    generateBundle(dir, manifest);

    expect(readFileSync(join(bundleDir, "src/alpha.md"))).toEqual(before.alpha);
    expect(readFileSync(join(bundleDir, "src/beta.md"))).toEqual(before.beta);
    expect(readFileSync(join(bundleDir, "src/util/gamma.md"))).toEqual(before.gamma);
    expect(readFileSync(join(bundleDir, "index.md"))).toEqual(before.rootIndex);
    expect(readFileSync(join(bundleDir, "src/index.md"))).toEqual(before.srcIndex);
    expect(readFileSync(join(bundleDir, "src/util/index.md"))).toEqual(before.utilIndex);
    expect(readFileSync(join(bundleDir, ".gitignore"))).toEqual(before.gitignore);
  });
});

// SPEC-049 T7 dogfood find: src/index.ts's conceptPath ("src/index.md")
// collided with the reserved per-directory index.md — generateBundle writes
// concept files first and per-directory indexes second, so the directory
// index silently clobbered the concept on disk. This synthetic repo (never
// the shared FIXTURE, so the existing golden-file tests above are untouched)
// exercises both reserved stems ("index" and "log") plus an ordinary file,
// nested at two directory depths.
describe("SPEC-049 T7 dogfood: reserved-name concept path collision (index.ts / log.ts)", () => {
  test("conceptPath appends '.md' to the FULL filename for 'index'/'log' stems only; every other stem keeps the general replace-extension mapping", () => {
    expect(conceptPath("src/index.ts")).toBe("src/index.ts.md");
    expect(conceptPath("src/log.ts")).toBe("src/log.ts.md");
    expect(conceptPath("deeper/index.ts")).toBe("deeper/index.ts.md");
    expect(conceptPath("deeper/log.ts")).toBe("deeper/log.ts.md");
    expect(conceptPath("index.ts")).toBe("index.ts.md"); // root-level, no directory prefix
    expect(conceptPath("log.ts")).toBe("log.ts.md");

    // General mapping is unchanged — must not regress existing bundles/links.
    expect(conceptPath("src/alpha.ts")).toBe("src/alpha.md");
    expect(conceptPath("src/util/gamma.ts")).toBe("src/util/gamma.md");
    // Stems that merely CONTAIN "index"/"log" are not reserved — only an
    // exact stem match collides with the reserved basenames.
    expect(conceptPath("src/indexer.ts")).toBe("src/indexer.md");
    expect(conceptPath("src/logger.ts")).toBe("src/logger.md");
  });

  function makeSyntheticRepo(): string {
    const repoDir = mkdtempSync(join(tmpdir(), "asbuilt-reserved-name-repo-"));
    mkdirSync(join(repoDir, "src/util"), { recursive: true });
    writeFileSync(join(repoDir, "src/index.ts"), "export function indexMain(): number {\n  return 1;\n}\n");
    writeFileSync(join(repoDir, "src/util/log.ts"), 'export function logIt(): string {\n  return "hi";\n}\n');
    writeFileSync(join(repoDir, "src/normal.ts"), "export function normal(): number {\n  return 2;\n}\n");
    execSync(`git init -q ${repoDir}`);
    execSync(`git -C ${repoDir} add -A`);
    execSync(`git -C ${repoDir} -c user.email=fixture@local -c user.name=fixture commit -qm seed`);
    return repoDir;
  }

  test("bundle names index.ts/log.ts concepts by full filename, per-directory indexes stay intact with correct links, and verify passes", async () => {
    const repoDir = makeSyntheticRepo();
    const bundleRoot = mkdtempSync(join(tmpdir(), "asbuilt-reserved-name-bundle-"));
    try {
      const manifest = await extractGraph(repoDir);
      generateBundle(bundleRoot, manifest);
      const reservedBundleDir = join(bundleRoot, "docs/asbuilt");

      // Concept files land at the collision-safe paths — the fix under test.
      expect(existsSync(join(reservedBundleDir, "src/index.ts.md"))).toBe(true);
      expect(existsSync(join(reservedBundleDir, "src/util/log.ts.md"))).toBe(true);
      expect(existsSync(join(reservedBundleDir, "src/normal.md"))).toBe(true);

      // Each concept is a real Module concept, not a directory index.
      const indexConcept = readFileSync(join(reservedBundleDir, "src/index.ts.md"), "utf8");
      expect(indexConcept).toContain("# Structure");
      expect(frontmatterOf(indexConcept).type).toBe("Module");
      expect(frontmatterOf(indexConcept).resource).toBe("src/index.ts");

      const logConcept = readFileSync(join(reservedBundleDir, "src/util/log.ts.md"), "utf8");
      expect(logConcept).toContain("# Structure");
      expect(frontmatterOf(logConcept).resource).toBe("src/util/log.ts");

      const normalConcept = readFileSync(join(reservedBundleDir, "src/normal.md"), "utf8");
      expect(normalConcept).toContain("# Structure");
      expect(frontmatterOf(normalConcept).resource).toBe("src/normal.ts");

      // Per-directory index.md files are untouched by the concept content —
      // reserved files, no frontmatter — and list all three concepts (across
      // the tree) with links pointing at the collision-safe conceptPath.
      const srcIndex = readFileSync(join(reservedBundleDir, "src/index.md"), "utf8");
      expect(srcIndex.startsWith("---")).toBe(false);
      expect(srcIndex).toContain("# Concepts");
      expect(srcIndex).toContain("(index.ts.md)");
      expect(srcIndex).toContain("(normal.md)");

      const utilIndex = readFileSync(join(reservedBundleDir, "src/util/index.md"), "utf8");
      expect(utilIndex.startsWith("---")).toBe(false);
      expect(utilIndex).toContain("(log.ts.md)");

      const rootIndex = readFileSync(join(reservedBundleDir, "index.md"), "utf8");
      expect(rootIndex).toContain("# Concepts");

      // Round-trip through verify-asbuilt: bundle shape is clean AND (with a
      // saved manifest present) the new missing-concept completeness rule
      // finds nothing missing — the collision no longer silently drops a
      // concept.
      saveManifest(join(reservedBundleDir, ".graph-manifest.json"), manifest);
      const result = verifyBundle(reservedBundleDir);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    } finally {
      rmSync(repoDir, { recursive: true, force: true });
      rmSync(bundleRoot, { recursive: true, force: true });
    }
  });
});

describe("claw-i7fn: skeleton refuses enriched bundles", () => {
  function enrichedBundle(): string {
    const d = mkdtempSync(join(tmpdir(), "asbuilt-skel-guard-"));
    generateBundle(d, manifest);
    // simulate a folded concept: flip enrichment + append an enriched zone
    const p = join(d, "docs/asbuilt/src/alpha.md");
    writeFileSync(p, `${readFileSync(p, "utf8").replace("enrichment: none", "enrichment: accuracy-audited")}\n# Explanation\nAudited prose.\n`);
    return d;
  }

  test("listEnrichedConcepts finds the enriched concept, virgin bundle yields []", () => {
    expect(listEnrichedConcepts(enrichedBundle())).toEqual(["src/alpha.md"]);
    const virgin = mkdtempSync(join(tmpdir(), "asbuilt-skel-virgin-"));
    generateBundle(virgin, manifest);
    expect(listEnrichedConcepts(virgin)).toEqual([]);
  });

  test("CLI refuses without --force: exit 1, nothing modified, names the concept", () => {
    const d = enrichedBundle();
    saveManifest(join(d, "docs/asbuilt/.graph-manifest.json"), manifest); // CLI requires a manifest
    const before = readFileSync(join(d, "docs/asbuilt/src/alpha.md"), "utf8");
    const r = spawnSync("bun", [SKELETON_CLI, "--target", d], { encoding: "utf8" });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain("src/alpha.md");
    expect(readFileSync(join(d, "docs/asbuilt/src/alpha.md"), "utf8")).toBe(before); // byte-identical
  });

  test("CLI with --force regenerates a virgin skeleton", () => {
    const d = enrichedBundle();
    saveManifest(join(d, "docs/asbuilt/.graph-manifest.json"), manifest);
    const r = spawnSync("bun", [SKELETON_CLI, "--target", d, "--force"], { encoding: "utf8" });
    expect(r.status).toBe(0);
    const fm = frontmatterOf(readFileSync(join(d, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.enrichment).toBe("none");
    expect(readFileSync(join(d, "docs/asbuilt/src/alpha.md"), "utf8")).not.toContain("Audited prose");
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  rmSync(dir, { recursive: true, force: true });
});
