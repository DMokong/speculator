import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { extractGraph } from "../src/extract";
import { touchedSymbols } from "../src/slice";

// trk-8i3 (found live on a downstream Python project, 2026-08-22): slice.ts hard-coded a `*.ts`
// pathspec on its `git diff`, so a diff that only touched Python (or Go, or
// Java) produced an EMPTY slice even though extract.ts had indexed those
// files — every citation then surfaced as a diff_touched advisory and the
// generator had nothing to work from. The pathspec must come from the same
// adapter registry extract.ts discovers files with.

function git(repo: string, ...args: string[]): string {
  return execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", ...args], {
    encoding: "utf8",
  });
}

const tmpDirs: string[] = [];

/** A throwaway repo with one Python module; `change` modifies only `alpha`'s body. */
function seedPythonRepo(): string {
  const repo = mkdtempSync(join(tmpdir(), "asbuilt-slice-py-"));
  tmpDirs.push(repo);
  git(repo, "init", "-q", "-b", "main");
  mkdirSync(join(repo, "pkg"), { recursive: true });
  writeFileSync(
    join(repo, "pkg", "svc.py"),
    ["def alpha(x):", "    return x + 1", "", "", "def beta(y):", "    return alpha(y) * 2", ""].join("\n"),
  );
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "seed");
  git(repo, "checkout", "-q", "-b", "change");
  writeFileSync(
    join(repo, "pkg", "svc.py"),
    ["def alpha(x):", "    # changed body", "    return x + 2", "", "", "def beta(y):", "    return alpha(y) * 2", ""].join(
      "\n",
    ),
  );
  git(repo, "commit", "-q", "-am", "change alpha");
  return repo;
}

describe("touchedSymbols honours every language adapter's pathspec, not just *.ts", () => {
  test("a Python-only diff registers the changed Python symbol as touched", async () => {
    const repo = seedPythonRepo();
    // manifest at the NEW side (HEAD == change)
    const manifest = await extractGraph(repo);
    // manifest ids are `<file>#<name>`; entries carry no separate `name` field
    const ids = manifest.symbols.map((s) => s.id);
    expect(ids).toContain("pkg/svc.py#alpha");
    expect(ids).toContain("pkg/svc.py#beta");

    const touched = touchedSymbols(manifest, repo, "main...change");
    expect(touched).toEqual(["pkg/svc.py#alpha"]);
  });

  test("a no-op range is still empty for a Python repo", async () => {
    const repo = seedPythonRepo();
    const manifest = await extractGraph(repo);
    expect(touchedSymbols(manifest, repo, "change...change")).toEqual([]);
  });
});

process.on("exit", () => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});
