// SPEC-054 R7/AC8-toolchain-half (claw-wsit) — render-time test-source
// classification. isTestSource routes per-language convention predicates
// (lang.ts); skeleton/refresh/fold all classify through the same function,
// so a test source renders `type: Test` + a `test` tag everywhere, while the
// graph manifest itself (schema-pinned below) is completely unaffected.

import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { isTestSource } from "../src/lang";
import { saveManifest } from "../src/manifest";
import { refresh } from "../src/refresh";
import { conceptPath, generateBundle } from "../src/skeleton";

const FIXTURES = new URL("./fixtures/lang", import.meta.url).pathname;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@test",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@test",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

/** Stage a fixture tree into a fresh git repo (uncommitted — headSha's deterministic fallback). */
function stage(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `lang-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  execFileSync("git", ["-C", dir, "init", "-q"], { env: GIT_ENV });
  execFileSync("git", ["-C", dir, "add", "-A"], { env: GIT_ENV });
  return dir;
}

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
}

describe("isTestSource conventions (claw-wsit)", () => {
  const CASES: Array<[string, boolean]> = [
    ["src/app.test.ts", true],
    ["src/app.spec.ts", true],
    ["src/__tests__/x.ts", true],
    ["tests/x.ts", true],
    ["src/app.ts", false],
    ["src/contest.ts", false],
    ["pkg/svc_test.go", true],
    ["pkg/svc.go", false],
    ["src/test/java/AppTest.java", true],
    ["src/main/AppTest.java", true],
    ["src/main/App.java", false],
    ["test_tool.py", true],
    ["tool_test.py", true],
    ["tests/tool.py", true],
    ["tool.py", false],
    ["protest.py", false],
    ["README.md", false], // no adapter claims it
  ];
  for (const [file, want] of CASES) {
    test(`${file} -> ${want}`, () => expect(isTestSource(file)).toBe(want));
  }
});

describe("rendered classification", () => {
  test("skeleton renders type: Test + test tag for test sources; siblings untouched; manifest unaffected", async () => {
    const repo = stage("testconv");
    const manifest = await extractGraph(repo);
    // manifest schema is untouched by classification
    for (const s of manifest.symbols) {
      expect(Object.keys(s).sort()).toEqual(["content_hash", "exported", "file", "id", "kind", "span"]);
    }
    const dir = mkdtempSync(join(tmpdir(), "asbuilt-testconv-"));
    generateBundle(dir, manifest);
    const fmOf = (f: string) => frontmatterOf(readFileSync(join(dir, "docs/asbuilt", conceptPath(f)), "utf8"));
    expect(fmOf("app.test.ts").type).toBe("Test");
    expect(fmOf("app.test.ts").tags).toContain("test");
    expect(fmOf("svc_test.go").type).toBe("Test");
    expect(fmOf("AppTest.java").type).toBe("Test");
    expect(fmOf("test_tool.py").type).toBe("Test");
    expect(fmOf("app.ts").type).toBe("Module");
    expect(fmOf("app.ts").tags).not.toContain("test");
    expect(fmOf("contest.ts").type).toBe("Module"); // over-match guard
  });

  test("refresh reclassifies a legacy Module-typed test concept, preserving enriched prose", async () => {
    const repo = stage("testconv");
    execFileSync("git", ["-C", repo, "commit", "-qm", "fixture"], { env: GIT_ENV }); // refresh needs a commit
    const manifest = await extractGraph(repo);
    generateBundle(repo, manifest);
    saveManifest(join(repo, "docs/asbuilt/.graph-manifest.json"), manifest);
    // simulate a pre-SPEC-054 bundle: hand-revert the test concept to Module
    // w/o the test tag, and mark it as already enriched (prose + non-"none"
    // enrichment) so we can prove the reclassification doesn't disturb it.
    const p = join(repo, "docs/asbuilt", conceptPath("app.test.ts"));
    const before = readFileSync(p, "utf8");
    const beforeFm = frontmatterOf(before);
    expect(beforeFm.tags).toContain("test"); // sanity: freshly-rendered concept already has the tag
    const legacyTags = (beforeFm.tags as string[]).filter((t) => t !== "test");
    const legacyFrontmatter = before
      .replace("type: Test", "type: Module")
      .replace(/^tags:\n(?: {2}- .*\n)+/m, `tags:\n${legacyTags.map((t) => `  - ${t}`).join("\n")}\n`)
      .replace("enrichment: none", "enrichment: accuracy-audited");
    const legacy = `${legacyFrontmatter}\n# Explanation\nAudited prose survives.\n`;
    writeFileSync(p, legacy);

    // refresh() no-ops entirely (zero writes, not even a reclassification
    // pass) when the freshly re-extracted manifest hashes identically to the
    // committed one (its early-return fast path). Force a real manifest
    // change elsewhere (same trick as refresh.test.ts's AC11 case) so the
    // commonFiles loop actually runs and reaches app.test.ts's frontmatter.
    const appTsPath = join(repo, "app.ts");
    writeFileSync(appTsPath, readFileSync(appTsPath, "utf8").replace("{}", "{\n  return;\n}"));
    execFileSync("git", ["-C", repo, "commit", "-aqm", "mutate app"], { env: GIT_ENV });

    await refresh({ targetRepo: repo, date: "2026-07-06" });
    const text = readFileSync(p, "utf8");
    const fm = frontmatterOf(text);
    expect(fm.type).toBe("Test");
    expect(fm.tags).toContain("test");
    expect(text).toContain("Audited prose survives.");
  });
});
