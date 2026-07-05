// SPEC-053 AC6/R7 — the toolchain works end-to-end on a non-TS language.
//
// Drives the real CLIs (extract → skeleton → check → verify → fold) against
// the committed Go fixture, exactly as an operator would: proves no stage
// between extraction and fold secretly assumes TypeScript, that the
// mechanical layer both accepts a true Go citation and blocks a fabricated
// span, and that an audited draft folds into a Go concept with provenance.

import { describe, expect, test } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const FIXTURE = new URL("./fixtures/lang/go", import.meta.url).pathname;
const SRC = new URL("../src", import.meta.url).pathname;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "e2e",
  GIT_AUTHOR_EMAIL: "e2e@test",
  GIT_COMMITTER_NAME: "e2e",
  GIT_COMMITTER_EMAIL: "e2e@test",
  GIT_AUTHOR_DATE: "2026-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2026-01-01T00:00:00Z",
};

function run(args: string[], opts: { allowFail?: boolean } = {}): { stdout: string; stderr: string; code: number } {
  const proc = spawnSync("bun", args, { encoding: "utf8", env: process.env });
  if (!opts.allowFail && proc.status !== 0) {
    throw new Error(`bun ${args[0]} exited ${proc.status}\n${proc.stdout}\n${proc.stderr}`);
  }
  return { stdout: proc.stdout ?? "", stderr: proc.stderr ?? "", code: proc.status ?? -1 };
}

function stageGoRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "lang-e2e-go-"));
  cpSync(FIXTURE, dir, { recursive: true });
  execFileSync("git", ["-C", dir, "init", "-q"], { env: GIT_ENV });
  execFileSync("git", ["-C", dir, "add", "-A"], { env: GIT_ENV });
  execFileSync("git", ["-C", dir, "commit", "-qm", "fixture"], { env: GIT_ENV });
  return dir;
}

function artifactYaml(citationLines: string): string {
  return `comprehension_entries:
  - ac_id: BACKFILL-1
    ac_text: "backfill: explain svc.go for a future cold reader"
    coverage: full
    implementation_summary: >
      svc.go#NewServer (lines 15-20) validates the port via svc.go#validate
      before constructing a Server; Server.Start re-validates on start.
    code_locations:
      - symbol: "svc.go#NewServer"
        lines: "${citationLines}"
    gap_notes: ""
unexplained_behaviors: []
enrichment_drafts:
  - concept: svc.go.md
    explanation: >
      This module is the Go fixture's service core: construction validates
      eagerly (NewServer) and Start re-checks, so a Server in hand is always
      port-validated.
    decisions: >
      - (E2E-GO-1) validate() is deliberately unexported — validation is an
        internal invariant, not an API.
`;
}

describe("SPEC-053 AC6 — Go end-to-end through the toolchain", () => {
  test("extract → skeleton → check(valid) → verify → fold all succeed on Go", () => {
    const repo = stageGoRepo();
    run([join(SRC, "extract.ts"), "--target", repo]);
    run([join(SRC, "skeleton.ts"), "--target", repo]);

    const bundle = join(repo, "docs/asbuilt");
    const concepts = readdirSync(bundle).filter((f) => f.endsWith(".md"));
    expect(concepts).toContain("svc.go.md");
    expect(concepts).toContain("util.go.md");
    expect(readFileSync(join(bundle, "svc.go.md"), "utf8")).toContain("Server.Start");

    // Valid citation: real symbol, in-span range.
    const evidenceDir = mkdtempSync(join(tmpdir(), "lang-e2e-ev-"));
    writeFileSync(join(evidenceDir, "artifact.yml"), artifactYaml("15-20"));
    const check = run(
      [
        join(SRC, "check.ts"),
        "--manifest", join(bundle, ".graph-manifest.json"),
        "--artifact", join(evidenceDir, "artifact.yml"),
        "--target", repo,
        "--diff-range", "HEAD...HEAD",
      ],
    );
    const report = JSON.parse(check.stdout) as { symbol_exists: unknown[]; span_valid: unknown[]; blocking: boolean };
    expect(report.symbol_exists).toEqual([]);
    expect(report.span_valid).toEqual([]);
    expect(report.blocking).toBe(false);

    const verify = run([join(SRC, "verify.ts"), "--target", repo]);
    expect(verify.stdout).toContain("OK");

    // Fold an audited draft into the Go concept.
    writeFileSync(
      join(evidenceDir, "evidence.yml"),
      `gate: comprehension-asbuilt\nspec_id: E2E-GO\nresult: pass\nmechanical:\n  symbol_exists: []\n  span_valid: []\n  blocking: false\ngenerator:\n  artifact: artifact.yml\n`,
    );
    const fold = run([
      join(SRC, "fold.ts"),
      "--evidence", join(evidenceDir, "evidence.yml"),
      "--target", repo,
      "--spec-id", "E2E-GO",
      "--provenance", "accuracy-audited",
      "--date", "2026-01-01",
    ]);
    expect(fold.stdout).toContain("folded=1");
    const folded = readFileSync(join(bundle, "svc.go.md"), "utf8");
    expect(folded).toContain("enrichment: accuracy-audited");
    expect(folded).toContain("port-validated");
    expect(existsSync(join(bundle, "log.md"))).toBe(true);
  });

  test("a fabricated span on a real Go symbol is blocked by span_valid", () => {
    const repo = stageGoRepo();
    run([join(SRC, "extract.ts"), "--target", repo]);
    const evidenceDir = mkdtempSync(join(tmpdir(), "lang-e2e-bad-"));
    writeFileSync(join(evidenceDir, "artifact.yml"), artifactYaml("100-120"));
    const check = run(
      [
        join(SRC, "check.ts"),
        "--manifest", join(repo, "docs/asbuilt/.graph-manifest.json"),
        "--artifact", join(evidenceDir, "artifact.yml"),
        "--target", repo,
        "--diff-range", "HEAD...HEAD",
      ],
      { allowFail: true },
    );
    expect(check.code).not.toBe(0);
    const report = JSON.parse(check.stdout) as { span_valid: { symbol: string }[]; blocking: boolean };
    expect(report.blocking).toBe(true);
    expect(report.span_valid.length).toBe(1);
    expect(report.span_valid[0]?.symbol).toBe("svc.go#NewServer");
  });
});
