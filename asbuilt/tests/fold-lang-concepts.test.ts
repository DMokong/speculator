import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import { fold } from "../src/fold";
import { generateBundle } from "../src/skeleton";

// trk-8i3 (found live on a downstream Python project, 2026-08-22): skeleton's conceptPath keeps the
// extension for every non-TypeScript language (`pkg/svc.py` → `pkg/svc.py.md`)
// while the generator — trained on TS bundles — emitted the TS form
// (`pkg/svc.md`). fold refused with "concept does not exist" and the audited
// drafts never landed. fold must resolve the TS-style name to the bundle's
// real concept when exactly one adapter extension produces an existing file.

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    encoding: "utf8",
  });
}

const tmpDirs: string[] = [];

async function pythonBundle(): Promise<string> {
  const repo = mkdtempSync(join(tmpdir(), "asbuilt-fold-py-"));
  tmpDirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, "pkg"), { recursive: true });
  writeFileSync(join(repo, "pkg", "svc.py"), "def alpha(x):\n    return x + 1\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  const manifest = await extractGraph(repo);
  generateBundle(repo, manifest);
  expect(existsSync(join(repo, "docs/asbuilt/pkg/svc.py.md"))).toBe(true);
  expect(existsSync(join(repo, "docs/asbuilt/pkg/svc.md"))).toBe(false);
  return repo;
}

function writeEvidence(repo: string, concept: string, specId: string): string {
  const evidencePath = join(repo, `evidence-${specId}.yml`);
  writeFileSync(
    evidencePath,
    `\nresult: pass\nmechanical:\n  blocking: false\nspec_id: ${specId}\ngenerator:\n  artifact: artifact-${specId}.yml\n`,
  );
  writeFileSync(
    join(repo, `artifact-${specId}.yml`),
    `\ncomprehension_entries: []\nenrichment_drafts:\n  - concept: ${concept}\n    explanation: "svc.alpha adds one."\n    decisions: "kept it pure"\n`,
  );
  return evidencePath;
}

describe("fold resolves TS-style concept names for other-language concepts", () => {
  test("a draft naming pkg/svc.md folds into the bundle's pkg/svc.py.md", async () => {
    const repo = await pythonBundle();
    const result = fold({
      evidencePath: writeEvidence(repo, "pkg/svc.md", "SPEC-PY1"),
      targetRepo: repo,
      specId: "SPEC-PY1",
      provenance: "fully-audited",
      date: "2026-08-22",
    });
    expect(result.folded).toEqual(["pkg/svc.py.md"]);
    const svc = readFileSync(join(repo, "docs/asbuilt/pkg/svc.py.md"), "utf8");
    expect(svc).toContain("# Explanation\nsvc.alpha adds one.");
  });

  test("the exact bundle name still works unchanged", async () => {
    const repo = await pythonBundle();
    const result = fold({
      evidencePath: writeEvidence(repo, "pkg/svc.py.md", "SPEC-PY2"),
      targetRepo: repo,
      specId: "SPEC-PY2",
      provenance: "fully-audited",
      date: "2026-08-22",
    });
    expect(result.folded).toEqual(["pkg/svc.py.md"]);
  });

  test("a concept that exists under no adapter extension still refuses before any write", async () => {
    const repo = await pythonBundle();
    expect(() =>
      fold({
        evidencePath: writeEvidence(repo, "pkg/nope.md", "SPEC-PY3"),
        targetRepo: repo,
        specId: "SPEC-PY3",
        provenance: "fully-audited",
        date: "2026-08-22",
      }),
    ).toThrow(/concept does not exist in the bundle: pkg\/nope\.md/);
    expect(readFileSync(join(repo, "docs/asbuilt/pkg/svc.py.md"), "utf8")).not.toContain("# Explanation");
  });
});

process.on("exit", () => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});
