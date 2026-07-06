import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { parse } from "yaml";
import { extractGraph } from "../src/extract";
import { fold } from "../src/fold";
import { saveManifest } from "../src/manifest";
import { generateBundle } from "../src/skeleton";
import { verifyBundle } from "../src/verify";

const FIXTURE = new URL("fixtures/fixture-repo", import.meta.url).pathname;
execSync(`bash ${join(FIXTURE, "seed.sh")}`);

const EVIDENCE_DIR = new URL("fixtures/evidence", import.meta.url).pathname;
function ev(name: string): string {
  return join(EVIDENCE_DIR, name);
}

// Computed once — generateBundle (called fresh per test below) is a pure,
// cheap function of this manifest.
const manifest = await extractGraph(FIXTURE);

// claw-nybt: the src/alpha.ts symbol cited by fixtures/evidence/pass-artifact.yml's
// sole comprehension_entries code_location ("src/alpha.ts#alphaMain") — used below
// as the id we simulate deleting from the committed manifest.
const DEAD_ID = "src/alpha.ts#alphaMain";

const tmpDirs: string[] = [];
function freshBundle(): string {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-fold-"));
  tmpDirs.push(dir);
  generateBundle(dir, manifest);
  return dir;
}

function frontmatterOf(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n/);
  expect(match).not.toBeNull();
  return parse(match?.[1] ?? "");
}

function walk(dir: string, base: string = dir): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full, base));
    else out.push(relative(base, full));
  }
  return out;
}

