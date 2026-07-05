// Standing non-interference regression test (SPEC-049 Task 6, AC10). Runs
// the deterministic shadow pipeline (extract -> slice -> check -> assemble)
// end to end, in-process, against a sandboxed COPY of the fixture repo, and
// proves programmatically that the only paths created or modified anywhere
// under the sandbox are under the sandbox's own `evidence/` directory —
// mechanical enforcement of the asbuilt-gate skill's Step 7 additive
// guarantee (claw-pq8z), not just a one-time attestation.
//
// Git-manipulation ordering note: checking out the fixture's "change" branch
// (needed so extractGraph reads the new side of the diff) mutates .git
// internals (HEAD, reflogs, the index) as well as the working tree — none of
// that is part of the deterministic pipeline under test. So ALL git
// checkouts happen BEFORE the first snapshot; only the genuinely
// deterministic, read-only-on-the-repo pipeline steps (touchedSymbols'
// `git diff`, which only reads commit objects and touches neither the index
// nor the working tree) run between the two snapshots.

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, sep } from "node:path";
import { stringify } from "yaml";
import { runChecks } from "../src/check";
import { type AssembleOptions, assembleEvidence } from "../src/evidence";
import { extractGraph } from "../src/extract";
import { type GraphManifest, saveManifest } from "../src/manifest";
import { graphSlice, touchedSymbols } from "../src/slice";

const FIXTURE_SOURCE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
const ARTIFACTS = new URL("fixtures/artifacts", import.meta.url).pathname;
const JUDGE_CLEAN = new URL("fixtures/evidence/judge-clean.yml", import.meta.url).pathname;

const tmpDirs: string[] = [];
function makeTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  return dir;
}

/** seed.sh's default branch may be "main" or "master" depending on git config; detect which exists. */
function defaultBranch(repo: string): string {
  try {
    execSync(`git -C ${repo} rev-parse --verify main`, { stdio: "ignore" });
    return "main";
  } catch {
    return "master";
  }
}

type Snapshot = Map<string, string>;

/** Recursive {relative-path: sha256} map of every file under `root` (directories aren't entries, only files). */
function snapshotDir(root: string): Snapshot {
  const out: Snapshot = new Map();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.isFile()) {
        out.set(relative(root, full), createHash("sha256").update(readFileSync(full)).digest("hex"));
      }
    }
  };
  walk(root);
  return out;
}

/** Set-difference of two snapshots: which relative paths are new, changed, or gone. */
function diffSnapshots(before: Snapshot, after: Snapshot): { added: string[]; modified: string[]; removed: string[] } {
  const added: string[] = [];
  const modified: string[] = [];
  for (const [path, hash] of after) {
    const priorHash = before.get(path);
    if (priorHash === undefined) added.push(path);
    else if (priorHash !== hash) modified.push(path);
  }
  const removed = [...before.keys()].filter((path) => !after.has(path));
  return { added, modified, removed };
}

describe("AC10: non-interference — the deterministic pipeline touches only evidence/", () => {
  test("extract -> slice -> check -> assemble against a sandboxed fixture-repo copy: every added/modified path lands under <sandbox>/evidence/", async () => {
    const sandbox = makeTmpDir("asbuilt-noninterference-");
    const sandboxRepo = join(sandbox, "fixture-repo");

    // Copy the fixture repo's tracked files only — never a pre-existing
    // .git (other test files in this same bun test run may have already
    // seeded the SHARED original fixture-repo; we want our own fresh,
    // independent git history in the sandbox, not whatever state theirs
    // happens to be in). seed.sh re-inits from scratch in the copy.
    cpSync(FIXTURE_SOURCE, sandboxRepo, {
      recursive: true,
      filter: (src) => basename(src) !== ".git",
    });
    execSync(`bash ${join(sandboxRepo, "seed.sh")}`);

    const branch = defaultBranch(sandboxRepo);
    const diffRange = `${branch}...change`;

    // All git manipulation happens here, before snapshot 1.
    execSync(`git -C ${sandboxRepo} checkout -q change`);
    let manifest: GraphManifest;
    try {
      manifest = await extractGraph(sandboxRepo);
    } finally {
      execSync(`git -C ${sandboxRepo} checkout -q ${branch}`);
    }

    const before = snapshotDir(sandbox);

    // ---- deterministic pipeline under test (nothing above this line counts) ----
    const evidenceDir = join(sandbox, "evidence");
    mkdirSync(evidenceDir, { recursive: true });

    const manifestPath = join(evidenceDir, "asbuilt-manifest.json");
    saveManifest(manifestPath, manifest);

    const touched = touchedSymbols(manifest, sandboxRepo, diffRange);
    const slice = graphSlice(manifest, touched);
    writeFileSync(join(evidenceDir, "asbuilt-slice.json"), `${JSON.stringify(slice, null, 2)}\n`);

    const artifactPath = join(ARTIFACTS, "clean.yml");
    const report = runChecks(manifest, artifactPath, sandboxRepo, diffRange);
    const reportPath = join(evidenceDir, "asbuilt-mechanical.json");
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

    const outPath = join(evidenceDir, "gate-2c-asbuilt.yml");
    const opts: AssembleOptions = {
      artifactPath,
      mechanicalPath: reportPath,
      judgePath: JUDGE_CLEAN,
      specId: "SPEC-049",
      diffRange,
      manifestPath,
      threshold: 7.0,
      perDimensionMinimum: 5,
      generatorModel: "test-generator",
      judgeModel: "test-judge",
      outPath,
    };
    const { evidence, result } = assembleEvidence(opts);
    const yamlText = stringify(evidence);
    writeFileSync(outPath, yamlText.endsWith("\n") ? yamlText : `${yamlText}\n`);
    // ---- end of deterministic pipeline ----

    // Sanity check that this is a genuinely clean, passing run — a
    // silently-failing fixture would make the rest of this test meaningless.
    expect(report.blocking).toBe(false);
    expect(result).toBe("pass");

    const after = snapshotDir(sandbox);
    const diff = diffSnapshots(before, after);
    const evidencePrefix = `evidence${sep}`;
    const stray = [...diff.added, ...diff.modified].filter((path) => !path.startsWith(evidencePrefix));

    // Helpful-failure-message-by-construction: `stray` (if non-empty) lists
    // every offending path, and bun's toEqual prints the actual array.
    expect(stray).toEqual([]);
    // The pipeline is purely additive within evidence/ — nothing outside it
    // should disappear either.
    expect(diff.removed).toEqual([]);
  });
});

process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
