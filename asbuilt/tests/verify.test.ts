import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import { saveManifest } from "../src/manifest";
import { generateBundle } from "../src/skeleton";
import { verifyBundle } from "../src/verify";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

// Clean bundle generated once via Task 2+3 helpers, per task-4-brief. Mutation
// tests below copy it to a fresh tmp dir before mutating (resolution #5) —
// the shared bundle above is never mutated in place.
const manifest = await extractGraph(FIXTURE);
const baseRoot = makeTmpDir("asbuilt-verify-base-");
generateBundle(baseRoot, manifest);
const baseBundleDir = join(baseRoot, "docs/asbuilt");

function freshBundleCopy(): string {
  const root = makeTmpDir("asbuilt-verify-mut-");
  const bundleDir = join(root, "docs/asbuilt");
  cpSync(baseBundleDir, bundleDir, { recursive: true });
  return bundleDir;
}

describe("AC2/R3: verify-asbuilt conformance checker", () => {
  test("clean bundle passes with ok: true and no violations", () => {
    const result = verifyBundle(baseBundleDir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("mutation (a): stripping `type:` from a concept triggers frontmatter-type", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace(/\ntype: Module\n/, "\n");
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: frontmatter-type"))).toBe(true);
  });

  test("mutation (b): enriched-zone heading in an enrichment: none concept triggers enriched-zone-in-skeleton (trust invariant)", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = `${readFileSync(alphaPath, "utf8")}\n# Explanation\n\nprose\n`;
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: enriched-zone-in-skeleton"))).toBe(true);
  });

  test("mutation (c): frontmatter on a reserved directory index.md triggers reserved-frontmatter", () => {
    const bundleDir = freshBundleCopy();
    const srcIndexPath = join(bundleDir, "src/index.md");
    const mutated = `---\ntitle: nope\n---\n${readFileSync(srcIndexPath, "utf8")}`;
    writeFileSync(srcIndexPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/index.md: reserved-frontmatter"))).toBe(true);
  });

  test("root index.md is exempt from reserved-frontmatter (okf_version-only frontmatter allowed)", () => {
    const result = verifyBundle(baseBundleDir);
    expect(result.violations.some((v) => v.startsWith("index.md:"))).toBe(false);
  });

  test("root index.md with an extra frontmatter key beyond okf_version is a violation", () => {
    const bundleDir = freshBundleCopy();
    const rootIndexPath = join(bundleDir, "index.md");
    const mutated = readFileSync(rootIndexPath, "utf8").replace('okf_version: "0.1"', 'okf_version: "0.1"\ntitle: nope');
    writeFileSync(rootIndexPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("index.md: reserved-frontmatter"))).toBe(true);
  });

  test("invalid enrichment value triggers enrichment-value", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: partial");
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: enrichment-value"))).toBe(true);
  });

  test("missing `# Structure` heading triggers missing-structure", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("# Structure", "# Overview");
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: missing-structure"))).toBe(true);
  });

  test("empty resource on a Module concept triggers missing-resource", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("resource: src/alpha.ts", "resource:");
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: missing-resource"))).toBe(true);
  });

  test("unparseable YAML frontmatter triggers frontmatter-type", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    const mutated = readFileSync(alphaPath, "utf8").replace("title: src/alpha.ts", "title: [unterminated");
    writeFileSync(alphaPath, mutated);

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.startsWith("src/alpha.md: frontmatter-type"))).toBe(true);
  });

  test("missing bundle directory is a violation and ok is false", () => {
    const root = makeTmpDir("asbuilt-verify-missing-");
    const result = verifyBundle(join(root, "docs/asbuilt"));
    expect(result.ok).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });

  test(".graph-manifest.json and other non-.md files are not violations", () => {
    const bundleDir = freshBundleCopy();
    writeFileSync(join(bundleDir, ".graph-manifest.json"), '{"schema":1}');
    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(true);
  });

  test(".graph/ directory is skipped even if it contains a malformed .md file", () => {
    const bundleDir = freshBundleCopy();
    const graphDir = join(bundleDir, ".graph");
    mkdirSync(graphDir, { recursive: true });
    writeFileSync(join(graphDir, "broken.md"), "not frontmatter at all, just garbage prose");

    const result = verifyBundle(bundleDir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  describe("heading-match whitespace fix (hasHeadingLine)", () => {
    test("enrichment: none + '# Explanation ' (trailing space) still triggers enriched-zone-in-skeleton", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8")}\n# Explanation \n\nprose\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: enriched-zone-in-skeleton"))).toBe(true);
    });

    test("enrichment: none + ' # Explanation' (1 leading space, CommonMark ATX indent) still triggers enriched-zone-in-skeleton", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8")}\n # Explanation\n\nprose\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: enriched-zone-in-skeleton"))).toBe(true);
    });

    test("'# Structure ' (trailing space) does not trigger missing-structure", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = readFileSync(alphaPath, "utf8").replace("# Structure", "# Structure ");
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: missing-structure"))).toBe(false);
    });
  });

  describe("R3 precision: audited enrichment values may legitimately carry enriched-zone prose", () => {
    // Both mutations here also add a "# Citations" heading (Task 4's
    // missing-citations rule requires one on any audited concept) — these
    // tests are about R3 (enriched-zone prose is legitimate once audited),
    // not about citations, so a well-formed audited concept includes both.
    test("enrichment: fully-audited with a real '# Explanation' section is ok: true (no violations)", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: fully-audited")}\n# Explanation\n\nSome real prose explaining the module.\n\n# Citations\n[1] some citation\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    });

    test("enrichment: accuracy-audited with a real '# Explanation' section is ok: true (no violations)", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: accuracy-audited")}\n# Explanation\n\nSome real prose explaining the module.\n\n# Citations\n[1] some citation\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.violations).toEqual([]);
      expect(result.ok).toBe(true);
    });
  });

  describe("fenced-code-aware heading detection (T2 review fix)", () => {
    test("enrichment: none + a fenced literal '# Explanation' inside the Structure zone does NOT trigger enriched-zone-in-skeleton", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = readFileSync(alphaPath, "utf8").replace(
        "# Structure\n\n",
        "# Structure\n\n```ts\n# Explanation\nliteral text inside a fenced example, not a real heading\n```\n\n",
      );
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: enriched-zone-in-skeleton"))).toBe(false);
      expect(result.ok).toBe(true);
    });

    test("enrichment: none + a real (unfenced) '# Explanation' heading still triggers enriched-zone-in-skeleton", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8")}\n# Explanation\n\nprose\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: enriched-zone-in-skeleton"))).toBe(true);
    });
  });

  test("degenerate empty frontmatter block ('---\\n---\\n') parses as empty YAML, not unterminated (off-by-one fix)", () => {
    const bundleDir = freshBundleCopy();
    const alphaPath = join(bundleDir, "src/alpha.md");
    writeFileSync(alphaPath, "---\n---\n\n# Structure\n");

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain("src/alpha.md: frontmatter-type — type is missing or empty");
  });

  describe("AC11 (SPEC-049 Task 4): log.md structural validation", () => {
    test("malformed date heading ('## July 4') triggers a log-structure violation", () => {
      const bundleDir = freshBundleCopy();
      writeFileSync(join(bundleDir, "log.md"), "# Bundle Update Log\n\n## July 4\n* something happened\n");

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("log.md: log-structure"))).toBe(true);
    });

    test("oldest-first (ascending) date-group ordering triggers a log-structure violation", () => {
      const bundleDir = freshBundleCopy();
      writeFileSync(
        join(bundleDir, "log.md"),
        "# Bundle Update Log\n\n## 2026-07-01\n* first\n\n## 2026-07-04\n* second\n",
      );

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("log.md: log-structure"))).toBe(true);
    });

    test("missing the '# Bundle Update Log' header is a log-structure violation", () => {
      const bundleDir = freshBundleCopy();
      writeFileSync(join(bundleDir, "log.md"), "## 2026-07-04\n* second\n");

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("log.md: log-structure"))).toBe(true);
    });

    test("a well-formed log.md (correct header, valid dates, strictly descending) is not a violation", () => {
      const bundleDir = freshBundleCopy();
      writeFileSync(
        join(bundleDir, "log.md"),
        "# Bundle Update Log\n\n## 2026-07-04\n* second\n\n## 2026-07-01\n* first\n",
      );

      const result = verifyBundle(bundleDir);
      expect(result.violations.some((v) => v.startsWith("log.md:"))).toBe(false);
    });

    test("no log.md at all is not a violation (log.md is optional)", () => {
      const result = verifyBundle(baseBundleDir);
      expect(result.violations.some((v) => v.startsWith("log.md:"))).toBe(false);
    });
  });

  describe("AC11 (SPEC-049 Task 4): missing-citations rule", () => {
    test("fully-audited concept without a '# Citations' heading is a violation", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: fully-audited")}\n# Explanation\n\nSome prose.\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(false);
      expect(result.violations.some((v) => v.startsWith("src/alpha.md: missing-citations"))).toBe(true);
    });

    test("accuracy-audited concept without a '# Citations' heading is a warning only — ok stays true", () => {
      const bundleDir = freshBundleCopy();
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: accuracy-audited")}\n# Explanation\n\nSome prose.\n`;
      writeFileSync(alphaPath, mutated);

      const result = verifyBundle(bundleDir);
      expect(result.ok).toBe(true);
      expect(result.violations).toEqual([]);
      expect(result.warnings.some((w) => w.startsWith("src/alpha.md: missing-citations"))).toBe(true);
    });

    test("enrichment: none concepts are exempt from missing-citations (no rule for unaudited concepts)", () => {
      const result = verifyBundle(baseBundleDir);
      expect(result.warnings).toEqual([]);
      expect(result.violations.some((v) => v.includes("missing-citations"))).toBe(false);
    });
  });

  describe("CLI: warnings print with a 'warn:' prefix and never affect the exit code", () => {
    test("an accuracy-audited concept missing Citations prints a 'warn:' line but still exits 0", () => {
      const root = makeTmpDir("asbuilt-verify-cli-");
      const bundleDir = join(root, "docs/asbuilt");
      cpSync(baseBundleDir, bundleDir, { recursive: true });
      const alphaPath = join(bundleDir, "src/alpha.md");
      const mutated = `${readFileSync(alphaPath, "utf8").replace("enrichment: none", "enrichment: accuracy-audited")}\n# Explanation\n\nSome prose.\n`;
      writeFileSync(alphaPath, mutated);

      const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
      const result = Bun.spawnSync(["bun", "src/verify.ts", "--target", root], { cwd: ASBUILT_ROOT });

      expect(result.exitCode).toBe(0);
      expect(result.stdout.toString("utf8")).toContain("warn: src/alpha.md: missing-citations");
    });
  });
});