/** Deterministic hash of every file's path + content under <dir>/docs/asbuilt. */
function hashBundle(dir: string): string {
  const bundleDir = join(dir, "docs/asbuilt");
  const hash = createHash("sha256");
  for (const f of walk(bundleDir).sort()) {
    hash.update(f);
    hash.update("\0");
    hash.update(readFileSync(join(bundleDir, f)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

describe("AC1: fold-in lands enriched zones and frontmatter updates", () => {
  test("fold pass-evidence enriches alpha.md and beta.md, writes log.md, and verifyBundle stays ok", () => {
    const dir = freshBundle();

    const result = fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    expect([...result.folded].sort()).toEqual(["src/alpha.md", "src/beta.md"]);
    expect(result.skipped).toEqual([]);

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(alpha).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");
    expect(alpha).toContain("# Decisions\n- (SPEC-TEST) chose repeat(2) for determinism");
    expect(alpha).toContain("# Citations\n[1] SPEC-TEST evidence:");

    const fm = frontmatterOf(alpha);
    expect(fm.enrichment).toBe("fully-audited");
    expect(fm.from).toEqual(["SPEC-TEST"]);
    expect(fm.explains).toContain("src/alpha.ts#alphaMain");
    expect(fm.stale).toBe(false);
    expect(fm.stale_reason).toBe("");
    // Deliberate expectation change (SPEC-049 Task 4): skeleton.ts now
    // renders `tags` on every concept, and fold preserves them verbatim
    // (see concept.ts's resolveTags) — src/alpha.ts's tags are
    // [src, module, class, function, method] per the deterministic tags rule.
    expect(fm.tags).toEqual(["src", "module", "class", "function", "method"]);

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log.startsWith("# Bundle Update Log\n")).toBe(true);
    expect(log).toContain("## 2026-07-04");
    expect(log).toContain("* **Fold**: SPEC-TEST enriched [src/alpha.ts](/src/alpha.md) (fully-audited).");
    expect(log).toContain("* **Fold**: SPEC-TEST enriched [src/beta.ts](/src/beta.md) (fully-audited).");

    const verifyResult = verifyBundle(join(dir, "docs/asbuilt"));
    expect(verifyResult.violations).toEqual([]);
    expect(verifyResult.ok).toBe(true);
  });

  test("bundle-dir-prefixed concept paths are normalized correctly", () => {
    const dir = freshBundle();
    // Create a test evidence file with prefixed concept paths
    const testEvidence = `
result: pass
mechanical:
  blocking: false
spec_id: SPEC-PREFIXED
generator:
  artifact: artifact-prefixed.yml
`;
    const evidencePath = join(dir, "evidence-prefixed.yml");
    writeFileSync(evidencePath, testEvidence);

    // Create artifact with prefixed concept paths
    const testArtifact = `
comprehension_entries: []
enrichment_drafts:
  - concept: docs/asbuilt/src/alpha.md
    explanation: "Alpha module orchestrates gamma doubling."
    decisions: "chose repeat(2) for determinism"
`;
    const artifactPath = join(dir, "artifact-prefixed.yml");
    writeFileSync(artifactPath, testArtifact);

    const result = fold({
      evidencePath,
      targetRepo: dir,
      specId: "SPEC-PREFIXED",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    // Should fold into the same file as if the path were "src/alpha.md"
    expect(result.folded).toContain("src/alpha.md");
    expect(result.folded).not.toContain("docs/asbuilt/src/alpha.md");

    const alpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(alpha).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");

    const log = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(log).toContain("* **Fold**: SPEC-PREFIXED enriched [src/alpha.ts](/src/alpha.md) (fully-audited).");
  });
});

describe("AC11 (SPEC-049 Task 4): legacy concept lacking tags is re-derived on write", () => {
  test("a concept with no `tags` key gets a degraded fallback ([firstSegment, \"module\"]) when folded without a committed graph manifest", () => {
    const dir = freshBundle(); // freshBundle() never saves .graph-manifest.json — fold has no manifest to consult
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const stripped = readFileSync(alphaPath, "utf8").replace(/\ntags:\n(?: {2}- .*\n)+/, "\n");
    expect(stripped).not.toContain("tags:");
    writeFileSync(alphaPath, stripped);

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    const fm = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(fm.tags).toEqual(["src", "module"]);
  });
});

describe("AC2: re-fold is byte-identical", () => {
  test("folding the same evidence twice produces identical bytes and reports skipped, not folded", () => {
    const dir = freshBundle();
    const opts = {
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited" as const,
      date: "2026-07-04",
    };

    fold(opts);
    const before = hashBundle(dir);

    const second = fold(opts);
    expect(second.folded).toEqual([]);
    expect([...second.skipped].sort()).toEqual(["src/alpha.md", "src/beta.md"]);

    expect(hashBundle(dir)).toBe(before);
  });
});

describe("AC3: refusals produce zero writes", () => {
  test("result: fail refuses without touching the bundle", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("fail-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow();
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.blocking: true refuses even though result: pass (contradiction case)", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("blocking-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow();
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.skipped: true refuses without --allow-unchecked, naming the reason", () => {
    const dir = freshBundle();
    const before = hashBundle(dir);
    expect(() =>
      fold({
        evidencePath: ev("skipped-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-TEST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/mechanical checks were skipped/);
    expect(hashBundle(dir)).toBe(before);
  });

  test("mechanical.skipped: true folds with --allow-unchecked", () => {
    const dir = freshBundle();
    const result = fold({
      evidencePath: ev("skipped-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
      allowUnchecked: true,
    });
    expect(result.folded).toEqual(["src/util/gamma.md"]);
    const gamma = readFileSync(join(dir, "docs/asbuilt/src/util/gamma.md"), "utf8");
    expect(gamma).toContain("# Explanation\nGamma is the low-level string-doubling primitive alpha depends on.");
  });
});

describe("AC7: provenance transitions", () => {
  test("accuracy-audited lands on a skeleton concept, upgrades to fully-audited, then refuses a downgrade", () => {
    const dir = freshBundle();

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-A",
      provenance: "accuracy-audited",
      date: "2026-07-04",
    });
    let fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.enrichment).toBe("accuracy-audited");

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-B",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.enrichment).toBe("fully-audited");

    const beforeAlpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");
    expect(() =>
      fold({
        evidencePath: ev("pass-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-C",
        provenance: "accuracy-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/downgrade/);
    expect(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).toBe(beforeAlpha);
  });
});

describe("Missing concept: validate-all-before-write-any", () => {
  test("a draft naming a nonexistent concept refuses before any write, leaving a co-drafted valid concept untouched", () => {
    const dir = freshBundle();

    fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    const beforeAlpha = readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8");

    expect(() =>
      fold({
        evidencePath: ev("ghost-evidence.yml"),
        targetRepo: dir,
        specId: "SPEC-GHOST",
        provenance: "fully-audited",
        date: "2026-07-04",
      }),
    ).toThrow(/src\/ghost\.md/);

    expect(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8")).toBe(beforeAlpha);
  });
});

describe("Fenced-code-aware heading detection (T2 review fix)", () => {
  test("a fenced literal '# Explanation' inside a concept's machine zone does not split there — the full machine zone survives fold, and the real enriched zone lands after it", () => {
    const dir = freshBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");
    const before = readFileSync(alphaPath, "utf8");

    // Inject a fenced code sample containing a literal "# Explanation" line
    // into the middle of the machine zone (between "# Structure" and
    // "## Exports") — before the fix, isHeadingLine/isAnyHeadingLine would
    // treat this as the real split point, silently discarding "## Exports"
    // onward (the rest of the mechanically-written machine zone).
    const fence = "```ts\n# Explanation\nfake heading — literal text inside a fenced example, not a real heading\n```\n\n";
    const mutated = before.replace("# Structure\n\n", `# Structure\n\n${fence}`);
    expect(mutated).not.toBe(before);
    writeFileSync(alphaPath, mutated);

    const result = fold({
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });
    expect(result.folded).toContain("src/alpha.md");

    const after = readFileSync(alphaPath, "utf8");

    // The fenced sample itself survived, still inside the machine zone.
    expect(after).toContain(fence.trimEnd());
    // Everything that used to come after the fake heading in the machine
    // zone is still present — nothing was discarded.
    expect(after).toContain("## Exports");
    expect(after).toContain("## Symbols");
    expect(after).toContain("## Calls out");
    expect(after).toContain("## Called by");
    // The real enriched zone (from the draft) is appended after all of it.
    expect(after).toContain("# Explanation\nAlpha module orchestrates gamma doubling.");

    const fenceIdx = after.indexOf(fence.trimEnd());
    const exportsIdx = after.indexOf("## Exports");
    const realExplanationIdx = after.indexOf("# Explanation\nAlpha module orchestrates gamma doubling.");
    expect(fenceIdx).toBeGreaterThan(-1);
    expect(exportsIdx).toBeGreaterThan(fenceIdx);
    expect(realExplanationIdx).toBeGreaterThan(exportsIdx);
  });

  test("a fenced literal '# Decisions\\n- (FAKE-SPEC) ...' quoted inside an Explanation never leaks a phantom bullet into the permanent Decisions accumulation", () => {
    const dir = freshBundle();
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");

    fold({
      evidencePath: ev("fenced-decisions-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    // The Explanation section legitimately still quotes the fenced example
    // verbatim (it's prose, not structural markup that fold interprets).
    const afterFirst = readFileSync(alphaPath, "utf8");
    expect(afterFirst).toContain("- (FAKE-SPEC) example");

    // A second fold (different spec) re-parses the on-disk Decisions section
    // to accumulate across specs. Before the fix, the fenced "# Decisions"
    // heading inside the Explanation prose was mistaken for a real section
    // boundary, and "- (FAKE-SPEC) example" leaked into the accumulated map
    // — becoming a permanent, re-persisted phantom decision from here on.
    fold({
      evidencePath: ev("fenced-decisions-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-OTHER",
      provenance: "fully-audited",
      date: "2026-07-04",
    });

    const afterSecond = readFileSync(alphaPath, "utf8");
    const decisionsSection = decisionsSectionOf(afterSecond);
    expect(decisionsSection).not.toContain("FAKE-SPEC");
    expect(decisionsSection).toContain("- (SPEC-TEST) chose repeat(2) for determinism");
    expect(decisionsSection).toContain("- (SPEC-OTHER) chose repeat(2) for determinism");
  });
});

/** Extracts the real (rendered) "# Decisions" section body — the one immediately preceding "# Citations" — from a folded concept file. */
function decisionsSectionOf(raw: string): string {
  const citationsIdx = raw.indexOf("\n\n# Citations\n");
  expect(citationsIdx).toBeGreaterThan(-1);
  const decisionsHeadingIdx = raw.lastIndexOf("\n# Decisions\n", citationsIdx);
  expect(decisionsHeadingIdx).toBeGreaterThan(-1);
  return raw.slice(decisionsHeadingIdx + "\n# Decisions\n".length, citationsIdx);
}

describe("Log orphan-heading fix", () => {
  test("re-folding identical inputs under a later --date leaves log.md byte-identical (no empty date heading)", () => {
    const dir = freshBundle();
    const baseOpts = {
      evidencePath: ev("pass-evidence.yml"),
      targetRepo: dir,
      specId: "SPEC-TEST",
      provenance: "fully-audited" as const,
    };

    fold({ ...baseOpts, date: "2026-07-04" });
    const logAfterFirst = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");
    expect(logAfterFirst).toContain("## 2026-07-04");

    fold({ ...baseOpts, date: "2026-07-05" });
    const logAfterSecond = readFileSync(join(dir, "docs/asbuilt/log.md"), "utf8");

    expect(logAfterSecond).toBe(logAfterFirst);
    expect(logAfterSecond).not.toContain("## 2026-07-05");
  });
});

describe("Unreadable evidence file produces a refusal, not a raw ENOENT", () => {
  test("fold CLI exits 1 with a friendly refusal message when --evidence names a nonexistent file", () => {
    const dir = freshBundle();
    const ASBUILT_ROOT = new URL("..", import.meta.url).pathname;
    const result = Bun.spawnSync(
      [
        "bun",
        "src/fold.ts",
        "--evidence",
        join(dir, "does-not-exist.yml"),
        "--target",
        dir,
        "--spec-id",
        "SPEC-TEST",
      ],
      { cwd: ASBUILT_ROOT },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr.toString("utf8")).toContain("refusing to fold: cannot read");
    expect(result.stderr.toString("utf8")).not.toContain("ENOENT");
  });
});

describe("claw-nybt: explains dead-id reconciliation", () => {
  test("re-fold drops explains ids absent from the committed manifest", async () => {
    const dir = freshBundle();
    // manifest present on disk -> fold filters against it
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), manifest);
    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const alphaPath = join(dir, "docs/asbuilt/src/alpha.md");

    // Review fix (claw-nybt re-audit): pass-artifact.yml cites only DEAD_ID,
    // so at this point explains == [DEAD_ID] and the "every OTHER
    // previously-present id survives" loop below would run zero iterations
    // — silently passing regardless of whether survival actually works.
    // Seed a second, manifest-present id that this fold's evidence does NOT
    // cite (src/alpha.ts#AlphaService, a real symbol from `manifest`)
    // directly into alpha.md's frontmatter so the loop has a real case to
    // check: a partial re-audit must not drop ids it simply didn't touch.
    const SURVIVOR_ID = "src/alpha.ts#AlphaService";
    const withSurvivor = readFileSync(alphaPath, "utf8").replace(
      "explains:\n  - src/alpha.ts#alphaMain\n",
      `explains:\n  - src/alpha.ts#alphaMain\n  - ${SURVIVOR_ID}\n`,
    );
    expect(withSurvivor).toContain(SURVIVOR_ID); // guard: the string surgery above actually matched
    writeFileSync(alphaPath, withSurvivor);

    const before = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(before.explains).toContain(DEAD_ID); // DEAD_ID = the cited id you chose as B
    expect(before.explains).toContain(SURVIVOR_ID); // guard against the vacuity coming back

    // symbol B is deleted from the code: prune it from the committed manifest
    const pruned = { ...manifest, symbols: manifest.symbols.filter((s) => s.id !== DEAD_ID) };
    saveManifest(join(dir, "docs/asbuilt/.graph-manifest.json"), pruned);

    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const after = frontmatterOf(readFileSync(alphaPath, "utf8"));
    expect(after.explains).not.toContain(DEAD_ID);
    // every OTHER previously-present id survives (partial-audit safety) —
    // now a real, non-vacuous check thanks to SURVIVOR_ID above.
    for (const id of (before.explains as string[]).filter((i) => i !== DEAD_ID)) {
      expect(after.explains).toContain(id);
    }
  });

  test("no manifest on disk -> merge behavior unchanged (dead id retained)", async () => {
    const dir = freshBundle(); // no .graph-manifest.json written
    await fold({ evidencePath: ev("pass-evidence.yml"), targetRepo: dir, specId: "SPEC-T1", provenance: "fully-audited", date: "2026-07-06" });
    const fm = frontmatterOf(readFileSync(join(dir, "docs/asbuilt/src/alpha.md"), "utf8"));
    expect(fm.explains).toContain(DEAD_ID); // preserved: nothing to validate against
  });
});

// Cleanup after the whole suite has read everything it needs.
process.on("exit", () => {
  for (const dir of tmpDirs) rmSync(dir, { recursive: true, force: true });
});