// SPEC-049 T7 dogfood find: a concept silently overwritten by the
// index.md/log.md reserved-name collision left no trace R1-R7 could catch —
// the bundle looked perfectly well-formed with one fewer concept than the
// manifest actually had. These tests use their own synthetic repo (never the
// shared FIXTURE/goldens above) so they can exercise both an ordinary
// missing concept and a reserved-name one.
describe("SPEC-049 T7 dogfood: missing-concept completeness rule", () => {
  function makeSyntheticRepo(): string {
    const repoDir = makeTmpDir("asbuilt-completeness-repo-");
    mkdirSync(join(repoDir, "src/util"), { recursive: true });
    writeFileSync(join(repoDir, "src/index.ts"), "export function indexMain(): number {\n  return 1;\n}\n");
    writeFileSync(join(repoDir, "src/util/log.ts"), 'export function logIt(): string {\n  return "hi";\n}\n');
    writeFileSync(join(repoDir, "src/normal.ts"), "export function normal(): number {\n  return 2;\n}\n");
    execSync(`git init -q ${repoDir}`);
    execSync(`git -C ${repoDir} add -A`);
    execSync(`git -C ${repoDir} -c user.email=fixture@local -c user.name=fixture commit -qm seed`);
    return repoDir;
  }

  test("a clean synthetic bundle (with saved manifest) has no missing-concept violations", async () => {
    const repoDir = makeSyntheticRepo();
    const manifest = await extractGraph(repoDir);
    const bundleRoot = makeTmpDir("asbuilt-completeness-clean-");
    generateBundle(bundleRoot, manifest);
    const bundleDir = join(bundleRoot, "docs/asbuilt");
    saveManifest(join(bundleDir, ".graph-manifest.json"), manifest);

    const result = verifyBundle(bundleDir);
    expect(result.violations).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test("deleting src/normal.md from the generated bundle triggers missing-concept naming it", async () => {
    const repoDir = makeSyntheticRepo();
    const manifest = await extractGraph(repoDir);
    const bundleRoot = makeTmpDir("asbuilt-completeness-missing-");
    generateBundle(bundleRoot, manifest);
    const bundleDir = join(bundleRoot, "docs/asbuilt");
    saveManifest(join(bundleDir, ".graph-manifest.json"), manifest);

    rmSync(join(bundleDir, "src/normal.md"));

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(
      "src/normal.md: missing-concept — manifest file src/normal.ts has no concept page",
    );
  });

  test("no manifest present: a missing concept is NOT flagged — the rule is silently skipped", async () => {
    const repoDir = makeSyntheticRepo();
    const manifest = await extractGraph(repoDir);
    const bundleRoot = makeTmpDir("asbuilt-completeness-nomanifest-");
    generateBundle(bundleRoot, manifest);
    const bundleDir = join(bundleRoot, "docs/asbuilt");
    // Deliberately no saveManifest call — evidence-manifest workflows store
    // their manifest elsewhere, and this bundle has nothing to check against.

    rmSync(join(bundleDir, "src/normal.md"));

    const result = verifyBundle(bundleDir);
    expect(result.violations.some((v) => v.includes("missing-concept"))).toBe(false);
    expect(result.ok).toBe(true);
  });

  test("deleting the reserved-name concept src/index.ts.md is caught by missing-concept, distinct from the directory index src/index.md", async () => {
    const repoDir = makeSyntheticRepo();
    const manifest = await extractGraph(repoDir);
    const bundleRoot = makeTmpDir("asbuilt-completeness-reserved-");
    generateBundle(bundleRoot, manifest);
    const bundleDir = join(bundleRoot, "docs/asbuilt");
    saveManifest(join(bundleDir, ".graph-manifest.json"), manifest);

    rmSync(join(bundleDir, "src/index.ts.md"));

    const result = verifyBundle(bundleDir);
    expect(result.ok).toBe(false);
    expect(result.violations).toContain(
      "src/index.ts.md: missing-concept — manifest file src/index.ts has no concept page",
    );
    // The directory index at src/index.md is a separate, still-present file —
    // its own reserved-file checks are unaffected by the concept's removal.
    expect(result.violations.some((v) => v.startsWith("src/index.md:"))).toBe(false);
  });
});

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
